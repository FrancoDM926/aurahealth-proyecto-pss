/**
 * US-10: Búsqueda de turnos por especialidad, profesional y rango de fechas
 * (RF-AGE-04, RF-TUR-01, RNF-07, RN-03, RN-08).
 *
 * Criterios de aceptación cubiertos por esta lógica pura:
 * 1. Al confirmar la disponibilidad, los turnos generados quedan visibles para
 *    los pacientes sin intervención manual; antes de la confirmación, ningún
 *    turno de ese mes es visible (`agendaConfirmada === true`).
 * 2. La agenda muestra únicamente los turnos futuros y disponibles.
 * 3. El usuario puede filtrar por especialidad, por profesional o por ambos.
 * 4. El rango de fechas por defecto son los próximos treinta días.
 * 5. Los resultados se agrupan por día y se ordenan cronológicamente,
 *    mostrando especialidad, profesional, fecha y hora de cada turno.
 * 6. Si no hay turnos que cumplan el filtro, se informa con un mensaje claro y
 *    se sugiere ampliar el rango.
 */

import type { MedicalSpecialty } from "@/generated/prisma/client";
import { esFechaValida, etiquetaDia, sumarDias, type EstadoTurnoAgenda } from "@/lib/agenda-profesional";
import { SPECIALTY_LABELS } from "@/lib/roles";

export const DIAS_RANGO_DEFECTO = 30;

export const ESPECIALIDADES_BUSQUEDA: MedicalSpecialty[] = [
  "CLINICA_MEDICA",
  "PEDIATRIA",
  "TRAUMATOLOGIA",
];

export const MENSAJE_SIN_RESULTADOS =
  "No se encontraron turnos con los filtros seleccionados. Probá ampliar el rango de fechas o cambiar el profesional o la especialidad.";

export type InstanteArgentina = {
  /** "YYYY-MM-DD" en huso horario America/Argentina/Buenos_Aires */
  fecha: string;
  /** "HH:mm" (24h) en huso horario America/Argentina/Buenos_Aires */
  hora: string;
};

export type FiltrosBusquedaInput = {
  specialty?: string | null;
  doctorId?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

export type FiltrosBusquedaNormalizados = {
  specialty: MedicalSpecialty | "";
  doctorId: string;
  desde: string;
  hasta: string;
  esRangoPorDefecto: boolean;
  error: string | null;
};

export type ProfesionalBusqueda = {
  id: string;
  fullName: string;
  specialty: MedicalSpecialty;
  specialtyLabel: string;
};

export type TurnoCandidatoBusqueda = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  status: EstadoTurnoAgenda;
  doctorId: string;
  doctorName: string;
  specialty: MedicalSpecialty;
  specialtyLabel?: string;
  /**
   * Indica si la disponibilidad mensual del profesional para el mes del turno
   * fue confirmada (US-08 / US-10 Criterio 1). Antes de la confirmación,
   * ningún turno de ese mes es visible para los pacientes.
   */
  agendaConfirmada: boolean;
  /** Indica si el profesional se encuentra activo (US-03). Por defecto true. */
  doctorActivo?: boolean;
};

export type TurnoDisponiblePaciente = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  doctorId: string;
  doctorName: string;
  specialty: MedicalSpecialty;
  specialtyLabel: string;
  diaCorto: string;
  fechaFormateada: string;
};

export type GrupoDiaTurnos = {
  /** "YYYY-MM-DD" */
  date: string;
  /** Ej.: "Jue 01/10" */
  etiquetaCorta: string;
  /** Ej.: "Jueves 01/10/2026" */
  etiquetaLarga: string;
  turnos: TurnoDisponiblePaciente[];
};

function minutosDesdeMedianoche(hora: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Obtiene la fecha ("YYYY-MM-DD") y hora ("HH:mm") actuales en el huso horario
 * de Argentina (America/Argentina/Buenos_Aires).
 */
export function ahoraEnArgentina(now: Date = new Date()): InstanteArgentina {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "00";
  const normalizedHour = hourPart === "24" ? "00" : hourPart.padStart(2, "0");

  return {
    fecha,
    hora: `${normalizedHour}:${minutePart.padStart(2, "0")}`,
  };
}

/**
 * Criterio 4: El rango de fechas por defecto son los próximos treinta días
 * a partir de la fecha actual.
 */
export function rangoFechasPorDefecto(hoy: string): { desde: string; hasta: string } {
  return {
    desde: hoy,
    hasta: sumarDias(hoy, DIAS_RANGO_DEFECTO),
  };
}

/**
 * Criterio 2: Determina si un turno está en el futuro respecto del instante actual.
 * - Si la fecha del turno es posterior a hoy, es futuro.
 * - Si la fecha del turno es anterior a hoy, ya pasó.
 * - Si la fecha del turno es hoy, su hora de inicio debe ser estrictamente
 *   posterior a la hora actual.
 */
export function esTurnoFuturo(
  turno: { date: string; startTime: string },
  ahora: InstanteArgentina
): boolean {
  if (turno.date > ahora.fecha) return true;
  if (turno.date < ahora.fecha) return false;
  return minutosDesdeMedianoche(turno.startTime) > minutosDesdeMedianoche(ahora.hora);
}

export function esEspecialidadValida(valor: unknown): valor is MedicalSpecialty {
  return (
    typeof valor === "string" &&
    (ESPECIALIDADES_BUSQUEDA as string[]).includes(valor)
  );
}

/**
 * Normaliza y valida los parámetros de búsqueda recibidos desde la URL o el formulario.
 */
export function normalizarFiltrosBusqueda(
  input: FiltrosBusquedaInput,
  hoy: string
): FiltrosBusquedaNormalizados {
  const defecto = rangoFechasPorDefecto(hoy);

  const rawSpecialty = (input.specialty ?? "").trim();
  const specialty: MedicalSpecialty | "" = esEspecialidadValida(rawSpecialty)
    ? rawSpecialty
    : "";

  const doctorId = (input.doctorId ?? "").trim();

  const rawDesde = (input.desde ?? "").trim();
  const rawHasta = (input.hasta ?? "").trim();

  const desde = rawDesde || defecto.desde;
  const hasta = rawHasta || defecto.hasta;
  const esRangoPorDefecto = desde === defecto.desde && hasta === defecto.hasta;

  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return {
      specialty,
      doctorId,
      desde: esFechaValida(desde) ? desde : defecto.desde,
      hasta: esFechaValida(hasta) ? hasta : defecto.hasta,
      esRangoPorDefecto: false,
      error: "Ingresá fechas válidas en formato AAAA-MM-DD.",
    };
  }

  if (desde > hasta) {
    return {
      specialty,
      doctorId,
      desde,
      hasta,
      esRangoPorDefecto: false,
      error: "La fecha «Desde» no puede ser posterior a la fecha «Hasta».",
    };
  }

  return {
    specialty,
    doctorId,
    desde,
    hasta,
    esRangoPorDefecto,
    error: null,
  };
}

