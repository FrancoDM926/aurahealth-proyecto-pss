import { construirTextoAvisoBloqueo } from "@/lib/bloqueo-agenda";
import { AvisoBloqueoAgendaParams, RenderedEmail } from "../types";
import { escapeHtml, renderBaseLayout } from "./base-layout";

/**
 * US-22 — Aviso por modificación de agenda (`wf_aviso_bloqueo.html`, RF-NOT-02, RF-AGE-09).
 *
 * Informa al paciente que la franja en la que tenía su turno reservado fue bloqueada
 * por el profesional, aclara que su turno NO fue modificado automáticamente (RF-AGE-09)
 * e indica cómo reprogramarlo contactando a la sala.
 */
export function renderAvisoBloqueoAgenda(
  params: AvisoBloqueoAgendaParams
): RenderedEmail {
  const { subject, bodyText } = construirTextoAvisoBloqueo(params);

  const contentHtml = `
    <span class="badge badge-amber">Aviso de Agenda</span>
    <p style="color: #334155; margin: 14px 0 16px 0; font-size: 15px;">${escapeHtml(bodyText)}</p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Profesional:</td>
          <td class="value">${escapeHtml(params.doctorNombre)}</td>
        </tr>
        ${
          params.especialidad
            ? `<tr><td class="label">Especialidad:</td><td class="value">${escapeHtml(params.especialidad)}</td></tr>`
            : ""
        }
        <tr>
          <td class="label">Franja bloqueada:</td>
          <td class="value">${escapeHtml(params.fechaFranjaTexto)} (${escapeHtml(params.desde)} a ${escapeHtml(params.hasta)})</td>
        </tr>
        <tr>
          <td class="label">Turno afectado:</td>
          <td class="value">${escapeHtml(params.fechaTurno)} ${escapeHtml(params.horaTurno)} hs (sin modificar)</td>
        </tr>
        ${
          params.motivo
            ? `<tr><td class="label">Motivo:</td><td class="value">${escapeHtml(params.motivo)}</td></tr>`
            : ""
        }
      </table>
    </div>

    <p style="color: #475569; font-size: 14px;">
      Su turno no se cancela ni se reprograma de forma automática. Comuníquese con el mostrador de la sala o aguarde el contacto del personal administrativo para acordar la reprogramación o cancelación.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Su turno del ${params.fechaTurno} a las ${params.horaTurno} se vio afectado por un bloqueo de agenda.`,
    contentHtml,
  });

  const text = `
AuraHealth - Aviso por Modificación de Agenda

${bodyText}
${params.motivo ? `\nMotivo informado: ${params.motivo}\n` : ""}
Su turno no fue modificado automáticamente. Contacte a la sala para acordar la reprogramación.
  `.trim();

  return { subject, html, text };
}
