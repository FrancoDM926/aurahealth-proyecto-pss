import { db } from "@/lib/db";
import {
  LIMITES_JORNADAS_DEFAULT,
  type LimitesJornadas,
} from "@/lib/availability-rn02";

/**
 * Límites de jornadas semanales vigentes (US-06 / RN-02). Mientras el
 * administrador no los cambie, rigen los valores iniciales 2 y 7.
 */
export async function getLimitesJornadas(): Promise<LimitesJornadas> {
  const config = await db.configuracion.findUnique({ where: { id: 1 } });
  if (!config) return LIMITES_JORNADAS_DEFAULT;
  return { min: config.minJornadasSemana, max: config.maxJornadasSemana };
}

/** Dirección de la sala informada en los emails (US-14). */
export const SALA_DIRECCION_DEFAULT = "Consultorios Centrales AuraHealth";

export async function getSalaDireccion(): Promise<string> {
  const config = await db.configuracion.findUnique({
    where: { id: 1 },
    select: { salaDireccion: true },
  });
  const direccion = config?.salaDireccion?.trim();
  return direccion && direccion.length > 0 ? direccion : SALA_DIRECCION_DEFAULT;
}
