/**
 * US-62: alta de un estudio adjunto a una entrada de la ficha.
 *
 * La subida entra por el Route Handler `POST /api/historial/adjuntos/[id]`
 * (donde `id` es el `entradaId`) para no quedar sujeta al
 * `serverActions.bodySizeLimit` de Next: un archivo grande rechazado por el
 * parser de Server Actions no llega a ejecutar ninguna validación y el
 * navegador muestra la pantalla de error. Acá se repite la autorización y la
 * validación de tipo/tamaño, y todo acceso queda auditado (RNF-03, RNF-04).
 */

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdjuntoMaxMB } from "@/lib/configuracion";
import { ADJUNTO_ERROR_TAMANO, validarAdjunto } from "@/lib/historial";
import { registrarAccesoHistorial, type ActorHistorial } from "@/services/historial/auditoria";

export type SubirAdjuntoResultado = {
  ok: boolean;
  status: number;
  message: string;
};

export async function subirAdjuntoEntrada(input: {
  actor: ActorHistorial;
  entradaId: string;
  archivo: File | null;
}): Promise<SubirAdjuntoResultado> {
  const { actor, entradaId, archivo } = input;

  if (!entradaId) {
    return { ok: false, status: 400, message: "No se indicó la entrada de la ficha." };
  }

  if (!archivo) {
    return { ok: false, status: 400, message: "Seleccioná un archivo para adjuntar." };
  }

  const entrada = await db.fichaDiagnosticoEntrada.findUnique({
    where: { id: entradaId },
    select: {
      id: true,
      ficha: {
        select: {
          doctorId: true,
          patientKey: true,
          patientName: true,
        },
      },
    },
  });

  if (!entrada) {
    return { ok: false, status: 404, message: "La entrada de la ficha no existe." };
  }

  const pacienteNombre = entrada.ficha.patientName;

  if (actor.id !== entrada.ficha.doctorId) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: entrada.ficha.patientKey,
      pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "RECHAZADO",
      detalle: `Intento de adjuntar a una entrada de otro profesional: ${archivo.name}`,
    });
    return {
      ok: false,
      status: 403,
      message: "Solo el profesional autor de la ficha puede adjuntar estudios a sus entradas.",
    };
  }

  const maxMB = await getAdjuntoMaxMB();
  const validacion = validarAdjunto({
    nombreArchivo: archivo.name,
    tipoMime: archivo.type,
    tamanoBytes: archivo.size,
    maxMB,
  });

  if (!validacion.ok) {
    return { ok: false, status: 400, message: validacion.error };
  }

  try {
    const contenido = new Uint8Array(await archivo.arrayBuffer());
    // El tamaño real del buffer manda sobre el declarado por el navegador.
    if (contenido.byteLength > maxMB * 1024 * 1024) {
      return { ok: false, status: 400, message: ADJUNTO_ERROR_TAMANO };
    }
    if (contenido.byteLength === 0) {
      return { ok: false, status: 400, message: "El archivo está vacío o no se pudo leer." };
    }

    await db.adjuntoEstudio.create({
      data: {
        entradaId: entrada.id,
        nombreArchivo: validacion.nombreArchivo,
        tipoMime: archivo.type.toLowerCase(),
        tamanoBytes: contenido.byteLength,
        contenido,
        subidoPorId: actor.id,
        subidoPorNombre: `Dr. ${actor.firstName} ${actor.lastName}`.trim(),
      },
    });

    await registrarAccesoHistorial({
      actor,
      pacienteKey: entrada.ficha.patientKey,
      pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "EXITOSO",
      detalle: `Adjuntó el estudio «${validacion.nombreArchivo}» (${validacion.tipo})`,
    });

    revalidatePath(`/dashboard/historial/entradas/${entrada.id}`);
    revalidatePath("/dashboard/historial");
    revalidatePath("/dashboard/mi-historial");

    return { ok: true, status: 200, message: "Estudio adjuntado a la entrada de la ficha." };
  } catch (error) {
    console.error("subirAdjuntoEntrada:", error);
    return {
      ok: false,
      status: 500,
      message: "No se pudo guardar el estudio. Intentá nuevamente.",
    };
  }
}
