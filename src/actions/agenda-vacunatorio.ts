"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import {
  ERROR_SOLAPAMIENTO,
  calcularCambiosAgenda,
  claveFranja,
  mensajeBloqueoPorReservas,
  normalizarHora,
  validarAgendaMes,
  type FranjaGuardada,
  type FranjaVacunatorio,
  type TurnoVacunatorioExistente,
} from "@/lib/agenda-vacunatorio";
import { fechaUtcString, parseFechaUtc } from "@/lib/fecha-utc";
import { DURACION_TURNO_MINUTOS } from "@/lib/turno-generator";

/**
 * US-63 — Agenda del vacunatorio. Una sola agenda compartida por las enfermeras,
 * independiente de las agendas médicas (RN-08). No aplica la regla de 2 a 7 jornadas.
 */

export type FranjaVacunatorioItem = FranjaVacunatorio & {
  id: string;
  turnosTotal: number;
  turnosReservados: number;
};

export type GuardarAgendaResult = {
  success: boolean;
  message?: string;
  /** Errores por posición de la franja en el arreglo enviado. */
  errors?: Record<number, string>;
  creados?: number;
  quitados?: number;
};

const SOLO_ENFERMERIA = "Solo el personal de enfermería administra la agenda del vacunatorio.";

class AgendaConflictoError extends Error {}

const PATHS = [
  "/dashboard/agenda-vacunatorio",
  "/dashboard/turnos-vacunacion",
  "/dashboard/mostrador/vacunacion",
];

function rangoDelMes(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

function periodoValido(year: number, month: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
}

/** Franjas del mes con la cantidad de turnos generados y reservados. */
export async function obtenerAgendaVacunatorio(
  year: number,
  month: number
): Promise<FranjaVacunatorioItem[] | null> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return null;
  }
  if (!periodoValido(year, month)) return null;

  const jornadas = await db.jornadaVacunatorio.findMany({
    where: { date: rangoDelMes(year, month) },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { turnos: { select: { status: true } } },
  });

  return jornadas.map((j) => ({
    id: j.id,
    date: fechaUtcString(j.date),
    startTime: j.startTime,
    endTime: j.endTime,
    turnosTotal: j.turnos.length,
    turnosReservados: j.turnos.filter((t) => t.status !== "DISPONIBLE").length,
  }));
}

/**
 * Guarda la agenda del mes (estado completo deseado) y publica los turnos de 30
 * minutos de cada franja. Todo o nada: si una franja con turnos reservados se
 * quiere quitar, no se guarda nada.
 */
export async function guardarAgendaVacunatorio(
  year: number,
  month: number,
  franjas: FranjaVacunatorio[]
): Promise<GuardarAgendaResult> {
  let enfermera;
  try {
    ({ profile: enfermera } = await assertRoles(["ENFERMERA"]));
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }
  if (!periodoValido(year, month) || !Array.isArray(franjas)) {
    return { success: false, message: "Período inválido." };
  }

  const rango = rangoDelMes(year, month);
  const guardadasDb = await db.jornadaVacunatorio.findMany({
    where: { date: rango },
    select: { id: true, date: true, startTime: true, endTime: true },
  });
  const guardadas: FranjaGuardada[] = guardadasDb.map((j) => ({
    id: j.id,
    date: fechaUtcString(j.date),
    startTime: j.startTime,
    endTime: j.endTime,
  }));

  const errores = validarAgendaMes(franjas, year, month, guardadas);
  if (Object.keys(errores).length > 0) {
    return {
      success: false,
      message: [...new Set(Object.values(errores))].join(" "),
      errors: errores,
    };
  }

  const turnosDb = await db.turnoVacunacion.findMany({
    where: { date: rango },
    select: { id: true, date: true, startTime: true, endTime: true, status: true },
  });
  const turnos: TurnoVacunatorioExistente[] = turnosDb.map((t) => ({
    id: t.id,
    date: fechaUtcString(t.date),
    startTime: t.startTime,
    endTime: t.endTime,
    status: t.status,
  }));

  const cambios = calcularCambiosAgenda(franjas, guardadas, turnos);
  if (cambios.bloqueadosPorReserva.length > 0) {
    return { success: false, message: mensajeBloqueoPorReservas(cambios.bloqueadosPorReserva) };
  }

  try {
    await db.$transaction(async (tx) => {
      if (cambios.turnosAQuitar.length > 0) {
        // Solo se borran los que siguen libres: si alguien reservó entre la lectura y
        // ahora, no coincide la cuenta y se corta todo.
        const ids = cambios.turnosAQuitar.map((t) => t.id);
        const borrados = await tx.turnoVacunacion.deleteMany({
          where: { id: { in: ids }, status: "DISPONIBLE" },
        });
        if (borrados.count !== ids.length) {
          throw new AgendaConflictoError(
            "Alguien reservó un turno de esas franjas mientras guardabas. Revisá la agenda y guardá de nuevo."
          );
        }
      }
      if (cambios.franjasAQuitar.length > 0) {
        await tx.jornadaVacunatorio.deleteMany({
          where: { id: { in: cambios.franjasAQuitar.map((f) => f.id) } },
        });
      }

      const idPorClave = new Map<string, string>(
        guardadas
          .filter((g) => !cambios.franjasAQuitar.some((q) => q.id === g.id))
          .map((g) => [claveFranja(g), g.id])
      );
      for (const f of cambios.franjasACrear) {
        const creada = await tx.jornadaVacunatorio.create({
          data: {
            date: parseFechaUtc(f.date),
            startTime: normalizarHora(f.startTime),
            endTime: normalizarHora(f.endTime),
            createdById: enfermera.id,
          },
          select: { id: true },
        });
        idPorClave.set(claveFranja(f), creada.id);
      }

      if (cambios.turnosACrear.length > 0) {
        await tx.turnoVacunacion.createMany({
          data: cambios.turnosACrear.map((t) => ({
            jornadaId: idPorClave.get(t.franjaKey) ?? null,
            date: parseFechaUtc(t.date),
            startTime: t.startTime,
            endTime: t.endTime,
            duration: DURACION_TURNO_MINUTOS,
            status: "DISPONIBLE" as const,
          })),
        });
      }
    });
  } catch (error) {
    if (error instanceof AgendaConflictoError) {
      return { success: false, message: error.message };
    }
    if (error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === "P2002") {
      return { success: false, message: ERROR_SOLAPAMIENTO };
    }
    console.error("guardarAgendaVacunatorio:", error);
    return { success: false, message: "No se pudo guardar la agenda. Intentá de nuevo." };
  }

  for (const path of PATHS) revalidatePath(path);
  return {
    success: true,
    message: `Agenda publicada: ${cambios.turnosACrear.length} turnos nuevos, ${cambios.turnosAQuitar.length} quitados.`,
    creados: cambios.turnosACrear.length,
    quitados: cambios.turnosAQuitar.length,
  };
}

