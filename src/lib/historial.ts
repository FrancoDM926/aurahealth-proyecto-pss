/**
 * Historial clínico — US-40, US-41 y US-62.
 *
 * Lógica pura compartida por las vistas y las pruebas: normalización de filtros,
 * agrupación de entradas en orden cronológico inverso, validación de adjuntos
 * (tipo y tamaño configurable) y reglas de acceso por rol (RNF-03).
 *
 * El modelo de datos (`FichaDiagnostico` / `FichaDiagnosticoEntrada` /
 * `AdjuntoEstudio`) es el contrato compartido con la US-39; las consultas viven
 * en `src/services/historial/consultas.ts`.
 */

import type { MedicalSpecialty, Role } from "@/generated/prisma/client";
import { fechaArgentina, horaArgentina } from "@/lib/dosis";
import { esEspecialidadValida } from "@/lib/busqueda-turnos";

// ─────────────────────────────────────────────────────────────────────────────
// Filtros de la vista consolidada (US-40)
// ─────────────────────────────────────────────────────────────────────────────

export type FiltrosHistorial = {
  /** Documento (con o sin puntos) o apellido/nombre del paciente. */
  paciente: string;
  /** `patientKey` exacto de US-39 (`USER:<id>` / `PERSONA:<id>`), si se conoce. */
  patientKey: string;
  profesionalId: string;
  especialidad: MedicalSpecialty | "";
  /** "YYYY-MM-DD" o "" si no se filtra. */
  desde: string;
  hasta: string;
  error: string | null;
};

function esFechaISOValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return (
    fecha.getUTCFullYear() === y &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d
  );
}

/** Normaliza los `searchParams` de US-40 y devuelve un error de validación si corresponde. */
export function normalizarFiltrosHistorial(
  raw: Record<string, string | string[] | undefined>,
  hoy: string
): FiltrosHistorial {
  const texto = (v: string | string[] | undefined, max = 120) =>
    (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, max);

  const paciente = texto(raw.paciente, 120);
  const patientKey = texto(raw.patientKey, 60);
  const profesionalId = texto(raw.profesionalId, 40);
  const especialidadRaw = texto(raw.especialidad, 40);
  const especialidad = esEspecialidadValida(especialidadRaw) ? especialidadRaw : "";
  const desde = texto(raw.desde, 10);
  const hasta = texto(raw.hasta, 10);

  let error: string | null = null;
  if (desde && !esFechaISOValida(desde)) {
    error = "Ingresá una fecha «desde» válida.";
  } else if (hasta && !esFechaISOValida(hasta)) {
    error = "Ingresá una fecha «hasta» válida.";
  } else if (desde && hasta && desde > hasta) {
    error = "La fecha «desde» no puede ser posterior a «hasta».";
  } else if (desde && desde > hoy) {
    error = "La fecha «desde» no puede ser futura.";
  }

  return { paciente, patientKey, profesionalId, especialidad, desde, hasta, error };
}

export type RangoInstantes = { gte: Date; lte: Date };

/**
 * Convierte un rango de días de la sala (`YYYY-MM-DD`) en instantes UTC.
 * Argentina es UTC−3 todo el año: el día arranca a las 03:00Z y termina a las
 * 02:59:59.999Z del día siguiente.
 */
