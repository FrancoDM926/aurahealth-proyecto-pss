import { db } from "@/lib/db";
import { executeWithRetry } from "./retry";
import { enviosFallidosDe, getEnviosFallidosMax, getMensajePlantilla } from "./plantillas";
import { renderNotificationTemplate } from "./templates";
import { getDefaultFrom, getTransporter } from "./transporter";
import {
  NotificationTemplateType,
  SendNotificationOptions,
  SendNotificationResult,
} from "./types";

export * from "./types";
export * from "./catalogo";
export * from "./plantillas";
export * from "./templates";
export * from "./retry";
export * from "./transporter";

/**
 * Único componente responsable del envío de correos en el sistema (US-21 / RF-NOT-01).
 * Es consumido por todos los módulos (turnos médicos, vacunatorio, registro de usuarios, etc.).
 *
 * Flujo:
 * 1. Renderiza la plantilla parametrizada desde el registro desacoplado.
 * 2. Registra el inicio del envío en la tabla auditable EmailAuditLog (estado PENDING).
 * 3. Ejecuta el envío vía Nodemailer con reintentos acotados y backoff exponencial (Criterio 3).
 * 4. Actualiza el estado a SENT (éxito) o FAILED (tras agotar reintentos).
 */
export async function sendNotificationEmail<T extends NotificationTemplateType>(
  options: SendNotificationOptions<T>
): Promise<SendNotificationResult> {
  const {
    to,
    template,
    params,
    maxRetries = 3,
    initialDelayMs = 500,
  } = options;

  if (!to || !to.includes("@")) {
    throw new Error(`[EmailService] Dirección de destinatario inválida: "${to}"`);
  }

  // 0. Límite de envíos fallidos por destinatario (US-21, pantalla «Emails»):
  //    alcanzado el límite, el sistema deja de reintentarle el envío.
  const maxFallidos = await getEnviosFallidosMax();
  const fallidos = await enviosFallidosDe(to);
  if (fallidos >= maxFallidos) {
    console.warn(
      `[EmailService] ${to} acumula ${fallidos} envío(s) fallido(s) con límite ${maxFallidos}: se omite el envío de ${template}.`
    );
    return {
      success: false,
      attempts: 0,
      limitado: true,
      error: `Se alcanzó el límite de ${maxFallidos} envíos fallidos para ${to}: el sistema dejó de reintentarle el envío.`,
    };
  }

  // 1. Renderizar plantilla parametrizada con el mensaje que administra US-21
  const mensaje = await getMensajePlantilla(template);
  const rendered = renderNotificationTemplate(template, params, { mensaje });
  // 2. Registro auditable inicial en Base de Datos (si db está disponible)
  let auditLogId: string | undefined;
  try {
    const createdLog = await db.emailAuditLog.create({
      data: {
        recipient: to,
        template,
        subject: rendered.subject,
        status: "PENDING",
        attempts: 0,
      },
    });
    auditLogId = createdLog.id;
  } catch (dbError) {
    // Si la DB tiene una intermitencia o estamos en un mock test sin DB activa,
    // registramos en consola pero permitimos continuar con el intento de envío
    console.warn("[EmailService] No se pudo inicializar EmailAuditLog en BD:", dbError);
  }

  const transporter = getTransporter();
  const from = getDefaultFrom();

  let finalAttempts = 0;

  try {
    // 3. Ejecución resiliente con reintentos acotados (Criterio 3)
    const { result, attempts } = await executeWithRetry(
      async (attemptNumber) => {
        finalAttempts = attemptNumber;
        return await transporter.sendMail({
          from,
          to,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });
      },
      {
        maxRetries,
        initialDelayMs,
        onRetry: (attempt, err, nextDelay) => {
          console.warn(
            `[EmailService] Reintento ${attempt}/${maxRetries} para ${to} (próximo en ${nextDelay}ms). Error:`,
            err instanceof Error ? err.message : err
          );
        },
      }
    );

    // 4a. Éxito: actualizar auditoría a SENT
    if (auditLogId) {
      try {
        await db.emailAuditLog.update({
          where: { id: auditLogId },
          data: {
            status: "SENT",
            attempts,
            sentAt: new Date(),
            lastError: null,
          },
        });
      } catch (err) {
        console.error("[EmailService] Error actualizando audit log a SENT:", err);
      }
    }

    return {
      success: true,
      logId: auditLogId,
      attempts,
      messageId: (result as { messageId?: string })?.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const attempts = (error as { attempts?: number })?.attempts || finalAttempts || maxRetries;

    // 4b. Fallo definitivo tras agotar reintentos: marcar auditablemente como FAILED
    if (auditLogId) {
      try {
        await db.emailAuditLog.update({
          where: { id: auditLogId },
          data: {
            status: "FAILED",
            attempts,
            lastError: errorMessage,
          },
        });
      } catch (dbErr) {
        console.error("[EmailService] Error marcando audit log como FAILED:", dbErr);
      }
    }

    console.error(`[EmailService] Envió fallido definitivamente a ${to} tras ${attempts} intentos:`, errorMessage);

    return {
      success: false,
      logId: auditLogId,
      attempts,
      error: errorMessage,
    };
  }
}
