import { NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import {
  ADJUNTO_ERROR_TAMANO,
  contentDispositionAttachment,
  puedeDescargarAdjunto,
} from "@/lib/historial";
import { subirAdjuntoEntrada } from "@/services/historial/adjuntos";
import {
  obtenerAdjuntoParaDescarga,
} from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const dynamic = "force-dynamic";
// Prisma y `Uint8Array` requieren el runtime de Node, no el Edge.
export const runtime = "nodejs";

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

/**
 * POST /api/historial/adjuntos/[id] — US-62: alta de un estudio.
 *
 * Acá `id` es el `entradaId`. La subida va por un Route Handler —y no por una
 * Server Action— porque el límite `serverActions.bodySizeLimit` (1 MB por
 * defecto) rechaza el multipart antes de que la acción pueda validar el
 * tamaño, y el navegador termina mostrando una pantalla de error.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json(
      { ok: false, message: "No autenticado." },
      { status: 401 }
    );
  }

  const { role, profile } = session.context;
  if (role !== "MEDICO") {
    return NextResponse.json(
      { ok: false, message: "Solo un médico puede adjuntar estudios a la ficha." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // Si el hosting corta el cuerpo antes de parsearlo, se devuelve el mismo
    // mensaje que la validación de tamaño para no romper la pantalla.
    return NextResponse.json(
      { ok: false, message: ADJUNTO_ERROR_TAMANO },
      { status: 413 }
    );
  }

  const archivo = formData.get("archivo");
  const resultado = await subirAdjuntoEntrada({
    actor: {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role,
    },
    entradaId: id,
    archivo: archivo instanceof File ? archivo : null,
  });

  return NextResponse.json(
    { ok: resultado.ok, message: resultado.message },
    { status: resultado.status }
  );
}
