import { NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { generarHistorialPdf } from "@/lib/historial-pdf";
import { formatearFechaHoraAuditoriaAr } from "@/lib/estado-turno";
import { consultarHistorialPaciente } from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const dynamic = "force-dynamic";

/**
 * GET /api/historial/pdf — US-41: descarga el historial clínico del propio
 * paciente. Un pedido por otro paciente se rechaza y queda auditado (RNF-03).
 */
export async function GET(request: Request) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { role, profile } = session.context;
  if (role !== "USUARIO") {
    return NextResponse.json(
      { error: "No tenés permisos para descargar este historial." },
      { status: 403 }
    );
  }

  const nombrePropio = `${profile.firstName} ${profile.lastName}`.trim();
  const actor = {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role,
  };

  const paciente = new URL(request.url).searchParams.get("paciente");
  if (paciente && paciente !== profile.id && paciente !== `USER:${profile.id}`) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: paciente,
      pacienteNombre: "Paciente ajeno",
      tipo: "HISTORIAL_PACIENTE",
      resultado: "RECHAZADO",
      detalle: `Intento de descargar el historial de otro paciente (${paciente})`,
    });
    return NextResponse.json({ error: "Historial no encontrado." }, { status: 404 });
  }

  const entradas = await consultarHistorialPaciente(profile.id);
  await registrarAccesoHistorial({
    actor,
    pacienteKey: `USER:${profile.id}`,
    pacienteNombre: nombrePropio,
    tipo: "HISTORIAL_PACIENTE",
    resultado: "EXITOSO",
    detalle: "Descarga del historial en PDF",
  });

  const pdf = generarHistorialPdf({
    pacienteNombre: nombrePropio,
    pacienteDocumento: profile.docNumber ?? "—",
    emitidoEn: formatearFechaHoraAuditoriaAr(new Date()),
    entradas,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="historial-clinico.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
