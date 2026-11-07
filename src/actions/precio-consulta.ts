"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { toFecha } from "@/lib/agenda-profesional";
import { todayInArgentina } from "@/lib/availability-rn02";
import {
  armarHistorialVigencias,
  pesosACentavos,
  validarPrecioConsulta,
  type FilaVigencia,
  type PrecioConsultaErrors,
  type PrecioConsultaInput,
  type VigenciaPrecio,
} from "@/lib/pagos";

export type PrecioConsultaDatos = {
  hoy: string;
  vigente: FilaVigencia | null;
  historial: FilaVigencia[];
};

export type GuardarPrecioResult = {
  success: boolean;
  message: string;
  errors?: PrecioConsultaErrors;
};

async function cargarVigencias(doctorId: string): Promise<VigenciaPrecio[]> {
  const filas = await db.precioConsulta.findMany({ where: { doctorId } });
  return filas.map((f) => ({
    vigenteDesde: toFecha(f.vigenteDesde),
    montoCentavos: f.montoCentavos,
  }));
}

/**
 * US-33: precio vigente e historial de vigencias del médico autenticado. Un
 * médico solo ve el costo de sus propias consultas: el id sale de la sesión.
 */
export async function obtenerPrecioConsulta(): Promise<PrecioConsultaDatos> {
  const { profile } = await assertRoles(["MEDICO"]);
  const hoy = todayInArgentina();
  const vigencias = await cargarVigencias(profile.id);
  return { hoy, ...armarHistorialVigencias(vigencias, hoy) };
}

/**
 * US-33: el médico define el precio de su consulta sin cobertura, desde una fecha.
 * El precio anterior no se borra: queda en el historial de vigencias, y los pagos
 * ya registrados conservan el valor con que se cobraron.
 */
export async function guardarPrecioConsultaAction(
  input: PrecioConsultaInput
): Promise<GuardarPrecioResult> {
  let doctorId: string;
  try {
    ({
      profile: { id: doctorId },
    } = await assertRoles(["MEDICO"]));
  } catch {
    return { success: false, message: "Solo un médico puede definir el precio de su consulta." };
  }

  const hoy = todayInArgentina();
  const vigencias = await cargarVigencias(doctorId);
  const errors = validarPrecioConsulta(input, { hoy, vigencias });
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Revisá los datos del precio.", errors };
  }

  const montoCentavos = pesosACentavos(input.monto)!;
  const vigenteDesde = new Date(`${input.vigenteDesde.trim()}T00:00:00.000Z`);

  try {
    await db.precioConsulta.create({ data: { doctorId, montoCentavos, vigenteDesde } });
  } catch (error) {
    // Otra pestaña cargó la misma fecha entre la validación y el guardado.
    if ((error as { code?: string }).code === "P2002") {
      return {
        success: false,
        message: "Ya existe un precio con esa fecha de vigencia.",
        errors: { vigenteDesde: "Ya existe un precio con esa fecha de vigencia." },
      };
    }
    console.error("guardarPrecioConsultaAction:", error);
    return { success: false, message: "No se pudo guardar el precio de la consulta." };
  }

  revalidatePath("/dashboard/costo-consulta");
  return { success: true, message: "Precio de la consulta guardado. El anterior quedó en el historial." };
}
