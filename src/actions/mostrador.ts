"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { sumarDias } from "@/lib/agenda-profesional";
import { ahoraEnArgentina, formatearFechaAr } from "@/lib/busqueda-turnos";
import {
  ESTADO_TURNO_LABELS,
  formatearAutorCambioEstado,
  formatearFechaHoraAuditoriaAr,
} from "@/lib/estado-turno";
import { registrarEstadoTurnoAction } from "@/actions/estado-turnos";
import {
  TIPO_OPERACION_LABELS,
  construirTurnosPacienteMostrador,
  filtrarPacientesMostrador,
  formatearCoberturaPaciente,
  formatearProfesionalMostrador,
  resolverTipoTurnoPorRol,
  validarAltaPacienteMostrador,
  validarReprogramacionMostrador,
  type AltaPacienteMostradorInput,
  type FiltrosBusquedaPacienteInput,
  type OperacionMostradorAuditoriaItem,
  type PacienteMostradorItem,
  type TipoOperacionMostrador,
  type TipoTurnoMostrador,
  type TurnoDisponibleMostradorItem,
  type TurnoPacienteMostradorItem,
} from "@/lib/mostrador";
import {
  enviarNotificacionAltaPacienteMostrador,
  enviarNotificacionCancelacionMedicoMostrador,
  enviarNotificacionCancelacionVacunacionMostrador,
  enviarNotificacionReservaMostrador,
} from "@/services/notificaciones/mostrador";
import {
  cancelarTurnoVacunacion,
  reservarTurnoVacunacion,
} from "@/services/vacunacion/turnos";
import { ENTITY_OPTIONS } from "@/lib/validation";
import type { MedicalSpecialty, Role } from "@/generated/prisma/client";

export type ProfesionalMostradorOption = {
  id: string;
  fullName: string;
  role: Role;
  tipoTurno: TipoTurnoMostrador;
  specialty: MedicalSpecialty | null;
  specialtyLabel: string;
};

export type VacunaMostradorOption = {
  id: string;
  denominacion: string;
  laboratorio: string;
  esquemaDosis: string;
  dosis: Array<{ orden: number; etiqueta: string }>;
};

export type DatosInicialesMostrador = {
  hoy: string;
  pacientes: PacienteMostradorItem[];
  pacienteSeleccionado: PacienteMostradorItem | null;
  turnosParaGestion: TurnoPacienteMostradorItem[];
  turnosAsistenciaYPago: TurnoPacienteMostradorItem[];
  profesionales: ProfesionalMostradorOption[];
  vacunas: VacunaMostradorOption[];
  obrasSociales: string[];
  turnosDisponibles: TurnoDisponibleMostradorItem[];
  operacionesRecientes: OperacionMostradorAuditoriaItem[];
};

