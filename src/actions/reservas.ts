"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { enviarConfirmacionTurnoMedico } from "@/services/notificaciones/turno-confirmacion";

/**
 * US-13 (mínimo) — reserva de un turno disponible.
 *
 * US-14 se engancha acá: apenas el turno queda reservado se dispara la
 * confirmación por email de forma no bloqueante (`after`). Si el correo falla,
 * la reserva sigue válida y el fallo queda registrado por el servicio de US-21.
 */

export type ReservaResult = {
  success: boolean;
  message: string;
};

const MAX_NAME = 80;
const MAX_MOTIVO = 300;

function fail(message: string): ReservaResult {
  return { success: false, message };
}

/** Fecha "YYYY-MM-DD" (UTC) de un `Turno.date`. */
function toUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ReservarTurnoInput = {
  turnoId: string;
  /** El turno es para otra persona: sus datos reemplazan a los del reservador. */
  paraOtraPersona?: boolean;
  patientFirstName?: string;
  patientLastName?: string;
  motivoConsulta?: string;
};

/**
 * US-13 (mínimo): reserva el turno indicado para el usuario autenticado.
 * Solo puede reservarlo un paciente (`USUARIO`). La reserva es atómica: si otra
 * persona tomó el turno antes, esta operación no lo pisa.
 */
export async function reservarTurnoAction(
  input: ReservarTurnoInput
): Promise<{ success: boolean; message: string; turnoId?: string }> {
  let reservador;
  try {
    ({ profile: reservador } = await assertRoles(["USUARIO"]));
  } catch {
    return fail("Solo un usuario registrado puede reservar turnos.");
  }

  const turnoId = input.turnoId?.trim();
  if (!turnoId) return fail("Turno inválido.");

  const paraOtraPersona = Boolean(input.paraOtraPersona);
  const patientFirstName = input.patientFirstName?.trim() ?? "";
  const patientLastName = input.patientLastName?.trim() ?? "";
  const motivoConsulta = input.motivoConsulta?.trim() ?? "";

  if (paraOtraPersona) {
    if (!patientFirstName || !patientLastName) {
      return fail("Para reservar a nombre de otra persona, ingresá su nombre y apellido.");
    }
    if (patientFirstName.length > MAX_NAME || patientLastName.length > MAX_NAME) {
      return fail(`El nombre y el apellido no pueden superar los ${MAX_NAME} caracteres.`);
    }
  }
  if (motivoConsulta.length > MAX_MOTIVO) {
    return fail(`El motivo de consulta no puede superar los ${MAX_MOTIVO} caracteres.`);
  }

  const turno = await db.turno.findUnique({ where: { id: turnoId } });
  if (!turno) return fail("El turno no existe.");
  if (turno.status !== "DISPONIBLE") {
    return fail("Ese turno ya no está disponible. Elegí otro horario.");
  }
  if (!Number.isNaN(turno.date.getTime()) && toUtcDateString(turno.date) < todayInArgentina()) {
    return fail("No se puede reservar un turno de una fecha pasada.");
  }
  // Reserva atómica: el filtro por estado evita que dos reservas pisen el turno.
  const updated = await db.turno.updateMany({
    where: { id: turnoId, status: "DISPONIBLE" },
    data: {
      status: "RESERVADO",
      reservedById: reservador.id,
      patientFirstName: paraOtraPersona ? patientFirstName : null,
      patientLastName: paraOtraPersona ? patientLastName : null,
      motivoConsulta: motivoConsulta.length > 0 ? motivoConsulta : null,
      reservedAt: new Date(),
    },
  });
  
  if (updated.count === 0) {
    return fail("Alguien reservó ese turno un instante antes. Elegí otro horario.");
  }
  
  // Envío dentro del minuto, sin bloquear la respuesta al usuario (US-14).
  after(() => enviarConfirmacionTurnoMedico(turnoId));
  
  revalidatePath("/dashboard/reservar");
  revalidatePath("/dashboard");

  return {
    success: true,
    message: paraOtraPersona
      ? `Turno reservado a nombre de ${patientFirstName} ${patientLastName}. Te enviamos el detalle por email.`
      : "Turno reservado. Te enviamos la confirmación por email.",
    turnoId,
  };
}
