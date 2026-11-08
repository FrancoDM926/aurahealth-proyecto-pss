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

// ───────────────────────── Esquema estructurado de dosis ─────────────────────────
// US-24 (ampliación) · base de US-29 (dosis aplicada) y US-57 (carnet).

export const MAX_DOSIS_ESQUEMA = 10;
export const MAX_ETIQUETA_DOSIS = 40;
export const MAX_DIAS_ENTRE_DOSIS = 3650;

/** Dosis tal como se carga en el catálogo. El orden es la posición en la lista (1..n). */
export type DosisInput = {
  etiqueta: string;
  /** Días mínimos desde la dosis anterior. Se ignora en la primera dosis. */
  diasDesdeAnterior?: number | null;
};

export type DosisNormalizada = {
  orden: number;
  etiqueta: string;
  diasDesdeAnterior: number | null;
};

export type EsquemaErrores = { general?: string; filas: Record<number, string> };

export function dosisPorDefecto(): DosisInput[] {
  return [{ etiqueta: "Dosis única", diasDesdeAnterior: null }];
}

/**
 * Valida y normaliza la lista de dosis: de 1 a 10, etiquetas únicas (sin distinguir
 * mayúsculas), la primera sin intervalo y el resto con un entero de 1 a 3650 días o vacío.
 */
export function validarEsquemaDosis(
  dosis: DosisInput[] | undefined | null
): { ok: true; dosis: DosisNormalizada[] } | { ok: false; errors: EsquemaErrores } {
  const errors: EsquemaErrores = { filas: {} };
  const lista = Array.isArray(dosis) ? dosis : [];

  if (lista.length === 0) {
    return { ok: false, errors: { general: "Definí al menos una dosis del esquema.", filas: {} } };
  }
  if (lista.length > MAX_DOSIS_ESQUEMA) {
    return {
      ok: false,
      errors: { general: `El esquema admite hasta ${MAX_DOSIS_ESQUEMA} dosis.`, filas: {} },
    };
  }

  const vistas = new Set<string>();
  const normalizadas: DosisNormalizada[] = lista.map((d, i) => {
    const etiqueta = normalizarTexto(d?.etiqueta);
    if (!etiqueta) errors.filas[i] = "Indicá el nombre de la dosis.";
    else if (etiqueta.length > MAX_ETIQUETA_DOSIS) {
      errors.filas[i] = `Máximo ${MAX_ETIQUETA_DOSIS} caracteres.`;
    } else if (vistas.has(etiqueta.toLowerCase())) {
      errors.filas[i] = "Ya hay otra dosis con ese nombre.";
    }
    vistas.add(etiqueta.toLowerCase());

    let dias: number | null = null;
    if (i > 0 && d?.diasDesdeAnterior !== null && d?.diasDesdeAnterior !== undefined) {
      const n = Number(d.diasDesdeAnterior);
      if (!Number.isInteger(n) || n < 1 || n > MAX_DIAS_ENTRE_DOSIS) {
        errors.filas[i] =
          errors.filas[i] ?? `Los días deben ser un entero entre 1 y ${MAX_DIAS_ENTRE_DOSIS}.`;
      } else {
        dias = n;
      }
    }
    return { orden: i + 1, etiqueta, diasDesdeAnterior: dias };
  });

  if (Object.keys(errors.filas).length > 0) return { ok: false, errors };
  return { ok: true, dosis: normalizadas };
}

/** Texto sugerido para `esquemaDosis` (ej.: "3 dosis — 0, 1 y 6 meses"). */
export function describirEsquema(dosis: DosisInput[]): string {
  if (dosis.length === 0) return "";
  if (dosis.length === 1) return dosis[0].etiqueta;
  const intervalos = dosis.slice(1).map((d) => Number(d.diasDesdeAnterior ?? 0));
  if (intervalos.every((n) => n > 0 && n % 30 === 0)) {
    let meses = 0;
    const marcas = [0];
    for (const n of intervalos) {
      meses += n / 30;
      marcas.push(meses);
    }
    const ultimo = marcas.pop();
    return `${dosis.length} dosis — ${marcas.join(", ")} y ${ultimo} meses`;
  }
  return `${dosis.length} dosis: ${dosis.map((d) => d.etiqueta).join(", ")}`;
}
