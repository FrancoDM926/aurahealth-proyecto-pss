/**
 * US-24: Catálogo de vacunas
 * Trazabilidad: RF-VAC-01, RN-05
 *
 * - Se crean, modifican y desactivan vacunas con denominación, laboratorio y
 *   esquema de dosis.
 * - Una vacuna desactivada no puede asignarse a turnos nuevos.
 * - No hay dos vacunas activas con la misma denominación y laboratorio.
 * - El catálogo no administra existencias.
 */

export const MAX_DENOMINACION = 80;
export const MAX_LABORATORIO = 80;
export const MAX_ESQUEMA_DOSIS = 200;

export type VacunaInput = {
  denominacion: string;
  laboratorio: string;
  esquemaDosis: string;
};

export type VacunaNormalizada = VacunaInput;

export type VacunaErrores = Partial<Record<keyof VacunaInput, string>>;

/** Recorta los bordes y colapsa los espacios repetidos. */
export function normalizarTexto(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * Clave con la que se comparan dos vacunas: sin distinguir mayúsculas ni
 * acentos, para que "Antigripal" y "ANTIGRIPAL " cuenten como la misma.
 */
export function claveVacuna(denominacion: string, laboratorio: string): string {
  const base = (s: string) =>
    normalizarTexto(s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  return `${base(denominacion)}|${base(laboratorio)}`;
}

export function validarVacuna(
  input: Partial<VacunaInput>
): { ok: true; data: VacunaNormalizada } | { ok: false; errors: VacunaErrores } {
  const data: VacunaNormalizada = {
    denominacion: normalizarTexto(input.denominacion),
    laboratorio: normalizarTexto(input.laboratorio),
    esquemaDosis: normalizarTexto(input.esquemaDosis),
  };
  const errors: VacunaErrores = {};

  if (!data.denominacion) errors.denominacion = "La denominación es obligatoria.";
  else if (data.denominacion.length > MAX_DENOMINACION) {
    errors.denominacion = `La denominación no puede superar los ${MAX_DENOMINACION} caracteres.`;
  }

  if (!data.laboratorio) errors.laboratorio = "El laboratorio es obligatorio.";
  else if (data.laboratorio.length > MAX_LABORATORIO) {
    errors.laboratorio = `El laboratorio no puede superar los ${MAX_LABORATORIO} caracteres.`;
  }

  if (!data.esquemaDosis) errors.esquemaDosis = "El esquema de dosis es obligatorio.";
  else if (data.esquemaDosis.length > MAX_ESQUEMA_DOSIS) {
    errors.esquemaDosis = `El esquema de dosis no puede superar los ${MAX_ESQUEMA_DOSIS} caracteres.`;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, data };
}

export const MENSAJE_VACUNA_DUPLICADA =
  "Ya existe una vacuna activa con la misma denominación y laboratorio.";

type VacunaComparable = {
  id: string;
  denominacion: string;
  laboratorio: string;
  isActive: boolean;
};

/**
 * Devuelve la vacuna activa del catálogo que choca con la denominación y el
 * laboratorio indicados, ignorando `exceptoId` (la que se está editando).
 */
export function buscarDuplicadaActiva(
  catalogo: VacunaComparable[],
  denominacion: string,
  laboratorio: string,
  exceptoId?: string
): VacunaComparable | undefined {
  const clave = claveVacuna(denominacion, laboratorio);
  return catalogo.find(
    (v) =>
      v.isActive &&
      v.id !== exceptoId &&
      claveVacuna(v.denominacion, v.laboratorio) === clave
  );
}

/** Una vacuna solo se puede asignar a un turno nuevo si está activa. */
export function esVacunaAsignable(vacuna: { isActive: boolean } | null | undefined): boolean {
  return vacuna?.isActive === true;
}
