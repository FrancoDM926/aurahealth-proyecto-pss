import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { parseClerkRole } from "@/lib/roles";
import type { Role, User } from "@/generated/prisma/client";

/**
 * El rol es autoritativo en Clerk (`publicMetadata.role`), leído siempre del
 * Backend API para que un cambio de rol o una baja se reflejen de inmediato.
 *
 * Postgres guarda `User.role` únicamente como espejo para display y
 * reconciliación: ningún guard de autorización lo lee. `isActive` y
 * `deactivatedAt` sí viven en Postgres porque son datos de negocio con
 * trazabilidad.
 */
export type SessionContext = {
  clerkUserId: string;
  /** Rol autoritativo, proveniente de Clerk. */
  role: Role;
  /** Perfil en Postgres con los datos de negocio. */
  profile: User;
};

/** Motivo del rechazo, para que cada llamador elija su respuesta. */
export type SessionFailure =
  | "UNAUTHENTICATED"
  | "NO_PROFILE"
  | "INACTIVE"
  | "NO_ROLE"
  | "FORBIDDEN";

/**
 * Carga el contexto de sesión sin decidir la respuesta ante un rechazo.
 * Es la única fuente de las decisiones de autorización de la aplicación.
 */
export async function loadSession(): Promise<
  { ok: true; context: SessionContext } | { ok: false; reason: SessionFailure }
> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  // `currentUser()` es un fetch deduplicado por request: 1 llamada al Backend API.
  const [clerkRole, profile] = await Promise.all([
    currentUser().then((u) => parseClerkRole(u?.publicMetadata?.role)),
    db.user.findUnique({ where: { clerkUserId: userId } }),
  ]);

  if (!profile) {
    return { ok: false, reason: "NO_PROFILE" };
  }
  if (!profile.isActive) {
    return { ok: false, reason: "INACTIVE" };
  }
  if (!clerkRole) {
    // Deny-by-default: sin rol válido en Clerk no hay acceso. Queda logueado
    // para detectar cuentas que necesiten el backfill de metadata.
    console.error(
      `[auth] clerkUserId=${userId} sin publicMetadata.role válido; acceso denegado.`
    );
    return { ok: false, reason: "NO_ROLE" };
  }

  return { ok: true, context: { clerkUserId: userId, role: clerkRole, profile } };
}

/** Guard para páginas: redirige según el motivo del rechazo. */
export async function requireUserProfile(): Promise<SessionContext> {
  const result = await loadSession();
  if (result.ok) return result.context;

  if (result.reason === "UNAUTHENTICATED") redirect("/sign-in");
  if (result.reason === "NO_PROFILE") redirect("/completar-perfil");
  redirect("/acceso-denegado");
}

/** Guard para páginas con restricción de rol. */
export async function requireRoles(allowed: Role[]): Promise<SessionContext> {
  const context = await requireUserProfile();
  if (!allowed.includes(context.role)) {
    redirect("/acceso-denegado");
  }
  return context;
}

/**
 * Guard para server actions, donde `redirect()` no es una respuesta válida:
 * lanza y deja que la acción la traduzca a un `ActionResult`.
 */
export async function assertRoles(allowed: Role[]): Promise<SessionContext> {
  const result = await loadSession();
  if (!result.ok) {
    throw new Error(result.reason);
  }
  if (!allowed.includes(result.context.role)) {
    throw new Error("FORBIDDEN");
  }
  return result.context;
}
