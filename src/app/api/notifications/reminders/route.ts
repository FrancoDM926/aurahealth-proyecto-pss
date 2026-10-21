import { NextRequest, NextResponse } from "next/server";
import { authorizeCronOrRoles } from "@/lib/cron-auth";
import { procesarRecordatoriosPendientes } from "@/services/notificaciones/turno-recordatorio";

/**
 * US-15 — Ejecución automática del proceso de recordatorios de turno.
 *
 * Lo invoca el scheduler (Vercel Cron o un cron del sistema) con
 * `Authorization: Bearer <NOTIFICATIONS_CRON_SECRET>`; también puede dispararlo
 * un administrador desde el panel. Es idempotente: correrlo de más no duplica
 * correos (ver `turno-recordatorio.ts`).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function ejecutarRecordatorios(req: NextRequest) {
  if (!(await authorizeCronOrRoles(req, ["ADMINISTRADOR"]))) {
    return NextResponse.json(
      { success: false, error: "No autorizado para ejecutar los recordatorios." },
      { status: 401 }
    );
  }

  try {
    const resumen = await procesarRecordatoriosPendientes();
    return NextResponse.json({ success: true, ...resumen });
  } catch (error) {
    console.error("[API Recordatorios] Error inesperado:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

/** Vercel Cron invoca el endpoint con GET. */
export async function GET(req: NextRequest) {
  return ejecutarRecordatorios(req);
}

/** Disparo manual (admin) o crons que usan POST. */
export async function POST(req: NextRequest) {
  return ejecutarRecordatorios(req);
}
