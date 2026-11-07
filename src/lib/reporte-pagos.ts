/**
 * US-47 — Reporte de pagos realizados (RF-REP-03, RN-13) y su exportación a CSV
 * y PDF (RF-REP-05 / RF-REP-06, requerimiento especial incluido en el reporte).
 *
 * Lógica pura: recibe los pagos ya leídos y devuelve los totales. Los pagos
 * anulados se listan identificados y nunca suman al total.
 */

import { formatearFechaAr } from "@/lib/busqueda-turnos";
import {
  MEDIOS_PAGO,
  MEDIO_PAGO_LABELS,
  esFechaIso,
  formatearPesos,
} from "@/lib/pagos";
import { crearPdf, type PdfBloque } from "@/lib/pdf";
import type { EstadoPago, MedioPago } from "@/generated/prisma/client";

export const PARTICULAR_LABEL = "Particular";

export type FiltrosReportePagos = {
  /** "YYYY-MM-DD" */
  desde: string;
  hasta: string;
  medio: MedioPago | "";
  /** "" = todas; "PARTICULAR" = solo particulares; si no, el nombre de la entidad. */
  obraSocial: string;
  profesionalId: string;
  /** MedicalSpecialty o "" = todas. */
  especialidad: string;
};

export type PagoReporte = {
  /** Fecha del cobro en hora de Argentina, "YYYY-MM-DD". */
  fecha: string;
  medio: MedioPago;
  /** `null` = particular. */
  coberturaEntidad: string | null;
  importeCentavos: number;
  estado: EstadoPago;
  profesionalId: string;
  profesionalNombre: string;
  especialidadLabel: string;
};

export type FilaDetalle = {
  /** Tramo del mes que cae dentro del rango pedido, "YYYY-MM-DD". */
  periodoDesde: string;
  periodoHasta: string;
  medio: MedioPago;
  obraSocial: string;
  importeCentavos: number;
  estado: EstadoPago;
  cantidad: number;
};

export type FilaProfesional = {
  profesionalNombre: string;
  especialidadLabel: string;
  importeCentavos: number;
};

export type ReportePagos = {
  detalle: FilaDetalle[];
  /** Suma de los pagos vigentes (activos). Excluye los anulados. */
  totalCentavos: number;
  totalParticularesCentavos: number;
  totalConCoberturaCentavos: number;
  /** Totales por medio de pago (vigentes). */
  porMedio: { medio: MedioPago; importeCentavos: number }[];
  porProfesional: FilaProfesional[];
  cantidadVigentes: number;
  cantidadAnulados: number;
};

// ─── Filtros ─────────────────────────────────────────────────────────────────

/** Primer día del mes de una fecha "YYYY-MM-DD". */
function inicioDeMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

