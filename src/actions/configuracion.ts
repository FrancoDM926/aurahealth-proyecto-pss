"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { validarLimitesJornadas } from "@/lib/availability-rn02";
import { validarAntelacionRecordatorio } from "@/lib/recordatorios";
import {
  procesarRecordatoriosPendientes,
  type ResumenRecordatorios,
} from "@/services/notificaciones/turno-recordatorio";

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

/**
 * US-15: el administrador define con cuánta antelación (en horas) se envía el
 * recordatorio de cada turno. El valor inicial del sistema son 24 horas.
 */
export async function saveRecordatorioAntelacion(horas: number): Promise<ActionResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const error = validarAntelacionRecordatorio(horas);
  if (error) {
    return { success: false, message: error };
  }

  try {
    await db.configuracion.upsert({
      where: { id: 1 },
      create: { id: 1, recordatorioAntelacionHoras: horas },
      update: { recordatorioAntelacionHoras: horas },
    });
    revalidatePath("/dashboard/admin/configuracion");
    return { success: true, message: `Antelación de recordatorio actualizada a ${horas} h.` };
  } catch (err) {
    console.error("saveRecordatorioAntelacion:", err);
    return { success: false, message: "No se pudo guardar la antelación del recordatorio." };
  }
}

export type EjecutarRecordatoriosResult = ActionResult & {
  resumen?: ResumenRecordatorios;
};

/**
 * US-15: dispara la corrida del proceso de recordatorios a mano. Es el mismo
 * que ejecuta el cron de forma automática; sirve para la demo y para verificar
 * que quedan registros de cada envío sin esperar al scheduler.
 */
export async function ejecutarRecordatoriosAhoraAction(): Promise<EjecutarRecordatoriosResult> {
  try {
    await assertRoles(["ADMINISTRADOR"]);
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  try {
    const resumen = await procesarRecordatoriosPendientes();
    return {
      success: true,
      message: `Proceso ejecutado: ${resumen.enviados} recordatorio(s) enviado(s), ${resumen.fallidos} con error.`,
      resumen,
    };
  } catch (err) {
    console.error("ejecutarRecordatoriosAhoraAction:", err);
    return { success: false, message: "No se pudo ejecutar el proceso de recordatorios." };
  }
}
