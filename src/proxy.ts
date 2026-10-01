import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * El proxy solo decodifica la sesión de Clerk; no aplica reglas de autorización.
 *
 * Los guards de rol viven en `src/lib/auth-session.ts` (`requireUserProfile`,
 * `requireRoles`, `assertRoles`) y se invocan desde cada página y cada server
 * action que accede a datos protegidos. Es el patrón que Clerk recomienda
 * explícitamente: `createRouteMatcher` está deprecado y el control de acceso por
 * coincidencia de paths en middleware puede divergir de cómo Next enruta las
 * peticiones, dejando recursos protegidos alcanzables.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
