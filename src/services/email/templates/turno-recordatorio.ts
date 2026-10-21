import {
  getAsuntoPlantilla,
  getMensajePorDefecto,
  renderMensajeHtml,
  renderMensajeTexto,
} from "../catalogo";
import {
  RecordatorioTurnoParams,
  RenderTemplateOptions,
  RenderedEmail,
} from "../types";
import { renderBaseLayout } from "./base-layout";

/**
 * US-15. Asunto fijo y mensaje administrado por US-21 (wireframe
 * `wf_servicio_email.html`); los datos del turno viajan en la tarjeta.
 */
export function renderRecordatorioTurno(
  params: RecordatorioTurnoParams,
  opciones?: RenderTemplateOptions
): RenderedEmail {
  const subject =
    getAsuntoPlantilla("RECORDATORIO_TURNO") ?? "Recordatorio de turno";
  const mensaje =
    opciones?.mensaje ?? getMensajePorDefecto("RECORDATORIO_TURNO") ?? "";
  const valores: Record<string, string | undefined> = {
    paciente: params.pacienteNombre,
    profesional: params.profesionalOArea,
    fecha: params.fecha,
    hora: params.hora,
  };

  const contentHtml = `
    <span class="badge badge-amber">Recordatorio de Turno</span>
    <p style="color: #334155; margin: 14px 0 4px 0; font-size: 15px;">${renderMensajeHtml(mensaje, valores)}</p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Tipo de atención:</td>
          <td class="value">${params.tipoTurno}</td>
        </tr>
        <tr>
          <td class="label">Profesional / Sector:</td>
          <td class="value">${params.profesionalOArea}</td>
        </tr>
        <tr>
          <td class="label">Fecha:</td>
          <td class="value">${params.fecha}</td>
        </tr>
        <tr>
          <td class="label">Horario:</td>
          <td class="value">${params.hora} hs</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px; font-size: 13px; color: #854d0e; margin-top: 16px;">
      <strong>¿No podrás asistir?</strong> Por favor cancela o reprograma tu turno con anticipación desde tu panel para liberar el cupo para otro paciente que lo necesite.
    </div>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Recordatorio de tu turno ${params.tipoTurno} del ${params.fecha} a las ${params.hora}.`,
    contentHtml,
  });

  const text = `
AuraHealth - Recordatorio de Turno

${renderMensajeTexto(mensaje, valores)}

- Atención: ${params.tipoTurno}
- Profesional/Sector: ${params.profesionalOArea}
- Fecha: ${params.fecha}
- Hora: ${params.hora} hs

Si no puedes asistir, por favor cancelalo desde la plataforma para liberar el horario.
  `.trim();

  return { subject, html, text };
}
