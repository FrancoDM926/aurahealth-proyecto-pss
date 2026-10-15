import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { sendNotificationEmail } from "@/services/email";
import { NotificationTemplateType } from "@/services/email/types";

/**
 * Route Handler: POST /api/notifications/send
 * Permite disparar notificaciones de correo de manera segura.
 * Autorización admitida:
 * 1. Bearer Token que coincida con NOTIFICATIONS_CRON_SECRET (para cron jobs / workers).
 * 2. Sesión activa con rol ADMINISTRADOR.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const cronSecret = process.env.NOTIFICATIONS_CRON_SECRET?.trim();

    let isAuthorized = false;

    // 1. Verificación por Cron Secret
    if (token && cronSecret && token === cronSecret) {
      isAuthorized = true;
    } else {
      // 2. Verificación por Sesión de Administrador
      const sessionResult = await loadSession();
      if (sessionResult.ok && sessionResult.context.role === "ADMINISTRADOR") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "No autorizado para despachar notificaciones." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { to, template, params, metadata, maxRetries } = body;

    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { success: false, error: "El campo 'to' es obligatorio y debe ser un email válido." },
        { status: 400 }
      );
    }

    if (!template || typeof template !== "string") {
      return NextResponse.json(
        { success: false, error: "El campo 'template' es obligatorio." },
        { status: 400 }
      );
    }

    if (!params || typeof params !== "object") {
      return NextResponse.json(
        { success: false, error: "El objeto 'params' es obligatorio." },
        { status: 400 }
      );
    }

    const result = await sendNotificationEmail({
      to,
      template: template as NotificationTemplateType,
      params,
      metadata,
      maxRetries,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, logId: result.logId, attempts: result.attempts },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      logId: result.logId,
      attempts: result.attempts,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("[API Notifications Send] Error inesperado:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}
