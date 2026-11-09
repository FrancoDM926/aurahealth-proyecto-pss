import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import {
  normalizarFiltrosReporteAusentismo,
  reporteAusentismoACsv,
  reporteAusentismoAPdf,
} from "@/lib/reporte-ausentismo";
import { consultarReporteAusentismo } from "@/lib/reporte-ausentismo-datos";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/ausentismo?format=csv|pdf&desde=…&hasta=…&profesionalId=…
 * US-48 / RF-REP-06: Exporta el reporte de ausentismo con los mismos filtros de la pantalla.
 * Solo accesible para el rol ADMINISTRADOR.
 */
export async function GET(request: NextRequest) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (session.context.role !== "ADMINISTRADOR") {
    return NextResponse.json({ error: "No tenés permisos para esta acción." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const formato = sp.get("format");
  if (formato !== "csv" && formato !== "pdf") {
    return NextResponse.json({ error: "Formato inválido: usá csv o pdf." }, { status: 400 });
  }

  const filtros = normalizarFiltrosReporteAusentismo(
    {
      desde: sp.get("desde") ?? undefined,
      hasta: sp.get("hasta") ?? undefined,
      profesionalId: sp.get("profesionalId") ?? undefined,
    },
    todayInArgentina()
  );

  if (filtros.error) {
    return NextResponse.json({ error: filtros.error }, { status: 400 });
  }

  const reporte = await consultarReporteAusentismo(filtros);
  const nombre = `reporte-ausentismo-${filtros.desde}_${filtros.hasta}`;

  if (formato === "csv") {
    return new NextResponse(reporteAusentismoACsv(reporte, filtros), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(Buffer.from(reporteAusentismoAPdf(reporte, filtros)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
