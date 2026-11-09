/**
 * US-44 — Auditoría de accesos al historial clínico (RF-HIS-06, RNF-03, RNF-04).
 *
 * Lógica pura de la vista de auditoría: normaliza los filtros del wireframe
 * (`wf_auditoria_accesos.html`), valida el rango de fechas y traduce los enums a
 * etiquetas. Las consultas viven en
 * `src/services/historial/auditoria-consultas.ts`.
 *
 * La vista es de solo lectura: este módulo no expone ninguna operación de
 * escritura sobre `AccesoHistorialLog`.
 */

import type {
  ResultadoAccesoHistorial,
  TipoAccesoHistorial,
} from "@/generated/prisma/client";
import { esFechaIso, sumarDias } from "@/lib/pagos";

export const TIPOS_ACCESO_HISTORIAL: readonly TipoAccesoHistorial[] = [
  "FICHA_CONSOLIDADA",
  "HISTORIAL_PACIENTE",
  "ESTUDIOS",
];

export const RESULTADOS_ACCESO_HISTORIAL: readonly ResultadoAccesoHistorial[] = [
  "EXITOSO",
  "RECHAZADO",
];

export const TIPO_ACCESO_HISTORIAL_LABELS: Record<TipoAccesoHistorial, string> = {
  FICHA_CONSOLIDADA: "Ficha del paciente",
  HISTORIAL_PACIENTE: "Historial clínico",
  ESTUDIOS: "Estudios de la ficha",
};

export const RESULTADO_ACCESO_LABELS: Record<ResultadoAccesoHistorial, string> = {
  EXITOSO: "Exitoso",
  RECHAZADO: "Rechazado",
};

/** Tope de filas que devuelve la vista: el wireframe no tiene paginación. */
export const LIMITE_ACCESOS_AUDITORIA = 500;

export type FiltrosAuditoriaHistorial = {
  /** `User.id` del actor; "" = todos. */
  usuarioId: string;
  /** Apellido, nombre o documento del paciente; "" = todos. */
  paciente: string;
  /** "YYYY-MM-DD"; "" = sin límite. */
  desde: string;
  hasta: string;
  tipo: TipoAccesoHistorial | "";
  resultado: ResultadoAccesoHistorial | "";
  error: string | null;
};

function texto(valor: string | string[] | undefined, max: number): string {
  return (Array.isArray(valor) ? valor[0] : valor ?? "").trim().slice(0, max);
}

/**
 * Normaliza los `searchParams` de US-44. Un rango inválido se informa en
 * `error`; tipo y resultado desconocidos se descartan en lugar de romper la
 * búsqueda.
 */
export function normalizarFiltrosAuditoriaHistorial(
  raw: Record<string, string | string[] | undefined>
): FiltrosAuditoriaHistorial {
  const usuarioId = texto(raw.usuarioId, 40);
  const paciente = texto(raw.paciente, 120);
  const desde = texto(raw.desde, 10);
  const hasta = texto(raw.hasta, 10);
  const tipoRaw = texto(raw.tipo, 40);
  const resultadoRaw = texto(raw.resultado, 40);

  const tipo = (TIPOS_ACCESO_HISTORIAL as readonly string[]).includes(tipoRaw)
    ? (tipoRaw as TipoAccesoHistorial)
    : "";
  const resultado = (RESULTADOS_ACCESO_HISTORIAL as readonly string[]).includes(resultadoRaw)
    ? (resultadoRaw as ResultadoAccesoHistorial)
    : "";

  let error: string | null = null;
  if (desde && !esFechaIso(desde)) {
    error = "Ingresá una fecha «desde» válida.";
  } else if (hasta && !esFechaIso(hasta)) {
    error = "Ingresá una fecha «hasta» válida.";
  } else if (desde && hasta && desde > hasta) {
    error = "La fecha «desde» no puede ser posterior a «hasta».";
  }

  return { usuarioId, paciente, desde, hasta, tipo, resultado, error };
}

/** Instante de inicio de un día "YYYY-MM-DD" en hora de Argentina (UTC−3). */
export function inicioDiaArgentina(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-03:00`);
}

/**
 * Rango de instantes de `createdAt` para el filtro de fechas, en hora de
 * Argentina. `hasta` incluye todo el día (el límite superior es el inicio del
 * día siguiente). `null` = sin filtro.
 */
export function rangoInstantesAuditoria(
  desde: string,
  hasta: string
): { gte?: Date; lt?: Date } | null {
  if (!desde && !hasta) return null;
  return {
    ...(desde ? { gte: inicioDiaArgentina(desde) } : {}),
    ...(hasta ? { lt: inicioDiaArgentina(sumarDias(hasta, 1)) } : {}),
  };
}

/** Tono del badge del wireframe: verde para exitoso, rojo para rechazado. */
export function tonoResultadoAcceso(
  resultado: ResultadoAccesoHistorial
): "ok" | "error" {
  return resultado === "EXITOSO" ? "ok" : "error";
}
