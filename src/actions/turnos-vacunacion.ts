"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { fechaUtcString } from "@/lib/fecha-utc";
import type { PersonaAtendidaErrors, PersonaAtendidaInput } from "@/lib/reservas";
import {
  MENSAJE_SIN_RESULTADOS_VACUNACION,
  agruparTurnosVacunacionPorDia,
  ahoraEnArgentina,
  filtrarTurnosVacunacion,
  normalizarFiltrosVacunacion,
  type FiltrosVacunacion,
  type GrupoDiaVacunacion,
} from "@/lib/turnos-vacunacion";
import { cancelarTurnoVacunacion, reservarTurnoVacunacion } from "@/services/vacunacion/turnos";
import {
  enviarAvisoCancelacionVacunacion,
  enviarConfirmacionTurnoVacunacion,
} from "@/services/notificaciones/turno-vacunacion";

/**
 * US-28 — Turno de vacunación. Las reglas de negocio viven en
 * `services/vacunacion/turnos.ts`; acá se resuelve la autorización y el email.
 */

const PATHS = [
  "/dashboard/turnos-vacunacion",
  "/dashboard/mostrador/vacunacion",
  "/dashboard/mis-turnos",
  "/dashboard/agenda-vacunatorio",
];

function revalidar() {
  for (const path of PATHS) revalidatePath(path);
}

export type BusquedaVacunacionResult = {
  filtros: FiltrosVacunacion;
  rangoDefecto: { desde: string; hasta: string };
  gruposPorDia: GrupoDiaVacunacion[];
  total: number;
  mensajeVacio: string | null;
};

/** Turnos disponibles y futuros del vacunatorio dentro del rango (por defecto, 30 días). */
export async function buscarTurnosVacunacion(input: {
  desde?: string | null;
  hasta?: string | null;
}): Promise<BusquedaVacunacionResult> {
  await assertRoles(["USUARIO", "ENFERMERA", "ADMINISTRATIVO"]);

  const ahora = ahoraEnArgentina();
  const filtros = normalizarFiltrosVacunacion(input, ahora.fecha);
  const rangoDefecto = normalizarFiltrosVacunacion({}, ahora.fecha);
  const vacio = { filtros, rangoDefecto: { desde: rangoDefecto.desde, hasta: rangoDefecto.hasta } };
  if (filtros.error) {
    return { ...vacio, gruposPorDia: [], total: 0, mensajeVacio: filtros.error };
  }

  const turnos = await db.turnoVacunacion.findMany({
    where: {
      status: "DISPONIBLE",
      date: {
        gte: new Date(`${filtros.desde}T00:00:00.000Z`),
        lte: new Date(`${filtros.hasta}T00:00:00.000Z`),
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, startTime: true, endTime: true, status: true },
  });

  const disponibles = filtrarTurnosVacunacion(
    turnos.map((t) => ({ ...t, date: fechaUtcString(t.date) })),
    filtros,
    ahora
  );
  return {
    ...vacio,
    gruposPorDia: agruparTurnosVacunacionPorDia(disponibles),
    total: disponibles.length,
    mensajeVacio: disponibles.length === 0 ? MENSAJE_SIN_RESULTADOS_VACUNACION : null,
  };
}

export type ReservarVacunacionActionInput = {
  turnoId: string;
  vacunaId: string;
  dosisPrevistaOrden?: number | null;
  /** Solo mostrador: usuario registrado a cuyo nombre se otorga el turno. */
  titularId?: string;
  paraOtraPersona?: { personaId: string } | { nueva: PersonaAtendidaInput };
};

export type ReservarVacunacionActionResult =
  | { success: true }
  | {
      success: false;
      code: "NO_DISPONIBLE" | "INVALIDO" | "SIN_PERMISO" | "ERROR";
      message: string;
      personaErrors?: PersonaAtendidaErrors;
    };

/**
 * El usuario reserva para sí o para otra persona (US-64). La enfermera y el
 * administrativo lo otorgan desde el mostrador a nombre de un titular registrado.
 */
export async function reservarTurnoVacunacionAction(
  input: ReservarVacunacionActionInput
): Promise<ReservarVacunacionActionResult> {
  let sesion;
  try {
    sesion = await assertRoles(["USUARIO", "ENFERMERA", "ADMINISTRATIVO"]);
  } catch {
    return { success: false, code: "SIN_PERMISO", message: "No tenés permisos para reservar turnos de vacunación." };
  }

  const esPersonal = sesion.role !== "USUARIO";
  let titularId = sesion.profile.id;
  if (esPersonal) {
    if (!input.titularId) {
      return { success: false, code: "INVALIDO", message: "Elegí la persona a cuyo nombre se otorga el turno." };
    }
    titularId = input.titularId;
  }

  const result = await reservarTurnoVacunacion({
    turnoId: input.turnoId,
    vacunaId: input.vacunaId,
    dosisPrevistaOrden: input.dosisPrevistaOrden ?? null,
    titularId,
    otorgadoPorId: esPersonal ? sesion.profile.id : null,
    paraOtraPersona: input.paraOtraPersona,
  });

  revalidar();
  if (!result.success) return result;

  // US-14 análogo: confirmación al titular sin bloquear la respuesta.
  after(() => enviarConfirmacionTurnoVacunacion(result.turnoId));
  return { success: true };
}

export type CancelarVacunacionActionResult =
  | { success: true }
  | { success: false; code: "FUERA_DE_PLAZO" | "NO_CANCELABLE" | "SIN_PERMISO" | "ERROR"; message: string };

/** US-16 para vacunación: el titular cancela un turno propio o de otra persona dentro del plazo. */
export async function cancelarTurnoVacunacionAction(
  turnoId: string
): Promise<CancelarVacunacionActionResult> {
  let usuario;
  try {
    ({ profile: usuario } = await assertRoles(["USUARIO"]));
  } catch {
    return { success: false, code: "SIN_PERMISO", message: "No tenés permisos para esta acción." };
  }

  const result = await cancelarTurnoVacunacion({
    turnoId,
    canceladoPorId: usuario.id,
    soloDelTitularId: usuario.id,
    validarPlazo: true,
  });
  if (!result.success) return result;

  after(() => enviarAvisoCancelacionVacunacion(result.aviso));
  revalidar();
  return { success: true };
}
