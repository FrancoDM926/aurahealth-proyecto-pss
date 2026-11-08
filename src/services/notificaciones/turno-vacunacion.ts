import { db } from "@/lib/db";
import { getSalaDireccion } from "@/lib/configuracion";
import { nombreVacuna } from "@/lib/turnos-vacunacion";
import { sendNotificationEmail } from "@/services/email";
import type {
  CancelacionTurnoVacunatorioParams,
  ConfirmacionTurnoVacunatorioParams,
} from "@/services/email/types";
import { emailDeLaSala } from "@/services/notificaciones/turno-cancelacion";
import { formatFechaTurno } from "@/services/notificaciones/turno-confirmacion";

/**
 * US-28 — Confirmación del turno de vacunación por email (RF-NOT-01, RF-NOT-02).
 * Misma regla que US-14 / US-64: el correo va al titular (quien reservó) y, si el
 * turno es a nombre de otra persona, indica de quién es. La reserva ya está
 * persistida cuando esto corre: un fallo de envío queda registrado (US-21) y nunca
 * la invalida.
 */

export type ConfirmacionVacunacionData = {
  destinatarioNombre: string;
  vacunaNombre?: string | null;
  fecha: Date;
  startTime: string;
  salaDireccion: string;
  aNombreDe?: string | null;
};

/** Traducción pura de los datos del turno a los parámetros de la plantilla. */
export function buildConfirmacionVacunacionParams(
  data: ConfirmacionVacunacionData
): ConfirmacionTurnoVacunatorioParams {
  const aNombreDe = data.aNombreDe?.trim();
  return {
    pacienteNombre: data.destinatarioNombre,
    vacunaNombre: data.vacunaNombre ?? undefined,
    fecha: formatFechaTurno(data.fecha),
    hora: data.startTime,
    direccion: data.salaDireccion,
    aNombreDe: aNombreDe && aNombreDe.length > 0 ? aNombreDe : undefined,
  };
}

export type CancelacionVacunacionData = {
  reservador: { nombre: string; email: string };
  vacunaNombre?: string | null;
  fecha: Date;
  startTime: string;
  aNombreDe?: string | null;
};

export function buildCancelacionVacunacionParams(
  data: CancelacionVacunacionData
): CancelacionTurnoVacunatorioParams {
  const aNombreDe = data.aNombreDe?.trim();
  return {
    pacienteNombre: data.reservador.nombre,
    vacunaNombre: data.vacunaNombre ?? undefined,
    fecha: formatFechaTurno(data.fecha),
    hora: data.startTime,
    aNombreDe: aNombreDe && aNombreDe.length > 0 ? aNombreDe : undefined,
  };
}

/** No lanza: el fallo de envío queda registrado y la reserva sigue válida. */
export async function enviarConfirmacionTurnoVacunacion(turnoId: string): Promise<void> {
  try {
    const turno = await db.turnoVacunacion.findUnique({
      where: { id: turnoId },
      include: { reservedBy: true, vacuna: true },
    });
    if (!turno || !turno.reservedBy) {
      console.error(`[US-28] Turno de vacunación ${turnoId} sin reserva: no se envía la confirmación.`);
      return;
    }

    const params = buildConfirmacionVacunacionParams({
      destinatarioNombre: `${turno.reservedBy.firstName} ${turno.reservedBy.lastName}`,
      vacunaNombre: turno.vacuna ? nombreVacuna(turno.vacuna) : null,
      fecha: turno.date,
      startTime: turno.startTime,
      salaDireccion: await getSalaDireccion(),
      aNombreDe: turno.patientFirstName
        ? `${turno.patientFirstName} ${turno.patientLastName ?? ""}`.trim()
        : null,
    });

    const result = await sendNotificationEmail({
      to: turno.reservedBy.email,
      template: "CONFIRMACION_TURNO_VACUNATORIO",
      params,
    });
    if (!result.success) {
      console.error(
        `[US-28] La confirmación del turno de vacunación ${turnoId} no pudo enviarse (queda registrada para reintento):`,
        result.error
      );
    }
  } catch (error) {
    console.error(`[US-28] Error al enviar la confirmación del turno de vacunación ${turnoId}:`, error);
  }
}

/** Aviso al titular y a la sala (US-16 para vacunación). No lanza. */
export async function enviarAvisoCancelacionVacunacion(data: CancelacionVacunacionData): Promise<void> {
  const params = buildCancelacionVacunacionParams(data);
  const destinatarios = [data.reservador.email, emailDeLaSala()].filter((e): e is string => Boolean(e));

  for (const to of new Set(destinatarios)) {
    try {
      const result = await sendNotificationEmail({
        to,
        template: "CANCELACION_TURNO_VACUNATORIO",
        params,
      });
      if (!result.success) {
        console.error(`[US-28] El aviso de cancelación a ${to} no pudo enviarse:`, result.error);
      }
    } catch (error) {
      console.error(`[US-28] Error al enviar el aviso de cancelación a ${to}:`, error);
    }
  }
}
