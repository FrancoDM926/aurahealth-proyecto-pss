"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { esFechaValida, toFecha } from "@/lib/agenda-profesional";
import { todayInArgentina } from "@/lib/availability-rn02";
import { SPECIALTY_LABELS } from "@/lib/roles";
import {
  efectosEstadoTurno,
  ESTADO_TURNO_LABELS,
  formatearAutorCambioEstado,
  formatearFechaHoraAuditoriaAr,
  puedeModificarEstadoEnFecha,
  resolverNombrePacienteTurno,
  validarCambioEstadoTurno,
  type EfectosEstadoTurno,
} from "@/lib/estado-turno";
import type { EstadoTurno, MedicalSpecialty, Role } from "@/generated/prisma/client";

export type TurnoAsistenciaItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: EstadoTurno;
  doctorId: string;
  doctorName: string;
  specialtyLabel: string;
  pacienteNombre: string;
  motivoConsulta: string | null;
  puedeModificarHoy: boolean;
  efectos: EfectosEstadoTurno;
};

export type RegistroAuditoriaEstadoItem = {
  id: string;
  turnoId: string;
  turnoDescripcion: string;
  previousStatus: EstadoTurno;
  newStatus: EstadoTurno;
  newStatusLabel: string;
  changedByName: string;
  changedByRole: Role;
  fechaHoraFormateada: string;
};

export type ProfesionalSelectorItem = {
  id: string;
  fullName: string;
  specialtyLabel: string;
};

export type DatosPaginaEstadoTurnos = {
  fecha: string;
  hoy: string;
  puedeModificarEnFechaSeleccionada: boolean;
  viewerRole: Role;
  doctorFiltroId: string;
  profesionales: ProfesionalSelectorItem[];
  turnos: TurnoAsistenciaItem[];
  auditoria: RegistroAuditoriaEstadoItem[];
  fechasConTurnosReservados: string[];
};

export type RegistrarEstadoTurnoResult = {
  success: boolean;
  message: string;
  efectos?: EfectosEstadoTurno;
};

type RawTurnoDiaRow = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  status: EstadoTurno;
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorSpecialty: MedicalSpecialty | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  motivoConsulta: string | null;
  reservedByFirstName: string | null;
  reservedByLastName: string | null;
};

type RawAuditoriaRow = {
  id: string;
  turnoId: string;
  previousStatus: EstadoTurno;
  newStatus: EstadoTurno;
  changedByName: string;
  changedByRole: Role;
  changedAt: Date;
  startTime: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  reservedByFirstName: string | null;
  reservedByLastName: string | null;
};

async function consultarTurnosDelDia(
  fechaUtc: Date,
  doctorFiltroId: string
): Promise<RawTurnoDiaRow[]> {
  const filtroDoctor = doctorFiltroId
    ? Prisma.sql`AND t."doctorId" = ${doctorFiltroId}`
    : Prisma.empty;

  return db.$queryRaw<RawTurnoDiaRow[]>(Prisma.sql`
    SELECT
      t."id",
      t."date",
      t."startTime",
      t."endTime",
      t."status",
      t."doctorId",
      d."firstName" AS "doctorFirstName",
      d."lastName" AS "doctorLastName",
      d."specialty" AS "doctorSpecialty",
      t."patientFirstName",
      t."patientLastName",
      t."motivoConsulta",
      r."firstName" AS "reservedByFirstName",
      r."lastName" AS "reservedByLastName"
    FROM "Turno" t
    INNER JOIN "User" d ON d."id" = t."doctorId"
    LEFT JOIN "User" r ON r."id" = t."reservedById"
    WHERE t."date" = ${fechaUtc}
    ${filtroDoctor}
    ORDER BY t."startTime" ASC, t."doctorId" ASC
  `);
}