export function rangoInstantesArgentina(desde: string, hasta: string): RangoInstantes | null {
  if (!desde && !hasta) return null;
  const inicio = desde || "1970-01-01";
  const fin = hasta || "2999-12-31";
  const gte = new Date(`${inicio}T03:00:00.000Z`);
  const lte = new Date(new Date(`${fin}T03:00:00.000Z`).getTime() + 86_400_000 - 1);
  return { gte, lte };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrupación y orden (US-40 / US-41)
// ─────────────────────────────────────────────────────────────────────────────

export type EntradaAgrupable = { fichaId: string; firmadoEn: Date };

/**
 * Agrupa las entradas por ficha (una por médico) y las ordena en orden
 * cronológico inverso, igual que el wireframe. Las fichas se ordenan por su
 * entrada más reciente.
 */
export function agruparEntradasPorFicha<T extends EntradaAgrupable>(
  entradas: T[]
): Array<{ fichaId: string; entradas: T[] }> {
  const porFicha = new Map<string, T[]>();
  for (const entrada of entradas) {
    porFicha.set(entrada.fichaId, [...(porFicha.get(entrada.fichaId) ?? []), entrada]);
  }

  const grupos = [...porFicha.entries()].map(([fichaId, lista]) => ({
    fichaId,
    entradas: [...lista].sort((a, b) => b.firmadoEn.getTime() - a.firmadoEn.getTime()),
  }));

  return grupos.sort(
    (a, b) => b.entradas[0].firmadoEn.getTime() - a.entradas[0].firmadoEn.getTime()
  );
}

/** Entradas de todas las fichas en un único orden cronológico inverso (US-41). */
export function ordenarEntradasDesc<T extends EntradaAgrupable>(entradas: T[]): T[] {
  return [...entradas].sort((a, b) => b.firmadoEn.getTime() - a.firmadoEn.getTime());
}

/** Fecha y hora de una entrada en la hora de la sala: «14/11/2026 10:35». */
export function formatearFechaHoraEntrada(fecha: Date): string {
  return `${fechaArgentina(fecha)} ${horaArgentina(fecha)}`;
}

/** «Dr. Carlos Méndez»: los autores del historial son siempre médicos. */
export function nombreProfesional(firstName: string, lastName: string): string {
  return `Dr. ${firstName} ${lastName}`.trim();
}

/** Etiqueta de especialidad con el mismo fallback que el resto de las vistas. */
export function especialidadDe(
  specialty: MedicalSpecialty | null,
  labels: Record<MedicalSpecialty, string>
): string {
  return specialty ? labels[specialty] : "Consulta médica";
}

// ─────────────────────────────────────────────────────────────────────────────
// Adjuntos (US-62)
// ─────────────────────────────────────────────────────────────────────────────

export const ADJUNTO_MIME_PERMITIDOS: Record<string, "Imagen" | "PDF"> = {
  "application/pdf": "PDF",
  "image/jpeg": "Imagen",
  "image/jpg": "Imagen",
  "image/png": "Imagen",
  "image/webp": "Imagen",
  "image/gif": "Imagen",
};

export const ADJUNTO_MAX_MB_DEFAULT = 10;
export const ADJUNTO_MAX_MB_LIMITE = 25;
export const ADJUNTO_NOMBRE_MAX = 200;

export function validarMaxAdjuntoMB(valor: number): string | null {
  if (!Number.isInteger(valor) || valor < 1 || valor > ADJUNTO_MAX_MB_LIMITE) {
    return `El tamaño máximo debe ser un número entero entre 1 y ${ADJUNTO_MAX_MB_LIMITE} MB.`;
  }
  return null;
}

export type AdjuntoValidado =
  | { ok: true; nombreArchivo: string; tipo: "Imagen" | "PDF" }
  | { ok: false; error: string };

/**
 * Valida un archivo antes de guardarlo: nombre, tipo MIME admitido y tamaño
 * contra el máximo configurado por el administrador. La misma función se usa en
 * cliente (mensaje inmediato) y en la server action (RNF-03).
 */
export function validarAdjunto(input: {
  nombreArchivo: string | null | undefined;
  tipoMime: string | null | undefined;
  tamanoBytes: number;
  maxMB: number;
}): AdjuntoValidado {
  const nombreArchivo = (input.nombreArchivo ?? "").trim();
  if (!nombreArchivo) {
    return { ok: false, error: "Seleccioná un archivo." };
  }
  if (nombreArchivo.length > ADJUNTO_NOMBRE_MAX) {
    return {
      ok: false,
      error: `El nombre del archivo no puede superar los ${ADJUNTO_NOMBRE_MAX} caracteres.`,
    };
  }

  if (!Number.isFinite(input.tamanoBytes) || input.tamanoBytes <= 0) {
    return { ok: false, error: "El archivo está vacío o no se pudo leer." };
  }

  const maxMB = Math.min(
    Math.max(1, Number.isFinite(input.maxMB) ? Math.trunc(input.maxMB) : ADJUNTO_MAX_MB_DEFAULT),
    ADJUNTO_MAX_MB_LIMITE
  );
  if (input.tamanoBytes > maxMB * 1024 * 1024) {
    return {
      ok: false,
      error: `El archivo supera el tamaño máximo permitido (${maxMB} MB).`,
    };
  }

  const tipo = ADJUNTO_MIME_PERMITIDOS[(input.tipoMime ?? "").toLowerCase()];
  if (!tipo) {
    return {
      ok: false,
      error: "Solo se admiten imágenes (JPG, PNG, WEBP o GIF) o archivos PDF.",
    };
  }

  return { ok: true, nombreArchivo, tipo };
}

/** «1,8 MB» / «640,0 KB» / «512 B», con coma decimal y sin depender de Intl. */
export function formatearTamanoArchivo(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Nombre seguro para `Content-Disposition` (sin barras ni caracteres de control). */
export function sanitizarNombreArchivo(nombre: string): string {
  const limpio = nombre
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  return limpio.slice(0, ADJUNTO_NOMBRE_MAX) || "estudio";
}

/**
 * Cabecera `Content-Disposition` con el nombre original en UTF-8 y un fallback
 * ASCII, para que los acentos no rompan navegadores viejos.
 */
export function contentDispositionAttachment(nombre: string): string {
  const seguro = sanitizarNombreArchivo(nombre);
  const ascii = seguro
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(seguro)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control de acceso (RNF-03)
// ─────────────────────────────────────────────────────────────────────────────

/** Un médico puede ver las fichas de toda la sala (US-40); el paciente solo la propia. */
export function puedeAccederFicha(input: {
  role: Role;
  actorId: string;
  /** `patientKey` de US-39 (`USER:<id>` / `PERSONA:<id>`). */
  patientKey: string;
}): boolean {
  if (input.role === "MEDICO") return true;
  if (input.role === "USUARIO") return input.patientKey === `USER:${input.actorId}`;
  return false;
}

/** Solo el médico autor de la ficha puede adjuntar estudios a sus entradas (US-62). */
export function puedeSubirAdjunto(input: {
  role: Role;
  actorId: string;
  fichaMedicoId: string;
}): boolean {
  return input.role === "MEDICO" && input.actorId === input.fichaMedicoId;
}

/** Médicos de la sala o el paciente dueño del historial pueden descargar el estudio. */
export function puedeDescargarAdjunto(input: {
  role: Role;
  actorId: string;
  patientKey: string;
}): boolean {
  return puedeAccederFicha(input);
}
