import { loadSession } from "@/lib/auth-session";
import type { Role } from "@/generated/prisma/client";

/**
 * Autorización de los endpoints que ejecuta el scheduler (recordatorios de
 * turno). Dos vías: un secreto compartido Bearer (cron de Vercel o del sistema)
 * o una sesión de administrador (disparo manual desde el panel).
 */

type RequestLike = { headers: { get(name: string): string | null } };

/** Secreto esperado. Acepta el nombre de Vercel Cron y el propio del proyecto. */
export function getCronSecret(): string | null {
  const secret = (process.env.NOTIFICATIONS_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  return secret.length > 0 ? secret : null;
}

/** ¿La petición trae el Bearer del scheduler? */
export function isCronRequest(req: RequestLike): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const secret = getCronSecret();
  return Boolean(token && secret && token === secret);
}

/** Autoriza por secreto de cron o por sesión con alguno de los roles indicados. */
export async function authorizeCronOrRoles(req: RequestLike, roles: Role[]): Promise<boolean> {
  if (isCronRequest(req)) return true;
  const session = await loadSession();
  return session.ok && roles.includes(session.context.role);
}
