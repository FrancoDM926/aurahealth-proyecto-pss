import { db } from "@/lib/db";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { formatearFechaCortaDdMm, formatearRangoFechasAr } from "@/lib/bloqueo-agenda";
import { sendNotificationEmail } from "@/services/email";
import type { AvisoBloqueoAgendaParams } from "@/services/email/types";

/**
 * US-22 — Aviso por modificación de agenda (RF-NOT-02, RF-AGE-06, RF-AGE-09, RN-10).
 *
 * Al bloquearse una franja, identifica los turnos reservados dentro de ella y
 * envía el correo de aviso a cada paciente afectado utilizando el servicio único
 * de notificaciones (US-21), dejando registrado el estado del envío en `BloqueoAviso`
 * para el listado del personal administrativo.
 */

export type DatosAvisoBloqueoInput = {
  pacienteNombre: string;
  doctorNombre: string;
  especialidad?: string;
  /** "YYYY-MM-DD" */
  diaBloqueo: string;
  /** "YYYY-MM-DD" */
  diaBloqueoHasta?: string;
  /** "HH:mm" */
  desde: string;
  /** "HH:mm" */
  hasta: string;
  /** "YYYY-MM-DD" */
  fechaTurno: string;
  /** "HH:mm" */
  horaTurno: string;
  motivo?: string;
};

function formatUtcDateIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildAvisoBloqueoAgendaParams(
  data: DatosAvisoBloqueoInput
): AvisoBloqueoAgendaParams {
  return {
    pacienteNombre: data.pacienteNombre,
    doctorNombre: data.doctorNombre,
    especialidad: data.especialidad,
    fechaFranjaTexto: formatearRangoFechasAr(data.diaBloqueo, data.diaBloqueoHasta),
    desde: data.desde,
    hasta: data.hasta,
    fechaTurno: formatearFechaAr(data.fechaTurno),
    fechaTurnoCorta: formatearFechaCortaDdMm(data.fechaTurno),
    horaTurno: data.horaTurno,
    motivo: data.motivo,
  };
}

/**
 * Envía los avisos por email a todos los pacientes con turno reservado en la
 * franja bloqueada y actualiza cada fila de `BloqueoAviso` con el estado real
 * del envío (`SENT` o `FAILED`).
 */
export async function enviarAvisosBloqueoAgenda(bloqueoId: string): Promise<void> {
  try {
    const bloqueo = await db.bloqueoAgenda.findUnique({
      where: { id: bloqueoId },
      include: {
        doctor: true,
        avisosPacientes: {
          orderBy: [{ fechaTurno: "asc" }, { startTime: "asc" }],
        },
      },
    });

    if (!bloqueo) {
      console.error(`[US-22] Bloqueo ${bloqueoId} inexistente: no se envían avisos.`);
      return;
    }

    const doctorNombre = `Dr. ${bloqueo.doctor.firstName} ${bloqueo.doctor.lastName}`;
    const especialidad = bloqueo.doctor.specialty
      ? SPECIALTY_LABELS[bloqueo.doctor.specialty]
      : "Consulta médica";
    const diaBloqueo = formatUtcDateIso(bloqueo.date);
    const diaBloqueoHasta = formatUtcDateIso(bloqueo.dateHasta);

    for (const aviso of bloqueo.avisosPacientes) {
      if (!aviso.pacienteEmail || !aviso.pacienteEmail.includes("@")) {
        await db.bloqueoAviso.update({
          where: { id: aviso.id },
          data: { emailStatus: "FAILED" },
        });
        continue;
      }

      const fechaTurnoIso = formatUtcDateIso(aviso.fechaTurno);
      const params = buildAvisoBloqueoAgendaParams({
        pacienteNombre: aviso.pacienteNombre,
        doctorNombre,
        especialidad,
        diaBloqueo,
        diaBloqueoHasta,
        desde: bloqueo.startTime,
        hasta: bloqueo.endTime,
        fechaTurno: fechaTurnoIso,
        horaTurno: aviso.startTime,
        motivo: bloqueo.motivo,
      });

      const result = await sendNotificationEmail({
        to: aviso.pacienteEmail,
        template: "AVISO_BLOQUEO_AGENDA",
        params,
      });

      await db.bloqueoAviso.update({
        where: { id: aviso.id },
        data: {
          emailStatus: result.success ? "SENT" : "FAILED",
          emailLogId: result.logId ?? null,
        },
      });
    }
  } catch (error) {
    console.error(`[US-22] Error al enviar avisos del bloqueo ${bloqueoId}:`, error);
  }
}
