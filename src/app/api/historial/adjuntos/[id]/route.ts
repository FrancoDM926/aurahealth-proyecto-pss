import { NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import {
  contentDispositionAttachment,
  puedeDescargarAdjunto,
} from "@/lib/historial";
import {
  obtenerAdjuntoParaDescarga,
} from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const dynamic = "force-dynamic";

/**
 * GET /api/historial/adjuntos/[id] — US-62: descarga de un estudio adjunto.
 * Puede hacerlo cualquier médico de la sala o el paciente dueño del historial
 * (RNF-03). Todo acceso, exitoso o rechazado, se audita (RNF-04).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { role, profile } = session.context;
  const { id } = await params;

  const actor = {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role,
  };

  const adjunto = await obtenerAdjuntoParaDescarga(id);
  if (!adjunto) {
    return NextResponse.json({ error: "Estudio no encontrado." }, { status: 404 });
  }

  if (!puedeDescargarAdjunto({ role, actorId: profile.id, patientKey: adjunto.pacienteKey })) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: adjunto.pacienteKey,
      pacienteNombre: adjunto.pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "RECHAZADO",
      detalle: `Intento de descargar el estudio «${adjunto.nombreArchivo}» sin permiso`,
    });
    // Un adjunto ajeno es indistinguible de uno inexistente.
    return NextResponse.json({ error: "Estudio no encontrado." }, { status: 404 });
  }

  await registrarAccesoHistorial({
    actor,
    pacienteKey: adjunto.pacienteKey,
    pacienteNombre: adjunto.pacienteNombre,
    tipo: "ESTUDIOS",
    resultado: "EXITOSO",
    detalle: `Descarga del estudio «${adjunto.nombreArchivo}»`,
  });

  return new NextResponse(Buffer.from(adjunto.contenido), {
    headers: {
      "Content-Type": adjunto.tipoMime,
      "Content-Disposition": contentDispositionAttachment(adjunto.nombreArchivo),
      "Content-Length": String(adjunto.tamanoBytes),
      "Cache-Control": "private, no-store",
    },
  });
}
