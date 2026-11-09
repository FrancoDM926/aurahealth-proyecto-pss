/**
 * US-48 — Reporte de asistencia y ausentismo de pacientes (RF-REP-04) y su
 * exportación a CSV y PDF (RF-REP-05 / RF-REP-06, requerimientos especiales).
 *
 * Criterios de aceptación:
 * 1. El reporte calcula el porcentaje de ausentismo sobre los turnos reservados del período.
 * 2. Puede desglosarse por profesional, especialidad, tipo de turno y día de la semana.
 * 3. Identifica a los pacientes con mayor cantidad de ausencias.
 * 4. Excluye del cálculo los turnos cancelados por la sala.
 *
 * Lógica pura: recibe los turnos ya leídos de la BD y calcula los totales y desgloses.
 */

import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { esFechaIso } from "@/lib/pagos";
import { crearPdf, type PdfBloque } from "@/lib/pdf";
import type { EstadoTurno } from "@/generated/prisma/client";

export type FiltrosReporteAusentismo = {
  /** "YYYY-MM-DD" */
  desde: string;
  hasta: string;
  /** Id del médico o enfermera, o "" para todos */
  profesionalId: string;
};

export type FiltrosReporteAusentismoNormalizados = FiltrosReporteAusentismo & {
  error: string | null;
};

export type TurnoReporteAusentismo = {
  id: string;
  /** Fecha en hora de Argentina, "YYYY-MM-DD". */
  fecha: string;
  diaSemana: string; // "Lunes", "Martes", etc.
  tipoTurno: "Consulta médica" | "Vacunación";
  profesionalId: string;
  profesionalNombre: string;
  especialidad: string;
  pacienteKey: string;
  pacienteNombre: string;
  status: EstadoTurno;
};

export type FilaDesglose = {
  etiqueta: string;
  reservados: number;
  ausentes: number;
  porcentaje: number;
  porcentajeLabel: string;
};

export type FilaPacienteAusencias = {
  pacienteNombre: string;
  reservados: number;
  ausentes: number;
};

export type ReporteAusentismo = {
  /** Turnos reservados computables (excluye cancelados por la sala y disponibles). */
  totalReservados: number;
  totalAusentes: number;
  porcentajeGeneral: number;
  porcentajeGeneralLabel: string;

  porProfesional: FilaDesglose[];
  porEspecialidad: FilaDesglose[];
  porTipoTurno: FilaDesglose[];
  porDiaSemana: FilaDesglose[];
  pacientesReincidentes: FilaPacienteAusencias[];
};

// ─── Helpers de fechas y días ────────────────────────────────────────────────

export const DIAS_ORDENADOS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export function diaDeLaSemanaAr(fechaIso: string): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayIndex = date.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const nombres = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return nombres[dayIndex] ?? "Lunes";
}

function inicioDeMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

export function rangoReporteAusentismoDefecto(hoy: string): { desde: string; hasta: string } {
  return { desde: inicioDeMes(hoy), hasta: hoy };
}

export function normalizarFiltrosReporteAusentismo(
  raw: Partial<Record<keyof FiltrosReporteAusentismo, string | undefined>>,
  hoy: string
): FiltrosReporteAusentismoNormalizados {
  const defecto = rangoReporteAusentismoDefecto(hoy);
  const desde = raw.desde?.trim() || defecto.desde;
  const hasta = raw.hasta?.trim() || defecto.hasta;
  const profesionalId = raw.profesionalId?.trim() ?? "";

  let error: string | null = null;
  if (!esFechaIso(desde) || !esFechaIso(hasta)) {
    error = "Ingresá fechas válidas para el período.";
  } else if (desde > hasta) {
    error = "La fecha «Desde» no puede ser posterior a «Hasta».";
  }

  return {
    desde,
    hasta,
    profesionalId,
    error,
  };
}

export function formatearPorcentaje(porcentaje: number): string {
  return `${porcentaje.toFixed(1).replace(".", ",")} %`;
}

export function formatearPeriodo(desde: string, hasta: string): string {
  return `${formatearFechaAr(desde)} – ${formatearFechaAr(hasta)}`;
}

// ─── Agregación y cálculo del reporte ────────────────────────────────────────

/**
 * Procesa los turnos y calcula el reporte de ausentismo.
 *
 * Criterio 4: Excluye del cálculo los turnos cancelados por la sala (status CANCELADO).
 * Criterio 1: Calcula el porcentaje de ausentismo sobre los turnos reservados.
 * Criterio 2: Desglosa por profesional, especialidad, tipo de turno y día de la semana.
 * Criterio 3: Identifica los pacientes con más ausencias.
 */
