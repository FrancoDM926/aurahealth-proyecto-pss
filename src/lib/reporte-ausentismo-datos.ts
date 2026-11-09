import { db } from "@/lib/db";
import { fechaUtcString, parseFechaUtc } from "@/lib/fecha-utc";
import { SPECIALTY_LABELS } from "@/lib/roles";
import {
  armarReporteAusentismo,
  diaDeLaSemanaAr,
  type FiltrosReporteAusentismo,
  type ReporteAusentismo,
  type TurnoReporteAusentismo,
} from "@/lib/reporte-ausentismo";
import type { EstadoTurno } from "@/generated/prisma/client";

export type OpcionProfesionalAusentismo = {
  id: string;
  nombre: string;
  rol: "MEDICO" | "ENFERMERA";
  especialidadLabel: string;
};

/**
 * US-48: Obtiene las opciones de profesionales (médicos y enfermeras) para el selector de filtros.
 */
export async function opcionesFiltrosReporteAusentismo(): Promise<{
  profesionales: OpcionProfesionalAusentismo[];
}> {
  const [medicos, enfermeras] = await Promise.all([
    db.user.findMany({
      where: { role: "MEDICO", isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, specialty: true },
    }),
    db.user.findMany({
      where: { role: "ENFERMERA", isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const opciones: OpcionProfesionalAusentismo[] = [
    ...medicos.map((m) => ({
      id: m.id,
      nombre: `Dr. ${m.firstName} ${m.lastName}`,
      rol: "MEDICO" as const,
      especialidadLabel: m.specialty ? SPECIALTY_LABELS[m.specialty] : "Clínica médica",
    })),
    ...enfermeras.map((e) => ({
      id: e.id,
      nombre: `Enf. ${e.firstName} ${e.lastName}`,
      rol: "ENFERMERA" as const,
      especialidadLabel: "Vacunatorio",
    })),
  ];

  return { profesionales: opciones };
}

function formatearNombrePaciente(t: {
  patientFirstName?: string | null;
  patientLastName?: string | null;
  personaAtendida?: { firstName: string; lastName: string } | null;
  reservedBy?: { firstName: string; lastName: string } | null;
}): string {
  if (t.patientFirstName && t.patientLastName) {
    return `${t.patientFirstName} ${t.patientLastName}`.trim();
  }
  if (t.personaAtendida) {
    return `${t.personaAtendida.firstName} ${t.personaAtendida.lastName}`.trim();
  }
  if (t.reservedBy) {
    return `${t.reservedBy.firstName} ${t.reservedBy.lastName}`.trim();
  }
  return "Paciente";
}

/**
 * US-48: Lee los turnos del período (consultas médicas y vacunación) con los filtros pedidos
 * y calcula el reporte de ausentismo.
 */
export async function consultarReporteAusentismo(
  filtros: FiltrosReporteAusentismo
): Promise<ReporteAusentismo> {
  const desdeDate = parseFechaUtc(filtros.desde);
  const hastaDate = parseFechaUtc(filtros.hasta);

  let profesionalTarget: { id: string; role: string } | null = null;
  if (filtros.profesionalId) {
    const user = await db.user.findUnique({
      where: { id: filtros.profesionalId },
      select: { id: true, role: true },
    });
    if (user) {
      profesionalTarget = { id: user.id, role: user.role };
    }
  }

  const incluirMedicos = !profesionalTarget || profesionalTarget.role === "MEDICO";
  const incluirVacunatorio = !profesionalTarget || profesionalTarget.role === "ENFERMERA";

  const estadosValidos: EstadoTurno[] = ["RESERVADO", "CUMPLIDO", "AUSENTE", "CANCELADO"];

  const [turnosMedicos, turnosVacunacion] = await Promise.all([
    incluirMedicos
      ? db.turno.findMany({
          where: {
            date: { gte: desdeDate, lte: hastaDate },
            status: { in: estadosValidos },
            ...(profesionalTarget?.role === "MEDICO"
              ? { doctorId: profesionalTarget.id }
              : {}),
          },
          include: {
            doctor: { select: { id: true, firstName: true, lastName: true, specialty: true } },
            reservedBy: { select: { id: true, firstName: true, lastName: true } },
            personaAtendida: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        })
      : Promise.resolve([]),
    incluirVacunatorio
      ? db.turnoVacunacion.findMany({
          where: {
            date: { gte: desdeDate, lte: hastaDate },
            status: { in: estadosValidos },
            ...(profesionalTarget?.role === "ENFERMERA"
              ? {
                  OR: [
                    { jornada: { createdById: profesionalTarget.id } },
                    { otorgadoPorId: profesionalTarget.id },
                  ],
                }
              : {}),
          },
          include: {
            jornada: {
              include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            reservedBy: { select: { id: true, firstName: true, lastName: true } },
            personaAtendida: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const turnosReporte: TurnoReporteAusentismo[] = [];

  // Mapear consultas médicas
  for (const tm of turnosMedicos) {
    const fecha = fechaUtcString(tm.date);
    const diaSemana = diaDeLaSemanaAr(fecha);
    const pacienteNombre = formatearNombrePaciente(tm);
    const pacienteKey = tm.personaAtendidaId ?? tm.reservedById ?? pacienteNombre;

    turnosReporte.push({
      id: tm.id,
      fecha,
      diaSemana,
      tipoTurno: "Consulta médica",
      profesionalId: tm.doctorId,
      profesionalNombre: `Dr. ${tm.doctor.firstName} ${tm.doctor.lastName}`,
      especialidad: tm.doctor.specialty
        ? SPECIALTY_LABELS[tm.doctor.specialty]
        : "Clínica médica",
      pacienteKey,
      pacienteNombre,
      status: tm.status,
    });
  }

  // Mapear turnos de vacunación
  for (const tv of turnosVacunacion) {
    const fecha = fechaUtcString(tv.date);
    const diaSemana = diaDeLaSemanaAr(fecha);
    const pacienteNombre = formatearNombrePaciente(tv);
    const pacienteKey = tv.personaAtendidaId ?? tv.reservedById ?? pacienteNombre;

    const enfermera = tv.jornada?.createdBy;
    const profesionalNombre = enfermera
      ? `Enf. ${enfermera.firstName} ${enfermera.lastName}`
      : "Vacunatorio";
    const profesionalId = enfermera?.id ?? tv.jornada?.createdById ?? "vacunatorio";

    turnosReporte.push({
      id: tv.id,
      fecha,
      diaSemana,
      tipoTurno: "Vacunación",
      profesionalId,
      profesionalNombre,
      especialidad: "Vacunatorio",
      pacienteKey,
      pacienteNombre,
      status: tv.status,
    });
  }

  return armarReporteAusentismo(turnosReporte);
}
