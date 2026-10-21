import {
  getAsuntoPlantilla,
  getMensajePorDefecto,
  renderMensajeHtml,
  renderMensajeTexto,
} from "../catalogo";
import {
  CancelacionTurnoMedicoParams,
  CancelacionTurnoVacunatorioParams,
  RenderTemplateOptions,
  RenderedEmail,
} from "../types";
import { renderBaseLayout } from "./base-layout";

/**
 * US-16, administrada desde la pantalla «Emails» de US-21: asunto fijo y
 * mensaje editable con las mismas variables del resto del flujo de turnos.
 */
export function renderCancelacionTurnoMedico(
  params: CancelacionTurnoMedicoParams,
  opciones?: RenderTemplateOptions
): RenderedEmail {
  const subject =
    getAsuntoPlantilla("CANCELACION_TURNO_MEDICO") ?? "Cancelación de turno";
  const mensaje =
    opciones?.mensaje ?? getMensajePorDefecto("CANCELACION_TURNO_MEDICO") ?? "";
  const valores: Record<string, string | undefined> = {
    paciente: params.pacienteNombre,
    profesional: params.doctorNombre,
    fecha: params.fecha,
    hora: params.hora,
  };

  const contentHtml = `
    <span class="badge badge-rose">Turno Cancelado</span>
    <p style="color: #334155; margin: 14px 0 4px 0; font-size: 15px;">${renderMensajeHtml(mensaje, valores)}</p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Especialidad:</td>
          <td class="value">${params.especialidad}</td>
        </tr>
        <tr>
          <td class="label">Profesional:</td>
          <td class="value">${params.doctorNombre}</td>
        </tr>
        <tr>
          <td class="label">Fecha cancelada:</td>
          <td class="value">${params.fecha}</td>
        </tr>
        <tr>
          <td class="label">Horario:</td>
          <td class="value">${params.hora} hs</td>
        </tr>
        ${
          params.motivo
            ? `<tr><td class="label">Motivo:</td><td class="value">${params.motivo}</td></tr>`
            : ""
        }
      </table>
    </div>

    <p style="color: #475569; font-size: 14px;">
      Si deseas coordinar una nueva cita con el profesional, puedes acceder al portal web de AuraHealth para consultar la disponibilidad vigente y reservar un nuevo turno.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Aviso de cancelación de turno para el ${params.fecha} a las ${params.hora}.`,
    contentHtml,
  });

  const text = `
AuraHealth - Aviso de Cancelación de Turno Médico

${renderMensajeTexto(mensaje, valores)}
${params.motivo ? `\n- Motivo: ${params.motivo}\n` : ""}
Puedes ingresar a tu cuenta de AuraHealth para reservar un nuevo turno.
  `.trim();

  return { subject, html, text };
}

export function renderCancelacionTurnoVacunatorio(
  params: CancelacionTurnoVacunatorioParams
): RenderedEmail {
  const subject = `Cancelación de Turno en Vacunatorio: ${params.fecha} ${params.hora}`;

  const contentHtml = `
    <span class="badge badge-rose">Vacunatorio - Turno Cancelado</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">Estimado/a ${params.pacienteNombre},</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">El turno asignado en el vacunatorio ha sido cancelado.</p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Área:</td>
          <td class="value">Vacunatorio Central</td>
        </tr>
        ${
          params.vacunaNombre
            ? `<tr><td class="label">Vacuna:</td><td class="value">${params.vacunaNombre}</td></tr>`
            : ""
        }
        <tr>
          <td class="label">Fecha cancelada:</td>
          <td class="value">${params.fecha}</td>
        </tr>
        <tr>
          <td class="label">Horario:</td>
          <td class="value">${params.hora} hs</td>
        </tr>
        ${
          params.motivo
            ? `<tr><td class="label">Motivo:</td><td class="value">${params.motivo}</td></tr>`
            : ""
        }
      </table>
    </div>

    <p style="color: #475569; font-size: 14px;">
      Puedes ingresar nuevamente a la plataforma para solicitar un nuevo horario de vacunación cuando lo desees.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Cancelación de turno de vacunación del ${params.fecha}.`,
    contentHtml,
  });

  const text = `
AuraHealth - Cancelación de Turno de Vacunación

Estimado/a ${params.pacienteNombre}:
El turno asignado en el vacunatorio para el ${params.fecha} a las ${params.hora} hs ha sido cancelado.
${params.motivo ? `Motivo: ${params.motivo}\n` : ""}
Puedes ingresar nuevamente a la plataforma para programar otro turno.
  `.trim();

  return { subject, html, text };
}