function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapearPacienteMostrador(u: {
  id: string;
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string | null;
  email: string;
  phone: string | null;
  coverageType: string;
  healthInsuranceEntity: string | null;
  healthInsurancePlan: string | null;
  healthInsuranceNumber: string | null;
}): PacienteMostradorItem {
  const coverageType = u.coverageType === "OBRA_SOCIAL" ? "OBRA_SOCIAL" : "PARTICULAR";
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName} ${u.lastName}`.trim(),
    docType: u.docType || "DNI",
    docNumber: u.docNumber,
    email: u.email,
    phone: u.phone,
    coverageType,
    healthInsuranceEntity: u.healthInsuranceEntity,
    healthInsurancePlan: u.healthInsurancePlan,
    healthInsuranceNumber: u.healthInsuranceNumber,
    coberturaLabel: formatearCoberturaPaciente({
      coverageType,
      healthInsuranceEntity: u.healthInsuranceEntity,
      healthInsurancePlan: u.healthInsurancePlan,
    }),
  };
}

/**
 * Si la agenda del vacunatorio (`TurnoVacunacion` — US-63) aún no tiene turnos
 * disponibles futuros generados, asegura una grilla inicial de turnos de 30 minutos
 * en los próximos días hábiles, de modo que el mostrador siempre pueda gestionar
 * turnos de ambos tipos (US-17 Criterio 3).
 */
async function asegurarTurnosVacunatorioDisponibles(hoy: string): Promise<void> {
  try {
    const countExistentes = await db.turnoVacunacion.count({
      where: {
        status: "DISPONIBLE",
        date: { gte: new Date(`${hoy}T00:00:00.000Z`) },
      },
    });

    if (countExistentes > 0) return;

    const creador =
      (await db.user.findFirst({
        where: { role: "ENFERMERA", isActive: true },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true },
      })) ??
      (await db.user.findFirst({
        where: { isActive: true },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true },
      }));

    if (!creador) return;

    const slotsHorarios = [
      { startTime: "09:00", endTime: "09:30" },
      { startTime: "09:30", endTime: "10:00" },
      { startTime: "10:00", endTime: "10:30" },
      { startTime: "10:30", endTime: "11:00" },
      { startTime: "11:00", endTime: "11:30" },
    ];

    for (let offset = 1; offset <= 5; offset++) {
      const fechaIso = sumarDias(hoy, offset);
      const fechaUtc = new Date(`${fechaIso}T00:00:00.000Z`);
      const dow = fechaUtc.getUTCDay();
      if (dow === 0 || dow === 6) continue;

      const jornada = await db.jornadaVacunatorio.create({
        data: {
          date: fechaUtc,
          startTime: "09:00",
          endTime: "11:30",
          createdById: creador.id,
        },
      });

      await db.turnoVacunacion.createMany({
        data: slotsHorarios.map((slot) => ({
          jornadaId: jornada.id,
          date: fechaUtc,
          startTime: slot.startTime,
          endTime: slot.endTime,
          duration: 30,
          status: "DISPONIBLE" as const,
        })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.warn("[US-17] No se pudieron pre-generar turnos de vacunatorio:", error);
  }
}

async function cargarTurnosDePaciente(pacienteId: string) {
  const ahora = ahoraEnArgentina();
  const [
    turnosMedicos,
    cancelacionesMedicas,
    turnosVacunacion,
    cancelacionesVacunacion,
  ] = await Promise.all([
    db.turno.findMany({
      where: { reservedById: pacienteId },
      include: {
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            specialty: true,
          },
        },
        pagos: {
          where: { estado: "ACTIVO" },
          select: { id: true, comprobanteNumero: true },
          take: 1,
        },
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
    db.turnoCancelacion.findMany({
      where: { reservedById: pacienteId },
      include: {
        turno: {
          select: {
            id: true,
            status: true,
            doctorId: true,
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                specialty: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
    db.turnoVacunacion.findMany({
      where: { reservedById: pacienteId },
      include: {
        vacuna: {
          select: {
            id: true,
            denominacion: true,
            laboratorio: true,
          },
        },
        aplicaciones: {
          where: { estado: "ACTIVA" },
          select: { enfermeraId: true, enfermeraNombre: true },
          take: 1,
        },
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
    db.turnoVacunacionCancelacion.findMany({
      where: { reservedById: pacienteId },
      include: {
        turno: {
          select: { id: true, status: true },
        },
      },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
    }),
  ]);

  const candidatos: Parameters<typeof construirTurnosPacienteMostrador>[0] = [];

  for (const r of turnosMedicos) {
    candidatos.push({
      id: r.id,
      date: formatUtcDateString(r.date),
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      doctorId: r.doctorId,
      doctorFirstName: r.doctor.firstName,
      doctorLastName: r.doctor.lastName,
      doctorRole: r.doctor.role,
      doctorSpecialty: r.doctor.specialty,
      tipoTurno: "MEDICO",
      motivoConsulta: r.motivoConsulta,
      pagoId: r.pagos[0]?.id ?? null,
      comprobanteNumero: r.pagos[0]?.comprobanteNumero ?? null,
    });
  }

  for (const c of cancelacionesMedicas) {
    // Si el turno ya figura con status CANCELADO y reservedById del paciente, evitamos duplicar
    if (c.turnoId && turnosMedicos.some((t) => t.id === c.turnoId && t.status === "CANCELADO")) {
      continue;
    }
    candidatos.push({
      id: `canc-med-${c.id}`,
      date: formatUtcDateString(c.date),
      startTime: c.startTime,
      endTime: c.endTime,
      status: "CANCELADO",
      doctorId: c.turno?.doctorId ?? "med-canc",
      doctorFirstName: c.turno?.doctor.firstName ?? c.doctorNombre,
      doctorLastName: c.turno?.doctor.lastName ?? "-",
      doctorRole: "MEDICO",
      doctorSpecialty: c.turno?.doctor.specialty ?? null,
      tipoTurno: "MEDICO",
      profesionalNombreCustom: c.doctorNombre,
    });
  }

  for (const tv of turnosVacunacion) {
    const vacunaLabel = tv.vacuna
      ? `${tv.vacuna.denominacion} (${tv.vacuna.laboratorio})`
      : null;
    const enfermeraNombre = tv.aplicaciones[0]?.enfermeraNombre ?? "Sala de Vacunación";
    candidatos.push({
      id: tv.id,
      date: formatUtcDateString(tv.date),
      startTime: tv.startTime,
      endTime: tv.endTime,
      status: tv.status,
      doctorId: tv.aplicaciones[0]?.enfermeraId ?? "vacunatorio",
      doctorFirstName: "Sala de Vacunación",
      doctorLastName: "-",
      doctorRole: "ENFERMERA",
      doctorSpecialty: null,
      tipoTurno: "VACUNACION",
      profesionalNombreCustom: enfermeraNombre,
      vacunaId: tv.vacunaId,
      vacunaNombre: vacunaLabel,
      dosisPrevistaOrden: tv.dosisPrevistaOrden,
    });
  }

  for (const cv of cancelacionesVacunacion) {
    if (
      cv.turnoId &&
      turnosVacunacion.some((t) => t.id === cv.turnoId && t.status === "CANCELADO")
    ) {
      continue;
    }
    candidatos.push({
      id: `canc-vac-${cv.id}`,
      date: formatUtcDateString(cv.date),
      startTime: cv.startTime,
      endTime: cv.endTime,
      status: "CANCELADO",
      doctorId: "vacunatorio",
      doctorFirstName: "Sala de Vacunación",
      doctorLastName: "-",
      doctorRole: "ENFERMERA",
      doctorSpecialty: null,
      tipoTurno: "VACUNACION",
      profesionalNombreCustom: "Sala de Vacunación",
      vacunaNombre: cv.vacunaNombre ?? null,
    });
  }

  return construirTurnosPacienteMostrador(candidatos, ahora);
}

async function cargarTurnosDisponiblesMostrador(hoy: string): Promise<TurnoDisponibleMostradorItem[]> {
  await asegurarTurnosVacunatorioDisponibles(hoy);

  const [rowsMedicos, rowsVacunacion] = await Promise.all([
    db.turno.findMany({
      where: {
        status: "DISPONIBLE",
        bloqueoId: null,
        date: {
          gte: new Date(`${hoy}T00:00:00.000Z`),
        },
        doctor: {
          isActive: true,
          role: "MEDICO",
        },
      },
      include: {
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            specialty: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 300,
    }),
    db.turnoVacunacion.findMany({
      where: {
        status: "DISPONIBLE",
        date: {
          gte: new Date(`${hoy}T00:00:00.000Z`),
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 200,
    }),
  ]);

  const itemsMedicos: TurnoDisponibleMostradorItem[] = rowsMedicos.map((t) => {
    const dateStr = formatUtcDateString(t.date);
    const profesionalNombre = formatearProfesionalMostrador(t.doctor);
    const especialidadOVacunatorio = t.doctor.specialty
      ? SPECIALTY_LABELS[t.doctor.specialty]
      : "Consulta médica";

    return {
      id: t.id,
      tipoTurno: "MEDICO",
      date: dateStr,
      fechaFormateada: formatearFechaAr(dateStr),
      startTime: t.startTime,
      endTime: t.endTime,
      profesionalId: t.doctorId,
      profesionalNombre,
      especialidadOVacunatorio,
      specialty: t.doctor.specialty,
      status: t.status,
      bloqueado: Boolean(t.bloqueoId),
    };
  });

  const itemsVacunacion: TurnoDisponibleMostradorItem[] = rowsVacunacion.map((tv) => {
    const dateStr = formatUtcDateString(tv.date);
    return {
      id: tv.id,
      tipoTurno: "VACUNACION",
      date: dateStr,
      fechaFormateada: formatearFechaAr(dateStr),
      startTime: tv.startTime,
      endTime: tv.endTime,
      profesionalId: "vacunatorio",
      profesionalNombre: "Sala de Vacunación",
      especialidadOVacunatorio: "Vacunatorio",
      specialty: null,
      status: tv.status,
      bloqueado: false,
    };
  });

  return [...itemsMedicos, ...itemsVacunacion];
}

async function cargarOperacionesRecientes(pacienteId?: string): Promise<OperacionMostradorAuditoriaItem[]> {
  const rows = await db.mostradorOperacionLog.findMany({
    where: pacienteId ? { pacienteId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return rows.map((r) => {
    const tipoOp = (
      ["ALTA_PACIENTE", "RESERVA", "REPROGRAMACION", "CANCELACION", "ASISTENCIA"].includes(
        r.tipoOperacion
      )
        ? r.tipoOperacion
        : "RESERVA"
    ) as TipoOperacionMostrador;

    return {
      id: r.id,
      tipoOperacion: tipoOp,
      tipoOperacionLabel: TIPO_OPERACION_LABELS[tipoOp],
      tipoTurno:
        r.tipoTurno === "MEDICO" || r.tipoTurno === "VACUNACION" ? r.tipoTurno : null,
      pacienteId: r.pacienteId,
      pacienteNombre: r.pacienteNombre,
      turnoId: r.turnoId,
      turnoOriginalId: r.turnoOriginalId,
      detalle: r.detalle,
      realizadoPorId: r.realizadoPorId,
      realizadoPorNombre: r.realizadoPorNombre,
      realizadoPorRole: r.realizadoPorRole,
      fechaHoraFormateada: formatearFechaHoraAuditoriaAr(r.createdAt),
    };
  });
}

export async function obtenerDatosInicialesMostrador(params?: {
  pacienteId?: string;
}): Promise<DatosInicialesMostrador> {
  await assertRoles(["ADMINISTRATIVO"]);
  const ahora = ahoraEnArgentina();

  const [
    pacientesRows,
    profesionalesRows,
    vacunasRows,
    obrasSocialesRows,
    turnosDisponibles,
    operacionesRecientes,
  ] = await Promise.all([
    db.user.findMany({
      where: { role: "USUARIO", isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 40,
    }),
    db.user.findMany({
      where: {
        role: "MEDICO",
        isActive: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        specialty: true,
      },
    }),
    db.vacuna.findMany({
      where: { isActive: true },
      orderBy: [{ denominacion: "asc" }],
      select: {
        id: true,
        denominacion: true,
        laboratorio: true,
        esquemaDosis: true,
        dosis: {
          orderBy: [{ orden: "asc" }],
          select: { orden: true, etiqueta: true },
        },
      },
    }),
    db.obraSocial.findMany({
      orderBy: [{ nombre: "asc" }],
      select: { nombre: true },
    }),
    cargarTurnosDisponiblesMostrador(ahora.fecha),
    cargarOperacionesRecientes(params?.pacienteId),
  ]);

  const pacientes = pacientesRows.map(mapearPacienteMostrador);

  let pacienteSeleccionado: PacienteMostradorItem | null = null;
  let turnosParaGestion: TurnoPacienteMostradorItem[] = [];
  let turnosAsistenciaYPago: TurnoPacienteMostradorItem[] = [];

  const targetPacienteId = params?.pacienteId?.trim() || pacientes[0]?.id;
  if (targetPacienteId) {
    const encontrado =
      pacientes.find((p) => p.id === targetPacienteId) ??
      (await db.user
        .findUnique({ where: { id: targetPacienteId } })
        .then((u) => (u && u.role === "USUARIO" ? mapearPacienteMostrador(u) : null)));

    if (encontrado) {
      pacienteSeleccionado = encontrado;
      const clasificados = await cargarTurnosDePaciente(encontrado.id);
      turnosParaGestion = clasificados.turnosParaGestion;
      turnosAsistenciaYPago = clasificados.turnosAsistenciaYPago;
    }
  }

  const profesionales: ProfesionalMostradorOption[] = profesionalesRows.map((p) => ({
    id: p.id,
    fullName: formatearProfesionalMostrador(p),
    role: p.role,
    tipoTurno: resolverTipoTurnoPorRol(p.role),
    specialty: p.specialty,
    specialtyLabel: p.specialty ? SPECIALTY_LABELS[p.specialty] : "Consulta médica",
  }));

  const setObrasSociales = new Set<string>(
    ENTITY_OPTIONS.map((o) => o.value)
  );
  for (const os of obrasSocialesRows) {
    if (os.nombre.trim()) setObrasSociales.add(os.nombre.trim());
  }

  return {
    hoy: ahora.fecha,
    pacientes,
    pacienteSeleccionado,
    turnosParaGestion,
    turnosAsistenciaYPago,
    profesionales,
    vacunas: vacunasRows,
    obrasSociales: Array.from(setObrasSociales),
    turnosDisponibles,
    operacionesRecientes,
  };
}

export async function buscarPacientesMostradorAction(
  filtros: FiltrosBusquedaPacienteInput
): Promise<{
  success: boolean;
  pacientes: PacienteMostradorItem[];
  message?: string;
}> {
  try {
    await assertRoles(["ADMINISTRATIVO"]);
  } catch {
    return {
      success: false,
      pacientes: [],
      message: "Solo el personal administrativo puede buscar pacientes desde el mostrador.",
    };
  }

  const todos = await db.user.findMany({
    where: { role: "USUARIO", isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });

  const mapeados = todos.map(mapearPacienteMostrador);
  const filtrados = filtrarPacientesMostrador(mapeados, filtros);

  return {
    success: true,
    pacientes: filtrados,
  };
}

export async function seleccionarPacienteMostradorAction(pacienteId: string): Promise<{
  success: boolean;
  paciente?: PacienteMostradorItem;
  turnosParaGestion?: TurnoPacienteMostradorItem[];
  turnosAsistenciaYPago?: TurnoPacienteMostradorItem[];
  operacionesRecientes?: OperacionMostradorAuditoriaItem[];
  message?: string;
}> {
  try {
    await assertRoles(["ADMINISTRATIVO"]);
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede acceder al mostrador.",
    };
  }

  const user = await db.user.findUnique({ where: { id: pacienteId.trim() } });
  if (!user || user.role !== "USUARIO") {
    return {
      success: false,
      message: "El paciente seleccionado no existe.",
    };
  }

  const paciente = mapearPacienteMostrador(user);
  const [{ turnosParaGestion, turnosAsistenciaYPago }, operacionesRecientes] = await Promise.all([
    cargarTurnosDePaciente(user.id),
    cargarOperacionesRecientes(user.id),
  ]);

  return {
    success: true,
    paciente,
    turnosParaGestion,
    turnosAsistenciaYPago,
    operacionesRecientes,
  };
}

/**
 * Criterio 2: Da de alta un paciente nuevo desde el mismo flujo de mostrador,
 * incluyendo su obra social, envía el email de bienvenida y deja constancia
 * de qué administrativo realizó el registro.
 */
export async function registrarPacienteMostradorAction(
  input: AltaPacienteMostradorInput
): Promise<{
  success: boolean;
  message: string;
  errors?: Record<string, string>;
  paciente?: PacienteMostradorItem;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede registrar pacientes desde el mostrador.",
    };
  }

  const validacion = validarAltaPacienteMostrador(input);
  if (!validacion.valid || !validacion.parsedBirthDate) {
    return {
      success: false,
      message: "Revisá los campos señalados en el formulario de alta.",
      errors: validacion.errors,
    };
  }

  const cleanDoc = input.docNumber.trim();
  const cleanEmail = input.email.trim().toLowerCase();

  const existente = await db.user.findFirst({
    where: {
      OR: [{ docNumber: cleanDoc }, { email: cleanEmail }],
    },
  });

  if (existente) {
    if (existente.docNumber === cleanDoc) {
      return {
        success: false,
        message: "Ya existe un paciente registrado con este número de documento.",
        errors: { docNumber: "Este documento ya se encuentra registrado." },
      };
    }
    return {
      success: false,
      message: "Ya existe una cuenta registrada con este correo electrónico.",
      errors: { email: "Este correo electrónico ya está en uso." },
    };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const actorNombre = formatearAutorCambioEstado({
    firstName: actorProfile.firstName,
    lastName: actorProfile.lastName,
    role: actorRole,
  });

  try {
    let clerkUserId = `mostrador_${randomUUID()}`;
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.createUser({
        emailAddress: [cleanEmail],
        firstName,
        lastName,
        password: randomBytes(24).toString("base64url"),
        skipPasswordChecks: true,
        publicMetadata: {
          role: "USUARIO",
        },
      });
      clerkUserId = clerkUser.id;
    } catch (clerkErr) {
      console.warn(
        "[US-17] No se pudo crear identidad en Clerk, se registra con identificador local de mostrador:",
        clerkErr
      );
    }

    const creado = await db.$transaction(async (tx) => {
      const nuevoUsuario = await tx.user.create({
        data: {
          clerkUserId,
          email: cleanEmail,
          firstName,
          lastName,
          docType: input.docType || "DNI",
          docNumber: cleanDoc,
          birthDate: validacion.parsedBirthDate,
          phone: input.phone.trim(),
          address: input.address?.trim() || null,
          coverageType: input.coverageType,
          healthInsuranceEntity:
            input.coverageType === "OBRA_SOCIAL" ? input.healthInsuranceEntity?.trim() : null,
          healthInsurancePlan:
            input.coverageType === "OBRA_SOCIAL"
              ? input.healthInsurancePlan?.trim() || "General"
              : null,
          healthInsuranceNumber:
            input.coverageType === "OBRA_SOCIAL" ? input.healthInsuranceNumber?.trim() : null,
          role: "USUARIO",
          isActive: true,
        },
      });

      const coberturaTexto = formatearCoberturaPaciente(nuevoUsuario);
      await tx.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "ALTA_PACIENTE",
          pacienteId: nuevoUsuario.id,
          pacienteNombre: `${nuevoUsuario.firstName} ${nuevoUsuario.lastName}`.trim(),
          detalle: `Alta en mostrador (${nuevoUsuario.docType} ${nuevoUsuario.docNumber} · ${coberturaTexto})`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      return nuevoUsuario;
    });

    await enviarNotificacionAltaPacienteMostrador({
      nombre: `${creado.firstName} ${creado.lastName}`.trim(),
      email: creado.email,
    });

    revalidatePath("/dashboard/mostrador");

    return {
      success: true,
      message: `Paciente ${creado.firstName} ${creado.lastName} registrado y seleccionado. Se envió el email de bienvenida.`,
      paciente: mapearPacienteMostrador(creado),
    };
  } catch (error) {
    console.error("registrarPacienteMostradorAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al registrar al paciente desde el mostrador.",
    };
  }
}

/**
 * Criterio 3, 5 y 6: Reserva un turno (consulta médica en `Turno` o vacunación
 * en `TurnoVacunacion`) en nombre del paciente seleccionado, envía el email de
 * confirmación correspondiente y deja registrada la operación con el usuario administrativo.
 */
export async function reservarTurnoMostradorAction(input: {
  pacienteId: string;
  turnoId: string;
  tipoTurno: TipoTurnoMostrador;
  vacunaId?: string;
  dosisPrevistaOrden?: number | null;
  motivoConsulta?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede reservar turnos desde el mostrador.",
    };
  }

  const pacienteId = (input.pacienteId ?? "").trim();
  const turnoId = (input.turnoId ?? "").trim();
  if (!pacienteId || !turnoId) {
    return { success: false, message: "Seleccioná un paciente y un turno disponible." };
  }

  try {
    const paciente = await db.user.findUnique({ where: { id: pacienteId } });
    if (!paciente || paciente.role !== "USUARIO") {
      return { success: false, message: "El paciente seleccionado no es válido." };
    }

    const actorNombre = formatearAutorCambioEstado({
      firstName: actorProfile.firstName,
      lastName: actorProfile.lastName,
      role: actorRole,
    });
    const pacienteNombre = `${paciente.firstName} ${paciente.lastName}`.trim();

    // Caso A: Turno de Vacunación (tabla TurnoVacunacion + servicio de Grupo C)
    if (input.tipoTurno === "VACUNACION") {
      const vacunaId = (input.vacunaId ?? "").trim();
      if (!vacunaId) {
        return {
          success: false,
          message: "Seleccioná la vacuna del catálogo para reservar el turno de vacunación.",
        };
      }

      const [vacuna, turnoVac] = await Promise.all([
        db.vacuna.findUnique({ where: { id: vacunaId } }),
        db.turnoVacunacion.findUnique({ where: { id: turnoId } }),
      ]);

      if (!vacuna || !vacuna.isActive) {
        return {
          success: false,
          message: "La vacuna seleccionada no existe o no se encuentra activa.",
        };
      }

      if (!turnoVac) {
        return {
          success: false,
          message: "El turno de vacunación seleccionado no existe.",
        };
      }

      const resVac = await reservarTurnoVacunacion({
        turnoId: turnoVac.id,
        vacunaId: vacuna.id,
        dosisPrevistaOrden: input.dosisPrevistaOrden ?? null,
        titularId: paciente.id,
        otorgadoPorId: actorProfile.id,
      });

      if (!resVac.success) {
        return {
          success: false,
          message: resVac.message,
        };
      }

      const fechaFormateada = formatearFechaAr(formatUtcDateString(turnoVac.date));

      await db.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "RESERVA",
          tipoTurno: "VACUNACION",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoId: turnoVac.id,
          detalle: `Reserva de turno (Vacunación · ${vacuna.denominacion}) el ${fechaFormateada} ${turnoVac.startTime} en Sala de Vacunación`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      await enviarNotificacionReservaMostrador(turnoVac.id, "VACUNACION");

      revalidatePath("/dashboard/mostrador");
      revalidatePath("/dashboard/mostrador/vacunacion");
      revalidatePath("/dashboard/agenda-vacunatorio");
      revalidatePath("/dashboard/mis-turnos");

      return {
        success: true,
        message: `Turno de vacunación (${vacuna.denominacion}) reservado para ${pacienteNombre} el ${fechaFormateada} a las ${turnoVac.startTime}. Se envió la confirmación por email.`,
      };
    }

    // Caso B: Turno Médico (tabla Turno)
    const turno = await db.turno.findUnique({
      where: { id: turnoId },
      include: { doctor: true },
    });

    if (!turno) {
      return { success: false, message: "El turno seleccionado no existe." };
    }

    if (turno.status !== "DISPONIBLE" || turno.bloqueoId) {
      return {
        success: false,
        message: "Ese turno ya no está disponible. Elegí otro horario.",
      };
    }

    const motivoLimpio = (input.motivoConsulta ?? "").trim() || null;
    const profNombre = formatearProfesionalMostrador(turno.doctor);
    const fechaFormateada = formatearFechaAr(formatUtcDateString(turno.date));

    const reservado = await db.$transaction(async (tx) => {
      const updated = await tx.turno.updateMany({
        where: {
          id: turno.id,
          status: "DISPONIBLE",
          bloqueoId: null,
        },
        data: {
          status: "RESERVADO",
          reservedById: paciente.id,
          personaAtendidaId: null,
          patientFirstName: null,
          patientLastName: null,
          motivoConsulta: motivoLimpio,
          reservedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        return false;
      }

      await tx.turnoEstadoAuditLog.create({
        data: {
          turnoId: turno.id,
          previousStatus: "DISPONIBLE",
          newStatus: "RESERVADO",
          changedById: actorProfile.id,
          changedByName: actorNombre,
          changedByRole: actorRole,
        },
      });

      await tx.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "RESERVA",
          tipoTurno: "MEDICO",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoId: turno.id,
          detalle: `Reserva de turno (Consulta médica) el ${fechaFormateada} ${turno.startTime} con ${profNombre}`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      return true;
    });

    if (!reservado) {
      return {
        success: false,
        message: "Ese turno fue tomado un instante antes. Elegí otro horario.",
      };
    }

    await enviarNotificacionReservaMostrador(turno.id, "MEDICO");

    revalidatePath("/dashboard/mostrador");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");
    revalidatePath("/dashboard/mis-turnos");
    revalidatePath("/dashboard/estado-turnos");

    return {
      success: true,
      message: `Turno reservado para ${pacienteNombre} el ${fechaFormateada} a las ${turno.startTime} (${profNombre}). Se envió la confirmación por email.`,
    };
  } catch (error) {
    console.error("reservarTurnoMostradorAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al reservar el turno desde el mostrador.",
    };
  }
}

/**
 * Cancela un turno reservado del paciente (médico o de vacunación) desde el mostrador,
 * envía el email de aviso de cancelación y registra quién realizó la operación.
 */
export async function cancelarTurnoMostradorAction(input: {
  pacienteId: string;
  turnoId: string;
  tipoTurno?: TipoTurnoMostrador;
  motivo?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede cancelar turnos desde el mostrador.",
    };
  }

  const pacienteId = (input.pacienteId ?? "").trim();
  const turnoId = (input.turnoId ?? "").trim();
  if (!pacienteId || !turnoId) {
    return { success: false, message: "Datos de turno o paciente inválidos." };
  }

  try {
    const paciente = await db.user.findUnique({ where: { id: pacienteId } });
    if (!paciente) {
      return { success: false, message: "El paciente no existe." };
    }

    const actorNombre = formatearAutorCambioEstado({
      firstName: actorProfile.firstName,
      lastName: actorProfile.lastName,
      role: actorRole,
    });
    const pacienteNombre = `${paciente.firstName} ${paciente.lastName}`.trim();

    // Verificar si es un turno de vacunación en TurnoVacunacion
    const turnoVac =
      input.tipoTurno === "VACUNACION"
        ? await db.turnoVacunacion.findUnique({
            where: { id: turnoId },
            include: { vacuna: true },
          })
        : null;

    if (turnoVac) {
      const resCancVac = await cancelarTurnoVacunacion({
        turnoId: turnoVac.id,
        canceladoPorId: actorProfile.id,
        soloDelTitularId: paciente.id,
        validarPlazo: false,
      });

      if (!resCancVac.success) {
        return {
          success: false,
          message: "No se pudo cancelar el turno de vacunación seleccionado.",
        };
      }

      const fechaFormateada = formatearFechaAr(formatUtcDateString(turnoVac.date));

      await db.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "CANCELACION",
          tipoTurno: "VACUNACION",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoId: turnoVac.id,
          detalle: `Cancelación del turno de vacunación (${turnoVac.vacuna?.denominacion ?? "Vacunatorio"}) del ${fechaFormateada} ${turnoVac.startTime}`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      await enviarNotificacionCancelacionVacunacionMostrador(resCancVac.aviso);

      revalidatePath("/dashboard/mostrador");
      revalidatePath("/dashboard/mostrador/vacunacion");
      revalidatePath("/dashboard/agenda-vacunatorio");
      revalidatePath("/dashboard/mis-turnos");

      return {
        success: true,
        message: `Turno de vacunación del ${fechaFormateada} a las ${turnoVac.startTime} cancelado. Se envió el aviso por email al paciente.`,
      };
    }

    // Turno médico en tabla Turno
    const turno = await db.turno.findUnique({
      where: { id: turnoId },
      include: { doctor: true },
    });

    if (!turno) {
      return { success: false, message: "El turno no existe." };
    }

    if (turno.status !== "RESERVADO" || turno.reservedById !== paciente.id) {
      return {
        success: false,
        message: "Solo se puede cancelar un turno reservado del paciente seleccionado.",
      };
    }

    const profNombre = formatearProfesionalMostrador(turno.doctor);
    const fechaFormateada = formatearFechaAr(formatUtcDateString(turno.date));
    const motivoCancelacion =
      (input.motivo ?? "").trim() || "Cancelación solicitada en mostrador.";

    await db.$transaction(async (tx) => {
      // Libera el horario para que vuelva a estar DISPONIBLE (US-16 / RF-TUR-05)
      // y deja la constancia en TurnoCancelacion, TurnoEstadoAuditLog y MostradorOperacionLog.
      await tx.turno.update({
        where: { id: turno.id },
        data: {
          status: "DISPONIBLE",
          reservedById: null,
          personaAtendidaId: null,
          patientFirstName: null,
          patientLastName: null,
          motivoConsulta: null,
          reservedAt: null,
          recordatorioEstado: "PENDIENTE",
          recordatorioEnviadoAt: null,
          recordatorioIntentos: 0,
          recordatorioUltimoError: null,
          recordatorioEmailLogId: null,
        },
      });

      await tx.turnoCancelacion.create({
        data: {
          turnoId: turno.id,
          reservedById: paciente.id,
          doctorNombre: profNombre,
          date: turno.date,
          startTime: turno.startTime,
          endTime: turno.endTime,
          patientFirstName: turno.patientFirstName,
          patientLastName: turno.patientLastName,
        },
      });

      await tx.turnoEstadoAuditLog.create({
        data: {
          turnoId: turno.id,
          previousStatus: "RESERVADO",
          newStatus: "CANCELADO",
          changedById: actorProfile.id,
          changedByName: actorNombre,
          changedByRole: actorRole,
        },
      });

      await tx.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "CANCELACION",
          tipoTurno: "MEDICO",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoId: turno.id,
          detalle: `Cancelación del turno del ${fechaFormateada} ${turno.startTime} con ${profNombre}`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });
    });

    await enviarNotificacionCancelacionMedicoMostrador({
      pacienteNombre,
      pacienteEmail: paciente.email,
      doctorNombre: profNombre,
      especialidad: turno.doctor.specialty
        ? SPECIALTY_LABELS[turno.doctor.specialty]
        : "Consulta médica",
      date: turno.date,
      startTime: turno.startTime,
      motivo: motivoCancelacion,
    });

    revalidatePath("/dashboard/mostrador");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");
    revalidatePath("/dashboard/mis-turnos");
    revalidatePath("/dashboard/estado-turnos");

    return {
      success: true,
      message: `Turno del ${fechaFormateada} a las ${turno.startTime} cancelado. Se envió el aviso por email al paciente.`,
    };
  } catch (error) {
    console.error("cancelarTurnoMostradorAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al cancelar el turno.",
    };
  }
}

/**
 * Criterio 4, 5 y 6:
 * Reprograma un turno en una sola operación:
 * 1) Cancela el turno original (sin editar jamás su fecha, hora ni profesional — RF-AGE-09 / RN-10).
 * 2) Reserva el nuevo turno disponible.
 * 3) Registra la auditoría indicando qué administrativo realizó la operación.
 * 4) Envía al paciente el email correspondiente.
 */
export async function reprogramarTurnoMostradorAction(input: {
  pacienteId: string;
  turnoOriginalId: string;
  turnoNuevoId: string;
  tipoTurno?: TipoTurnoMostrador;
  vacunaId?: string;
  dosisPrevistaOrden?: number | null;
  motivoConsulta?: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede reprogramar turnos desde el mostrador.",
    };
  }

  const pacienteId = (input.pacienteId ?? "").trim();
  const turnoOriginalId = (input.turnoOriginalId ?? "").trim();
  const turnoNuevoId = (input.turnoNuevoId ?? "").trim();

  if (!pacienteId || !turnoOriginalId || !turnoNuevoId) {
    return {
      success: false,
      message: "Seleccioná el turno a reprogramar y el nuevo horario disponible.",
    };
  }

  try {
    const paciente = await db.user.findUnique({ where: { id: pacienteId } });
    if (!paciente) {
      return { success: false, message: "El paciente seleccionado no existe." };
    }

    const ahora = ahoraEnArgentina();
    const actorNombre = formatearAutorCambioEstado({
      firstName: actorProfile.firstName,
      lastName: actorProfile.lastName,
      role: actorRole,
    });
    const pacienteNombre = `${paciente.firstName} ${paciente.lastName}`.trim();

    // Caso A: Reprogramación de turno de vacunación (TurnoVacunacion, usando cancelarTurnoVacunacion + reservarTurnoVacunacion)
    const turnoVacOriginal = await db.turnoVacunacion.findUnique({
      where: { id: turnoOriginalId },
      include: { vacuna: true },
    });

    if (turnoVacOriginal) {
      const turnoVacNuevo = await db.turnoVacunacion.findUnique({
        where: { id: turnoNuevoId },
      });

      if (!turnoVacNuevo) {
        return {
          success: false,
          message: "El nuevo horario de vacunación seleccionado no existe.",
        };
      }

      const fechaOriginalIso = formatUtcDateString(turnoVacOriginal.date);
      const fechaNuevaIso = formatUtcDateString(turnoVacNuevo.date);

      const validacionVac = validarReprogramacionMostrador({
        turnoOriginal: {
          id: turnoVacOriginal.id,
          status: turnoVacOriginal.status,
          reservedById: turnoVacOriginal.reservedById,
          tipoTurno: "VACUNACION",
          date: fechaOriginalIso,
          startTime: turnoVacOriginal.startTime,
          doctorId: "vacunatorio",
        },
        turnoNuevo: {
          id: turnoVacNuevo.id,
          status: turnoVacNuevo.status,
          bloqueoId: null,
          tipoTurno: "VACUNACION",
          date: fechaNuevaIso,
          startTime: turnoVacNuevo.startTime,
          doctorId: "vacunatorio",
        },
        pacienteId: paciente.id,
        ahora,
      });

      if (!validacionVac.ok) {
        return { success: false, message: validacionVac.error };
      }

      const vacunaFinalId = (input.vacunaId ?? "").trim() || turnoVacOriginal.vacunaId;
      if (!vacunaFinalId) {
        return {
          success: false,
          message: "Seleccioná la vacuna del catálogo para reprogramar el turno.",
        };
      }

      // 1) Cancelar el turno original (GRUPO-D-VACUNATORIO.md: cancelar + reservar)
      const resCancel = await cancelarTurnoVacunacion({
        turnoId: turnoVacOriginal.id,
        canceladoPorId: actorProfile.id,
        soloDelTitularId: paciente.id,
        validarPlazo: false,
      });

      if (!resCancel.success) {
        return {
          success: false,
          message: "No se pudo cancelar el turno de vacunación original.",
        };
      }

      // 2) Reservar el nuevo turno
      const resReserva = await reservarTurnoVacunacion({
        turnoId: turnoVacNuevo.id,
        vacunaId: vacunaFinalId,
        dosisPrevistaOrden:
          input.dosisPrevistaOrden ?? turnoVacOriginal.dosisPrevistaOrden ?? null,
        titularId: paciente.id,
        otorgadoPorId: actorProfile.id,
      });

      const fechaOriginalAr = formatearFechaAr(fechaOriginalIso);
      const fechaNuevaAr = formatearFechaAr(fechaNuevaIso);

      if (!resReserva.success) {
        await enviarNotificacionCancelacionVacunacionMostrador(resCancel.aviso);
        return {
          success: false,
          message: `El turno original del ${fechaOriginalAr} (${turnoVacOriginal.startTime}) ya fue cancelado, pero el nuevo horario no pudo reservarse: ${resReserva.message}`,
        };
      }

      await db.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "REPROGRAMACION",
          tipoTurno: "VACUNACION",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoOriginalId: turnoVacOriginal.id,
          turnoId: turnoVacNuevo.id,
          detalle: `Reprogramación de vacunación: canceló turno ${fechaOriginalAr} ${turnoVacOriginal.startTime} y reservó ${fechaNuevaAr} ${turnoVacNuevo.startTime}`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      await Promise.all([
        enviarNotificacionCancelacionVacunacionMostrador(resCancel.aviso),
        enviarNotificacionReservaMostrador(turnoVacNuevo.id, "VACUNACION"),
      ]);

      revalidatePath("/dashboard/mostrador");
      revalidatePath("/dashboard/mostrador/vacunacion");
      revalidatePath("/dashboard/agenda-vacunatorio");
      revalidatePath("/dashboard/mis-turnos");

      return {
        success: true,
        message: `Turno de vacunación reprogramado: se canceló el turno del ${fechaOriginalAr} (${turnoVacOriginal.startTime}) y se reservó el nuevo turno para el ${fechaNuevaAr} a las ${turnoVacNuevo.startTime}. Se envió el email al paciente.`,
      };
    }

    // Caso B: Reprogramación de turno médico (tabla Turno)
    const [turnoOriginal, turnoNuevo] = await Promise.all([
      db.turno.findUnique({
        where: { id: turnoOriginalId },
        include: { doctor: true },
      }),
      db.turno.findUnique({
        where: { id: turnoNuevoId },
        include: { doctor: true },
      }),
    ]);

    if (!turnoOriginal || !turnoNuevo) {
      return {
        success: false,
        message: "No se encontraron los datos de los turnos indicados.",
      };
    }

    const fechaOriginalIso = formatUtcDateString(turnoOriginal.date);
    const fechaNuevaIso = formatUtcDateString(turnoNuevo.date);

    const validacion = validarReprogramacionMostrador({
      turnoOriginal: {
        id: turnoOriginal.id,
        status: turnoOriginal.status,
        reservedById: turnoOriginal.reservedById,
        tipoTurno: "MEDICO",
        date: fechaOriginalIso,
        startTime: turnoOriginal.startTime,
        doctorId: turnoOriginal.doctorId,
      },
      turnoNuevo: {
        id: turnoNuevo.id,
        status: turnoNuevo.status,
        bloqueoId: turnoNuevo.bloqueoId,
        tipoTurno: "MEDICO",
        date: fechaNuevaIso,
        startTime: turnoNuevo.startTime,
        doctorId: turnoNuevo.doctorId,
      },
      pacienteId: paciente.id,
      ahora,
    });

    if (!validacion.ok) {
      return {
        success: false,
        message: validacion.error,
      };
    }

    const profOriginalNombre = formatearProfesionalMostrador(turnoOriginal.doctor);
    const profNuevoNombre = formatearProfesionalMostrador(turnoNuevo.doctor);
    const fechaOriginalAr = formatearFechaAr(fechaOriginalIso);
    const fechaNuevaAr = formatearFechaAr(fechaNuevaIso);
    const motivoFinal =
      (input.motivoConsulta ?? "").trim() || turnoOriginal.motivoConsulta || null;

    const exito = await db.$transaction(async (tx) => {
      // Paso 1: Cancelar el turno original liberando el horario y guardando TurnoCancelacion
      // (en ningún caso se edita su fecha, hora ni profesional).
      const cancelado = await tx.turno.updateMany({
        where: {
          id: turnoOriginal.id,
          status: "RESERVADO",
          reservedById: paciente.id,
        },
        data: {
          status: "DISPONIBLE",
          reservedById: null,
          personaAtendidaId: null,
          patientFirstName: null,
          patientLastName: null,
          motivoConsulta: null,
          reservedAt: null,
          recordatorioEstado: "PENDIENTE",
          recordatorioEnviadoAt: null,
          recordatorioIntentos: 0,
          recordatorioUltimoError: null,
          recordatorioEmailLogId: null,
        },
      });

      if (cancelado.count === 0) {
        throw new Error("TURNO_ORIGINAL_NO_RESERVADO");
      }

      await tx.turnoCancelacion.create({
        data: {
          turnoId: turnoOriginal.id,
          reservedById: paciente.id,
          doctorNombre: profOriginalNombre,
          date: turnoOriginal.date,
          startTime: turnoOriginal.startTime,
          endTime: turnoOriginal.endTime,
          patientFirstName: turnoOriginal.patientFirstName ?? paciente.firstName,
          patientLastName: turnoOriginal.patientLastName ?? paciente.lastName,
        },
      });

      // Paso 2: Reservar de forma atómica el nuevo turno disponible.
      const reservado = await tx.turno.updateMany({
        where: {
          id: turnoNuevo.id,
          status: "DISPONIBLE",
          bloqueoId: null,
        },
        data: {
          status: "RESERVADO",
          reservedById: paciente.id,
          personaAtendidaId: turnoOriginal.personaAtendidaId,
          patientFirstName: turnoOriginal.patientFirstName ?? paciente.firstName,
          patientLastName: turnoOriginal.patientLastName ?? paciente.lastName,
          motivoConsulta: motivoFinal,
          reservedAt: new Date(),
        },
      });

      if (reservado.count === 0) {
        throw new Error("TURNO_NUEVO_NO_DISPONIBLE");
      }

      // Paso 3: Auditoría de estados sobre ambos turnos + log de operación de mostrador.
      await tx.turnoEstadoAuditLog.createMany({
        data: [
          {
            turnoId: turnoOriginal.id,
            previousStatus: "RESERVADO",
            newStatus: "CANCELADO",
            changedById: actorProfile.id,
            changedByName: actorNombre,
            changedByRole: actorRole,
          },
          {
            turnoId: turnoNuevo.id,
            previousStatus: "DISPONIBLE",
            newStatus: "RESERVADO",
            changedById: actorProfile.id,
            changedByName: actorNombre,
            changedByRole: actorRole,
          },
        ],
      });

      await tx.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "REPROGRAMACION",
          tipoTurno: "MEDICO",
          pacienteId: paciente.id,
          pacienteNombre,
          turnoOriginalId: turnoOriginal.id,
          turnoId: turnoNuevo.id,
          detalle: `Reprogramación: canceló turno ${fechaOriginalAr} ${turnoOriginal.startTime} (${profOriginalNombre}) y reservó ${fechaNuevaAr} ${turnoNuevo.startTime} (${profNuevoNombre})`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });

      return true;
    });

    if (!exito) {
      return {
        success: false,
        message: "No se pudo completar la reprogramación.",
      };
    }

    await Promise.all([
      enviarNotificacionCancelacionMedicoMostrador({
        pacienteNombre,
        pacienteEmail: paciente.email,
        doctorNombre: profOriginalNombre,
        especialidad: turnoOriginal.doctor.specialty
          ? SPECIALTY_LABELS[turnoOriginal.doctor.specialty]
          : "Consulta médica",
        date: turnoOriginal.date,
        startTime: turnoOriginal.startTime,
        motivo: `Reprogramado en mostrador al ${fechaNuevaAr} a las ${turnoNuevo.startTime} hs.`,
      }),
      enviarNotificacionReservaMostrador(turnoNuevo.id, "MEDICO"),
    ]);

    revalidatePath("/dashboard/mostrador");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");
    revalidatePath("/dashboard/mis-turnos");
    revalidatePath("/dashboard/estado-turnos");

    return {
      success: true,
      message: `Turno reprogramado: se canceló el turno del ${fechaOriginalAr} (${turnoOriginal.startTime}) y se reservó el nuevo turno para el ${fechaNuevaAr} a las ${turnoNuevo.startTime} (${profNuevoNombre}). Se envió el email al paciente.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "TURNO_NUEVO_NO_DISPONIBLE") {
      return {
        success: false,
        message:
          "El nuevo horario seleccionado dejó de estar disponible. El turno original se mantuvo sin cambios.",
      };
    }
    console.error("reprogramarTurnoMostradorAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al reprogramar el turno.",
    };
  }
}

