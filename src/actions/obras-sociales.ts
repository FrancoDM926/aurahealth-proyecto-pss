"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { validarDescuentoPorcentaje, validarNombreObraSocial } from "@/lib/pagos";

export type ObraSocialResult = {
  success: boolean;
  message: string;
};

/**
 * US-34 (RN-14): el administrador define el descuento porcentual predefinido de
 * una obra social, que se aplica sobre el precio de consulta sin cobertura.
 */
export async function guardarDescuentoObraSocialAction(
  id: string,
  descuentoPorcentaje: number
): Promise<ObraSocialResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const error = validarDescuentoPorcentaje(descuentoPorcentaje);
  if (error) return { success: false, message: error };

  try {
    const obra = await db.obraSocial.update({ where: { id }, data: { descuentoPorcentaje } });
    revalidatePath("/dashboard/admin/configuracion");
    return {
      success: true,
      message: `Descuento de ${obra.nombre} actualizado a ${descuentoPorcentaje}%. Rige para los pagos que se registren desde ahora.`,
    };
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") {
      return { success: false, message: "La obra social indicada no existe." };
    }
    console.error("guardarDescuentoObraSocialAction:", err);
    return { success: false, message: "No se pudo guardar el descuento." };
  }
}

/** Alta de una obra social en el listado, con su descuento inicial. */
export async function crearObraSocialAction(
  nombre: string,
  descuentoPorcentaje: number
): Promise<ObraSocialResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const errorNombre = validarNombreObraSocial(nombre);
  if (errorNombre) return { success: false, message: errorNombre };
  const errorDescuento = validarDescuentoPorcentaje(descuentoPorcentaje);
  if (errorDescuento) return { success: false, message: errorDescuento };

  const limpio = nombre.trim();
  try {
    const existente = await db.obraSocial.findFirst({
      where: { nombre: { equals: limpio, mode: "insensitive" } },
      select: { id: true },
    });
    if (existente) {
      return { success: false, message: "Ya existe una obra social con ese nombre." };
    }
    await db.obraSocial.create({ data: { nombre: limpio, descuentoPorcentaje } });
    revalidatePath("/dashboard/admin/configuracion");
    return { success: true, message: `Obra social ${limpio} agregada con ${descuentoPorcentaje}% de descuento.` };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, message: "Ya existe una obra social con ese nombre." };
    }
    console.error("crearObraSocialAction:", err);
    return { success: false, message: "No se pudo agregar la obra social." };
  }
}
