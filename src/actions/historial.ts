"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { getAdjuntoMaxMB } from "@/lib/configuracion";
import { validarAdjunto } from "@/lib/historial";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export type AdjuntoFormState = {
  success: boolean;
  message: string;
};

/**
 * US-62: adjunta una imagen o un PDF a una entrada de la ficha. Solo el médico
 * autor de la ficha puede hacerlo (RNF-03), y el tamaño máximo lo define el
 * administrador. El acceso queda registrado en la auditoría (RNF-04).
 */
export async function subirAdjuntoAction(
  _prevState: AdjuntoFormState,
  formData: FormData
): Promise<AdjuntoFormState> {
  let actor;
  try {
    actor = await assertRoles(["MEDICO"]);
  } catch {
    return { success: false, message: "Solo un médico puede adjuntar estudios a la ficha." };
  }

  const entradaId = String(formData.get("entradaId") ?? "").trim();
  if (!entradaId) {
    return { success: false, message: "No se indicó la entrada de la ficha." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return { success: false, message: "Seleccioná un archivo para adjuntar." };
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
    return { success: false, message: "La entrada de la ficha no existe." };
  }

  const pacienteNombre = entrada.ficha.patientName;

  if (actor.profile.id !== entrada.ficha.doctorId) {
    await registrarAccesoHistorial({
      actor: {
        id: actor.profile.id,
        firstName: actor.profile.firstName,
        lastName: actor.profile.lastName,
        role: actor.role,
      },
      pacienteKey: entrada.ficha.patientKey,
      pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "RECHAZADO",
      detalle: `Intento de adjuntar a una entrada de otro profesional: ${archivo.name}`,
    });
    return {
      success: false,
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
    return { success: false, message: validacion.error };
  }

  try {
    const contenido = new Uint8Array(await archivo.arrayBuffer());
    // El tamaño real del buffer manda sobre el declarado por el navegador.
    if (contenido.byteLength > maxMB * 1024 * 1024) {
      return {
        success: false,
        message: `El archivo supera el tamaño máximo permitido (${maxMB} MB).`,
      };
    }
    if (contenido.byteLength === 0) {
      return { success: false, message: "El archivo está vacío o no se pudo leer." };
    }

    await db.adjuntoEstudio.create({
      data: {
        entradaId: entrada.id,
        nombreArchivo: validacion.nombreArchivo,
        tipoMime: archivo.type.toLowerCase(),
        tamanoBytes: contenido.byteLength,
        contenido,
        subidoPorId: actor.profile.id,
        subidoPorNombre: `Dr. ${actor.profile.firstName} ${actor.profile.lastName}`.trim(),
      },
    });

    await registrarAccesoHistorial({
      actor: {
        id: actor.profile.id,
        firstName: actor.profile.firstName,
        lastName: actor.profile.lastName,
        role: actor.role,
      },
      pacienteKey: entrada.ficha.patientKey,
      pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "EXITOSO",
      detalle: `Adjuntó el estudio «${validacion.nombreArchivo}» (${validacion.tipo})`,
    });

    revalidatePath(`/dashboard/historial/entradas/${entrada.id}`);
    revalidatePath("/dashboard/historial");
    revalidatePath("/dashboard/mi-historial");

    return { success: true, message: "Estudio adjuntado a la entrada de la ficha." };
  } catch (error) {
    console.error("subirAdjuntoAction:", error);
    return {
      success: false,
      message: "No se pudo guardar el estudio. Intentá nuevamente.",
    };
  }
}
