/**
 * US-15 — Recordatorio automático de turno (RF-TUR-04, RF-NOT-01).
 *
 * Lógica pura (sin base de datos ni envío) para poder probarla:
 *  - con qué antelación se recuerda cada turno (configurable, inicial 24 h),
 *  - qué turnos están dentro de la ventana de recordatorio,
 *  - la traducción de los datos del turno a los parámetros de la plantilla.
 */

/** Antelación inicial del recordatorio, en horas (valor por defecto del sistema). */
export const ANTELACION_RECORDATORIO_DEFAULT_HORAS = 24;

/** Límites admitidos para la antelación configurable (1 hora a 7 días). */
export const ANTELACION_RECORDATORIO_MIN_HORAS = 1;
export const ANTELACION_RECORDATORIO_MAX_HORAS = 168;

/**
 * Argentina no aplica horario de verano desde 2009: UTC-3 fijo. Los turnos se
 * guardan con `date` como fecha pura (UTC) y `startTime` como "HH:mm" en hora
 * de la sala, así que el instante real del turno se arma con este offset.
 */
export const ARGENTINA_UTC_OFFSET_HORAS = 3;

/** Turno mínimo necesario para decidir si corresponde recordarlo. */
export type TurnoRecordatoriable = {
  id: string;
  status: "DISPONIBLE" | "RESERVADO" | "CUMPLIDO" | "AUSENTE" | "CANCELADO";
  date: Date;
  startTime: string;
  reservedById: string | null;
  recordatorioEstado: "PENDIENTE" | "ENVIADO";
};

function parseHora(hora: string): { horas: number; minutos: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return { horas, minutos };
}

/**
 * Instante real (UTC) en que empieza el turno. `date` viene como fecha pura a
 * las 00:00 UTC y `startTime` está en hora de la sala (UTC-3).
 * Devuelve `null` si la hora no tiene el formato esperado.
 */
export function inicioTurnoUTC(turno: Pick<TurnoRecordatoriable, "date" | "startTime">): Date | null {
  const hora = parseHora(turno.startTime);
  if (!hora) return null;
  return new Date(
    Date.UTC(
      turno.date.getUTCFullYear(),
      turno.date.getUTCMonth(),
      turno.date.getUTCDate(),
      hora.horas + ARGENTINA_UTC_OFFSET_HORAS,
      hora.minutos
    )
  );
}

/** Horas que faltan para el inicio del turno (negativo si ya pasó). */
export function horasHastaTurno(
  turno: Pick<TurnoRecordatoriable, "date" | "startTime">,
  ahora: Date
): number | null {
  const inicio = inicioTurnoUTC(turno);
  if (!inicio) return null;
  return (inicio.getTime() - ahora.getTime()) / (60 * 60 * 1000);
}

/**
 * ¿El turno entra en la ventana de recordatorio? Es decir: todavía no empezó y
 * falta menos (o igual) que la antelación configurada.
 */
export function estaEnVentanaRecordatorio(
  turno: Pick<TurnoRecordatoriable, "date" | "startTime">,
  ahora: Date,
  antelacionHoras: number
): boolean {
  const faltan = horasHastaTurno(turno, ahora);
  if (faltan === null) return false;
  return faltan > 0 && faltan <= antelacionHoras;
}

/**
 * ¿El turno es recordable en este momento, según su estado y la ventana?
 * No mira si ya se envió: lo usan tanto la selección como la re-verificación
 * que corre después de reclamar el turno (cuando el estado ya es ENVIADO).
 */
export function esTurnoRecordable(
  turno: TurnoRecordatoriable,
  ahora: Date,
  antelacionHoras: number
): boolean {
  if (turno.status !== "RESERVADO") return false;
  if (!turno.reservedById) return false;
  return estaEnVentanaRecordatorio(turno, ahora, antelacionHoras);
}

/**
 * ¿Corresponde enviar el recordatorio? Requiere además que siga PENDIENTE
 * (garantía de no duplicar: un turno ya ENVIADO nunca se vuelve a elegir).
 */
export function debeRecordarse(
  turno: TurnoRecordatoriable,
  ahora: Date,
  antelacionHoras: number
): boolean {
  if (turno.recordatorioEstado === "ENVIADO") return false;
  return esTurnoRecordable(turno, ahora, antelacionHoras);
}

/**
 * Turnos a recordar en esta corrida, del más próximo al más lejano.
 * Reintentar el proceso sobre el mismo conjunto no genera duplicados: los que
 * ya quedaron ENVIADO se descartan acá y, además, el servicio los vuelve a
 * descartar con un UPDATE condicional antes de enviar.
 */
export function seleccionarTurnosARecordar<T extends TurnoRecordatoriable>(
  turnos: readonly T[],
  ahora: Date,
  antelacionHoras: number
): T[] {
  return turnos
    .filter((turno) => debeRecordarse(turno, ahora, antelacionHoras))
    .sort((a, b) => {
      const inicioA = inicioTurnoUTC(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const inicioB = inicioTurnoUTC(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      return inicioA - inicioB;
    });
}

/** Valida la antelación que carga el administrador. Devuelve el error o null. */
export function validarAntelacionRecordatorio(horas: number): string | null {
  if (!Number.isInteger(horas)) {
    return "La antelación tiene que ser un número entero de horas.";
  }
  if (horas < ANTELACION_RECORDATORIO_MIN_HORAS || horas > ANTELACION_RECORDATORIO_MAX_HORAS) {
    return `La antelación tiene que estar entre ${ANTELACION_RECORDATORIO_MIN_HORAS} y ${ANTELACION_RECORDATORIO_MAX_HORAS} horas.`;
  }
  return null;
}

/** Datos ya resueltos que necesita la plantilla del recordatorio. */
export type RecordatorioTurnoData = {
  destinatarioNombre: string;
  doctorNombre: string;
  especialidad: string;
  fecha: Date;
  startTime: string;
  horasRestantes?: number;
};

/** Fecha del turno (guardada en UTC) al formato del email: dd/mm/aaaa. */
export function formatFechaTurno(date: Date): string {
  const dia = String(date.getUTCDate()).padStart(2, "0");
  const mes = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${date.getUTCFullYear()}`;
}

/**
 * Traducción pura a los parámetros tipados de `RECORDATORIO_TURNO`.
 * Aislada para poder probarla sin base de datos ni envío.
 */
export function buildRecordatorioTurnoParams(data: RecordatorioTurnoData) {
  return {
    pacienteNombre: data.destinatarioNombre,
    tipoTurno: "Consulta médica" as const,
    profesionalOArea: data.doctorNombre,
    fecha: formatFechaTurno(data.fecha),
    hora: data.startTime,
    horasRestantes:
      typeof data.horasRestantes === "number"
        ? Math.max(0, Math.round(data.horasRestantes))
        : undefined,
  };
}
