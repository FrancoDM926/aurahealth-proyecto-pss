import { NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { generarCarnetPdf } from "@/lib/carnet";
import { formatearFechaHoraAuditoriaAr } from "@/lib/estado-turno";
import { SALA_NOMBRE } from "@/lib/pagos";
import { obtenerDatosCarnet } from "@/services/vacunacion/carnet";

export const dynamic = "force-dynamic";

/**
 * GET /api/carnet/pdf[?persona=<id>] — US-57: descarga el carnet de vacunación en PDF.
 * Solo el propio usuario, o una persona atendida que él cargó (RNF-03). Una persona
 * ajena es indistinguible de una inexistente.
 */
export async function GET(request: Request) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { role, profile } = session.context;
  if (role !== "USUARIO") {
    return NextResponse.json({ error: "Carnet no encontrado." }, { status: 404 });
  }

  const personaId = new URL(request.url).searchParams.get("persona");
  const datos = await obtenerDatosCarnet(profile, personaId || null);
  if (!datos) {
    return NextResponse.json({ error: "Carnet no encontrado." }, { status: 404 });
  }

  const pdf = generarCarnetPdf({
    salaNombre: SALA_NOMBRE,
    pacienteNombre: datos.pacienteNombre,
    pacienteDocumento: datos.pacienteDocumento,
    emitidoEn: formatearFechaHoraAuditoriaAr(new Date()),
    carnet: datos.carnet,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="carnet-vacunacion.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
