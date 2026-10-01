import type { MedicalSpecialty } from "@/generated/prisma/client";
import { SPECIALTY_LABELS } from "@/lib/roles";

const SPECIALTY_VALUES = new Set<string>([
  "CLINICA_MEDICA",
  "PEDIATRIA",
  "TRAUMATOLOGIA",
]);

/** Normaliza valores guardados a mano en Studio (ej. "Clínica médica") al enum de Prisma. */
export function parseMedicalSpecialty(
  raw: string | null | undefined
): MedicalSpecialty | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (SPECIALTY_VALUES.has(value)) {
    return value as MedicalSpecialty;
  }
  const byLabel = (
    Object.entries(SPECIALTY_LABELS) as [MedicalSpecialty, string][]
  ).find(([, label]) => label.toLowerCase() === value.toLowerCase());
  if (byLabel) return byLabel[0];
  const normalized = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (SPECIALTY_VALUES.has(normalized)) {
    return normalized as MedicalSpecialty;
  }
  return null;
}
