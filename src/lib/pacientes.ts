/**
 * Búsqueda de pacientes para el personal (mostrador, vacunatorio).
 * Lógica pura compartida por US-28 (turno de vacunación desde mostrador), US-29
 * (registro de dosis) y, por reutilización, US-17 (mostrador, Grupo D).
 */

export const MIN_CARACTERES_BUSQUEDA = 3;
export const MAX_RESULTADOS_BUSQUEDA = 10;

export const MENSAJE_BUSQUEDA_CORTA = `Ingresá al menos ${MIN_CARACTERES_BUSQUEDA} caracteres del documento, apellido o email.`;

export const MENSAJE_PACIENTE_NO_REGISTRADO =
  "No se encontró a la persona. Si no está registrada, hay que darla de alta primero (registro del paciente desde el mostrador).";

/** Texto de búsqueda limpio o `null` si es demasiado corto. */
export function normalizarBusquedaPaciente(q: string | null | undefined): string | null {
  const limpio = (q ?? "").trim().replace(/\s+/g, " ");
  return limpio.length >= MIN_CARACTERES_BUSQUEDA ? limpio : null;
}

/** Documento sin puntos, espacios ni guiones, para comparar "30.123.456" con "30123456". */
export function normalizarDocumentoBusqueda(q: string): string {
  return q.replace(/[.\s-]/g, "");
}

export type PacienteRef = { tipo: "USER"; id: string } | { tipo: "PERSONA"; id: string };

export type PacienteResultado = {
  ref: PacienteRef;
  nombre: string;
  documento: string | null;
  /** Línea de contexto: email, obra social o titular. */
  detalle: string;
};

export function esPacienteRefValido(ref: unknown): ref is PacienteRef {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as { tipo?: unknown; id?: unknown };
  return (r.tipo === "USER" || r.tipo === "PERSONA") && typeof r.id === "string" && r.id.length > 0;
}

export function resumenCobertura(u: {
  coverageType: string;
  healthInsuranceEntity: string | null;
  healthInsurancePlan: string | null;
}): string {
  if (u.coverageType !== "OBRA_SOCIAL" || !u.healthInsuranceEntity) return "Particular";
  return [u.healthInsuranceEntity, u.healthInsurancePlan].filter(Boolean).join(" ");
}
