/**
 * US-63 — Agenda del vacunatorio (RF-VAC-09, RF-AGE-04, RN-08).
 *
 * Lógica pura (sin base de datos) para poder probarla y compartir las reglas entre
 * la pantalla y las server actions. Es independiente de las agendas médicas: solo
 * reutiliza funciones puras de grilla horaria y de turnos de 30 minutos.
 *
 * Reglas:
 * - La enfermera carga días y franjas; varias franjas por día, sin solaparse (wireframe).
 * - No aplica la regla de 2 a 7 jornadas semanales.
 * - Al guardar, se generan los turnos de 30 minutos y quedan publicados.
 * - No se cargan ni quitan franjas sobre horarios pasados.
 * - Quitar una franja elimina sus turnos libres; si alguno está reservado no se puede quitar.
 */

import {
  esHorarioDeGrilla,
  isPastDate,
  isPastTime,
  todayInArgentina,
} from "@/lib/availability-rn02";
import { splitFranjaIntoSlots, timeStringToMinutes } from "@/lib/turno-generator";

export type FranjaVacunatorio = {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
};

export type FranjaGuardada = FranjaVacunatorio & { id: string };

export type TurnoVacunatorioExistente = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
};

export function claveFranja(f: FranjaVacunatorio): string {
  return `${f.date}|${f.startTime}|${f.endTime}`;
}

export function claveTurnoVac(date: string, startTime: string): string {
  return `${date}_${startTime}`;
}

export function normalizarHora(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : time.trim();
}

export function formatearFechaAr(date: string): string {
  return date.split("-").reverse().join("/");
}

export const ERROR_SOLAPAMIENTO = "La franja se solapa con otra ya cargada ese día.";

/** Dos franjas del mismo día se solapan si sus intervalos se pisan (tocarse no cuenta). */
export function franjasSolapadas(a: FranjaVacunatorio, b: FranjaVacunatorio): boolean {
  if (a.date !== b.date) return false;
  return (
    timeStringToMinutes(a.startTime) < timeStringToMinutes(b.endTime) &&
    timeStringToMinutes(b.startTime) < timeStringToMinutes(a.endTime)
  );
}

/** Validación de una franja suelta (sin mirar el resto del mes). Devuelve el error o null. */
export function validarFranjaSimple(f: FranjaVacunatorio): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "Elegí un día válido.";
  const inicio = normalizarHora(f.startTime);
  const fin = normalizarHora(f.endTime);
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) {
    return "Horario inválido (use formato HH:MM).";
  }
  if (timeStringToMinutes(fin) <= timeStringToMinutes(inicio)) {
    return "El horario «hasta» debe ser posterior a «desde».";
  }
  if (!esHorarioDeGrilla(inicio) || !esHorarioDeGrilla(fin)) {
    return "Los horarios van de 30 en 30 minutos (en punto o y media).";
  }
  return null;
}

/**
 * Valida el conjunto de franjas deseadas del mes. Devuelve errores por clave de
 * franja (índice en el arreglo). Las franjas pasadas que ya estaban guardadas sin
 * cambios se aceptan, para poder seguir editando el resto del mes.
 */
export function validarAgendaMes(
  franjas: FranjaVacunatorio[],
  year: number,
  month: number,
  guardadas: FranjaVacunatorio[],
  now: Date = new Date()
): Record<number, string> {
  const errores: Record<number, string> = {};
  const hoy = todayInArgentina(now);
  const prefijo = `${year}-${String(month).padStart(2, "0")}-`;
  const clavesGuardadas = new Set(guardadas.map(claveFranja));

  franjas.forEach((raw, i) => {
    const f = { date: raw.date, startTime: normalizarHora(raw.startTime), endTime: normalizarHora(raw.endTime) };
    const simple = validarFranjaSimple(f);
    if (simple) {
      errores[i] = simple;
      return;
    }
    if (!f.date.startsWith(prefijo)) {
      errores[i] = "La fecha no pertenece al mes seleccionado.";
      return;
    }
    const sinCambios = clavesGuardadas.has(claveFranja(f));
    if (!sinCambios) {
      if (isPastDate(f.date, hoy)) {
        errores[i] = `El ${formatearFechaAr(f.date)} ya pasó: no se pueden cargar franjas en fechas pasadas.`;
        return;
      }
      if (isPastTime(f.date, f.startTime, now)) {
        errores[i] = `El horario de inicio del ${formatearFechaAr(f.date)} ya pasó: elegí un horario posterior a la hora actual.`;
        return;
      }
    }
  });

  // Solapamientos (y duplicados exactos) dentro del mes.
  for (let i = 0; i < franjas.length; i++) {
    for (let j = i + 1; j < franjas.length; j++) {
      if (errores[j]) continue;
      if (!errores[i] && franjasSolapadas(franjas[i], franjas[j])) {
        errores[j] = ERROR_SOLAPAMIENTO;
      }
    }
  }
  return errores;
}

