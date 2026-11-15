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
  Role,
  TipoAccesoHistorial,
} from "@/generated/prisma/client";
import { esFechaIso, sumarDias } from "@/lib/pagos";
import { ROLE_LABELS } from "@/lib/roles";

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

// ─── Actor de un intento de acceso ───────────────────────────────────────────

/**
 * Nombre que se guarda cuando el intento rechazado no permite identificar al
 * paciente: el rol no autorizado ni siquiera llega a resolver la ficha.
 */
export const PACIENTE_NO_IDENTIFICADO = "Paciente no identificado";

/**
 * Detalle del rechazo por rol. Se guarda en el log para que el administrador
 * entienda por qué la fila es `RECHAZADO` sin abrir otra pantalla.
 */
export function detalleRechazoPorRol(
  role: Role,
  tipo: TipoAccesoHistorial
): string {
  return `Acceso rechazado: el rol ${ROLE_LABELS[role]} no puede consultar ${
    TIPO_ACCESO_HISTORIAL_LABELS[tipo]
  }`;
}

export type OpcionUsuarioAuditoria = { id: string; nombre: string };

/**
 * Opciones del selector «Usuario» de US-44: la unión de los actores que ya
 * tienen accesos registrados y de los usuarios activos de la base.
 *
 * Sin la unión, un usuario que todavía no accedió al historial —por ejemplo
 * Enfermería o Administrativo, que solo aparecen cuando un intento queda
 * rechazado— no figura en el filtro y la pantalla parece no tener sus datos.
 * Los activos mandan el nombre a mostrar; los del log se conservan para no
 * perder cuentas dadas de baja.
 */
export function combinarOpcionesUsuarios(
  activos: readonly OpcionUsuarioAuditoria[],
  actoresDelLog: readonly OpcionUsuarioAuditoria[]
): OpcionUsuarioAuditoria[] {
  const porId = new Map<string, string>();
  for (const actor of actoresDelLog) {
    if (!porId.has(actor.id)) porId.set(actor.id, actor.nombre);
  }
  for (const usuario of activos) {
    if (usuario.nombre.trim()) porId.set(usuario.id, usuario.nombre);
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