export function armarReporteAusentismo(
  turnos: TurnoReporteAusentismo[]
): ReporteAusentismo {
  // Exclusión estricta de turnos cancelados por la sala o turnos no reservados (DISPONIBLE).
  const computables = turnos.filter(
    (t) => t.status !== "CANCELADO" && t.status !== "DISPONIBLE"
  );

  const totalReservados = computables.length;
  const totalAusentes = computables.filter((t) => t.status === "AUSENTE").length;
  const porcentajeGeneral =
    totalReservados > 0 ? (totalAusentes / totalReservados) * 100 : 0;

  // 1. Por profesional
  const mapaProfesional = new Map<string, { etiqueta: string; reservados: number; ausentes: number }>();
  // 2. Por especialidad
  const mapaEspecialidad = new Map<string, { etiqueta: string; reservados: number; ausentes: number }>();
  // 3. Por tipo de turno
  const mapaTipoTurno = new Map<string, { etiqueta: string; reservados: number; ausentes: number }>();
  // 4. Por día de la semana
  const mapaDiaSemana = new Map<string, { etiqueta: string; reservados: number; ausentes: number }>();
  // 5. Por paciente
  const mapaPacientes = new Map<string, { pacienteNombre: string; reservados: number; ausentes: number }>();

  // Inicializar días de la semana en orden estándar (Lunes a Viernes al menos)
  for (const dia of DIAS_ORDENADOS) {
    mapaDiaSemana.set(dia, { etiqueta: dia, reservados: 0, ausentes: 0 });
  }

  for (const t of computables) {
    const esAusente = t.status === "AUSENTE";

    // Profesional
    const profKey = t.profesionalId || t.profesionalNombre;
    const prof = mapaProfesional.get(profKey) ?? {
      etiqueta: t.profesionalNombre,
      reservados: 0,
      ausentes: 0,
    };
    prof.reservados += 1;
    if (esAusente) prof.ausentes += 1;
    mapaProfesional.set(profKey, prof);

    // Especialidad
    const esp = mapaEspecialidad.get(t.especialidad) ?? {
      etiqueta: t.especialidad,
      reservados: 0,
      ausentes: 0,
    };
    esp.reservados += 1;
    if (esAusente) esp.ausentes += 1;
    mapaEspecialidad.set(t.especialidad, esp);

    // Tipo de turno
    const tipo = mapaTipoTurno.get(t.tipoTurno) ?? {
      etiqueta: t.tipoTurno,
      reservados: 0,
      ausentes: 0,
    };
    tipo.reservados += 1;
    if (esAusente) tipo.ausentes += 1;
    mapaTipoTurno.set(t.tipoTurno, tipo);

    // Día de la semana
    const diaItem = mapaDiaSemana.get(t.diaSemana) ?? {
      etiqueta: t.diaSemana,
      reservados: 0,
      ausentes: 0,
    };
    diaItem.reservados += 1;
    if (esAusente) diaItem.ausentes += 1;
    mapaDiaSemana.set(t.diaSemana, diaItem);

    // Paciente
    const pacKey = t.pacienteKey || t.pacienteNombre;
    const pac = mapaPacientes.get(pacKey) ?? {
      pacienteNombre: t.pacienteNombre,
      reservados: 0,
      ausentes: 0,
    };
    pac.reservados += 1;
    if (esAusente) pac.ausentes += 1;
    mapaPacientes.set(pacKey, pac);
  }

  const calcularDesglose = (
    entradas: { etiqueta: string; reservados: number; ausentes: number }[]
  ): FilaDesglose[] =>
    entradas.map((e) => {
      const porcentaje = e.reservados > 0 ? (e.ausentes / e.reservados) * 100 : 0;
      return {
        etiqueta: e.etiqueta,
        reservados: e.reservados,
        ausentes: e.ausentes,
        porcentaje,
        porcentajeLabel: formatearPorcentaje(porcentaje),
      };
    });

  // Ordenamiento por profesional: reservados desc, ausentes desc, nombre asc
  const porProfesional = calcularDesglose([...mapaProfesional.values()]).sort(
    (a, b) => b.reservados - a.reservados || b.ausentes - a.ausentes || a.etiqueta.localeCompare(b.etiqueta)
  );

  // Ordenamiento por especialidad: reservados desc, etiqueta asc
  const porEspecialidad = calcularDesglose([...mapaEspecialidad.values()]).sort(
    (a, b) => b.reservados - a.reservados || a.etiqueta.localeCompare(b.etiqueta)
  );

  // Ordenamiento por tipo de turno: reservados desc, etiqueta asc
  const porTipoTurno = calcularDesglose([...mapaTipoTurno.values()]).sort(
    (a, b) => b.reservados - a.reservados || a.etiqueta.localeCompare(b.etiqueta)
  );

  // Días de la semana: solo los que tienen turnos reservados o días de lunes a viernes
  const diasFiltrados = DIAS_ORDENADOS.map((dia) => mapaDiaSemana.get(dia)!).filter(
    (d) => d.reservados > 0 || (d.etiqueta !== "Sábado" && d.etiqueta !== "Domingo" && totalReservados === 0)
  );
  const porDiaSemana = calcularDesglose(diasFiltrados);

  // Pacientes con mayor cantidad de ausencias: solo los que tienen al menos 1 ausencia
  const pacientesReincidentes: FilaPacienteAusencias[] = [...mapaPacientes.values()]
    .filter((p) => p.ausentes > 0)
    .sort(
      (a, b) =>
        b.ausentes - a.ausentes ||
        b.reservados - a.reservados ||
        a.pacienteNombre.localeCompare(b.pacienteNombre)
    );

  return {
    totalReservados,
    totalAusentes,
    porcentajeGeneral,
    porcentajeGeneralLabel: formatearPorcentaje(porcentajeGeneral),
    porProfesional,
    porEspecialidad,
    porTipoTurno,
    porDiaSemana,
    pacientesReincidentes,
  };
}

