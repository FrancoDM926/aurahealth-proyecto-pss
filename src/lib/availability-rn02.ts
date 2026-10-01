/** RN-02: entre 2 y 7 jornadas por semana (lun–dom), solo semanas con ≥3 días hábiles (lun–vie) en el mes. */

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

const MIN_JORNADAS = 2;
const MAX_JORNADAS = 7;
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
  month: number
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
      if (jornadaCount < MIN_JORNADAS) {
        valid = false;
        errorType = "too_few";
        const sample = formatDateAr(monday.toISOString().slice(0, 10));
        blockingMessages.push(
          `La semana del ${sample} tiene ${jornadaCount} jornada${jornadaCount === 1 ? "" : "s"}. Seleccioná al menos ${MIN_JORNADAS} para continuar.`
        );
      } else if (jornadaCount > MAX_JORNADAS) {
        valid = false;
        errorType = "too_many";
        const sample = formatDateAr(monday.toISOString().slice(0, 10));
        blockingMessages.push(
          `La semana del ${sample} tiene ${jornadaCount} jornadas. El máximo permitido es ${MAX_JORNADAS}.`
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
