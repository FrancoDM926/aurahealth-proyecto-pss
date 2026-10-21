"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  formatDisplayDate,
  FranjaInput,
  generateTurnosFromFranjasList,
  calcularCambiosTurnos,
  FranjaPreview,
  GenerationSummary,
} from "@/lib/turno-generator";
import {
  agruparTurnosPorDia,
  ahoraEnArgentina,
  filtrarYOrdenarTurnosDisponibles,
  MENSAJE_SIN_RESULTADOS,
  normalizarFiltrosBusqueda,
  rangoFechasPorDefecto,
  type FiltrosBusquedaInput,
  type FiltrosBusquedaNormalizados,
  type GrupoDiaTurnos,
  type ProfesionalBusqueda,
  type TurnoCandidatoBusqueda,
  type TurnoDisponiblePaciente,
} from "@/lib/busqueda-turnos";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { assertRoles } from "@/lib/auth-session";
import { isPastTime, validateMonthlyJornadasRN02 } from "@/lib/availability-rn02";
import { getLimitesJornadas } from "@/lib/configuracion";
import type { User } from "@/generated/prisma/client";

export type AgendaPreviewData = {
  doctorName: string;
  specialty: string;
  month: number;
  year: number;
  monthLabel: string;
  /** Resumen de la generación más la validación RN-02 con los límites vigentes. */
  summary: GenerationSummary & {
    jornadasValidadas: boolean;
    minJornadasSemana: number;
    maxJornadasSemana: number;
  };
  previews: FranjaPreview[];
  /** El médico cargó disponibilidad para el mes (US-06). Sin ella no hay nada que generar. */
  hasAvailability: boolean;
  alreadyGenerated: boolean;
  existingTurnosCount: number;
  /** Lo que cambia al confirmar: turnos nuevos, turnos a quitar y turnos que no se pueden quitar. */
  cambios: {
    aCrear: number;
    preservados: number;
    aQuitar: TurnoFueraDeAgenda[];
    conservadosPorReserva: TurnoFueraDeAgenda[];
  };
};

export type TurnoFueraDeAgenda = {
  date: string;
  displayDate: string;
  startTime: string;
  endTime: string;
};

