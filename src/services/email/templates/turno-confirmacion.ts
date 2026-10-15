import {
  ConfirmacionTurnoMedicoParams,
  ConfirmacionTurnoVacunatorioParams,
  RenderedEmail,
} from "../types";
import { renderBaseLayout } from "./base-layout";

export function renderConfirmacionTurnoMedico(
  params: ConfirmacionTurnoMedicoParams
): RenderedEmail {
  const subject = `Confirmación de Turno: ${params.especialidad} - ${params.fecha} ${params.hora}`;

  const contentHtml = `
    <span class="badge badge-teal">Turno Confirmado</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">¡Hola, ${params.pacienteNombre}!</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">Tu consulta médica ha sido reservada con éxito en AuraHealth. A continuación te acercamos los detalles de tu turno:</p>

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
          <td class="label">Fecha:</td>
          <td class="value">${params.fecha}</td>
        </tr>
        <tr>
          <td class="label">Horario:</td>
          <td class="value">${params.hora} hs (Duración 30 min)</td>
        </tr>
        ${
          params.direccion
            ? `<tr><td class="label">Ubicación:</td><td class="value">${params.direccion}</td></tr>`
            : `<tr><td class="label">Ubicación:</td><td class="value">Consultorios Centrales AuraHealth</td></tr>`
        }
        ${
          params.costoConsulta !== undefined
            ? `<tr><td class="label">Costo consulta:</td><td class="value">$${params.costoConsulta.toLocaleString("es-AR")}</td></tr>`
            : ""
        }
      </table>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
      <strong>Recordatorio:</strong> Te sugerimos presentarte 10 minutos antes del horario indicado con tu documento de identidad y credencial de cobertura médica en caso de corresponder.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Tu turno con ${params.doctorNombre} para el ${params.fecha} a las ${params.hora} ha sido confirmado.`,
    contentHtml,
  });

  const text = `
AuraHealth - Confirmación de Turno Médico

Hola, ${params.pacienteNombre}:
Tu consulta médica ha sido reservada con éxito.

Detalles del turno:
- Especialidad: ${params.especialidad}
- Profesional: ${params.doctorNombre}
- Fecha: ${params.fecha}
- Horario: ${params.hora} hs (30 minutos)
${params.costoConsulta ? `- Costo: $${params.costoConsulta}` : ""}

Ubicación: ${params.direccion || "Consultorios Centrales AuraHealth"}

Por favor presentate 10 minutos antes con tu documento.
  `.trim();

  return { subject, html, text };
}

export function renderConfirmacionTurnoVacunatorio(
  params: ConfirmacionTurnoVacunatorioParams
): RenderedEmail {
  const subject = `Confirmación de Turno de Vacunación: ${params.fecha} ${params.hora}`;

  const contentHtml = `
    <span class="badge badge-teal">Vacunatorio</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">¡Hola, ${params.pacienteNombre}!</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">Tu turno en el vacunatorio de AuraHealth ha sido programado con éxito.</p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Área:</td>
          <td class="value">Vacunatorio Central</td>
        </tr>
        ${
          params.vacunaNombre
            ? `<tr><td class="label">Vacuna / Esquema:</td><td class="value">${params.vacunaNombre}</td></tr>`
            : ""
        }
        ${
          params.enfermeraNombre
            ? `<tr><td class="label">Enfermera a cargo:</td><td class="value">${params.enfermeraNombre}</td></tr>`
            : ""
        }
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

    ${
      params.indicaciones
        ? `<div style="margin-top: 16px; padding: 12px; background-color: #f0fdfa; border-left: 4px solid #0d9488; font-size: 13px; color: #0f766e;">
             <strong>Indicaciones:</strong> ${params.indicaciones}
           </div>`
        : ""
    }

    <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
      Recuerda llevar tu libreta o carnet de vacunación y documento de identidad.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Turno en vacunatorio programado para el ${params.fecha} a las ${params.hora}.`,
    contentHtml,
  });

  const text = `
AuraHealth - Confirmación de Turno en Vacunatorio

Hola, ${params.pacienteNombre}:
Tu turno en el vacunatorio ha sido programado con éxito.

Detalles:
- Área: Vacunatorio Central
${params.vacunaNombre ? `- Vacuna: ${params.vacunaNombre}\n` : ""}- Fecha: ${params.fecha}
- Horario: ${params.hora} hs
${params.indicaciones ? `Indicaciones: ${params.indicaciones}\n` : ""}
Por favor presentate con tu carnet de vacunación y DNI.
  `.trim();

  return { subject, html, text };
}