async function consultarAuditoriaDelDia(
  fechaUtc: Date,
  doctorFiltroId: string
): Promise<RawAuditoriaRow[]> {
  const filtroDoctor = doctorFiltroId
    ? Prisma.sql`AND t."doctorId" = ${doctorFiltroId}`
    : Prisma.empty;

  return db.$queryRaw<RawAuditoriaRow[]>(Prisma.sql`
    SELECT
      a."id",
      a."turnoId",
      a."previousStatus",
      a."newStatus",
      a."changedByName",
      a."changedByRole",
      a."changedAt",
      t."startTime",
      t."patientFirstName",
      t."patientLastName",
      r."firstName" AS "reservedByFirstName",
      r."lastName" AS "reservedByLastName"
    FROM "TurnoEstadoAuditLog" a
    INNER JOIN "Turno" t ON t."id" = a."turnoId"
    LEFT JOIN "User" r ON r."id" = t."reservedById"
    WHERE t."date" = ${fechaUtc}
    ${filtroDoctor}
    ORDER BY a."changedAt" DESC
  `);
}

/**
 * Obtiene los turnos del día de hoy y la tabla de auditoría de cambios de estado (US-18).
 * - Si el usuario es MEDICO, consulta únicamente su propia agenda.
 * - Si el usuario es ADMINISTRATIVO, puede consultar todos los médicos o filtrar por uno.
 */
export async function obtenerTurnosDelDiaParaAsistencia(params?: {
  doctorId?: string | null;
}): Promise<DatosPaginaEstadoTurnos> {
  const { role, profile } = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
  const hoy = todayInArgentina();
  const fecha = hoy;

  const doctorFiltroId =
    role === "MEDICO" ? profile.id : (params?.doctorId ?? "").trim();

  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);

  const [doctorsRows, turnosRows, auditoriaRows] = await Promise.all([
    role === "ADMINISTRATIVO"
      ? db.user.findMany({
          where: { role: "MEDICO", isActive: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialty: true,
          },
        })
      : Promise.resolve([]),
    consultarTurnosDelDia(fechaUtc, doctorFiltroId),
    consultarAuditoriaDelDia(fechaUtc, doctorFiltroId),
  ]);

  const profesionales: ProfesionalSelectorItem[] = doctorsRows.map((d) => ({
    id: d.id,
    fullName: `Dr. ${d.firstName} ${d.lastName}`,
    specialtyLabel: d.specialty ? SPECIALTY_LABELS[d.specialty] : "Consulta médica",
  }));

  const puedeModificarEnFecha = puedeModificarEstadoEnFecha(fecha, hoy);

  const turnos: TurnoAsistenciaItem[] = turnosRows.map((t) => {
    const dateStr = toFecha(new Date(t.date));
    const reservedBy =
      t.reservedByFirstName || t.reservedByLastName
        ? {
            firstName: t.reservedByFirstName ?? "",
            lastName: t.reservedByLastName ?? "",
          }
        : null;

    const pacienteNombre = resolverNombrePacienteTurno({
      status: t.status,
      patientFirstName: t.patientFirstName,
      patientLastName: t.patientLastName,
      reservedBy,
    });

    return {
      id: t.id,
      date: dateStr,
      startTime: t.startTime,
      endTime: t.endTime,
      status: t.status,
      doctorId: t.doctorId,
      doctorName: `Dr. ${t.doctorFirstName} ${t.doctorLastName}`,
      specialtyLabel: t.doctorSpecialty
        ? SPECIALTY_LABELS[t.doctorSpecialty]
        : "Consulta médica",
      pacienteNombre,
      motivoConsulta: t.motivoConsulta ?? null,
      puedeModificarHoy: t.status === "RESERVADO" && puedeModificarEnFecha,
      efectos: efectosEstadoTurno(t.status),
    };
  });

  const auditoria: RegistroAuditoriaEstadoItem[] = auditoriaRows.map((log) => {
    const reservedBy =
      log.reservedByFirstName || log.reservedByLastName
        ? {
            firstName: log.reservedByFirstName ?? "",
            lastName: log.reservedByLastName ?? "",
          }
        : null;

    const paciente = resolverNombrePacienteTurno({
      status: log.newStatus,
      patientFirstName: log.patientFirstName,
      patientLastName: log.patientLastName,
      reservedBy,
    });

    return {
      id: log.id,
      turnoId: log.turnoId,
      turnoDescripcion: `${log.startTime} · ${paciente}`,
      previousStatus: log.previousStatus,
      newStatus: log.newStatus,
      newStatusLabel: ESTADO_TURNO_LABELS[log.newStatus],
      changedByName: log.changedByName,
      changedByRole: log.changedByRole,
      fechaHoraFormateada: formatearFechaHoraAuditoriaAr(new Date(log.changedAt)),
    };
  });

  return {
    fecha,
    hoy,
    puedeModificarEnFechaSeleccionada: puedeModificarEnFecha,
    viewerRole: role,
    doctorFiltroId,
    profesionales,
    turnos,
    auditoria,
    fechasConTurnosReservados: [],
  };
}

