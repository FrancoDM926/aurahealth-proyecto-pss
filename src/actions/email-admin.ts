"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import {
  ENVIOS_FALLIDOS_MAX,
  ENVIOS_FALLIDOS_MIN,
  esPlantillaAdministrable,
  validarMensajePlantilla,
} from "@/services/email/catalogo";

export type EmailAdminResult = {
  success: boolean;
  message?: string;
};

/**
 * US-21: el administrador guarda el cuerpo del mensaje de una plantilla desde
 * la pantalla «Emails». El asunto, el remitente y los destinatarios no se
 * tocan: son fijos por plantilla (wireframe `wf_servicio_email.html`).
 */
export async function saveMensajePlantillaAction(
  clave: string,
  mensaje: string
): Promise<EmailAdminResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  if (!esPlantillaAdministrable(clave)) {
    return { success: false, message: "Plantilla inexistente." };
  }

  const error = validarMensajePlantilla(clave, mensaje);
  if (error) {
    return { success: false, message: error };
  }

  const limpio = mensaje.trim();
  try {
    await db.plantillaEmail.upsert({
      where: { clave },
      create: { clave, mensaje: limpio },
      update: { mensaje: limpio },
    });
    revalidatePath("/dashboard/admin/emails");
    return { success: true, message: "Mensaje de la plantilla actualizado." };
  } catch (err) {
    console.error("saveMensajePlantillaAction:", err);
    return { success: false, message: "No se pudo guardar el mensaje de la plantilla." };
  }
}

/**
 * US-21: cantidad máxima de envíos fallidos que puede acumular un mismo
 * destinatario antes de que el servicio deje de reintentarle.
 */
export async function saveEnviosFallidosAction(valor: number): Promise<EmailAdminResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  if (!Number.isInteger(valor)) {
    return { success: false, message: "Ingresá un número entero." };
  }
  if (valor < ENVIOS_FALLIDOS_MIN || valor > ENVIOS_FALLIDOS_MAX) {
    return {
      success: false,
      message: `Ingresá un número entre ${ENVIOS_FALLIDOS_MIN} y ${ENVIOS_FALLIDOS_MAX}.`,
    };
  }

  try {
    await db.configuracion.upsert({
      where: { id: 1 },
      create: { id: 1, maxEnviosFallidosPorUsuario: valor },
      update: { maxEnviosFallidosPorUsuario: valor },
    });
    revalidatePath("/dashboard/admin/emails");
    return { success: true, message: `Límite de envíos fallidos actualizado a ${valor}.` };
  } catch (err) {
    console.error("saveEnviosFallidosAction:", err);
    return { success: false, message: "No se pudo guardar el límite de envíos fallidos." };
  }
}
