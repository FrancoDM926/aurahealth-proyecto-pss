"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import {
  esHorarioDeGrilla,
  isPastDate,
  isPastTime,
  SLOT_DURATION_MINUTES,
  todayInArgentina,
  validateMonthlyJornadasRN02,
  type JornadaInput,
} from "@/lib/availability-rn02";
import { getLimitesJornadas } from "@/lib/configuracion";
import { splitFranjaIntoSlots } from "@/lib/turno-generator";

export type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
};

export type JornadaPayload = {
  date: string;
  startTime: string;
  endTime: string;
};

function normalizeTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return time.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalizeTime(time));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function validateJornadaTimes(jornadas: JornadaPayload[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const j of jornadas) {
    const start = parseTimeToMinutes(j.startTime);
    const end = parseTimeToMinutes(j.endTime);
    if (start === null || end === null) {
      errors[j.date] = "Horario inválido (use formato HH:MM).";
      continue;
    }
    if (end <= start) {
      errors[j.date] = "La hora de fin debe ser posterior a la de inicio.";
      continue;
    }
    // Los turnos son de 30 minutos (RN-09): la franja empieza y termina en
    // punto o y media, así se divide en turnos completos.
    if (!esHorarioDeGrilla(normalizeTime(j.startTime)) || !esHorarioDeGrilla(normalizeTime(j.endTime))) {
      errors[j.date] = `Los horarios van de ${SLOT_DURATION_MINUTES} en ${SLOT_DURATION_MINUTES} minutos (en punto o y media).`;
    }
  }
  return errors;
}

function formatDateAr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/**
 * US-06: no se cargan franjas sobre fechas pasadas ni fuera del mes elegido.
 * Las jornadas pasadas que ya estaban guardadas sin cambios se aceptan, para
 * que el médico pueda seguir editando el resto del mes en curso.
 */
function validateJornadaDates(
  jornadas: JornadaPayload[],
  year: number,
  month: number,
  persisted: Map<string, { startTime: string; endTime: string }>
): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = todayInArgentina();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;

  for (const j of jornadas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date) || !j.date.startsWith(monthPrefix)) {
      errors[j.date] = "La fecha no pertenece al mes seleccionado.";
      continue;
    }
    const saved = persisted.get(j.date);
    const unchanged =
      saved &&
      saved.startTime === normalizeTime(j.startTime) &&
      saved.endTime === normalizeTime(j.endTime);
    if (isPastDate(j.date, today)) {
      if (!unchanged) {
        errors[j.date] = `El ${formatDateAr(j.date)} ya pasó: no se pueden cargar franjas en fechas pasadas.`;
      }
    } else if (!unchanged && isPastTime(j.date, normalizeTime(j.startTime))) {
      // Hoy tampoco se puede cargar una franja que arranca en un horario que ya pasó.
      errors[j.date] = `El horario de inicio del ${formatDateAr(j.date)} ya pasó: elegí un horario posterior a la hora actual.`;
    }
  }
  return errors;
}

export async function getMonthlyAvailability(year: number, month: number) {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user || !user.isActive) return null;

  // Rol autoritativo en Clerk. La página ya aplicó `requireRoles(["MEDICO"])`,
  // pero la acción se expone al cliente y no debe confiar en ese gate.
  try {
    await assertRoles(["MEDICO"]);
  } catch {
    return null;
  }

  try {
    return await db.monthlyAvailability.findUnique({
      where: {
        userId_year_month: { userId: user.id, year, month },
      },
      include: { jornadas: { orderBy: { date: "asc" } } },
    });
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : null;
    if (code === "P2021") {
      console.error(
        "Faltan tablas de disponibilidad. Ejecutá: npx prisma migrate deploy"
      );
      return null;
    }
    throw error;
  }
}

