import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import {
  normalizarFiltrosReportePagos,
  reportePagosACsv,
  reportePagosAPdf,
} from "@/lib/reporte-pagos";
import { consultarReportePagos } from "@/lib/reporte-pagos-datos";

export const dynamic = "force-dynamic";

/**
 * GET /api/reportes/pagos?format=csv|pdf&desde=…&hasta=…
 * US-47 / RF-REP-06: exporta el reporte de pagos con los mismos filtros de la
 * pantalla. Solo el administrador.
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

  const filtros = normalizarFiltrosReportePagos(
    {
      desde: sp.get("desde") ?? undefined,
      hasta: sp.get("hasta") ?? undefined,
      medio: sp.get("medio") ?? undefined,
      obraSocial: sp.get("obraSocial") ?? undefined,
      profesionalId: sp.get("profesionalId") ?? undefined,
      especialidad: sp.get("especialidad") ?? undefined,
    },
    todayInArgentina()
  );
  if (filtros.error) {
    return NextResponse.json({ error: filtros.error }, { status: 400 });
  }

  const reporte = await consultarReportePagos(filtros);
  const nombre = `reporte-pagos-${filtros.desde}_${filtros.hasta}`;

  if (formato === "csv") {
    return new NextResponse(reportePagosACsv(reporte, filtros), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(Buffer.from(reportePagosAPdf(reporte, filtros)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
