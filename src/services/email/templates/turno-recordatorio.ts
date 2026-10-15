import { RecordatorioTurnoParams, RenderedEmail } from "../types";
import { renderBaseLayout } from "./base-layout";

export function renderRecordatorioTurno(
  params: RecordatorioTurnoParams
): RenderedEmail {
  const subject = `Recordatorio: Tenés un turno programado para el ${params.fecha} a las ${params.hora}`;

  const contentHtml = `
    <span class="badge badge-amber">Recordatorio de Turno</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">¡Hola, ${params.pacienteNombre}!</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">
      Te recordamos que se aproxima tu turno en AuraHealth.
    </p>

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

Hola, ${params.pacienteNombre}:
Te recordamos tu próximo turno en AuraHealth.

- Atención: ${params.tipoTurno}
- Profesional/Sector: ${params.profesionalOArea}
- Fecha: ${params.fecha}
- Hora: ${params.hora} hs

Si no puedes asistir, por favor cancelalo desde la plataforma para liberar el horario.
  `.trim();

  return { subject, html, text };
}
