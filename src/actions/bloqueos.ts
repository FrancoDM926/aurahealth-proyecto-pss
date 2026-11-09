"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { ahoraEnArgentina, formatearFechaAr } from "@/lib/busqueda-turnos";
import {
  clasificarTurnosDeFranja,
  construirPreviewBloqueoFranja,
  construirTextoAvisoBloqueo,
  esBloqueoReversible,
  etiquetaEstadoAviso,
  formatearFechaCortaDdMm,
  formatearRangoFechasAr,
  validarSolicitudBloqueo,
  type DatosFranjaBloqueoInput,
  type PacienteAContactar,
  type PreviewBloqueoFranja,
  type TurnoEnFranjaCandidato,
} from "@/lib/bloqueo-agenda";
import { enviarAvisosBloqueoAgenda } from "@/services/notificaciones/bloqueo-agenda";
import type { Role } from "@/generated/prisma/client";

export type DoctorOpcionBloqueo = {
  id: string;
  fullName: string;
  specialtyLabel: string;
};

export type ResumenBloqueoRegistrado = {
  id: string;
  doctorId: string;
  doctorNombre: string;
  especialidadLabel: string;
  dia: string;
  diaHasta: string;
  fechaRangoFormateada: string;
  desde: string;
  hasta: string;
  motivo: string;
  registradoElTexto: string;
  createdByName: string;
  createdByRole: Role;
  revertedAt: string | null;
  reversible: boolean;
  motivoNoReversible: string | null;
  cantidadTurnosBloqueados: number;
  cantidadReservadosAfectados: number;
  previewEmail: {
    subject: string;
    bodyText: string;
  };
  pacientesAContactar: PacienteAContactar[];
};

export type ContextoBloqueoFranja = {
  actorRole: Role;
  selectedDoctorId: string;
  doctores: DoctorOpcionBloqueo[];
  hoy: string;
  bloqueosRegistrados: ResumenBloqueoRegistrado[];
};