function finDeMes(fecha: string): string {
  const [y, m] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Rango inicial del reporte: lo que va del mes en curso. */
export function rangoReporteDefecto(hoy: string): { desde: string; hasta: string } {
  return { desde: inicioDeMes(hoy), hasta: hoy };
}

export type FiltrosReporteNormalizados = FiltrosReportePagos & { error: string | null };

/** Normaliza los filtros que llegan por la URL; un rango inválido se informa en `error`. */
export function normalizarFiltrosReportePagos(
  raw: Partial<Record<keyof FiltrosReportePagos, string | undefined>>,
  hoy: string
): FiltrosReporteNormalizados {
  const defecto = rangoReporteDefecto(hoy);
  const desde = raw.desde?.trim() || defecto.desde;
  const hasta = raw.hasta?.trim() || defecto.hasta;
  const medioRaw = raw.medio?.trim() ?? "";
  const medio = (MEDIOS_PAGO as readonly string[]).includes(medioRaw) ? (medioRaw as MedioPago) : "";

  let error: string | null = null;
  if (!esFechaIso(desde) || !esFechaIso(hasta)) {
    error = "Ingresá fechas válidas para el período.";
  } else if (desde > hasta) {
    error = "La fecha «Desde» no puede ser posterior a «Hasta».";
  }

  return {
    desde,
    hasta,
    medio,
    obraSocial: raw.obraSocial?.trim() ?? "",
    profesionalId: raw.profesionalId?.trim() ?? "",
    especialidad: raw.especialidad?.trim() ?? "",
    error,
  };
}

/** Instante de inicio de un día "YYYY-MM-DD" en hora de Argentina (UTC−3, sin horario de verano). */
export function inicioDiaArgentina(fecha: string): Date {
  return new Date(`${fecha}T00:00:00-03:00`);
}

/** Fecha "YYYY-MM-DD" de un instante, en hora de Argentina. */
export function fechaEnArgentina(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

// ─── Totales ─────────────────────────────────────────────────────────────────

/**
 * Agrupa los pagos por tramo de mes, medio de pago, obra social y estado. Los
 * pagos anulados forman filas propias (identificadas por su estado) y no suman
 * a ningún total.
 */
export function armarReportePagos(
  pagos: PagoReporte[],
  rango: { desde: string; hasta: string }
): ReportePagos {
  const grupos = new Map<string, FilaDetalle>();
  const porProfesional = new Map<string, FilaProfesional>();
  const porMedio = new Map<MedioPago, number>();
  let totalCentavos = 0;
  let totalParticularesCentavos = 0;
  let cantidadVigentes = 0;
  let cantidadAnulados = 0;

  for (const pago of pagos) {
    const mes = pago.fecha.slice(0, 7);
    const obraSocial = pago.coberturaEntidad ?? PARTICULAR_LABEL;
    const clave = [mes, pago.medio, obraSocial, pago.estado].join("|");

    let fila = grupos.get(clave);
    if (!fila) {
      const inicio = inicioDeMes(pago.fecha);
      const fin = finDeMes(pago.fecha);
      fila = {
        periodoDesde: inicio < rango.desde ? rango.desde : inicio,
        periodoHasta: fin > rango.hasta ? rango.hasta : fin,
        medio: pago.medio,
        obraSocial,
        importeCentavos: 0,
        estado: pago.estado,
        cantidad: 0,
      };
      grupos.set(clave, fila);
    }
    fila.importeCentavos += pago.importeCentavos;
    fila.cantidad += 1;

    if (pago.estado === "ANULADO") {
      cantidadAnulados += 1;
      continue;
    }

    cantidadVigentes += 1;
    totalCentavos += pago.importeCentavos;
    if (!pago.coberturaEntidad) totalParticularesCentavos += pago.importeCentavos;
    porMedio.set(pago.medio, (porMedio.get(pago.medio) ?? 0) + pago.importeCentavos);

    const claveProf = `${pago.profesionalId}`;
    const prof = porProfesional.get(claveProf) ?? {
      profesionalNombre: pago.profesionalNombre,
      especialidadLabel: pago.especialidadLabel,
      importeCentavos: 0,
    };
    prof.importeCentavos += pago.importeCentavos;
    porProfesional.set(claveProf, prof);
  }

  const detalle = [...grupos.values()].sort(
    (a, b) =>
      a.periodoDesde.localeCompare(b.periodoDesde) ||
      a.medio.localeCompare(b.medio) ||
      a.obraSocial.localeCompare(b.obraSocial) ||
      a.estado.localeCompare(b.estado)
  );

  return {
    detalle,
    totalCentavos,
    totalParticularesCentavos,
    totalConCoberturaCentavos: totalCentavos - totalParticularesCentavos,
    porMedio: MEDIOS_PAGO.map((medio) => ({ medio, importeCentavos: porMedio.get(medio) ?? 0 })),
    porProfesional: [...porProfesional.values()].sort(
      (a, b) => b.importeCentavos - a.importeCentavos || a.profesionalNombre.localeCompare(b.profesionalNombre)
    ),
    cantidadVigentes,
    cantidadAnulados,
  };
}

export function formatearPeriodo(desde: string, hasta: string): string {
  return `${formatearFechaAr(desde)} – ${formatearFechaAr(hasta)}`;
}

export const ESTADO_PAGO_LABELS: Record<EstadoPago, string> = {
  ACTIVO: "Vigente",
  ANULADO: "Anulado",
};

// ─── Exportación (RF-REP-06) ─────────────────────────────────────────────────

function celdaCsv(valor: string): string {
  // El separador es «;»: la coma decimal de los importes no necesita comillas.
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Importe en pesos con coma decimal, apto para planillas en configuración regional es-AR. */
function pesosCsv(centavos: number): string {
  const pesos = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `${pesos},${resto}`;
}

/** CSV (separado por «;», con BOM para que Excel respete los acentos). */
export function reportePagosACsv(
  reporte: ReportePagos,
  filtros: Pick<FiltrosReportePagos, "desde" | "hasta">
): string {
  const lineas: string[][] = [
    ["Reporte de pagos realizados"],
    [`Período: ${formatearPeriodo(filtros.desde, filtros.hasta)}`],
    [],
    ["Período", "Medio de pago", "Obra social", "Cantidad", "Importe", "Estado"],
    ...reporte.detalle.map((f) => [
      formatearPeriodo(f.periodoDesde, f.periodoHasta),
      MEDIO_PAGO_LABELS[f.medio],
      f.obraSocial,
      String(f.cantidad),
      pesosCsv(f.importeCentavos),
      ESTADO_PAGO_LABELS[f.estado],
    ]),
    [],
    ["Total del período (sin anulados)", "", "", "", pesosCsv(reporte.totalCentavos), ""],
    ["Consultas particulares", "", "", "", pesosCsv(reporte.totalParticularesCentavos), ""],
    ["Consultas con cobertura", "", "", "", pesosCsv(reporte.totalConCoberturaCentavos), ""],
    [],
    ["Profesional", "Especialidad", "Importe"],
    ...reporte.porProfesional.map((p) => [
      p.profesionalNombre,
      p.especialidadLabel,
      pesosCsv(p.importeCentavos),
    ]),
  ];
  return `﻿${lineas.map((l) => l.map(celdaCsv).join(";")).join("\r\n")}\r\n`;
}

export function reportePagosAPdf(
  reporte: ReportePagos,
  filtros: Pick<FiltrosReportePagos, "desde" | "hasta">
): Uint8Array {
  const bloques: PdfBloque[] = [
    { tipo: "texto", texto: "AuraHealth — Reporte de pagos realizados", size: 16, bold: true },
    { tipo: "texto", texto: `Período: ${formatearPeriodo(filtros.desde, filtros.hasta)}`, size: 10 },
    { tipo: "espacio", alto: 10 },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "PERÍODO", x: 0, ancho: 130 },
        { texto: "MEDIO", x: 135, ancho: 80 },
        { texto: "OBRA SOCIAL", x: 220, ancho: 120 },
        { texto: "IMPORTE", x: 345, ancho: 90, derecha: true },
        { texto: "ESTADO", x: 445, ancho: 50 },
      ],
    },
    { tipo: "linea" },
  ];

  for (const f of reporte.detalle) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: formatearPeriodo(f.periodoDesde, f.periodoHasta), x: 0, ancho: 130 },
        { texto: MEDIO_PAGO_LABELS[f.medio], x: 135, ancho: 80 },
        { texto: f.obraSocial, x: 220, ancho: 120 },
        { texto: formatearPesos(f.importeCentavos), x: 345, ancho: 90, derecha: true },
        { texto: ESTADO_PAGO_LABELS[f.estado], x: 445, ancho: 50 },
      ],
    });
  }
  if (reporte.detalle.length === 0) {
    bloques.push({ tipo: "texto", texto: "No hay pagos para los filtros elegidos.", size: 10 });
  }

  bloques.push(
    { tipo: "linea" },
    { tipo: "texto", texto: `Total del período: ${formatearPesos(reporte.totalCentavos)} — no incluye los pagos anulados.`, size: 11, bold: true },
    { tipo: "texto", texto: `Consultas particulares: ${formatearPesos(reporte.totalParticularesCentavos)}  ·  Consultas con cobertura: ${formatearPesos(reporte.totalConCoberturaCentavos)}`, size: 10 },
    { tipo: "espacio", alto: 12 },
    { tipo: "texto", texto: "Desglose por especialidad y profesional", size: 12, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "PROFESIONAL", x: 0, ancho: 200 },
        { texto: "ESPECIALIDAD", x: 210, ancho: 150 },
        { texto: "IMPORTE", x: 395, ancho: 100, derecha: true },
      ],
    }
  );
  for (const p of reporte.porProfesional) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: p.profesionalNombre, x: 0, ancho: 200 },
        { texto: p.especialidadLabel, x: 210, ancho: 150 },
        { texto: formatearPesos(p.importeCentavos), x: 395, ancho: 100, derecha: true },
      ],
    });
  }

  return crearPdf(bloques);
}
