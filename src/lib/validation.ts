/**
 * Validación de datos de cuenta — fuente única de verdad.
 *
 * Estas funciones se importan desde los formularios client (validación en el
 * navegador) y desde las server actions (RNF-03 / Definición de terminado:
 * toda validación de campos se repite del lado del servidor). Al compartir
 * reglas y mensajes, ambos lados devuelven exactamente los mismos errores.
 *
 * Cobertura médica: dato declarativo, no se valida contra el padrón de la
 * entidad (Definición 10 del cliente, 19/09/2026).
 */

export const DOC_TYPES = ["DNI", "LC", "LE", "PASAPORTE"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  DNI: "DNI (Documento Nacional de Identidad)",
  LC: "LC (Libreta Cívica)",
  LE: "LE (Libreta de Enrolamiento)",
  PASAPORTE: "Pasaporte",
};

export const COVERAGE_TYPES = ["OBRA_SOCIAL", "PARTICULAR"] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

/**
 * Listado hardcodeado mientras US-32 (listado administrado por el
 * administrador) no esté implementado.
 */
export const ENTITY_OPTIONS = [
  { value: "OSDE", label: "OSDE" },
  { value: "Swiss Medical", label: "Swiss Medical" },
  { value: "IOMA", label: "IOMA" },
  { value: "PAMI", label: "PAMI" },
] as const;

export const MAX_LENGTHS = {
  firstName: 50,
  lastName: 50,
  docType: 10,
  docNumber: 20,
  phone: 20,
  email: 254,
  address: 120,
  alternativeContact: 120,
  healthInsuranceEntity: 50,
  healthInsurancePlan: 50,
  healthInsuranceNumber: 30,
} as const;

/** RNF-08: mensajes breves para pantallas de 360 px. */

// Nombre y apellido: letras (con acentos y ñ), espacios, guiones y apóstrofes.
const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'’-]*$/;

// Formato práctico: algo@algo.tld (sin espacios, TLD de 2+ letras).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Teléfono flexible: dígitos, espacios, guiones y paréntesis, '+' inicial opcional.
const PHONE_PATTERN = /^\+?[\d\s\-()]+$/;

const DOC_TYPE_STRINGS: readonly string[] = DOC_TYPES;
const COVERAGE_TYPE_STRINGS: readonly string[] = COVERAGE_TYPES;

export function validateName(value: string, label: "nombre" | "apellido"): string | null {
  const v = value.trim();
  if (!v) return `Ingresá tu ${label}.`;
  if (v.length < 2) return "Usá al menos 2 caracteres.";
  if (v.length > MAX_LENGTHS.firstName) return `Máximo ${MAX_LENGTHS.firstName} caracteres.`;
  if (!NAME_PATTERN.test(v)) return "Solo letras, espacios, guiones y apóstrofes.";
  return null;
}

export function validateEmailFormat(value: string): string | null {
  const v = value.trim();
  if (!v) return "Ingresá tu correo electrónico.";
  if (v.length > MAX_LENGTHS.email) return `Máximo ${MAX_LENGTHS.email} caracteres.`;
  if (!EMAIL_PATTERN.test(v)) return "Ingresá un correo electrónico válido.";
  return null;
}

export function validatePhone(value: string): string | null {
  const v = value.trim();
  if (!v) return "Ingresá tu teléfono.";
  if (v.length > MAX_LENGTHS.phone) return `Máximo ${MAX_LENGTHS.phone} caracteres.`;
  if (!PHONE_PATTERN.test(v)) return "Solo dígitos, espacios, guiones y paréntesis.";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) {
    return "Debe tener entre 6 y 15 dígitos.";
  }
  return null;
}

/**
 * Parsea un `YYYY-MM-DD` como fecha UTC. Devuelve `null` si el formato es
 * inválido o la fecha no existe en el calendario (p. ej. 2026-02-30).
 */
export function parseBirthDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function validateBirthDate(value: string): string | null {
  const v = value.trim();
  if (!v) return "Seleccioná tu fecha de nacimiento.";
  const date = parseBirthDate(v);
  if (!date) return "Ingresá una fecha de nacimiento válida.";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date.getTime() > today.getTime()) return "La fecha no puede ser futura.";
  const oldest = new Date(
    Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate())
  );
  if (date.getTime() < oldest.getTime()) return "La fecha no puede tener más de 120 años.";
  return null;
}

