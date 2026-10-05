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