export type TurnoACrear = { date: string; startTime: string; endTime: string; franjaKey: string };

export type CambiosAgenda = {
  franjasACrear: FranjaVacunatorio[];
  franjasAQuitar: FranjaGuardada[];
  turnosACrear: TurnoACrear[];
  /** Turnos libres que quedan fuera de la agenda deseada: se eliminan. */
  turnosAQuitar: TurnoVacunatorioExistente[];
  /** Turnos reservados (o con estado) que quedarían fuera: impiden guardar. */
  bloqueadosPorReserva: TurnoVacunatorioExistente[];
  /** Turnos que ya existían y siguen vigentes. */
  preservados: number;
};

/**
 * Compara la agenda deseada con la guardada, a nivel de franja y de turno. Es
 * idempotente: reguardar lo mismo no crea ni quita nada. Los horarios que ya
 * pasaron no se crean ni se tocan.
 */
export function calcularCambiosAgenda(
  deseadas: FranjaVacunatorio[],
  guardadas: FranjaGuardada[],
  turnosExistentes: TurnoVacunatorioExistente[],
  now: Date = new Date()
): CambiosAgenda {
  const normalizadas = deseadas.map((f) => ({
    date: f.date,
    startTime: normalizarHora(f.startTime),
    endTime: normalizarHora(f.endTime),
  }));
  const clavesDeseadas = new Set(normalizadas.map(claveFranja));
  const clavesGuardadas = new Set(guardadas.map(claveFranja));

  const franjasACrear = normalizadas.filter((f) => !clavesGuardadas.has(claveFranja(f)));
  const franjasAQuitar = guardadas.filter((f) => !clavesDeseadas.has(claveFranja(f)));

  const yaPaso = (date: string, startTime: string) => isPastTime(date, startTime, now);

  const slotsDeseados = new Map<string, TurnoACrear>();
  for (const f of normalizadas) {
    for (const s of splitFranjaIntoSlots(f.startTime, f.endTime)) {
      slotsDeseados.set(claveTurnoVac(f.date, s.startTime), {
        date: f.date,
        startTime: s.startTime,
        endTime: s.endTime,
        franjaKey: claveFranja(f),
      });
    }
  }
  const existentes = new Set(turnosExistentes.map((t) => claveTurnoVac(t.date, t.startTime)));

  const turnosACrear = [...slotsDeseados.entries()]
    .filter(([clave, t]) => !existentes.has(clave) && !yaPaso(t.date, t.startTime))
    .map(([, t]) => t);

  const fuera = turnosExistentes.filter(
    (t) => !slotsDeseados.has(claveTurnoVac(t.date, t.startTime)) && !yaPaso(t.date, t.startTime)
  );

  return {
    franjasACrear,
    franjasAQuitar,
    turnosACrear,
    turnosAQuitar: fuera.filter((t) => t.status === "DISPONIBLE"),
    bloqueadosPorReserva: fuera.filter((t) => t.status !== "DISPONIBLE"),
    preservados: turnosExistentes.filter((t) => slotsDeseados.has(claveTurnoVac(t.date, t.startTime))).length,
  };
}

export function mensajeBloqueoPorReservas(bloqueados: TurnoVacunatorioExistente[]): string {
  const lista = bloqueados
    .slice(0, 5)
    .map((t) => `${formatearFechaAr(t.date)} ${t.startTime}`)
    .join(", ");
  const resto = bloqueados.length > 5 ? ` y ${bloqueados.length - 5} más` : "";
  return `No se puede quitar: hay turnos reservados en esas franjas (${lista}${resto}). Cancelalos primero desde el mostrador.`;
}

/** Cantidad de turnos de 30 minutos que genera una franja (el sobrante < 30 min no cuenta). */
export function cantidadTurnosDeFranja(f: Pick<FranjaVacunatorio, "startTime" | "endTime">): number {
  try {
    return splitFranjaIntoSlots(normalizarHora(f.startTime), normalizarHora(f.endTime)).length;
  } catch {
    return 0;
  }
}

/** Ordena cronológicamente (fecha y hora de inicio). */
export function ordenarFranjas<T extends FranjaVacunatorio>(franjas: T[]): T[] {
  return [...franjas].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
  );
}