function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateTimeArgentina(date: Date): string {
  const fecha = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${fecha} ${hora}`;
}

async function cargarTurnosCandidatosEnRango(
  doctorId: string,
  dia: string,
  diaHasta: string
): Promise<TurnoEnFranjaCandidato[]> {
  const rows = await db.turno.findMany({
    where: {
      doctorId,
      date: {
        gte: new Date(`${dia}T00:00:00.000Z`),
        lte: new Date(`${diaHasta}T00:00:00.000Z`),
      },
    },
    include: {
      reservedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    doctorId: r.doctorId,
    date: formatUtcDateString(r.date),
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    bloqueoId: r.bloqueoId,
    patientFirstName: r.patientFirstName,
    patientLastName: r.patientLastName,
    reservedBy: r.reservedBy,
  }));
}

async function construirResumenesBloqueos(whereDoctorId?: string): Promise<ResumenBloqueoRegistrado[]> {
  const ahora = ahoraEnArgentina();

  const rows = await db.bloqueoAgenda.findMany({
    where: whereDoctorId ? { doctorId: whereDoctorId } : undefined,
    include: {
      doctor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
        },
      },
      avisosPacientes: {
        orderBy: [{ fechaTurno: "asc" }, { startTime: "asc" }],
      },
      _count: {
        select: {
          turnosBloqueados: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });

  return rows.map((b) => {
    const dia = formatUtcDateString(b.date);
    const diaHasta = formatUtcDateString(b.dateHasta);
    const fechaRangoFormateada = formatearRangoFechasAr(dia, diaHasta);
    const doctorNombre = `Dr. ${b.doctor.firstName} ${b.doctor.lastName}`;
    const especialidadLabel = b.doctor.specialty
      ? SPECIALTY_LABELS[b.doctor.specialty]
      : "Consulta médica";

    const rev = esBloqueoReversible(
      {
        date: dia,
        dateHasta: diaHasta,
        endTime: b.endTime,
        revertedAt: b.revertedAt,
      },
      ahora
    );

    const pacientesAContactar: PacienteAContactar[] = b.avisosPacientes.map((a) => {
      const fechaTurnoIso = formatUtcDateString(a.fechaTurno);
      const fechaTurnoFormateada = formatearFechaAr(fechaTurnoIso);
      const partesContacto: string[] = [];
      if (a.pacienteEmail) partesContacto.push(a.pacienteEmail);
      if (a.pacienteTelefono) partesContacto.push(a.pacienteTelefono);

      return {
        id: a.id,
        turnoId: a.turnoId,
        pacienteNombre: a.pacienteNombre,
        pacienteEmail: a.pacienteEmail,
        pacienteTelefono: a.pacienteTelefono,
        contactoTexto: partesContacto.length > 0 ? partesContacto.join(" · ") : "Sin datos de contacto",
        fechaTurno: fechaTurnoIso,
        fechaTurnoFormateada,
        startTime: a.startTime,
        endTime: a.endTime,
        turnoAfectadoTexto: `${fechaTurnoFormateada} · ${a.startTime}`,
        emailStatus: a.emailStatus,
        estadoAvisoLabel: etiquetaEstadoAviso(a.emailStatus),
      };
    });

    const primerAfectado = pacientesAContactar[0];
    const previewEmail = construirTextoAvisoBloqueo({
      pacienteNombre: primerAfectado?.pacienteNombre ?? "Paciente",
      doctorNombre,
      fechaFranjaTexto: fechaRangoFormateada,
      desde: b.startTime,
      hasta: b.endTime,
      fechaTurno: primerAfectado?.fechaTurnoFormateada ?? formatearFechaAr(dia),
      fechaTurnoCorta: primerAfectado
        ? formatearFechaCortaDdMm(primerAfectado.fechaTurno)
        : formatearFechaCortaDdMm(dia),
      horaTurno: primerAfectado?.startTime ?? b.startTime,
      motivo: b.motivo,
    });

    return {
      id: b.id,
      doctorId: b.doctorId,
      doctorNombre,
      especialidadLabel,
      dia,
      diaHasta,
      fechaRangoFormateada,
      desde: b.startTime,
      hasta: b.endTime,
      motivo: b.motivo,
      registradoElTexto: formatDateTimeArgentina(b.createdAt),
      createdByName: b.createdByName,
      createdByRole: b.createdByRole,
      revertedAt: b.revertedAt ? formatDateTimeArgentina(b.revertedAt) : null,
      reversible: rev.reversible,
      motivoNoReversible: rev.motivoNoReversible,
      cantidadTurnosBloqueados: b._count.turnosBloqueados,
      cantidadReservadosAfectados: pacientesAContactar.length,
      previewEmail,
      pacientesAContactar,
    };
  });
}

export async function obtenerContextoBloqueoFranja(params?: {
  doctorId?: string;
}): Promise<ContextoBloqueoFranja> {
  const { role, profile } = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
  const ahora = ahoraEnArgentina();

  const doctorsRows = await db.user.findMany({
    where: {
      role: "MEDICO",
      isActive: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialty: true,
    },
  });

  const doctores: DoctorOpcionBloqueo[] = doctorsRows.map((d) => ({
    id: d.id,
    fullName: `Dr. ${d.firstName} ${d.lastName}`,
    specialtyLabel: d.specialty ? SPECIALTY_LABELS[d.specialty] : "Consulta médica",
  }));

  const selectedDoctorId =
    role === "MEDICO"
      ? profile.id
      : params?.doctorId && doctores.some((d) => d.id === params.doctorId)
        ? params.doctorId
        : (doctores[0]?.id ?? "");

  const bloqueosRegistrados = await construirResumenesBloqueos(
    role === "MEDICO" ? profile.id : undefined
  );

  return {
    actorRole: role,
    selectedDoctorId,
    doctores,
    hoy: ahora.fecha,
    bloqueosRegistrados,
  };
}

export async function previsualizarBloqueoFranjaAction(
  input: DatosFranjaBloqueoInput
): Promise<{
  success: boolean;
  message?: string;
  preview?: PreviewBloqueoFranja;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo un médico o el personal administrativo puede consultar y bloquear franjas.",
    };
  }

  const ahora = ahoraEnArgentina();
  const validacion = validarSolicitudBloqueo(
    input,
    {
      id: actorProfile.id,
      role: actorRole,
      fullName: `${actorProfile.firstName} ${actorProfile.lastName}`,
    },
    ahora,
    { exigirMotivo: false }
  );

  if (!validacion.ok) {
    return {
      success: false,
      message: validacion.error,
    };
  }

  const { doctorId, dia, diaHasta, desde, hasta } = validacion.datos;
  const doctor = await db.user.findUnique({
    where: { id: doctorId },
    select: { id: true, firstName: true, lastName: true, role: true, isActive: true },
  });

  if (!doctor || doctor.role !== "MEDICO" || !doctor.isActive) {
    return {
      success: false,
      message: "El profesional seleccionado no es válido o no se encuentra activo.",
    };
  }

  const turnosCandidatos = await cargarTurnosCandidatosEnRango(doctorId, dia, diaHasta);
  const preview = construirPreviewBloqueoFranja(turnosCandidatos, {
    doctorId,
    doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
    dia,
    diaHasta,
    desde,
    hasta,
  });

  return {
    success: true,
    preview,
  };
}

export async function confirmarBloqueoFranjaAction(
  input: DatosFranjaBloqueoInput
): Promise<{
  success: boolean;
  message: string;
  bloqueoId?: string;
  bloqueadosCount?: number;
  reservadosAfectadosCount?: number;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo un médico o el personal administrativo puede bloquear franjas de agenda.",
    };
  }

  const ahora = ahoraEnArgentina();
  const actorNombre =
    actorRole === "MEDICO"
      ? `Dr. ${actorProfile.firstName} ${actorProfile.lastName}`
      : `${actorProfile.firstName} ${actorProfile.lastName}`;

  const validacion = validarSolicitudBloqueo(
    input,
    {
      id: actorProfile.id,
      role: actorRole,
      fullName: actorNombre,
    },
    ahora,
    { exigirMotivo: true }
  );

  if (!validacion.ok) {
    return {
      success: false,
      message: validacion.error,
    };
  }

  const { doctorId, dia, diaHasta, desde, hasta, motivo } = validacion.datos;

  try {
    const doctor = await db.user.findUnique({
      where: { id: doctorId },
      select: { id: true, firstName: true, lastName: true, role: true, isActive: true },
    });

    if (!doctor || doctor.role !== "MEDICO" || !doctor.isActive) {
      return {
        success: false,
        message: "El profesional seleccionado no es válido o no se encuentra activo.",
      };
    }

    const turnosCandidatos = await cargarTurnosCandidatosEnRango(doctorId, dia, diaHasta);
    const { turnosLibres, turnosReservados } = clasificarTurnosDeFranja(turnosCandidatos, {
      doctorId,
      dia,
      diaHasta,
      desde,
      hasta,
    });

    if (turnosLibres.length === 0 && turnosReservados.length === 0) {
      return {
        success: false,
        message:
          "No se encontraron turnos publicados (libres ni reservados) dentro de la franja seleccionada.",
      };
    }

    const { bloqueoId, bloqueadosCount } = await db.$transaction(async (tx) => {
      const creado = await tx.bloqueoAgenda.create({
        data: {
          doctorId,
          date: new Date(`${dia}T00:00:00.000Z`),
          dateHasta: new Date(`${diaHasta}T00:00:00.000Z`),
          startTime: desde,
          endTime: hasta,
          motivo,
          createdById: actorProfile.id,
          createdByName: actorNombre,
          createdByRole: actorRole,
        },
      });

      let count = 0;
      if (turnosLibres.length > 0) {
        const updated = await tx.turno.updateMany({
          where: {
            id: { in: turnosLibres.map((t) => t.id) },
            status: "DISPONIBLE",
            bloqueoId: null,
          },
          data: {
            bloqueoId: creado.id,
          },
        });
        count = updated.count;
      }

      // RF-AGE-09: Los turnos reservados NO se modifican. Se registran en BloqueoAviso
      // para disparar la notificación por email (US-22) y listarlos al administrativo.
      if (turnosReservados.length > 0) {
        await tx.bloqueoAviso.createMany({
          data: turnosReservados.map((r) => ({
            bloqueoId: creado.id,
            turnoId: r.id,
            pacienteNombre: r.pacienteNombre,
            pacienteEmail: r.pacienteEmail,
            pacienteTelefono: r.pacienteTelefono,
            fechaTurno: new Date(`${r.date}T00:00:00.000Z`),
            startTime: r.startTime,
            endTime: r.endTime,
            emailStatus: "PENDING",
          })),
          skipDuplicates: true,
        });
      }

      return { bloqueoId: creado.id, bloqueadosCount: count };
    });

    if (turnosReservados.length > 0) {
      await enviarAvisosBloqueoAgenda(bloqueoId);
    }

    revalidatePath("/dashboard/bloqueo-franja");
    revalidatePath("/dashboard/bloqueos");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");
    revalidatePath("/dashboard/reservar");

    const detalleReservados =
      turnosReservados.length > 0
        ? ` ${turnosReservados.length} turno(s) reservado(s) quedaron sin modificar y se envió el aviso por email a los pacientes afectados.`
        : "";

    return {
      success: true,
      message: `Bloqueo registrado: ${bloqueadosCount} turno(s) libre(s) bloqueado(s).${detalleReservados}`,
      bloqueoId,
      bloqueadosCount,
      reservadosAfectadosCount: turnosReservados.length,
    };
  } catch (error) {
    console.error("confirmarBloqueoFranjaAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al registrar el bloqueo de la franja.",
    };
  }
}

export async function revertirBloqueoFranjaAction(input: {
  bloqueoId: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  let actorProfile;
  let actorRole: Role;
  try {
    const auth = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
    actorProfile = auth.profile;
    actorRole = auth.role;
  } catch {
    return {
      success: false,
      message: "Solo un médico o el personal administrativo puede revertir un bloqueo.",
    };
  }

  const bloqueoId = (input.bloqueoId ?? "").trim();
  if (!bloqueoId) {
    return { success: false, message: "Identificador de bloqueo inválido." };
  }

  try {
    const bloqueo = await db.bloqueoAgenda.findUnique({
      where: { id: bloqueoId },
    });

    if (!bloqueo) {
      return { success: false, message: "El bloqueo indicado no existe." };
    }

    if (actorRole === "MEDICO" && bloqueo.doctorId !== actorProfile.id) {
      return {
        success: false,
        message: "Un médico solo puede revertir bloqueos de su propia agenda.",
      };
    }

    const ahora = ahoraEnArgentina();
    const dia = formatUtcDateString(bloqueo.date);
    const diaHasta = formatUtcDateString(bloqueo.dateHasta);

    const estadoRev = esBloqueoReversible(
      {
        date: dia,
        dateHasta: diaHasta,
        endTime: bloqueo.endTime,
        revertedAt: bloqueo.revertedAt,
      },
      ahora
    );

    if (!estadoRev.reversible) {
      return {
        success: false,
        message: estadoRev.motivoNoReversible ?? "Este bloqueo no puede revertirse.",
      };
    }

    let liberados = 0;
    await db.$transaction(async (tx) => {
      const updated = await tx.turno.updateMany({
        where: {
          bloqueoId: bloqueo.id,
          status: "DISPONIBLE",
        },
        data: {
          bloqueoId: null,
        },
      });
      liberados = updated.count;

      await tx.bloqueoAgenda.update({
        where: { id: bloqueo.id },
        data: {
          revertedAt: new Date(),
          revertedById: actorProfile.id,
        },
      });
    });

    revalidatePath("/dashboard/bloqueo-franja");
    revalidatePath("/dashboard/bloqueos");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");
    revalidatePath("/dashboard/reservar");

    return {
      success: true,
      message: `Bloqueo revertido correctamente. ${liberados} turno(s) libre(s) volvieron a estar disponibles.`,
    };
  } catch (error) {
    console.error("revertirBloqueoFranjaAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al revertir el bloqueo.",
    };
  }
}

export async function obtenerListadoBloqueosYAvisos(): Promise<{
  actorRole: Role;
  bloqueos: ResumenBloqueoRegistrado[];
}> {
  const { role, profile } = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
  const bloqueos = await construirResumenesBloqueos(
    role === "MEDICO" ? profile.id : undefined
  );
  return {
    actorRole: role,
    bloqueos,
  };
}