/** Formatea "YYYY-MM-DD" como "DD/MM/YYYY". */
export function formatearFechaAr(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

/** Formatea "YYYY-MM-DD" como "Jue 01/10" (igual que la columna Día del wireframe). */
export function formatearDiaCorto(fecha: string): string {
  const [, m, d] = fecha.split("-");
  const { corto } = etiquetaDia(fecha);
  return `${corto} ${d}/${m}`;
}

/** Formatea "YYYY-MM-DD" como "Jueves 01/10/2026". */
export function formatearDiaLargo(fecha: string): string {
  const { largo } = etiquetaDia(fecha);
  const capitalizado = largo.charAt(0).toUpperCase() + largo.slice(1);
  return `${capitalizado} ${formatearFechaAr(fecha)}`;
}

/**
 * Filtra y ordena cronológicamente los turnos según todos los criterios de US-10:
 * - Criterio 1: Solo meses con disponibilidad confirmada (`agendaConfirmada === true`) y médico activo.
 * - Criterio 2: Solo turnos en estado `DISPONIBLE` y futuros respecto de `ahora`.
 * - Criterio 3: Filtra por especialidad, por profesional o por ambos.
 * - Criterio 4/5: Dentro del rango `[desde, hasta]`, ordenados por fecha y hora de inicio.
 */
export function filtrarYOrdenarTurnosDisponibles(
  turnos: TurnoCandidatoBusqueda[],
  filtros: {
    specialty?: MedicalSpecialty | "";
    doctorId?: string;
    desde: string;
    hasta: string;
  },
  ahora: InstanteArgentina
): TurnoDisponiblePaciente[] {
  if (filtros.desde > filtros.hasta) return [];

  const especialidadFiltro = filtros.specialty || "";
  const doctorFiltro = (filtros.doctorId ?? "").trim();

  const filtrados = turnos.filter((t) => {
    // Criterio 1: Antes de la confirmación, ningún turno de ese mes es visible
    if (!t.agendaConfirmada) return false;
    if (t.doctorActivo === false) return false;

    // Criterio 2: Únicamente turnos disponibles y futuros
    if (t.status !== "DISPONIBLE") return false;
    if (!esTurnoFuturo(t, ahora)) return false;

    // Rango de fechas
    if (t.date < filtros.desde || t.date > filtros.hasta) return false;

    // Criterio 3: Filtro por especialidad, profesional o ambos
    if (especialidadFiltro && t.specialty !== especialidadFiltro) return false;
    if (doctorFiltro && t.doctorId !== doctorFiltro) return false;

    return true;
  });

  // Criterio 5: Orden cronológico (fecha asc, hora inicio asc, profesional asc)
  filtrados.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      minutosDesdeMedianoche(a.startTime) - minutosDesdeMedianoche(b.startTime) ||
      a.doctorName.localeCompare(b.doctorName, "es")
  );

  return filtrados.map((t) => ({
    id: t.id,
    date: t.date,
    startTime: t.startTime,
    endTime: t.endTime,
    doctorId: t.doctorId,
    doctorName: t.doctorName,
    specialty: t.specialty,
    specialtyLabel: t.specialtyLabel ?? SPECIALTY_LABELS[t.specialty],
    diaCorto: formatearDiaCorto(t.date),
    fechaFormateada: formatearFechaAr(t.date),
  }));
}

/**
 * Criterio 5: Agrupa los turnos disponibles por día manteniendo el orden
 * cronológico tanto entre días como dentro de cada día.
 */
export function agruparTurnosPorDia(
  turnos: TurnoDisponiblePaciente[]
): GrupoDiaTurnos[] {
  const ordenados = [...turnos].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      minutosDesdeMedianoche(a.startTime) - minutosDesdeMedianoche(b.startTime) ||
      a.doctorName.localeCompare(b.doctorName, "es")
  );

  const mapa = new Map<string, GrupoDiaTurnos>();
  for (const turno of ordenados) {
    const existente = mapa.get(turno.date);
    if (existente) {
      existente.turnos.push(turno);
    } else {
      mapa.set(turno.date, {
        date: turno.date,
        etiquetaCorta: formatearDiaCorto(turno.date),
        etiquetaLarga: formatearDiaLargo(turno.date),
        turnos: [turno],
      });
    }
  }

  return Array.from(mapa.values());
}
