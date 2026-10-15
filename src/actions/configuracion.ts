"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { validarLimitesJornadas } from "@/lib/availability-rn02";

export type ActionResult = {
  success: boolean;
  message?: string;
};

/** US-06: el administrador ajusta el mínimo y el máximo de jornadas semanales. */
export async function saveLimitesJornadas(
  min: number,
  max: number
): Promise<ActionResult> {  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const error = validarLimitesJornadas({ min, max });
  if (error) {
    return { success: false, message: error };
  }

  try {
    await db.configuracion.upsert({
      where: { id: 1 },
      create: { id: 1, minJornadasSemana: min, maxJornadasSemana: max },
      update: { minJornadasSemana: min, maxJornadasSemana: max },
    });
    revalidatePath("/dashboard/admin/configuracion");
    revalidatePath("/dashboard/disponibilidad");
    return { success: true, message: "Límites de jornadas actualizados." };
  } catch (err) {
    console.error("saveLimitesJornadas:", err);
    return { success: false, message: "No se pudo guardar la configuración." };
  }
}

const MAX_SALA_DIRECCION = 200;

/**
 * US-14: el administrador define la dirección de la sala que se informa en el
 * email de confirmación de turno.
 */
export async function saveSalaDireccion(direccion: string): Promise<ActionResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const limpia = direccion.trim();
  if (limpia.length === 0) {
    return { success: false, message: "Ingresá la dirección de la sala." };
  }
  if (limpia.length > MAX_SALA_DIRECCION) {
    return {
      success: false,
      message: `La dirección no puede superar los ${MAX_SALA_DIRECCION} caracteres.`,
    };
  }

  try {
    await db.configuracion.upsert({
      where: { id: 1 },
      create: { id: 1, salaDireccion: limpia },
      update: { salaDireccion: limpia },
    });
    revalidatePath("/dashboard/admin/configuracion");
    return { success: true, message: "Dirección de la sala actualizada." };
  } catch (err) {
    console.error("saveSalaDireccion:", err);
    return { success: false, message: "No se pudo guardar la dirección." };
  }
}
