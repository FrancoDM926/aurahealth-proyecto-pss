/**
 * RN-02: entre un mínimo y un máximo de jornadas por semana (lun–dom), solo en
 * semanas con ≥3 días hábiles (lun–vie) dentro del mes. Los límites los
 * configura el administrador (US-06); 2 y 7 son los valores iniciales.
 */

export type JornadaInput = {
  date: string; // YYYY-MM-DD
};

export type WeekValidation = {
  weekKey: string;
  weekLabel: string;
  jornadaCount: number;
  businessDaysInMonth: number;
  applies: boolean;
  valid: boolean;
  errorType?: "too_few" | "too_many";
};

export type LimitesJornadas = { min: number; max: number };

export const LIMITES_JORNADAS_DEFAULT: LimitesJornadas = { min: 2, max: 7 };

const MIN_BUSINESS_DAYS = 3;

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateAr(iso: string): string {
  const date = parseDateOnly(iso);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Lunes 00:00 UTC de la semana que contiene `date`. */
function weekStartMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function weekKey(monday: Date): string {
  return monday.toISOString().slice(0, 10);
}

function businessDaysInMonthForWeek(
  monday: Date,
  year: number,
  month: number
): number {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    if (d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && isBusinessDay(d)) {
      count++;
    }
  }
  return count;
}

function weekLabel(monday: Date, year: number, month: number): string {
  const start = formatDateAr(monday.toISOString().slice(0, 10));
  const endDate = new Date(monday);
  endDate.setUTCDate(monday.getUTCDate() + 6);
  const end = formatDateAr(endDate.toISOString().slice(0, 10));
  return `Semana del ${start} al ${end}`;
}

export function validateMonthlyJornadasRN02(
  jornadas: JornadaInput[],
  year: number,
  month: number,
  limites: LimitesJornadas = LIMITES_JORNADAS_DEFAULT
): { weeks: WeekValidation[]; isValid: boolean; blockingMessages: string[] } {
  const jornadaDates = jornadas.map((j) => parseDateOnly(j.date));

  const weekMap = new Map<string, { monday: Date; dates: Date[] }>();

  for (const date of jornadaDates) {
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) {
      continue;
    }
    const monday = weekStartMonday(date);
    const key = weekKey(monday);
    const entry = weekMap.get(key) ?? { monday, dates: [] };
    entry.dates.push(date);
    weekMap.set(key, entry);
  }

  // Incluir semanas del mes que tengan ≥3 días hábiles aunque no tengan jornadas
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  for (let d = new Date(firstDay); d <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) {
    const monday = weekStartMonday(new Date(d));
    const key = weekKey(monday);
    if (!weekMap.has(key)) {
      weekMap.set(key, { monday, dates: [] });
    }
  }

  const weeks: WeekValidation[] = [];
  const blockingMessages: string[] = [];

  const sorted = [...weekMap.entries()].sort((a, b) =>
    a[1].monday.getTime() - b[1].monday.getTime()
  );

  for (const [, { monday, dates }] of sorted) {
    const businessDays = businessDaysInMonthForWeek(monday, year, month);
    const applies = businessDays >= MIN_BUSINESS_DAYS;
    const jornadaCount = dates.length;
    let valid = true;
    let errorType: WeekValidation["errorType"];

    if (applies) {
      if (jornadaCount < limites.min) {
        valid = false;
        errorType = "too_few";
        const sample = formatDateAr(monday.toISOString().slice(0, 10));
        blockingMessages.push(
          `La semana del ${sample} tiene ${jornadaCount} jornada${jornadaCount === 1 ? "" : "s"}. Seleccioná al menos ${limites.min} para continuar.`
        );
      } else if (jornadaCount > limites.max) {
        valid = false;
        errorType = "too_many";
        const sample = formatDateAr(monday.toISOString().slice(0, 10));
        blockingMessages.push(
          `La semana del ${sample} tiene ${jornadaCount} jornadas. El máximo permitido es ${limites.max}.`
        );
      }
    }

    weeks.push({
      weekKey: weekKey(monday),
      weekLabel: weekLabel(monday, year, month),
      jornadaCount,
      businessDaysInMonth: businessDays,
      applies,
      valid: !applies || valid,
      errorType,
    });
  }

  const isValid = weeks.every((w) => w.valid);
  return { weeks, isValid, blockingMessages };
}

export const SLOT_DURATION_MINUTES = 30;

/** Valida los límites que carga el administrador. Devuelve el error o null. */
export function validarLimitesJornadas(limites: LimitesJornadas): string | null {
  const { min, max } = limites;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return "Los límites tienen que ser números enteros.";
  }
  if (min < 1 || max > 7) {
    return "Los límites tienen que estar entre 1 y 7 jornadas por semana.";
  }
  if (min > max) {
    return "El mínimo no puede ser mayor que el máximo.";
  }
  return null;
}

/** Fecha de hoy ("YYYY-MM-DD") en la hora de la sala, no la del servidor. */
export function todayInArgentina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** US-06: una franja no puede cargarse sobre una fecha ya pasada. */
export function isPastDate(date: string, today: string): boolean {
  return date < today;
}

/** Paso de los horarios que se ofrecen al elegir una franja. */
export const FRANJA_STEP_MINUTES = 15;

function minutesToHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Horarios posibles para el inicio de una franja: deja lugar a un turno completo. */
export function opcionesHoraInicio(): string[] {
  const out: string[] = [];
  for (let t = 0; t + SLOT_DURATION_MINUTES <= 24 * 60 - FRANJA_STEP_MINUTES; t += FRANJA_STEP_MINUTES) {
    out.push(minutesToHHMM(t));
  }
  return out;
}

/**
 * Horarios posibles para el fin de una franja: solo posteriores al inicio y con
 * al menos un turno completo de 30 minutos. Así no se puede elegir una franja
 * "al revés" (ej. de 19:00 a 14:00).
 */
export function opcionesHoraFin(inicio: string): string[] {
  const out: string[] = [];
  for (
    let t = hhmmToMinutes(inicio) + SLOT_DURATION_MINUTES;
    t <= 24 * 60 - FRANJA_STEP_MINUTES;
    t += FRANJA_STEP_MINUTES
  ) {
    out.push(minutesToHHMM(t));
  }
  return out;
}

/** Minutos sobrantes de la franja que no llegan a formar un turno (US-08). */
export function minutosSobrantes(inicio: string, fin: string): number {
  return (hhmmToMinutes(fin) - hhmmToMinutes(inicio)) % SLOT_DURATION_MINUTES;
}