export type GenerateTurnosResult = {
  success: boolean;
  message: string;
  createdCount: number;
  existingCount: number;
  removedCount: number;
  totalSlots: number;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidPeriod(year: number, month: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12 && year >= 2000;
}

/**
 * Franjas de la disponibilidad mensual que el médico guardó en US-06.
 * Es la única fuente de los turnos: no hay datos de ejemplo.
 */
async function loadFranjas(doctor: User, year: number, month: number) {
  const doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
  const specialty = doctor.specialty ? SPECIALTY_LABELS[doctor.specialty] : "";

  const availability = await db.monthlyAvailability.findUnique({
    where: { userId_year_month: { userId: doctor.id, year, month } },
    include: { jornadas: { orderBy: { date: "asc" } } },
  });

  const franjas: FranjaInput[] = (availability?.jornadas ?? []).map((j) => ({
    id: j.id,
    doctorId: doctor.id,
    doctorName,
    specialty,
    date: formatUtcDateString(j.date),
    startTime: j.startTime,
    endTime: j.endTime,
  }));

  return { doctorName, specialty, franjas };
}

/** Turnos ya generados del médico en el mes, con su estado. */
async function loadTurnosDelMes(doctorId: string, year: number, month: number) {
  return db.turno.findMany({
    where: {
      doctorId,
      date: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0)),
      },
    },
    select: { id: true, date: true, startTime: true, endTime: true, status: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
}

function aTurnoFueraDeAgenda(t: { date: Date; startTime: string; endTime: string }): TurnoFueraDeAgenda {
  return {
    date: formatUtcDateString(t.date),
    displayDate: formatDisplayDate(t.date),
    startTime: t.startTime,
    endTime: t.endTime,
  };
}

/**
 * Vista previa de la agenda a generar (US-08) a partir de la disponibilidad
 * mensual del médico autenticado.
 */
export async function getAgendaGeneradaPreview(params: {
  year: number;
  month: number;
}): Promise<AgendaPreviewData> {
  const { profile } = await assertRoles(["MEDICO"]);
  const { year, month } = params;
  if (!isValidPeriod(year, month)) {
    throw new Error("Período inválido.");
  }

  const { doctorName, specialty, franjas } = await loadFranjas(profile, year, month);
  const { previews, summary } = generateTurnosFromFranjasList(franjas);

  // RN-02 calculado sobre la disponibilidad real y con los límites vigentes.
  const limites = await getLimitesJornadas();
  const rn02 = validateMonthlyJornadasRN02(
    franjas.map((f) => ({ date: String(f.date) })),
    year,
    month,
    limites
  );

  const existentes = await loadTurnosDelMes(profile.id, year, month);
  const existingTurnosCount = existentes.length;
  const ahora = new Date();
  const cambios = calcularCambiosTurnos(
    generateTurnosFromFranjasList(franjas).turnos,
    existentes,
    (date, startTime) => isPastTime(date, startTime, ahora)
  );

  return {
    doctorName,
    specialty,
    month,
    year,
    monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
    summary: {
      ...summary,
      jornadasValidadas: rn02.isValid,
      minJornadasSemana: limites.min,
      maxJornadasSemana: limites.max,
    },
    previews,
    hasAvailability: franjas.length > 0,
    alreadyGenerated: existingTurnosCount > 0,
    existingTurnosCount,
    cambios: {
      aCrear: cambios.aCrear.length,
      preservados: cambios.preservados,
      aQuitar: cambios.aQuitar.map(aTurnoFueraDeAgenda),
      conservadosPorReserva: cambios.conservadosPorReserva.map(aTurnoFueraDeAgenda),
    },
  };
}

/**
 * US-08: genera los turnos de 30 minutos del médico autenticado para el mes,
 * a partir de su disponibilidad guardada.
 * 1. Un turno por cada intervalo consecutivo de 30 minutos dentro de la franja.
 * 2. Duración fija de 30 minutos (RN-09).
 * 3. Un remanente menor a 30 minutos no genera turno.
 * 4. Cada turno queda DISPONIBLE, asociado al médico, la fecha y la hora.
 * 5. Idempotente: reconfirmar no duplica turnos.
 */
export async function generateTurnosAction(input: {
  year: number;
  month: number;
}): Promise<GenerateTurnosResult> {
  const fail = (message: string): GenerateTurnosResult => ({
    success: false,
    message,
    createdCount: 0,
    existingCount: 0,
    removedCount: 0,
    totalSlots: 0,
  });

  let doctor: User;
  try {
    ({ profile: doctor } = await assertRoles(["MEDICO"]));
  } catch {
    return fail("Solo un médico puede generar los turnos de su agenda.");
  }

  const { year, month } = input;
  if (!isValidPeriod(year, month)) {
    return fail("Período inválido.");
  }

  try {
    const { franjas } = await loadFranjas(doctor, year, month);
    if (franjas.length === 0) {
      return fail(
        "No cargaste disponibilidad para este mes. Cargala en «Disponibilidad» antes de generar los turnos."
      );
    }

    // Se compara la disponibilidad vigente contra los turnos ya generados: se crean
    // los nuevos y se quitan los disponibles que el médico sacó de su disponibilidad.
    // Los horarios que ya pasaron no se crean ni se tocan; los turnos reservados o con
    // estado registrado nunca se quitan. Reconfirmar sin cambios no duplica nada.
    const ahora = new Date();
    const { turnos } = generateTurnosFromFranjasList(franjas);
    const existentes = await loadTurnosDelMes(doctor.id, year, month);
    const { aCrear, aQuitar, preservados } = calcularCambiosTurnos(
      turnos,
      existentes,
      (date, startTime) => isPastTime(date, startTime, ahora)
    );

    let createdCount = 0;
    let removedCount = 0;
    await db.$transaction(async (tx) => {
      if (aQuitar.length > 0) {
        const removed = await tx.turno.deleteMany({
          where: { id: { in: aQuitar.map((t) => t.id) }, status: "DISPONIBLE" },
        });
        removedCount = removed.count;
      }
      if (aCrear.length > 0) {
        const created = await tx.turno.createMany({
          data: aCrear.map((t) => ({
            doctorId: t.doctorId,
            jornadaId: t.franjaId,
            date: t.date,
            startTime: t.startTime,
            endTime: t.endTime,
            duration: t.duration,
            status: "DISPONIBLE" as const,
          })),
          skipDuplicates: true,
        });
        createdCount = created.count;
      }
      await tx.monthlyAvailability.update({
        where: { userId_year_month: { userId: doctor.id, year, month } },
        data: { isConfirmed: true, confirmedAt: new Date() },
      });
    });
    const existingCount = preservados;

    revalidatePath("/dashboard/agenda-generada");
    revalidatePath("/dashboard/disponibilidad");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");

    return {
      success: true,
      message: [
        `${createdCount} turnos nuevos creados`,
        `${removedCount} quitados`,
        `${existingCount} ya existentes conservados`,
      ].join(", ") + ".",
      createdCount,
      existingCount,
      removedCount,
      totalSlots: turnos.length,
    };
  } catch (error) {
    console.error("generateTurnosAction:", error);
    return fail("Ocurrió un error al guardar los turnos en la base de datos.");
  }
}

export type ResultadoBusquedaTurnos = {
  filtros: FiltrosBusquedaNormalizados;
  rangoDefecto: { desde: string; hasta: string };
  profesionales: ProfesionalBusqueda[];
  turnos: TurnoDisponiblePaciente[];
  gruposPorDia: GrupoDiaTurnos[];
  duracionMs: number;
  mensajeVacio: string | null;
};

/**
 * US-10: Búsqueda de turnos disponibles para pacientes filtrando por
 * especialidad, profesional y rango de fechas (por defecto próximos 30 días).
 */
export async function buscarTurnosDisponiblesPaciente(
  input: FiltrosBusquedaInput = {}
): Promise<ResultadoBusquedaTurnos> {
  await assertRoles(["USUARIO"]);

  const inicioMs = performance.now();
  const ahora = ahoraEnArgentina();
  const rangoDefecto = rangoFechasPorDefecto(ahora.fecha);
  const filtros = normalizarFiltrosBusqueda(input, ahora.fecha);

  const effectiveDesde =
    filtros.desde > ahora.fecha ? filtros.desde : ahora.fecha;

  const [doctorsRows, confirmedMonths, turnosRows] = await Promise.all([
    db.user.findMany({
      where: {
        role: "MEDICO",
        isActive: true,
        specialty: { not: null },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialty: true,
      },
    }),
    filtros.error || effectiveDesde > filtros.hasta
      ? Promise.resolve([])
      : db.monthlyAvailability.findMany({
          where: {
            isConfirmed: true,
            ...(filtros.doctorId ? { userId: filtros.doctorId } : {}),
          },
          select: {
            userId: true,
            year: true,
            month: true,
          },
        }),
    filtros.error || effectiveDesde > filtros.hasta
      ? Promise.resolve([])
      : db.turno.findMany({
          where: {
            status: "DISPONIBLE",
            date: {
              gte: new Date(`${effectiveDesde}T00:00:00.000Z`),
              lte: new Date(`${filtros.hasta}T00:00:00.000Z`),
            },
            ...(filtros.doctorId ? { doctorId: filtros.doctorId } : {}),
            doctor: {
              role: "MEDICO",
              isActive: true,
              ...(filtros.specialty
                ? { specialty: filtros.specialty }
                : { specialty: { not: null } }),
            },
          },
          include: {
            doctor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                specialty: true,
                isActive: true,
              },
            },
            jornada: {
              select: {
                monthlyAvailability: {
                  select: {
                    isConfirmed: true,
                  },
                },
              },
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
  ]);

  const profesionales: ProfesionalBusqueda[] = doctorsRows
    .filter((d): d is typeof d & { specialty: NonNullable<typeof d.specialty> } => d.specialty !== null)
    .map((d) => ({
      id: d.id,
      fullName: `Dr. ${d.firstName} ${d.lastName}`,
      specialty: d.specialty,
      specialtyLabel: SPECIALTY_LABELS[d.specialty],
    }));

  const confirmedKeySet = new Set(
    confirmedMonths.map((m) => `${m.userId}_${m.year}_${m.month}`)
  );

  const candidatos: TurnoCandidatoBusqueda[] = turnosRows
    .filter((t) => t.doctor.specialty !== null)
    .map((t) => {
      const dateStr = formatUtcDateString(t.date);
      const [yStr, mStr] = dateStr.split("-");
      const monthKey = `${t.doctorId}_${Number(yStr)}_${Number(mStr)}`;
      const isMonthConfirmed =
        t.jornada?.monthlyAvailability?.isConfirmed === true ||
        confirmedKeySet.has(monthKey);

      const specialty = t.doctor.specialty!;
      return {
        id: t.id,
        date: dateStr,
        startTime: t.startTime,
        endTime: t.endTime,
        status: t.status,
        doctorId: t.doctorId,
        doctorName: `Dr. ${t.doctor.firstName} ${t.doctor.lastName}`,
        specialty,
        specialtyLabel: SPECIALTY_LABELS[specialty],
        agendaConfirmada: isMonthConfirmed,
        doctorActivo: t.doctor.isActive,
      };
    });

  const turnos = filtros.error
    ? []
    : filtrarYOrdenarTurnosDisponibles(candidatos, filtros, ahora);
  const gruposPorDia = agruparTurnosPorDia(turnos);
  const duracionMs = Math.round(performance.now() - inicioMs);

  return {
    filtros,
    rangoDefecto,
    profesionales,
    turnos,
    gruposPorDia,
    duracionMs,
    mensajeVacio: !filtros.error && turnos.length === 0 ? MENSAJE_SIN_RESULTADOS : null,
  };
}
