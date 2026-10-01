import type { MedicalSpecialty, Role } from "@/generated/prisma/client";

export const INTERNAL_ROLES: Role[] = [
  "MEDICO",
  "ENFERMERA",
  "ADMINISTRATIVO",
  "ADMINISTRADOR",
];

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
