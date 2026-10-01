import type { MedicalSpecialty, Role } from "@/generated/prisma/client";

export const ALL_ROLES: Role[] = [
  "USUARIO",
  "MEDICO",
  "ENFERMERA",
  "ADMINISTRATIVO",
  "ADMINISTRADOR",
];

export const INTERNAL_ROLES: Role[] = [
  "MEDICO",
  "ENFERMERA",
  "ADMINISTRATIVO",
  "ADMINISTRADOR",
];

/**
 * Valida un valorproveniente de la metadata de Clerk contra el enum `Role`.
 * Deny-by-default: cualquier valor ausente, no-string o fuera del enum
 * devuelve `null` y el llamador debe negar el acceso.
 */
export function parseClerkRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return (ALL_ROLES as string[]).includes(value) ? (value as Role) : null;
}

export const ROLE_LABELS: Record<Role, string> = {
  USUARIO: "Usuario",
  MEDICO: "Médico",
  ENFERMERA: "Enfermería",
  ADMINISTRATIVO: "Administrativo",
  ADMINISTRADOR: "Administrador",
};

export const SPECIALTY_LABELS: Record<MedicalSpecialty, string> = {
  CLINICA_MEDICA: "Clínica médica",
  PEDIATRIA: "Pediatría",
  TRAUMATOLOGIA: "Traumatología",
};

export function formatUserRole(
  role: Role,
  specialty?: MedicalSpecialty | null,
  specialtyFallback?: string | null
) {
  const base = ROLE_LABELS[role];
  if (role === "MEDICO") {
    if (specialty) return `${base} · ${SPECIALTY_LABELS[specialty]}`;
    if (specialtyFallback) return `${base} · ${specialtyFallback}`;
  }
  return base;
}
