/**
 * US-57 — Carnet de vacunación del paciente (RF-VAC-08, RNF-03).
 *
 * Lógica pura: arma el listado (vacuna, dosis, fecha), indica si el esquema quedó
 * incompleto según las dosis definidas en el catálogo y genera el PDF descargable.
 * Solo cuenta aplicaciones ACTIVAS registradas en la sala (US-29): las anuladas
 * no figuran.
 */

import {
  evaluarEsquema,
  fechaArgentina,
  type AplicacionActiva,
  type DosisEsquema,
} from "@/lib/dosis";
import { crearPdf, type PdfBloque } from "@/lib/pdf";

export type AplicacionCarnet = {
  vacunaId: string;
  /** "Denominación — Laboratorio", copia del momento de la aplicación. */
  vacunaNombre: string;
  dosisOrden: number;
  dosisEtiqueta: string;
  aplicadaAt: Date;
};

export type FilaCarnet = {
  vacuna: string;
  dosis: string;
  /** "dd/mm/aaaa" en la hora de la sala. */
  fecha: string;
};

export type EsquemaCarnet = {
  vacunaId: string;
  /** Solo la denominación, sin laboratorio. */
  vacuna: string;
  completo: boolean;
  /** Texto de aviso cuando el esquema está incompleto. */
  aviso: string | null;
};

export type Carnet = {
  filas: FilaCarnet[];
  esquemas: EsquemaCarnet[];
  incompleto: boolean;
};

export const CARNET_SIN_APLICACIONES = "Todavía no hay vacunas registradas en la sala.";
export const AVISO_CARNET_SALA = "Solo se listan las aplicaciones registradas en la sala.";

function denominacion(nombre: string): string {
  return nombre.split(" — ")[0];
}

/** Aviso del wireframe: «Esquema incompleto: la 2ª dosis de X corresponde a partir del dd/mm/aaaa.» */
export function avisoEsquemaIncompleto(
  vacuna: string,
  estado: Extract<ReturnType<typeof evaluarEsquema>, { estado: "INCOMPLETO" }>,
  ahora: Date
): string {
  const faltan = estado.faltantes.length;
  const prefijo = "Esquema incompleto: ";
  const proxima = estado.proxima.etiqueta;
  if (estado.proximaDesde && estado.proximaDesde.getTime() > ahora.getTime()) {
    return `${prefijo}la ${proxima} de ${vacuna} corresponde a partir del ${fechaArgentina(estado.proximaDesde)}.`;
  }
  if (faltan === 1) return `${prefijo}falta la ${proxima} de ${vacuna}.`;
  return `${prefijo}faltan ${faltan} dosis de ${vacuna}; la próxima es la ${proxima}.`;
}

export function armarCarnet(
  aplicaciones: AplicacionCarnet[],
  esquemasPorVacuna: Map<string, DosisEsquema[]>,
  ahora: Date = new Date()
): Carnet {
  const ordenadas = [...aplicaciones].sort((a, b) => b.aplicadaAt.getTime() - a.aplicadaAt.getTime());
  const filas = ordenadas.map((a) => ({
    vacuna: denominacion(a.vacunaNombre),
    dosis: a.dosisEtiqueta,
    fecha: fechaArgentina(a.aplicadaAt),
  }));

  const porVacuna = new Map<string, AplicacionCarnet[]>();
  for (const a of ordenadas) porVacuna.set(a.vacunaId, [...(porVacuna.get(a.vacunaId) ?? []), a]);

  const esquemas: EsquemaCarnet[] = [];
  for (const [vacunaId, lista] of porVacuna) {
    const nombre = denominacion(lista[0].vacunaNombre);
    const dosis = esquemasPorVacuna.get(vacunaId);
    if (!dosis || dosis.length === 0) {
      esquemas.push({ vacunaId, vacuna: nombre, completo: true, aviso: null });
      continue;
    }
    const activas: AplicacionActiva[] = lista.map((a) => ({ dosisOrden: a.dosisOrden, aplicadaAt: a.aplicadaAt }));
    const estado = evaluarEsquema(dosis, activas);
    esquemas.push(
      estado.estado === "COMPLETO"
        ? { vacunaId, vacuna: nombre, completo: true, aviso: null }
        : { vacunaId, vacuna: nombre, completo: false, aviso: avisoEsquemaIncompleto(nombre, estado, ahora) }
    );
  }
  esquemas.sort((a, b) => a.vacuna.localeCompare(b.vacuna, "es"));

  return { filas, esquemas, incompleto: esquemas.some((e) => !e.completo) };
}

export type DatosPdfCarnet = {
  salaNombre: string;
  /** Persona a la que pertenece el carnet. */
  pacienteNombre: string;
  pacienteDocumento: string | null;
  emitidoEn: string;
  carnet: Carnet;
};

/** Genera el carnet en PDF con el mismo generador que el comprobante de pago. */
export function generarCarnetPdf(d: DatosPdfCarnet): Uint8Array {
  const bloques: PdfBloque[] = [
    { tipo: "texto", texto: "AuraHealth", size: 20, bold: true },
    { tipo: "texto", texto: d.salaNombre, size: 11 },
    { tipo: "espacio", alto: 14 },
    { tipo: "texto", texto: "Carnet de vacunación", size: 16, bold: true },
    {
      tipo: "texto",
      texto: d.pacienteDocumento ? `${d.pacienteNombre} — ${d.pacienteDocumento}` : d.pacienteNombre,
      size: 11,
    },
    { tipo: "espacio", alto: 6 },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 10,
      bold: true,
      columnas: [
        { texto: "VACUNA", x: 0 },
        { texto: "DOSIS", x: 250 },
        { texto: "FECHA", x: 400 },
      ],
    },
    { tipo: "linea" },
  ];

  if (d.carnet.filas.length === 0) {
    bloques.push({ tipo: "texto", texto: CARNET_SIN_APLICACIONES, size: 11 });
  }
  for (const f of d.carnet.filas) {
    bloques.push(
      {
        tipo: "fila",
        size: 11,
        columnas: [
          { texto: f.vacuna, x: 0, ancho: 245 },
          { texto: f.dosis, x: 250, ancho: 145 },
          { texto: f.fecha, x: 400, ancho: 95 },
        ],
      },
      { tipo: "espacio", alto: 3 }
    );
  }

  bloques.push({ tipo: "linea" }, { tipo: "espacio", alto: 8 });
  const avisos = d.carnet.esquemas.filter((e) => e.aviso);
  if (avisos.length > 0) {
    bloques.push({ tipo: "texto", texto: "Estado del esquema", size: 12, bold: true }, { tipo: "espacio", alto: 4 });
    for (const e of avisos) bloques.push({ tipo: "texto", texto: e.aviso ?? "", size: 10 }, { tipo: "espacio", alto: 3 });
    bloques.push({ tipo: "espacio", alto: 6 });
  }
  bloques.push(
    { tipo: "texto", texto: AVISO_CARNET_SALA, size: 9 },
    { tipo: "texto", texto: `Emitido el ${d.emitidoEn}.`, size: 9 }
  );
  return crearPdf(bloques);
}
