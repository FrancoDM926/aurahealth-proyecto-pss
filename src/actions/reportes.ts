"use server";

import { assertRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { db } from "@/lib/db";
import {
  calcularReporteTurnos,
  normalizarFiltrosReporteTurnos,
  rangoMesEnCurso,
  type FiltrosReporteTurnosInput,
  type ProfesionalReporteInfo,
  type ResultadoReporteTurnos,
  type TurnoReporteCandidato,
} from "@/lib/reporte-turnos";

function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * US-45: Obtiene los datos del reporte de turnos por especialidad y el desglose
 * por profesional dentro del período seleccionado, uniendo los turnos médicos
 * (`Turno` + `TurnoCancelacion`) y los turnos del vacunatorio (`TurnoVacunacion` +
 * `TurnoVacunacionCancelacion`).
 * RNF-03: Exclusivo para el rol ADMINISTRADOR.
 */
export async function obtenerReporteTurnosPorEspecialidad(
  input: FiltrosReporteTurnosInput = {}
): Promise<ResultadoReporteTurnos> {
  await assertRoles(["ADMINISTRADOR"]);

  const hoy = todayInArgentina();
  const rangoDefecto = rangoMesEnCurso(hoy);
  const filtros = normalizarFiltrosReporteTurnos(input, hoy);

  const dateRangeFilter = {
    gte: new Date(`${filtros.desde}T00:00:00.000Z`),
    lte: new Date(`${filtros.hasta}T00:00:00.000Z`),
  };

  const [
    turnosRows,
    cancelacionesMedicasRows,
    turnosVacunacionRows,
    cancelacionesVacunacionRows,
    profesionalesRows,
  ] = await Promise.all([
    filtros.error
      ? Promise.resolve([])
      : db.turno.findMany({
          where: {
            status: { not: "DISPONIBLE" },
            date: dateRangeFilter,
          },
          include: {
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                specialty: true,
                isActive: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
    filtros.error
      ? Promise.resolve([])
      : db.turnoCancelacion.findMany({
          where: { date: dateRangeFilter },
          include: {
            turno: {
              include: {
                doctor: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    specialty: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        }),
    filtros.error
      ? Promise.resolve([])
      : db.turnoVacunacion.findMany({
          where: {
            status: { not: "DISPONIBLE" },
            date: dateRangeFilter,
          },
          include: {
            jornada: {
              include: {
                createdBy: {
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
            aplicaciones: {
              where: { estado: "ACTIVA" },
              include: {
                enfermera: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    specialty: true,
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
    filtros.error
      ? Promise.resolve([])
      : db.turnoVacunacionCancelacion.findMany({
          where: { date: dateRangeFilter },
          include: {
            turno: {
              select: {
                id: true,
                status: true,
                jornada: {
                  select: {
                    createdBy: {
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
            },
          },
        }),
    db.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: "MEDICO", specialty: { not: null } },
          { role: "ENFERMERA" },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        specialty: true,
        isActive: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const primeraEnfermera = profesionalesRows.find((p) => p.role === "ENFERMERA");
  const fallbackEnfermera = primeraEnfermera ?? {
    id: "vacunatorio-general",
    firstName: "Sala",
    lastName: "Vacunatorio",
    role: "ENFERMERA" as const,
    specialty: null,
    isActive: true,
  };

  const turnos: TurnoReporteCandidato[] = [];

  for (const t of turnosRows) {
    turnos.push({
      id: t.id,
      date: formatUtcDateString(t.date),
      status: t.status,
      doctorId: t.doctorId,
      doctorFirstName: t.doctor.firstName,
      doctorLastName: t.doctor.lastName,
      doctorRole: t.doctor.role,
      doctorSpecialty: t.doctor.specialty,
    });
  }

  // US-16: turnos médicos cancelados que liberaron el slot (status actual != CANCELADO)
  for (const c of cancelacionesMedicasRows) {
    if (c.turno && c.turno.status === "CANCELADO") continue;
    if (c.turno?.doctor) {
      turnos.push({
        id: `canc-med-${c.id}`,
        date: formatUtcDateString(c.date),
        status: "CANCELADO",
        doctorId: c.turno.doctor.id,
        doctorFirstName: c.turno.doctor.firstName,
        doctorLastName: c.turno.doctor.lastName,
        doctorRole: c.turno.doctor.role,
        doctorSpecialty: c.turno.doctor.specialty,
      });
    }
  }

  // US-63 / US-28 / US-29: turnos de vacunación de la tabla TurnoVacunacion
  for (const tv of turnosVacunacionRows) {
    const enf =
      tv.aplicaciones[0]?.enfermera ??
      tv.jornada?.createdBy ??
      fallbackEnfermera;

    turnos.push({
      id: `vac-${tv.id}`,
      date: formatUtcDateString(tv.date),
      status: tv.status,
      doctorId: enf.id,
      doctorFirstName: enf.firstName,
      doctorLastName: enf.lastName,
      doctorRole: "ENFERMERA",
      doctorSpecialty: null,
    });
  }

  // US-28: turnos de vacunación cancelados registrados en TurnoVacunacionCancelacion
  for (const cv of cancelacionesVacunacionRows) {
    if (cv.turno && cv.turno.status === "CANCELADO") continue;
    const enf = cv.turno?.jornada?.createdBy ?? fallbackEnfermera;
    turnos.push({
      id: `canc-vac-${cv.id}`,
      date: formatUtcDateString(cv.date),
      status: "CANCELADO",
      doctorId: enf.id,
      doctorFirstName: enf.firstName,
      doctorLastName: enf.lastName,
      doctorRole: "ENFERMERA",
      doctorSpecialty: null,
    });
  }

  const profesionales: ProfesionalReporteInfo[] = profesionalesRows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    role: p.role,
    specialty: p.specialty,
    isActive: p.isActive,
  }));

  return calcularReporteTurnos({
    turnos,
    profesionales,
    filtros,
    rangoDefecto,
  });
}