/**
 * Marca un turno ya ocurrido del paciente como CUMPLIDO o AUSENTE desde el mostrador
 * (Sección 4 del wireframe `wf_mostrador.html`, integrado con US-18 y Pagos US-34/35).
 */
export async function marcarAsistenciaMostradorAction(input: {
  pacienteId: string;
  turnoId: string;
  nuevoEstado: "CUMPLIDO" | "AUSENTE";
}): Promise<{
  success: boolean;
  message: string;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo el personal administrativo puede registrar asistencia desde el mostrador.",
    };
  }

  const res = await registrarEstadoTurnoAction({
    turnoId: input.turnoId,
    nuevoEstado: input.nuevoEstado,
  });

  if (!res.success) {
    return {
      success: false,
      message: res.message,
    };
  }

  try {
    const [paciente, turno] = await Promise.all([
      db.user.findUnique({ where: { id: input.pacienteId } }),
      db.turno.findUnique({ where: { id: input.turnoId }, include: { doctor: true } }),
    ]);

    if (paciente && turno) {
      const actorNombre = formatearAutorCambioEstado({
        firstName: actorProfile.firstName,
        lastName: actorProfile.lastName,
        role: actorRole,
      });
      const fechaAr = formatearFechaAr(formatUtcDateString(turno.date));
      const profNombre = formatearProfesionalMostrador(turno.doctor);
      const etiqueta = ESTADO_TURNO_LABELS[input.nuevoEstado];

      await db.mostradorOperacionLog.create({
        data: {
          tipoOperacion: "ASISTENCIA",
          tipoTurno: resolverTipoTurnoPorRol(turno.doctor.role),
          pacienteId: paciente.id,
          pacienteNombre: `${paciente.firstName} ${paciente.lastName}`.trim(),
          turnoId: turno.id,
          detalle: `Marcó turno del ${fechaAr} ${turno.startTime} (${profNombre}) como ${etiqueta}`,
          realizadoPorId: actorProfile.id,
          realizadoPorNombre: actorNombre,
          realizadoPorRole: actorRole,
        },
      });
    }
  } catch (err) {
    console.warn("[US-17] No se pudo registrar log secundario de asistencia:", err);
  }

  revalidatePath("/dashboard/mostrador");
  revalidatePath("/dashboard/pagos");
  return {
    success: true,
    message: res.message,
  };
}
