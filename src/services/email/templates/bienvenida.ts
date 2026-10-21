import {
  AltaUsuarioInternoParams,
  BienvenidaRegistroParams,
  RenderedEmail,
} from "../types";
import { renderBaseLayout } from "./base-layout";

export function renderBienvenidaRegistro(
  params: BienvenidaRegistroParams
): RenderedEmail {
  const subject = `Bienvenido/a a AuraHealth - Tu cuenta ha sido creada`;

  const contentHtml = `
    <span class="badge badge-teal">Bienvenido/a</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">¡Hola, ${params.nombre}!</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">
      Tu cuenta en AuraHealth ha sido creada con éxito. A partir de ahora podrás gestionar tus turnos médicos y de vacunatorio de forma ágil y 100% digital.
    </p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Correo registrado:</td>
          <td class="value">${params.email}</td>
        </tr>
        <tr>
          <td class="label">Rol:</td>
          <td class="value">Paciente (Usuario)</td>
        </tr>
      </table>
    </div>

    <p style="color: #475569; font-size: 14px; margin-top: 20px;">
      Desde tu portal personal podrás:
    </p>
    <ul style="color: #475569; font-size: 14px; line-height: 1.8; margin-top: 8px; padding-left: 20px;">
      <li>Reservar turnos con nuestros médicos especialistas y vacunatorio.</li>
      <li>Consultar y gestionar tus citas programadas.</li>
      <li>Actualizar tus datos de contacto y cobertura médica.</li>
    </ul>

    ${
      params.loginUrl
        ? `<div style="text-align: center; margin-top: 24px;">
             <a href="${params.loginUrl}" class="btn">Ingresar a AuraHealth</a>
           </div>`
        : ""
    }
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `¡Hola ${params.nombre}! Tu cuenta en AuraHealth está lista para usar.`,
    contentHtml,
  });

  const text = `
AuraHealth - Bienvenido/a

Hola, ${params.nombre}:
Tu cuenta de AuraHealth ha sido creada exitosamente asociada a ${params.email}.
Ahora podrás reservar turnos con especialistas, vacunas y gestionar tu información de salud.
${params.loginUrl ? `Ingresa desde: ${params.loginUrl}` : ""}
  `.trim();

  return { subject, html, text };
}

export function renderAltaUsuarioInterno(
  params: AltaUsuarioInternoParams
): RenderedEmail {
  const subject = `Alta de Usuario en AuraHealth - Rol asignado: ${params.rol}`;

  const contentHtml = `
    <span class="badge badge-blue">Equipo AuraHealth</span>
    <h2 style="font-size: 20px; color: #0f172a; margin: 12px 0 8px 0;">Estimado/a ${params.nombre},</h2>
    <p style="color: #475569; margin: 0 0 16px 0;">
      El administrador te ha dado de alta en la plataforma interna de AuraHealth con el rol <strong>${params.rol}</strong>.
    </p>

    <div class="card-detail">
      <table>
        <tr>
          <td class="label">Nombre:</td>
          <td class="value">${params.nombre}</td>
        </tr>
        <tr>
          <td class="label">Email de acceso:</td>
          <td class="value">${params.email}</td>
        </tr>
        <tr>
          <td class="label">Rol asignado:</td>
          <td class="value">${params.rol}</td>
        </tr>
      </table>
    </div>

    <p style="color: #475569; font-size: 14px; margin-top: 20px;">
      Puedes acceder al panel con tus credenciales institucionales para comenzar a operar en tu sección de trabajo.
    </p>

    ${
      params.loginUrl
        ? `<div style="text-align: center; margin-top: 24px;">
             <a href="${params.loginUrl}" class="btn">Acceder al Sistema</a>
           </div>`
        : ""
    }
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader: `Se ha creado tu usuario en el equipo de AuraHealth como ${params.rol}.`,
    contentHtml,
  });

  const text = `
AuraHealth - Alta de Usuario Interno

Estimado/a ${params.nombre}:
El administrador te ha dado de alta en AuraHealth con el rol: ${params.rol}.
Email: ${params.email}
${params.loginUrl ? `Acceso: ${params.loginUrl}` : ""}
  `.trim();

  return { subject, html, text };
}
