/**
 * US-08: Generación automática de turnos de 30 minutos
 * Trazabilidad: RF-AGE-03, RN-09
 * 
 * Reglas de negocio:
 * 1. Al confirmarse la disponibilidad, el sistema genera un turno por cada intervalo consecutivo de 30 minutos dentro de la franja.
 * 2. La duración es fija para todas las consultas y todas las especialidades: no es configurable (30 minutos).
 * 3. Un intervalo sobrante menor a 30 minutos no genera turno.
 * 4. Cada turno generado queda en estado disponible, asociado al médico, la fecha y la hora.
 * 5. La generación es idempotente: reconfirmar la misma disponibilidad no duplica turnos.
 */

// RN-09: Duración fija no configurable para consultas y especialidades
export const DURACION_TURNO_MINUTOS = 30;

export type FranjaInput = {
  id?: string;
  doctorId: string;
  date: Date | string; // YYYY-MM-DD o instancia Date
  startTime: string;   // Formato "HH:mm", ej. "08:00"
  endTime: string;     // Formato "HH:mm", ej. "13:00"
  doctorName?: string;
  specialty?: string;
};

export type GeneratedTurno = {
  doctorId: string;
  franjaId?: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number; // 30
  status: "DISPONIBLE";
};

export type FranjaPreview = {
  id?: string;
  date: string;
  displayDate: string;
  startTime: string;
  endTime: string;
  horario: string;
  doctorName: string;
  turnosCount: number;
  slots: Array<{ startTime: string; endTime: string }>;
  sobranteMinutos: number;
};

export type GenerationSummary = {
  totalJornadas: number;
  totalTurnos: number;
};

/**
 * Convierte una cadena de hora "HH:mm" a minutos transcurridos desde las 00:00.
 */
export function timeStringToMinutes(time: string): number {
  const parts = time.trim().split(":");
  if (parts.length < 2) {
    throw new Error(`Formato de hora inválido: "${time}". Se espera "HH:mm".`);
  }
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Hora fuera de rango: "${time}".`);
  }
  return hours * 60 + minutes;
}

/**
 * Convierte minutos desde las 00:00 a cadena "HH:mm".
 */
export function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Normaliza una fecha a UTC medianoche para evitar desfases de zona horaria.
 */
export function normalizeDateToUTC(dateInput: Date | string): Date {
  if (typeof dateInput === "string") {
    const cleanDate = dateInput.split("T")[0];
    const [year, month, day] = cleanDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return new Date(
    Date.UTC(
      dateInput.getUTCFullYear(),
      dateInput.getUTCMonth(),
      dateInput.getUTCDate()
    )
  );
}

/**
 * Formatea una fecha para mostrar en la interfaz (ej. "Mié 02/09").
 */
export function formatDisplayDate(dateInput: Date | string): string {
  const date = normalizeDateToUTC(dateInput);
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const dayName = dayNames[date.getUTCDay()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dayName} ${day}/${month}`;
}

/**
 * Criterio 1, 2 y 3 de US-08:
 * Divide una franja horaria en intervalos consecutivos de 30 minutos (RN-09).
 * - La duración es fija en 30 minutos: no es configurable.
 * - Un intervalo sobrante menor a 30 minutos no genera turno.
 */
export function splitFranjaIntoSlots(
  startTime: string,
  endTime: string
): Array<{ startTime: string; endTime: string }> {
  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);

  if (endMin <= startMin) {
    throw new Error(
      `La hora de fin (${endTime}) debe ser posterior a la hora de inicio (${startTime}).`
    );
  }

  const slots: Array<{ startTime: string; endTime: string }> = [];
  let currentStart = startMin;

  // Mientras el intervalo consecutivo alcance los 30 minutos completos
  while (currentStart + DURACION_TURNO_MINUTOS <= endMin) {
    const nextEnd = currentStart + DURACION_TURNO_MINUTOS;
    slots.push({
      startTime: minutesToTimeString(currentStart),
      endTime: minutesToTimeString(nextEnd),
    });
    currentStart = nextEnd;
  }

  // Cualquier remanente menor a 30 minutos (endMin - currentStart) se descarta por Criterio 3.
  return slots;
}

/**
 * Calcula los minutos sobrantes de una franja que no llegan a formar un turno de 30 minutos.
 */
export function calculateSobranteMinutos(
  startTime: string,
  endTime: string
): number {
  const startMin = timeStringToMinutes(startTime);
  const endMin = timeStringToMinutes(endTime);
  const totalDuration = endMin - startMin;
  return totalDuration % DURACION_TURNO_MINUTOS;
}

/**
 * Genera la lista de turnos en estado DISPONIBLE para una franja dada.
 * Criterio 4: Cada turno queda en estado disponible, asociado al médico, la fecha y la hora.
 */
export function generateTurnosForFranja(franja: FranjaInput): GeneratedTurno[] {
  const slots = splitFranjaIntoSlots(franja.startTime, franja.endTime);
  const utcDate = normalizeDateToUTC(franja.date);

  return slots.map((slot) => ({
    doctorId: franja.doctorId,
    franjaId: franja.id,
    date: utcDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    duration: DURACION_TURNO_MINUTOS,
    status: "DISPONIBLE" as const,
  }));
}

/**
 * Genera la lista completa de turnos para una colección de franjas horarias.
 */
export function generateTurnosFromFranjasList(
  franjas: FranjaInput[]
): {
  turnos: GeneratedTurno[];
  previews: FranjaPreview[];
  summary: GenerationSummary;
} {
  const turnos: GeneratedTurno[] = [];
  const previews: FranjaPreview[] = [];

  for (const franja of franjas) {
    const franjaTurnos = generateTurnosForFranja(franja);
    turnos.push(...franjaTurnos);

    const slots = splitFranjaIntoSlots(franja.startTime, franja.endTime);
    const sobrante = calculateSobranteMinutos(franja.startTime, franja.endTime);
    const utcDate = normalizeDateToUTC(franja.date);

    previews.push({
      id: franja.id,
      date: utcDate.toISOString().split("T")[0],
      displayDate: formatDisplayDate(utcDate),
      startTime: franja.startTime,
      endTime: franja.endTime,
      horario: `${franja.startTime}–${franja.endTime}`,
      doctorName: franja.doctorName || "Profesional médico",
      turnosCount: slots.length,
      slots,
      sobranteMinutos: sobrante,
    });
  }

  const summary: GenerationSummary = {
    totalJornadas: previews.length,
    totalTurnos: turnos.length,
  };

  return { turnos, previews, summary };
}

/**
 * Criterio 5: Idempotencia.
 * Compara los turnos generados contra los turnos ya existentes para el médico y fecha/hora.
 * Retorna los turnos nuevos a insertar y la cantidad de turnos existentes preservados.
 */
export function filterTurnosForIdempotency(
  generatedTurnos: GeneratedTurno[],
  existingKeys: Set<string>
): {
  toCreate: GeneratedTurno[];
  existingCount: number;
} {
  const toCreate: GeneratedTurno[] = [];
  let existingCount = 0;

  for (const turno of generatedTurnos) {
    const key = `${turno.doctorId}_${turno.date.toISOString().split("T")[0]}_${turno.startTime}`;
    if (existingKeys.has(key)) {
      existingCount++;
    } else {
      toCreate.push(turno);
      // Evitar duplicados dentro del mismo lote
      existingKeys.add(key);
    }
  }

  return { toCreate, existingCount };
}
