import nodemailer, { Transporter } from "nodemailer";

let customTransporter: Transporter | null = null;

export function setTransporterForTesting(transporter: Transporter | null) {
  customTransporter = transporter;
}

export function resetTransporter() {
  customTransporter = null;
}

export function getDefaultFrom(): string {
  return process.env.SMTP_FROM || '"AuraHealth" <notificaciones@aurahealth.com>';
}

/**
 * Obtiene el transporter de nodemailer.
 * Si no hay host configurado o estamos en desarrollo/pruebas sin credenciales,
 * provee un transporte de fallback simulado o jsonTransport.
 */
export function getTransporter(): Transporter {
  if (customTransporter) {
    return customTransporter;
  }

  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  // Si hay host y credenciales o host explícito
  if (host && host.length > 0) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: pass || "" } : undefined,
    });
  }

  // Fallback para desarrollo / testing cuando no hay servidor SMTP externo configurado
  return nodemailer.createTransport({
    jsonTransport: true,
  });
}
