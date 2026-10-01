import type { Role } from "@/generated/prisma/client";

/**
 * Clerk permite tipar la metadata pública mediante declaration merging en el
 * scope global. `UserPublicMetadata` solo se puede escribir desde el Backend API
 * (secret key), nunca desde el cliente, por lo que un autorregistro no puede
 * auto-asignarse un rol privilegiado (RN-11).
 */
declare global {
  interface UserPublicMetadata {
    /** Rol autoritativo del sistema. Ausente → deny-by-default. */
    role?: Role;
    /** Marca de usuario interno (médico, enfermería, administrativo). */
    internal?: boolean;
  }
}

export {};
