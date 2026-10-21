"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  FranjaInput,
  generateTurnosFromFranjasList,
  filterTurnosForIdempotency,
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
};

export type GenerateTurnosResult = {
  success: boolean;
  message: string;
  createdCount: number;
  existingCount: number;
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

  const existingTurnosCount = await db.turno.count({
    where: {
      doctorId: profile.id,
      date: {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lte: new Date(Date.UTC(year, month, 0)),
      },
    },
  });

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

    // No se generan turnos en horarios que ya pasaron (hoy, o fechas anteriores).
    const ahora = new Date();
    const turnos = generateTurnosFromFranjasList(franjas).turnos.filter(
      (t) => !isPastTime(formatUtcDateString(t.date), t.startTime, ahora)
    );

    // Criterio 5: idempotencia. Se omiten los turnos que ya existen.
    const existingTurnosInDb = await db.turno.findMany({
      where: {
        doctorId: doctor.id,
        date: { in: [...new Set(turnos.map((t) => t.date.getTime()))].map((ms) => new Date(ms)) },
      },
      select: { doctorId: true, date: true, startTime: true },
    });

    const existingKeys = new Set<string>(
      existingTurnosInDb.map(
        (t) => `${t.doctorId}_${formatUtcDateString(t.date)}_${t.startTime}`
      )
    );

    const { toCreate, existingCount } = filterTurnosForIdempotency(turnos, existingKeys);

    let createdCount = 0;
    if (toCreate.length > 0) {
      const createResult = await db.turno.createMany({
        data: toCreate.map((t) => ({
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
      createdCount = createResult.count;
    }

    await db.monthlyAvailability.update({
      where: { userId_year_month: { userId: doctor.id, year, month } },
      data: { isConfirmed: true, confirmedAt: new Date() },
    });

    revalidatePath("/dashboard/agenda-generada");
    revalidatePath("/dashboard/disponibilidad");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/turnos");

    return {
      success: true,
      message:
        existingCount > 0
          ? `Se procesaron ${turnos.length} turnos: ${createdCount} nuevos creados y ${existingCount} existentes preservados (idempotente).`
          : `Se generaron exitosamente ${createdCount} turnos de 30 minutos en estado disponible.`,
      createdCount,
      existingCount,
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
