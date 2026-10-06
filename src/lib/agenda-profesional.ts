/**
 * US-11: Vista de agenda del profesional (RF-AGE-05).
 *
 * Lógica pura de las tres vistas (diaria, semanal y mensual). Las fechas son
 * "YYYY-MM-DD" y se calculan en UTC, igual que las columnas `@db.Date`, para
 * que el huso del servidor no corra un día.
 */

export type VistaAgenda = "dia" | "semana" | "mes";

export const VISTAS: VistaAgenda[] = ["semana", "dia", "mes"];

export const VISTA_LABELS: Record<VistaAgenda, string> = {
  semana: "Semanal",
  dia: "Diaria",
  mes: "Mensual",
};

export type EstadoTurnoAgenda =
  | "DISPONIBLE"
  | "RESERVADO"
  | "CUMPLIDO"
  | "AUSENTE"
  | "CANCELADO";

export const ESTADO_LABELS: Record<EstadoTurnoAgenda, string> = {
  DISPONIBLE: "Libre",
  RESERVADO: "Reservado",
  CUMPLIDO: "Cumplido",
  AUSENTE: "Ausente",
  CANCELADO: "Cancelado",
};

export type TurnoAgenda = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  status: EstadoTurnoAgenda;
};

/** Filtro "Mostrar" del wireframe. */
export type FiltroAgenda = "todos" | "libres" | "reservados";

export const FILTRO_LABELS: Record<FiltroAgenda, string> = {
  todos: "Todos los turnos",
  libres: "Solo libres",
  reservados: "Solo reservados",
};

export type RangoAgenda = { desde: string; hasta: string };

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(fecha: string): Date {
  const m = FECHA_RE.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** true si la fecha existe en el calendario (rechaza "2026-02-31"). */
export function esFechaValida(fecha: string): boolean {
  return FECHA_RE.test(fecha) && toFecha(toDate(fecha)) === fecha;
}

export function sumarDias(fecha: string, dias: number): string {
  const d = toDate(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return toFecha(d);
}

/** Lunes de la semana de la fecha: la semana va de lunes a domingo. */
export function inicioDeSemana(fecha: string): string {
  const dow = (toDate(fecha).getUTCDay() + 6) % 7;
  return sumarDias(fecha, -dow);
}

export function rangoDeVista(vista: VistaAgenda, fecha: string): RangoAgenda {
  if (vista === "dia") return { desde: fecha, hasta: fecha };
  if (vista === "semana") {
    const desde = inicioDeSemana(fecha);
    return { desde, hasta: sumarDias(desde, 6) };
  }
  const d = toDate(fecha);
  return {
    desde: toFecha(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))),
    hasta: toFecha(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))),
  };
}

/** Fecha del período anterior (-1) o siguiente (1). */
export function moverPeriodo(vista: VistaAgenda, fecha: string, sentido: -1 | 1): string {
  if (vista === "dia") return sumarDias(fecha, sentido);
  if (vista === "semana") return sumarDias(fecha, 7 * sentido);
  // El mes se ancla al día 1 para que el 31/01 + 1 mes no caiga en marzo.
  const d = toDate(fecha);
  return toFecha(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + sentido, 1)));
}

/** Todas las fechas del rango, ambos extremos incluidos. */
export function diasDelRango({ desde, hasta }: RangoAgenda): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
}

export function etiquetaDia(fecha: string): { corto: string; largo: string; numero: string } {
  const d = toDate(fecha);
  return {
    corto: DIAS_CORTOS[d.getUTCDay()],
    largo: DIAS_LARGOS[d.getUTCDay()],
    numero: String(d.getUTCDate()).padStart(2, "0"),
  };
}

/**
 * Período tal como lo muestra el selector "Vista" del wireframe:
 * "05 al 11 de octubre de 2026", "05 de octubre de 2026", "octubre 2026".
 */
export function etiquetaPeriodo(vista: VistaAgenda, fecha: string): string {
  const { desde, hasta } = rangoDeVista(vista, fecha);
  const d = toDate(desde);
  const h = toDate(hasta);
  const dd = (x: Date) => String(x.getUTCDate()).padStart(2, "0");
  const mes = (x: Date) => MESES[x.getUTCMonth()];
  if (vista === "dia") {
    return `${dd(d)} de ${mes(d)} de ${d.getUTCFullYear()}`;
  }
  if (vista === "semana") {
    const izq = d.getUTCMonth() === h.getUTCMonth() ? dd(d) : `${dd(d)} de ${mes(d)}`;
    return `${izq} al ${dd(h)} de ${mes(h)} de ${h.getUTCFullYear()}`;
  }
  return `${mes(d)} ${d.getUTCFullYear()}`;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Filas de la grilla semanal: de 30 en 30 minutos, desde el primer turno hasta
 * el último, sin saltear los horarios intermedios (así los huecos se ven).
 */
export function filasHorario(turnos: TurnoAgenda[]): string[] {
  if (turnos.length === 0) return [];
  const desde = Math.min(...turnos.map((t) => minutos(t.startTime)));
  const hasta = Math.max(...turnos.map((t) => minutos(t.startTime)));
  const filas: string[] = [];
  for (let m = desde; m <= hasta; m += 30) {
    filas.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return filas;
}

export function pasaFiltro(t: TurnoAgenda, filtro: FiltroAgenda): boolean {
  if (filtro === "libres") return t.status === "DISPONIBLE";
  if (filtro === "reservados") return t.status === "RESERVADO";
  return true;
}

/** Turnos agrupados por día y ordenados cronológicamente. */
export function agruparPorDia(turnos: TurnoAgenda[]): Map<string, TurnoAgenda[]> {
  const ordenados = [...turnos].sort(
    (a, b) => a.date.localeCompare(b.date) || minutos(a.startTime) - minutos(b.startTime)
  );
  const out = new Map<string, TurnoAgenda[]>();
  for (const t of ordenados) {
    const lista = out.get(t.date);
    if (lista) lista.push(t);
    else out.set(t.date, [t]);
  }
  return out;
}

export type HuecoLibre = { startTime: string; endTime: string; turnos: number };

/**
 * Huecos libres de un día (vista diaria): tandas de turnos disponibles
 * consecutivos. Un turno de otro estado, o un salto de horario, corta la tanda.
 */
export function huecosLibres(turnosDelDia: TurnoAgenda[]): HuecoLibre[] {
  const huecos: HuecoLibre[] = [];
  let actual: HuecoLibre | null = null;
  const ordenados = [...turnosDelDia].sort((a, b) => minutos(a.startTime) - minutos(b.startTime));
  for (const t of ordenados) {
    if (t.status !== "DISPONIBLE") {
      actual = null;
      continue;
    }
    if (actual && actual.endTime === t.startTime) {
      actual.endTime = t.endTime;
      actual.turnos += 1;
    } else {
      actual = { startTime: t.startTime, endTime: t.endTime, turnos: 1 };
      huecos.push(actual);
    }
  }
  return huecos;
}

export type ResumenDia = Record<EstadoTurnoAgenda, number> & { total: number };

export function resumenDelDia(turnosDelDia: TurnoAgenda[]): ResumenDia {
  const r: ResumenDia = {
    DISPONIBLE: 0,
    RESERVADO: 0,
    CUMPLIDO: 0,
    AUSENTE: 0,
    CANCELADO: 0,
    total: 0,
  };
  for (const t of turnosDelDia) {
    r[t.status] += 1;
    r.total += 1;
  }
  return r;
}
