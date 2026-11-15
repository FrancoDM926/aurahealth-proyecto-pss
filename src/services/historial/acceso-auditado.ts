/**
 * US-44 / RNF-04 — guard de página que audita el rechazo por rol.
 *
 * `requireRoles` redirige a `/acceso-denegado` sin dejar rastro: el intento de
 * Enfermería o del Administrativo de abrir el historial clínico desaparecía.
 * Este wrapper escribe la fila `RECHAZADO` antes de redirigir, para que el
 * administrador vea en la auditoría quién lo intentó y sobre qué información.
 *
 * La escritura es best-effort (igual que el resto de la auditoría): si falla el
 * log, el rechazo se resuelve igual.
 */

import { redirect } from "next/navigation";
import { requireUserProfile, type SessionContext } from "@/lib/auth-session";
import {
  PACIENTE_NO_IDENTIFICADO,
  detalleRechazoPorRol,
} from "@/lib/auditoria-historial";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";
import type { Role, TipoAccesoHistorial } from "@/generated/prisma/client";

/** Contexto del acceso que se está intentando: se guarda en el log del rechazo. */
export type ContextoAccesoHistorial = {
  tipo: TipoAccesoHistorial;
  /** `patientKey` de US-39 si la pantalla ya lo conoce; nulo si no. */
  pacienteKey?: string | null;
  /** Nombre o texto buscado; si falta se guarda «Paciente no identificado». */
  pacienteNombre?: string;
  /** Detalle propio de la pantalla; si falta se arma con el rol y el tipo. */
  detalle?: string;
};

/**
 * Igual que `requireRoles`, pero un rol no autorizado queda auditado como
 * `RECHAZADO` antes de redirigir a `/acceso-denegado`.
 */
export async function requireRolesAuditado(
  allowed: Role[],
  contexto: ContextoAccesoHistorial
): Promise<SessionContext> {
  const context = await requireUserProfile();
  if (allowed.includes(context.role)) return context;

  const { profile, role } = context;
  await registrarAccesoHistorial({
    actor: {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role,
    },
    pacienteKey: contexto.pacienteKey ?? null,
    pacienteNombre:
      contexto.pacienteNombre?.trim() || PACIENTE_NO_IDENTIFICADO,
    tipo: contexto.tipo,
    resultado: "RECHAZADO",
    detalle: contexto.detalle ?? detalleRechazoPorRol(role, contexto.tipo),
  });

  redirect("/acceso-denegado");
}
