/**
 * US-28 — Turno de vacunación (RF-VAC-05, RF-VAC-09, RF-TUR-01, RF-TUR-11, RN-05, RN-08).
 *
 * Lógica pura (sin base de datos ni envío) compartida entre la búsqueda, la reserva
 * del paciente, la del mostrador y la cancelación. Reutiliza las reglas de tiempo de
 * la búsqueda médica (US-10): rango de 30 días por defecto, solo turnos futuros y
 * disponibles, agrupados por día.
 *
 * Criterios cubiertos:
 * - El usuario elige una vacuna activa del catálogo (US-24) y un turno de la agenda del vacunatorio.
 * - Filtro por rango de fechas, igual que US-10.
 * - No se verifica stock: ninguna reserva se rechaza por ese motivo.
 * - Puede superponerse con un turno médico de la misma persona: no hay ninguna validación cruzada.
 */

import {
  ahoraEnArgentina,
  esTurnoFuturo,
  formatearDiaCorto,
  formatearDiaLargo,
  formatearFechaAr,
  normalizarFiltrosBusqueda,
  type InstanteArgentina,
} from "@/lib/busqueda-turnos";

export { ahoraEnArgentina, esTurnoFuturo };

export const MENSAJE_SIN_RESULTADOS_VACUNACION =
  "No hay turnos de vacunación disponibles en el rango elegido. Probá ampliar el rango de fechas.";

export const MENSAJE_NO_DISPONIBLE_VACUNACION =
  "Ups — alguien reservó este turno un instante antes que vos. Volvé a los resultados de búsqueda, que ya están actualizados.";

export type FiltrosVacunacion = {
  desde: string;
  hasta: string;
  esRangoPorDefecto: boolean;
  error: string | null;
};

/** Rango por defecto: próximos 30 días (US-10). */
export function normalizarFiltrosVacunacion(
  input: { desde?: string | null; hasta?: string | null },
  hoy: string
): FiltrosVacunacion {
  const { desde, hasta, esRangoPorDefecto, error } = normalizarFiltrosBusqueda(
    { desde: input.desde, hasta: input.hasta },
    hoy
  );
  return { desde, hasta, esRangoPorDefecto, error };
}

export type TurnoVacunacionCandidato = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  startTime: string;
  endTime: string;
  status: string;
};

export type TurnoVacunacionDisponible = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  diaCorto: string;
  fechaFormateada: string;
};

export type GrupoDiaVacunacion = {
  date: string;
  etiquetaCorta: string;
  etiquetaLarga: string;
  turnos: TurnoVacunacionDisponible[];
};

/** Solo turnos DISPONIBLE, futuros y dentro del rango, en orden cronológico. */
export function filtrarTurnosVacunacion(
  turnos: TurnoVacunacionCandidato[],
  filtros: { desde: string; hasta: string },
  ahora: InstanteArgentina
): TurnoVacunacionDisponible[] {
  if (filtros.desde > filtros.hasta) return [];
  return turnos
    .filter(
      (t) =>
        t.status === "DISPONIBLE" &&
        esTurnoFuturo(t, ahora) &&
        t.date >= filtros.desde &&
        t.date <= filtros.hasta
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((t) => ({
      id: t.id,
      date: t.date,
      startTime: t.startTime,
      endTime: t.endTime,
      diaCorto: formatearDiaCorto(t.date),
      fechaFormateada: formatearFechaAr(t.date),
    }));
}

/** Agrupa por día manteniendo el orden cronológico. */
export function agruparTurnosVacunacionPorDia(
  turnos: TurnoVacunacionDisponible[]
): GrupoDiaVacunacion[] {
  const mapa = new Map<string, GrupoDiaVacunacion>();
  for (const t of turnos) {
    const grupo = mapa.get(t.date);
    if (grupo) grupo.turnos.push(t);
    else
      mapa.set(t.date, {
        date: t.date,
        etiquetaCorta: formatearDiaCorto(t.date),
        etiquetaLarga: formatearDiaLargo(t.date),
        turnos: [t],
      });
  }
  return [...mapa.values()];
}

/** La dosis prevista es opcional; si viene, debe existir en el esquema de la vacuna. */
export function validarDosisPrevista(
  dosis: { orden: number }[],
  orden: number | null | undefined
): string | null {
  if (orden === null || orden === undefined) return null;
  return dosis.some((d) => d.orden === orden) ? null : "La dosis elegida no pertenece al esquema de la vacuna.";
}

/** Nombre completo de la vacuna para mostrar y para las copias históricas. */
export function nombreVacuna(v: { denominacion: string; laboratorio: string }): string {
  return `${v.denominacion} — ${v.laboratorio}`;
}

/**
 * Razón por la que un turno de vacunación no se puede reservar, o null si se puede.
 * Un turno con la vacuna desactivada o ya reservado nunca se ofrece (US-24, US-13).
 */
export function motivoNoReservable(
  turno: { status: string; date: string; startTime: string } | null,
  vacuna: { isActive: boolean } | null,
  ahora: InstanteArgentina
): "TURNO_NO_DISPONIBLE" | "VACUNA_NO_ASIGNABLE" | null {
  if (!turno || turno.status !== "DISPONIBLE" || !esTurnoFuturo(turno, ahora)) {
    return "TURNO_NO_DISPONIBLE";
  }
  if (!vacuna || !vacuna.isActive) return "VACUNA_NO_ASIGNABLE";
  return null;
}

/** Texto de la fila de "Mis turnos" para un turno de vacunación. */
export function descripcionTurnoVacunacion(vacunaNombre: string | null): string {
  return vacunaNombre ? `Vacunatorio · ${vacunaNombre}` : "Vacunatorio";
}