export async function saveMonthlyAvailability(
  year: number,
  month: number,
  jornadas: JornadaPayload[]
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Sesión no válida." };
  }

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user || !user.isActive) {
    return { success: false, message: "Solo los médicos pueden cargar disponibilidad." };
  }

  // Rol autoritativo en Clerk: esta acción es un endpoint público para el
  // cliente y revalida por su cuenta.
  try {
    await assertRoles(["MEDICO"]);
  } catch {
    return { success: false, message: "Solo los médicos pueden cargar disponibilidad." };
  }

  if (month < 1 || month > 12 || year < 2000) {
    return { success: false, message: "Período inválido." };
  }

  const existing = await db.monthlyAvailability.findUnique({
    where: { userId_year_month: { userId: user.id, year, month } },
    include: { jornadas: true },
  });
  const persisted = new Map(
    (existing?.jornadas ?? []).map((j) => [
      j.date.toISOString().slice(0, 10),
      { startTime: j.startTime, endTime: j.endTime },
    ])
  );

  const fieldErrors = {
    ...validateJornadaTimes(jornadas),
    ...validateJornadaDates(jornadas, year, month, persisted),
  };
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message: Object.values(fieldErrors).join(" "),
      errors: fieldErrors,
    };
  }

  const limites = await getLimitesJornadas();
  const rn02 = validateMonthlyJornadasRN02(
    jornadas.map((j) => ({ date: j.date })),
    year,
    month,
    limites
  );

  if (!rn02.isValid) {
    // US-06: se informan todas las semanas que incumplen, no solo la primera.
    return {
      success: false,
      message: rn02.blockingMessages.join(" ") || "La disponibilidad no cumple el mínimo de jornadas semanales.",
    };
  }

  try {
    const jornadaRows = jornadas.map((j) => ({
      date: new Date(`${j.date}T00:00:00.000Z`),
      startTime: normalizeTime(j.startTime),
      endTime: normalizeTime(j.endTime),
    }));

    // Los turnos ya generados siguen a la disponibilidad: si se quitó o se acortó una
    // franja, los turnos que quedaron afuera se eliminan. Si alguno ya tiene una
    // reserva o un estado registrado, no se puede quitar y se avisa.
    const turnosMes = await db.turno.findMany({
      where: {
        doctorId: user.id,
        date: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lte: new Date(Date.UTC(year, month, 0)),
        },
      },
      select: { id: true, date: true, startTime: true, status: true },
    });
    const turnoKey = (date: Date, startTime: string) =>
      `${date.toISOString().slice(0, 10)}_${startTime}`;
    const slotsVigentes = new Set<string>();
    for (const row of jornadaRows) {
      for (const slot of splitFranjaIntoSlots(row.startTime, row.endTime)) {
        slotsVigentes.add(turnoKey(row.date, slot.startTime));
      }
    }
    const obsoletos = turnosMes.filter((t) => !slotsVigentes.has(turnoKey(t.date, t.startTime)));
    const conservados = obsoletos.filter((t) => t.status !== "DISPONIBLE");
    if (conservados.length > 0) {
      const dias = [...new Set(conservados.map((t) => formatDateAr(t.date.toISOString().slice(0, 10))))];
      return {
        success: false,
        message: `No se puede modificar la disponibilidad: hay turnos reservados o con estado registrado fuera de las nuevas franjas (${dias.join(", ")}).`,
      };
    }

    await db.$transaction(async (tx) => {
      const availability = await tx.monthlyAvailability.upsert({
        where: {
          userId_year_month: { userId: user.id, year, month },
        },
        create: {
          userId: user.id,
          year,
          month,
          jornadas: { create: jornadaRows },
        },
        update: {
          jornadas: {
            deleteMany: {},
            create: jornadaRows,
          },
        },
        include: { jornadas: { select: { id: true, date: true } } },
      });

      if (obsoletos.length > 0) {
        await tx.turno.deleteMany({
          where: { id: { in: obsoletos.map((t) => t.id) }, status: "DISPONIBLE" },
        });
      }

      // Al recrearse las jornadas, los turnos que se conservan quedaron sin vínculo.
      for (const jornada of availability.jornadas) {
        await tx.turno.updateMany({
          where: { doctorId: user.id, date: jornada.date },
          data: { jornadaId: jornada.id },
        });
      }
    });

    revalidatePath("/dashboard/disponibilidad");
    revalidatePath("/dashboard/agenda");
    revalidatePath("/dashboard/agenda-generada");
    revalidatePath("/dashboard/turnos");
    return {
      success: true,
      message: "Disponibilidad guardada correctamente.",
    };
  } catch (error) {
    console.error("saveMonthlyAvailability:", error);
    return {
      success: false,
      message: "No se pudo guardar la disponibilidad.",
    };
  }
}

export async function computeWeekValidations(
  year: number,
  month: number,
  jornadas: JornadaInput[]
) {
  return validateMonthlyJornadasRN02(jornadas, year, month, await getLimitesJornadas());
}