/**
 * US-18: Registra el cambio de estado de un turno (CUMPLIDO, AUSENTE o CANCELADO)
 * dejando constancia auditable de quién realizó el cambio y cuándo (RF-TUR-07).
 */
export async function registrarEstadoTurnoAction(input: {
  turnoId: string;
  nuevoEstado: EstadoTurno;
}): Promise<RegistrarEstadoTurnoResult> {
  let actorRole: Role;
  let actorProfile: { id: string; firstName: string; lastName: string };

  try {
    const session = await assertRoles(["MEDICO", "ADMINISTRATIVO"]);
    actorRole = session.role;
    actorProfile = session.profile;
  } catch {
    return {
      success: false,
      message: "Solo un médico o personal administrativo puede registrar el estado del turno.",
    };
  }

  const turnoId = (input.turnoId ?? "").trim();
  if (!turnoId) {
    return { success: false, message: "Identificador de turno inválido." };
  }

  try {
    const turno = await db.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        doctorId: true,
        date: true,
        startTime: true,
        status: true,
      },
    });

    if (!turno) {
      return { success: false, message: "El turno indicado no existe." };
    }

    const hoy = todayInArgentina();
    const fechaTurno = toFecha(turno.date);

    const validacion = validarCambioEstadoTurno({
      turno: {
        id: turno.id,
        doctorId: turno.doctorId,
        date: fechaTurno,
        status: turno.status,
      },
      nuevoEstado: input.nuevoEstado,
      actor: {
        id: actorProfile.id,
        role: actorRole,
      },
      hoyArgentina: hoy,
    });

    if (!validacion.valid) {
      return {
        success: false,
        message: validacion.error,
      };
    }

    const changedByName = formatearAutorCambioEstado({
      firstName: actorProfile.firstName,
      lastName: actorProfile.lastName,
      role: actorRole,
    });

    const auditId = randomUUID();

    await db.$transaction([
      // Actualiza únicamente el estado del turno; los datos de la reserva original
      // permanecen intactos (no constituye modificación en términos de RF-AGE-09).
      db.turno.update({
        where: { id: turno.id },
        data: { status: validacion.nuevoEstado },
      }),
      db.$executeRaw`
        INSERT INTO "TurnoEstadoAuditLog" (
          "id",
          "turnoId",
          "previousStatus",
          "newStatus",
          "changedById",
          "changedByName",
          "changedByRole",
          "changedAt"
        ) VALUES (
          ${auditId},
          ${turno.id},
          CAST(${turno.status} AS "EstadoTurno"),
          CAST(${validacion.nuevoEstado} AS "EstadoTurno"),
          ${actorProfile.id},
          ${changedByName},
          CAST(${actorRole} AS "Role"),
          CURRENT_TIMESTAMP
        )
      `,
    ]);

    revalidatePath("/dashboard/estado-turnos");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");

    const efectos = efectosEstadoTurno(validacion.nuevoEstado);
    const etiqueta = ESTADO_TURNO_LABELS[validacion.nuevoEstado].toLowerCase();

    return {
      success: true,
      message: `Turno de las ${turno.startTime} marcado como ${etiqueta}.`,
      efectos,
    };
  } catch (error) {
    console.error("registrarEstadoTurnoAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al registrar el estado del turno.",
    };
  }
}
