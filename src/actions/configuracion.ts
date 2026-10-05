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
): Promise<ActionResult> {
  try {
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
