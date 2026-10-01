"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  validateMonthlyJornadasRN02,
  type JornadaInput,
} from "@/lib/availability-rn02";

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
      errors[j.date] = "La hora de fin debe ser posterior al inicio.";
      continue;
    }
    if ((end - start) % 30 !== 0) {
      errors[j.date] = "La franja debe dividirse en bloques de 30 minutos (RN-09).";
    }
  }
  return errors;
}

export async function getMonthlyAvailability(year: number, month: number) {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user || user.role !== "MEDICO" || !user.isActive) return null;

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
  if (!user || user.role !== "MEDICO" || !user.isActive) {
    return { success: false, message: "Solo los médicos pueden cargar disponibilidad." };
  }

  if (month < 1 || month > 12 || year < 2000) {
    return { success: false, message: "Período inválido." };
  }

  const timeErrors = validateJornadaTimes(jornadas);
  if (Object.keys(timeErrors).length > 0) {
    return {
      success: false,
      message: "Revisá los horarios de las jornadas.",
      errors: timeErrors,
    };
  }

  const rn02 = validateMonthlyJornadasRN02(
    jornadas.map((j) => ({ date: j.date })),
    year,
    month
  );

  if (!rn02.isValid) {
    return {
      success: false,
      message: rn02.blockingMessages[0] || "La disponibilidad no cumple RN-02.",
    };
  }

  try {
    const jornadaRows = jornadas.map((j) => ({
      date: new Date(`${j.date}T00:00:00.000Z`),
      startTime: normalizeTime(j.startTime),
      endTime: normalizeTime(j.endTime),
    }));

    await db.monthlyAvailability.upsert({
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
    });

    revalidatePath("/dashboard/disponibilidad");
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
  return validateMonthlyJornadasRN02(jornadas, year, month);
}
