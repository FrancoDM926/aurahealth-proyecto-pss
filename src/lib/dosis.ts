/**
 * US-29 — Registro de aplicación de dosis (RF-VAC-06, RNF-04, RN-05).
 * US-57 — comparte las reglas de completitud del esquema.
 *
 * Lógica pura (sin base de datos). Reglas:
 * - El registro guarda paciente, vacuna, dosis del esquema, fecha, hora y enfermera
 *   responsable; esta última sale del usuario autenticado, nunca de un campo de entrada.
 * - No se registra lote ni se descuenta stock.
 * - Un registro no se elimina: se anula con motivo.
 * - Una misma dosis no puede tener dos aplicaciones ACTIVAS para la misma persona;
 *   anular la primera permite registrarla de nuevo.
 * - El orden de las dosis y el intervalo mínimo son criterio clínico: se advierte, no se bloquea.
 */

export const MAX_MOTIVO_ANULACION = 300;

export type DosisEsquema = {
  orden: number;
  etiqueta: string;
  diasDesdeAnterior: number | null;
};

export type AplicacionActiva = { dosisOrden: number; aplicadaAt: Date };

export type EvaluacionAplicacion = {
  error: string | null;
  advertencias: string[];
};

const MS_DIA = 24 * 60 * 60 * 1000;

/** Fecha "dd/mm/aaaa" de un instante, en la hora de la sala. */
export function fechaArgentina(fecha: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fecha);
}

/** Hora "HH:mm" de un instante, en la hora de la sala. */
export function horaArgentina(fecha: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/** Fecha mínima en la que corresponde una dosis, según la dosis previa aplicada. */
export function fechaMinimaDosis(dosis: DosisEsquema, aplicacionPrevia: Date | undefined): Date | null {
  if (!aplicacionPrevia || !dosis.diasDesdeAnterior) return null;
  return new Date(aplicacionPrevia.getTime() + dosis.diasDesdeAnterior * MS_DIA);
}

export function evaluarAplicacion(input: {
  esquema: DosisEsquema[];
  dosisOrden: number;
  aplicacionesActivas: AplicacionActiva[];
  ahora: Date;
}): EvaluacionAplicacion {
  const { esquema, dosisOrden, aplicacionesActivas, ahora } = input;
  const dosis = esquema.find((d) => d.orden === dosisOrden);
  if (!dosis) {
    return { error: "La dosis elegida no pertenece al esquema de la vacuna.", advertencias: [] };
  }
  if (aplicacionesActivas.some((a) => a.dosisOrden === dosisOrden)) {
    return {
      error: `La ${dosis.etiqueta} ya está registrada para esta persona. Si hubo un error, anulá el registro anterior con su motivo.`,
      advertencias: [],
    };
  }

  const advertencias: string[] = [];
  const faltantes = esquema.filter(
    (d) => d.orden < dosisOrden && !aplicacionesActivas.some((a) => a.dosisOrden === d.orden)
  );
  if (faltantes.length > 0) {
    advertencias.push(
      `No hay registro de: ${faltantes.map((d) => d.etiqueta).join(", ")}. Se registra igual, a criterio de la enfermera.`
    );
  }

  const previa = aplicacionesActivas.find((a) => a.dosisOrden === dosisOrden - 1);
  const desde = fechaMinimaDosis(dosis, previa?.aplicadaAt);
  if (desde && ahora.getTime() < desde.getTime()) {
    advertencias.push(
      `La ${dosis.etiqueta} corresponde a partir del ${fechaArgentina(desde)} (${dosis.diasDesdeAnterior} días desde la dosis anterior).`
    );
  }
  return { error: null, advertencias };
}

/** Motivo de anulación obligatorio (US-29). Devuelve el error o `null`. */
export function validarMotivoAnulacion(motivo: string | null | undefined): string | null {
  const m = (motivo ?? "").trim();
  if (!m) return "Ingresá el motivo de la anulación.";
  if (m.length > MAX_MOTIVO_ANULACION) {
    return `El motivo no puede superar los ${MAX_MOTIVO_ANULACION} caracteres.`;
  }
  return null;
}

export type EstadoEsquema =
  | { estado: "COMPLETO" }
  | {
      estado: "INCOMPLETO";
      /** Dosis que faltan aplicar, en orden. */
      faltantes: DosisEsquema[];
      /** Próxima dosis (la de menor orden que falta). */
      proxima: DosisEsquema;
      /** Desde cuándo corresponde la próxima, si hay intervalo definido y dosis previa. */
      proximaDesde: Date | null;
    };

/**
 * US-57: el esquema está completo cuando todas las dosis definidas para la vacuna
 * tienen una aplicación ACTIVA. Se evalúa contra las dosis vigentes del catálogo.
 */
export function evaluarEsquema(esquema: DosisEsquema[], aplicacionesActivas: AplicacionActiva[]): EstadoEsquema {
  const aplicadas = new Map<number, Date>();
  for (const a of aplicacionesActivas) {
    const previa = aplicadas.get(a.dosisOrden);
    if (!previa || a.aplicadaAt < previa) aplicadas.set(a.dosisOrden, a.aplicadaAt);
  }
  const ordenado = [...esquema].sort((a, b) => a.orden - b.orden);
  const faltantes = ordenado.filter((d) => !aplicadas.has(d.orden));
  if (faltantes.length === 0) return { estado: "COMPLETO" };

  const proxima = faltantes[0];
  return {
    estado: "INCOMPLETO",
    faltantes,
    proxima,
    proximaDesde: fechaMinimaDosis(proxima, aplicadas.get(proxima.orden - 1)),
  };
}
