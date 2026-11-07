import { sendNotificationEmail, getDefaultFrom } from "@/services/email";
import type { CancelacionTurnoMedicoParams } from "@/services/email/types";
import { formatFechaTurno } from "@/services/notificaciones/turno-confirmacion";

/**
 * US-16 — Aviso por email de la cancelación de un turno (RF-NOT-01).
 *
 * Se avisa al usuario que hizo la reserva (US-64: nunca a la persona atendida)
 * y a la sala. Delega el envío en el servicio único de US-21. La cancelación ya
 * está persistida cuando esto corre: un fallo del envío queda registrado y no
 * la revierte.
 */

export type CancelacionTurnoData = {
  /** Nombre y email de quien hizo la reserva. */
  reservador: { nombre: string; email: string };
  doctorNombre: string;
  especialidad: string;
  fecha: Date;
  startTime: string;
};

export function buildCancelacionTurnoParams(
  data: CancelacionTurnoData
): CancelacionTurnoMedicoParams {
  return {
    pacienteNombre: data.reservador.nombre,
    doctorNombre: data.doctorNombre,
    especialidad: data.especialidad,
    fecha: formatFechaTurno(data.fecha),
    hora: data.startTime,
  };
}

/**
 * Casilla de la sala: la misma cuenta desde la que el sistema envía los
 * correos (`SMTP_FROM`, con formato `"Nombre" <casilla@dominio>` o solo la casilla).
 */
export function emailDeLaSala(from: string = getDefaultFrom()): string | null {
  const match = /<([^>]+)>/.exec(from);
  const email = (match ? match[1] : from).trim();
  return email.includes("@") ? email : null;
}

/** No lanza: cada fallo de envío queda registrado por el servicio de US-21. */
export async function enviarAvisoCancelacionTurno(data: CancelacionTurnoData): Promise<void> {
  const params = buildCancelacionTurnoParams(data);
  const destinatarios = [data.reservador.email, emailDeLaSala()].filter(
    (email): email is string => Boolean(email)
  );

  for (const to of new Set(destinatarios)) {
    try {
      const result = await sendNotificationEmail({
        to,
        template: "CANCELACION_TURNO_MEDICO",
        params,
      });
      if (!result.success) {
        console.error(`[US-16] El aviso de cancelación a ${to} no pudo enviarse:`, result.error);
      }
    } catch (error) {
      console.error(`[US-16] Error al enviar el aviso de cancelación a ${to}:`, error);
    }
  }
}
