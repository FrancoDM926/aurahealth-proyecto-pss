import { db } from "@/lib/db";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { formatearProfesionalMostrador } from "@/lib/mostrador";
import { sendNotificationEmail } from "@/services/email";
import {
  enviarConfirmacionTurnoMedico,
  formatFechaTurno,
} from "@/services/notificaciones/turno-confirmacion";
import {
  enviarAvisoCancelacionVacunacion,
  enviarConfirmacionTurnoVacunacion,
  type CancelacionVacunacionData,
} from "@/services/notificaciones/turno-vacunacion";

/**
 * US-17 (Criterio 5, RF-TUR-06, RF-NOT-01):
 * Envío del correo correspondiente a cada acción realizada desde el mostrador
 * (alta de paciente, reserva de consulta médica o vacunación, cancelación y reprogramación).
 */

export async function enviarNotificacionAltaPacienteMostrador(params: {
  nombre: string;
  email: string;
}): Promise<void> {
  try {
    if (!params.email || !params.email.includes("@")) return;
    await sendNotificationEmail({
      to: params.email,
      template: "BIENVENIDA_REGISTRO",
      params: {
        nombre: params.nombre,
        email: params.email,
      },
    });
  } catch (error) {
    console.error("[US-17] Error al enviar email de bienvenida tras alta en mostrador:", error);
  }
}

export async function enviarNotificacionReservaMostrador(
  turnoId: string,
  tipoTurno: "MEDICO" | "VACUNACION" = "MEDICO"
): Promise<void> {
  try {
    if (tipoTurno === "VACUNACION") {
      await enviarConfirmacionTurnoVacunacion(turnoId);
      return;
    }

    await enviarConfirmacionTurnoMedico(turnoId);
  } catch (error) {
    console.error(`[US-17] Error al enviar confirmación del turno ${turnoId}:`, error);
  }
}

export async function enviarNotificacionCancelacionVacunacionMostrador(
  aviso: CancelacionVacunacionData
): Promise<void> {
  try {
    await enviarAvisoCancelacionVacunacion(aviso);
  } catch (error) {
    console.error("[US-17] Error al enviar aviso de cancelación de vacunación:", error);
  }
}

export async function enviarNotificacionCancelacionMedicoMostrador(params: {
  pacienteNombre: string;
  pacienteEmail: string;
  doctorNombre: string;
  especialidad: string;
  date: Date;
  startTime: string;
  motivo?: string;
}): Promise<void> {
  try {
    if (!params.pacienteEmail || !params.pacienteEmail.includes("@")) return;
    await sendNotificationEmail({
      to: params.pacienteEmail,
      template: "CANCELACION_TURNO_MEDICO",
      params: {
        pacienteNombre: params.pacienteNombre,
        doctorNombre: params.doctorNombre,
        especialidad: params.especialidad,
        fecha: formatFechaTurno(params.date),
        hora: params.startTime,
        motivo: params.motivo,
      },
    });
  } catch (error) {
    console.error("[US-17] Error al enviar aviso de cancelación de turno médico:", error);
  }
}

export async function enviarNotificacionCancelacionMostrador(
  turnoId: string,
  motivo?: string
): Promise<void> {
  try {
    const turno = await db.turno.findUnique({
      where: { id: turnoId },
      include: {
        doctor: true,
        reservedBy: true,
      },
    });

    if (!turno || !turno.reservedBy || !turno.reservedBy.email.includes("@")) return;

    await enviarNotificacionCancelacionMedicoMostrador({
      pacienteNombre: `${turno.reservedBy.firstName} ${turno.reservedBy.lastName}`.trim(),
      pacienteEmail: turno.reservedBy.email,
      doctorNombre: formatearProfesionalMostrador(turno.doctor),
      especialidad: turno.doctor.specialty
        ? SPECIALTY_LABELS[turno.doctor.specialty]
        : "Consulta médica",
      date: turno.date,
      startTime: turno.startTime,
      motivo,
    });
  } catch (error) {
    console.error(`[US-17] Error al enviar aviso de cancelación del turno ${turnoId}:`, error);
  }
}
