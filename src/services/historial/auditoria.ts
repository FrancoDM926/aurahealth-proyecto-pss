/**
 * RNF-04 / US-44: auditoría de accesos al historial clínico.
 *
 * US-40, US-41 y US-62 registran cada acceso, tanto el exitoso como el
 * rechazado. La escritura es best-effort: si falla el log no se bloquea la
 * consulta clínica, pero queda el error en consola para diagnóstico.
 */

import { db } from "@/lib/db";
import { formatearAutorCambioEstado } from "@/lib/estado-turno";
import type {
  ResultadoAccesoHistorial,
  Role,
  TipoAccesoHistorial,
} from "@/generated/prisma/client";

export type ActorHistorial = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export type AccesoHistorialInput = {
  actor: ActorHistorial;
  /**
   * `patientKey` de US-39 (`USER:<id>` / `PERSONA:<id>`) del paciente cuya
   * información se consultó; nulo en búsquedas sin paciente.
   */
  pacienteKey?: string | null;
  pacienteNombre: string;
  tipo: TipoAccesoHistorial;
  resultado: ResultadoAccesoHistorial;
  detalle?: string | null;
};

export async function registrarAccesoHistorial(input: AccesoHistorialInput): Promise<void> {
  try {
    await db.accesoHistorialLog.create({
      data: {
        usuarioId: input.actor.id,
        usuarioNombre: formatearAutorCambioEstado(input.actor),
        usuarioRole: input.actor.role,
        pacienteKey: input.pacienteKey ?? null,
        pacienteNombre: input.pacienteNombre,
        tipo: input.tipo,
        resultado: input.resultado,
        detalle: input.detalle?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("registrarAccesoHistorial:", error);
  }
}

// Las etiquetas viven en la lógica pura de US-44 para que la vista y las
// pruebas no dependan del módulo de escritura (que importa la base de datos).
export {
  RESULTADO_ACCESO_LABELS,
  TIPO_ACCESO_HISTORIAL_LABELS,
} from "@/lib/auditoria-historial";