export function validateOptionalText(value: string | undefined | null, max: number): string | null {
  const v = value?.trim() ?? "";
  if (!v) return null;
  if (v.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

export function validateDocType(value: string): string | null {
  const v = value.trim();
  // Vacío es válido: el servidor aplica "DNI" por defecto.
  if (!v) return null;
  if (!DOC_TYPE_STRINGS.includes(v)) return "Seleccioná un tipo de documento válido.";
  return null;
}

export function validateDocNumber(value: string, options?: { required?: boolean }): string | null {
  const v = value.trim();
  if (!v) return options?.required ? "Ingresá tu número de documento." : null;
  if (v.length > MAX_LENGTHS.docNumber) {
    return `Máximo ${MAX_LENGTHS.docNumber} caracteres.`;
  }
  return null;
}

/**
 * Tipo de cobertura obligatorio (aunque la cobertura en sí sea opcional: si
 * no hay cobertura se declara "particular"). Si es OBRA_SOCIAL, entidad,
 * plan y número de afiliado son obligatorios (declarativos, sin padrón).
 */
function validateCoverageFields(
  coverageType: string,
  fields: { entity?: string; plan?: string; number?: string }
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!coverageType.trim()) {
    errors.coverageType = "Seleccioná un tipo de cobertura válido.";
    return errors;
  }
  if (!COVERAGE_TYPE_STRINGS.includes(coverageType.trim())) {
    errors.coverageType = "Seleccioná un tipo de cobertura válido.";
    return errors;
  }
  if (coverageType.trim() === "OBRA_SOCIAL") {
    const entity = fields.entity?.trim() ?? "";
    const plan = fields.plan?.trim() ?? "";
    const number = fields.number?.trim() ?? "";
    if (!entity) {
      errors.healthInsuranceEntity = "Seleccioná tu entidad de obra social.";
    } else if (entity.length > MAX_LENGTHS.healthInsuranceEntity) {
      errors.healthInsuranceEntity = `Máximo ${MAX_LENGTHS.healthInsuranceEntity} caracteres.`;
    }
    if (!plan) {
      errors.healthInsurancePlan = "Ingresá el plan de tu cobertura.";
    } else if (plan.length > MAX_LENGTHS.healthInsurancePlan) {
      errors.healthInsurancePlan = `Máximo ${MAX_LENGTHS.healthInsurancePlan} caracteres.`;
    }
    if (!number) {
      errors.healthInsuranceNumber = "Ingresá tu número de afiliado.";
    } else if (number.length > MAX_LENGTHS.healthInsuranceNumber) {
      errors.healthInsuranceNumber = `Máximo ${MAX_LENGTHS.healthInsuranceNumber} caracteres.`;
    }
  }
  return errors;
}

export type CompleteProfileData = {
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  birthDate: string; // YYYY-MM-DD
  phone: string;
  address?: string;
  alternativeContact?: string;
  coverageType: string;
  healthInsuranceEntity?: string;
  healthInsurancePlan?: string;
  healthInsuranceNumber?: string;
};

export function validateCompleteProfileData(data: CompleteProfileData): Record<string, string> {
  const errors: Record<string, string> = {};
  const add = (field: string, error: string | null) => {
    if (error) errors[field] = error;
  };

  add("firstName", validateName(data.firstName ?? "", "nombre"));
  add("lastName", validateName(data.lastName ?? "", "apellido"));
  add("docType", validateDocType(data.docType ?? ""));
  add("docNumber", validateDocNumber(data.docNumber ?? "", { required: true }));
  add("birthDate", validateBirthDate(data.birthDate ?? ""));
  add("phone", validatePhone(data.phone ?? ""));
  add("address", validateOptionalText(data.address, MAX_LENGTHS.address));
  add("alternativeContact", validateOptionalText(data.alternativeContact, MAX_LENGTHS.alternativeContact));
  Object.assign(
    errors,
    validateCoverageFields(data.coverageType ?? "", {
      entity: data.healthInsuranceEntity,
      plan: data.healthInsurancePlan,
      number: data.healthInsuranceNumber,
    })
  );

  return errors;
}

export type ProfileUpdateData = {
  phone: string;
  email: string;
  address?: string;
  alternativeContact?: string;
  coverageType: string;
  healthInsuranceEntity?: string;
  healthInsurancePlan?: string;
  healthInsuranceNumber?: string;
  /**
   * One-shot (usuarios internos creados por el administrador): se validan
   * solo si vienen provistos; el servidor los escribe únicamente si el perfil
   * todavía no los tiene (US-01).
   */
  docType?: string;
  docNumber?: string;
  birthDate?: string; // YYYY-MM-DD
};

export function validateProfileUpdateData(data: ProfileUpdateData): Record<string, string> {
  const errors: Record<string, string> = {};
  const add = (field: string, error: string | null) => {
    if (error) errors[field] = error;
  };

  add("phone", validatePhone(data.phone ?? ""));
  add("email", validateEmailFormat(data.email ?? ""));
  add("address", validateOptionalText(data.address, MAX_LENGTHS.address));
  add("alternativeContact", validateOptionalText(data.alternativeContact, MAX_LENGTHS.alternativeContact));
  Object.assign(
    errors,
    validateCoverageFields(data.coverageType ?? "", {
      entity: data.healthInsuranceEntity,
      plan: data.healthInsurancePlan,
      number: data.healthInsuranceNumber,
    })
  );

  if (data.docType?.trim()) add("docType", validateDocType(data.docType));
  if (data.docNumber?.trim()) add("docNumber", validateDocNumber(data.docNumber));
  if (data.birthDate?.trim()) add("birthDate", validateBirthDate(data.birthDate));

  return errors;
}
