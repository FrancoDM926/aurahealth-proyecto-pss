import { db } from "@/lib/db";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { getSalaDireccion } from "@/lib/configuracion";
import { sendNotificationEmail } from "@/services/email";
import type { ConfirmacionTurnoMedicoParams } from "@/services/email/types";

/**
 * US-14 — Confirmación de reserva por email (RF-TUR-03, RF-NOT-01).
 *
 * Arma los datos del turno y delega el envío en el servicio único de US-21.
 * La reserva ya está persistida cuando esto corre: cualquier fallo del envío se
 * registra (auditoría de US-21) y nunca invalida el turno.
 */

export type ConfirmacionTurnoData = {
  /** Nombre de quien recibe el correo (el usuario que reservó). */
  destinatarioNombre: string;
  doctorNombre: string;
  especialidad: string;
  fecha: Date;
  startTime: string;
  salaDireccion: string;
  /** Persona atendida cuando el turno es a nombre de otra persona. */
  aNombreDe?: string | null;
  cancelUrl?: string;
};

/** Fecha del turno (guardada en UTC) al formato del email: dd/mm/aaaa. */
export function formatFechaTurno(date: Date): string {
  const dia = String(date.getUTCDate()).padStart(2, "0");
  const mes = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${date.getUTCFullYear()}`;
}

/**
 * Traducción pura de los datos del turno a los parámetros tipados de la plantilla.
 * Aislada para poder probarla sin base de datos ni envío.
 */
export function buildConfirmacionTurnoParams(
  data: ConfirmacionTurnoData
): ConfirmacionTurnoMedicoParams {
  const aNombreDe = data.aNombreDe?.trim();
  return {
    pacienteNombre: data.destinatarioNombre,
    doctorNombre: data.doctorNombre,
    especialidad: data.especialidad,
    fecha: formatFechaTurno(data.fecha),
    hora: data.startTime,
    direccion: data.salaDireccion,
    aNombreDe: aNombreDe && aNombreDe.length > 0 ? aNombreDe : undefined,
    cancelUrl: data.cancelUrl,
  };
}

/**
 * Carga el turno reservado y envía la confirmación al usuario que lo reservó.
 * No lanza: un fallo de envío queda registrado y la reserva sigue válida.
 */
export async function enviarConfirmacionTurnoMedico(turnoId: string): Promise<void> {
  try {
    const turno = await db.turno.findUnique({
      where: { id: turnoId },
      include: { doctor: true, reservedBy: true },
    });

    if (!turno) {
      console.error(`[US-14] Turno ${turnoId} inexistente: no se envía la confirmación.`);
      return;
    }

    const reservador = turno.reservedBy;
    if (!reservador) {
      console.error(`[US-14] Turno ${turnoId} sin reservador: no se envía la confirmación.`);
      return;
    }

    const { doctor } = turno;
    const aNombreDe = turno.patientFirstName
      ? `${turno.patientFirstName} ${turno.patientLastName ?? ""}`.trim()
      : null;

    const params = buildConfirmacionTurnoParams({
      destinatarioNombre: `${reservador.firstName} ${reservador.lastName}`,
      doctorNombre: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      especialidad: doctor.specialty ? SPECIALTY_LABELS[doctor.specialty] : "Consulta médica",
      fecha: turno.date,
      startTime: turno.startTime,
      salaDireccion: await getSalaDireccion(),
      aNombreDe,
    });

    const result = await sendNotificationEmail({
      to: reservador.email,
      template: "CONFIRMACION_TURNO_MEDICO",
      params
    });

    if (!result.success) {
      console.error(
        `[US-14] La confirmación del turno ${turnoId} no pudo enviarse (queda registrada para reintento):`,
        result.error
      );
    }
  } catch (error) {
    console.error(`[US-14] Error al enviar la confirmación del turno ${turnoId}:`, error);
  }
}