// ─── Exportación a CSV (RF-REP-05 / RF-REP-06) ───────────────────────────────

function celdaCsv(valor: string): string {
  return /[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function reporteAusentismoACsv(
  reporte: ReporteAusentismo,
  filtros: Pick<FiltrosReporteAusentismo, "desde" | "hasta">
): string {
  const lineas: string[][] = [
    ["Reporte de asistencia y ausentismo"],
    [`Período: ${formatearPeriodo(filtros.desde, filtros.hasta)}`],
    [],
    ["Ausentismo general", reporte.porcentajeGeneralLabel],
    [
      "Detalle general",
      `${reporte.totalAusentes} turnos ausentes sobre ${reporte.totalReservados} reservados. Los turnos cancelados por la sala no se cuentan.`,
    ],
    [],
    ["DESGLOSE POR PROFESIONAL"],
    ["Profesional", "Reservados", "Ausentes", "%"],
    ...reporte.porProfesional.map((f) => [
      f.etiqueta,
      String(f.reservados),
      String(f.ausentes),
      f.porcentajeLabel,
    ]),
    [],
    ["DESGLOSE POR ESPECIALIDAD"],
    ["Especialidad", "Reservados", "Ausentes", "%"],
    ...reporte.porEspecialidad.map((f) => [
      f.etiqueta,
      String(f.reservados),
      String(f.ausentes),
      f.porcentajeLabel,
    ]),
    [],
    ["DESGLOSE POR TIPO DE TURNO"],
    ["Tipo de turno", "Reservados", "Ausentes", "%"],
    ...reporte.porTipoTurno.map((f) => [
      f.etiqueta,
      String(f.reservados),
      String(f.ausentes),
      f.porcentajeLabel,
    ]),
    [],
    ["DESGLOSE POR DÍA DE LA SEMANA"],
    ["Día de la semana", "Reservados", "Ausentes", "%"],
    ...reporte.porDiaSemana.map((f) => [
      f.etiqueta,
      String(f.reservados),
      String(f.ausentes),
      f.porcentajeLabel,
    ]),
    [],
    ["PACIENTES CON MÁS AUSENCIAS"],
    ["Paciente", "Reservados", "Ausentes"],
    ...reporte.pacientesReincidentes.map((p) => [
      p.pacienteNombre,
      String(p.reservados),
      String(p.ausentes),
    ]),
  ];

  return `﻿${lineas.map((l) => l.map(celdaCsv).join(";")).join("\r\n")}\r\n`;
}

// ─── Exportación a PDF (RF-REP-06) ───────────────────────────────────────────

export function reporteAusentismoAPdf(
  reporte: ReporteAusentismo,
  filtros: Pick<FiltrosReporteAusentismo, "desde" | "hasta">
): Uint8Array {
  const bloques: PdfBloque[] = [
    { tipo: "texto", texto: "AuraHealth — Reporte de asistencia y ausentismo", size: 16, bold: true },
    { tipo: "texto", texto: `Período: ${formatearPeriodo(filtros.desde, filtros.hasta)}`, size: 10 },
    { tipo: "espacio", alto: 8 },
    { tipo: "linea" },
    {
      tipo: "texto",
      texto: `Ausentismo general: ${reporte.porcentajeGeneralLabel}`,
      size: 13,
      bold: true,
    },
    {
      tipo: "texto",
      texto: `${reporte.totalAusentes} turnos ausentes sobre ${reporte.totalReservados} reservados. Los turnos cancelados por la sala no se cuentan.`,
      size: 10,
    },
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: "Desglose por profesional", size: 11, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "PROFESIONAL", x: 0, ancho: 250 },
        { texto: "RESERVADOS", x: 260, ancho: 80, derecha: true },
        { texto: "AUSENTES", x: 350, ancho: 70, derecha: true },
        { texto: "%", x: 430, ancho: 65, derecha: true },
      ],
    },
  ];

  for (const p of reporte.porProfesional) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: p.etiqueta, x: 0, ancho: 250 },
        { texto: String(p.reservados), x: 260, ancho: 80, derecha: true },
        { texto: String(p.ausentes), x: 350, ancho: 70, derecha: true },
        { texto: p.porcentajeLabel, x: 430, ancho: 65, derecha: true },
      ],
    });
  }
  if (reporte.porProfesional.length === 0) {
    bloques.push({ tipo: "texto", texto: "Sin datos para el período.", size: 9 });
  }

  bloques.push(
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: "Desglose por especialidad", size: 11, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "ESPECIALIDAD", x: 0, ancho: 250 },
        { texto: "RESERVADOS", x: 260, ancho: 80, derecha: true },
        { texto: "AUSENTES", x: 350, ancho: 70, derecha: true },
        { texto: "%", x: 430, ancho: 65, derecha: true },
      ],
    }
  );
  for (const e of reporte.porEspecialidad) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: e.etiqueta, x: 0, ancho: 250 },
        { texto: String(e.reservados), x: 260, ancho: 80, derecha: true },
        { texto: String(e.ausentes), x: 350, ancho: 70, derecha: true },
        { texto: e.porcentajeLabel, x: 430, ancho: 65, derecha: true },
      ],
    });
  }

  bloques.push(
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: "Desglose por tipo de turno", size: 11, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "TIPO DE TURNO", x: 0, ancho: 250 },
        { texto: "RESERVADOS", x: 260, ancho: 80, derecha: true },
        { texto: "AUSENTES", x: 350, ancho: 70, derecha: true },
        { texto: "%", x: 430, ancho: 65, derecha: true },
      ],
    }
  );
  for (const t of reporte.porTipoTurno) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: t.etiqueta, x: 0, ancho: 250 },
        { texto: String(t.reservados), x: 260, ancho: 80, derecha: true },
        { texto: String(t.ausentes), x: 350, ancho: 70, derecha: true },
        { texto: t.porcentajeLabel, x: 430, ancho: 65, derecha: true },
      ],
    });
  }

  bloques.push(
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: "Desglose por día de la semana", size: 11, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "DÍA", x: 0, ancho: 250 },
        { texto: "RESERVADOS", x: 260, ancho: 80, derecha: true },
        { texto: "AUSENTES", x: 350, ancho: 70, derecha: true },
        { texto: "%", x: 430, ancho: 65, derecha: true },
      ],
    }
  );
  for (const d of reporte.porDiaSemana) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: d.etiqueta, x: 0, ancho: 250 },
        { texto: String(d.reservados), x: 260, ancho: 80, derecha: true },
        { texto: String(d.ausentes), x: 350, ancho: 70, derecha: true },
        { texto: d.porcentajeLabel, x: 430, ancho: 65, derecha: true },
      ],
    });
  }

  bloques.push(
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: "Pacientes con más ausencias", size: 11, bold: true },
    { tipo: "linea" },
    {
      tipo: "fila",
      size: 9,
      bold: true,
      columnas: [
        { texto: "PACIENTE", x: 0, ancho: 300 },
        { texto: "RESERVADOS", x: 310, ancho: 90, derecha: true },
        { texto: "AUSENTES", x: 410, ancho: 85, derecha: true },
      ],
    }
  );
  for (const pac of reporte.pacientesReincidentes) {
    bloques.push({
      tipo: "fila",
      size: 9,
      columnas: [
        { texto: pac.pacienteNombre, x: 0, ancho: 300 },
        { texto: String(pac.reservados), x: 310, ancho: 90, derecha: true },
        { texto: String(pac.ausentes), x: 410, ancho: 85, derecha: true },
      ],
    });
  }
  if (reporte.pacientesReincidentes.length === 0) {
    bloques.push({ tipo: "texto", texto: "No se registran pacientes con ausencias en el período.", size: 9 });
  }

  return crearPdf(bloques);
}
