/**
 * US-13 / US-64 / US-16 — Reserva de turno, reserva a nombre de otra persona y
 * cancelación por el paciente.
 *
 * Lógica pura (sin base de datos ni envío) para poder probarla y compartir las
 * mismas reglas y mensajes entre el formulario y las server actions.
 */

import { ENTITY_OPTIONS, MAX_LENGTHS, parseBirthDate } from "@/lib/validation";
import { horasHastaTurno } from "@/lib/recordatorios";

/** US-13: largo máximo del motivo de la consulta (opcional). */
export const MAX_MOTIVO_CONSULTA = 300;

/** US-16: antelación mínima inicial para cancelar un turno, en horas. */
export const ANTELACION_CANCELACION_DEFAULT_HORAS = 24;

/** Límites admitidos para la antelación configurable (1 hora a 7 días). */
export const ANTELACION_CANCELACION_MIN_HORAS = 1;
export const ANTELACION_CANCELACION_MAX_HORAS = 168;

export function validarAntelacionCancelacion(horas: number): string | null {
  if (
    !Number.isInteger(horas) ||
    horas < ANTELACION_CANCELACION_MIN_HORAS ||
    horas > ANTELACION_CANCELACION_MAX_HORAS
  ) {
    return `Ingresá un número entero entre ${ANTELACION_CANCELACION_MIN_HORAS} y ${ANTELACION_CANCELACION_MAX_HORAS} horas.`;
  }
  return null;
}

/**
 * US-16: el paciente puede cancelar mientras falte al menos la antelación
 * configurada para el inicio del turno.
 */
export function estaEnPlazoDeCancelacion(
  turno: { date: Date; startTime: string },
  ahora: Date,
  antelacionHoras: number
): boolean {
  const faltan = horasHastaTurno(turno, ahora);
  if (faltan === null) return false;
  return faltan >= antelacionHoras;
}

export function validarMotivoConsulta(motivo: string): string | null {
  if (motivo.trim().length > MAX_MOTIVO_CONSULTA) {
    return `El motivo no puede superar los ${MAX_MOTIVO_CONSULTA} caracteres.`;
  }
  return null;
}

/** US-64: datos de la persona atendida, tal como se cargan en el formulario. */
export type PersonaAtendidaInput = {
  firstName: string;
  lastName: string;
  docNumber: string;
  /** "YYYY-MM-DD" */
  birthDate: string;
  healthInsuranceEntity: string;
  healthInsurancePlan: string;
  healthInsuranceNumber: string;
};

export type PersonaAtendidaErrors = Partial<Record<keyof PersonaAtendidaInput, string>>;

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'’-]*$/;
const ENTITY_VALUES: readonly string[] = ENTITY_OPTIONS.map((o) => o.value);

function validarNombrePersona(value: string, label: "nombre" | "apellido"): string | null {
  const v = value.trim();
  if (!v) return `Ingresá el ${label}.`;
  if (v.length < 2) return "Usá al menos 2 caracteres.";
  if (v.length > MAX_LENGTHS.firstName) return `Máximo ${MAX_LENGTHS.firstName} caracteres.`;
  if (!NAME_PATTERN.test(v)) return "Solo letras, espacios, guiones y apóstrofes.";
  return null;
}

function validarFechaNacimientoPersona(value: string, hoy: Date): string | null {
  const v = value.trim();
  if (!v) return "Seleccioná la fecha de nacimiento.";
  const date = parseBirthDate(v);
  if (!date) return "Ingresá una fecha de nacimiento válida.";
  const today = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  if (date.getTime() > today.getTime()) return "La fecha no puede ser futura.";
  const oldest = new Date(
    Date.UTC(today.getUTCFullYear() - 120, today.getUTCMonth(), today.getUTCDate())
  );
  if (date.getTime() < oldest.getTime()) return "La fecha no puede tener más de 120 años.";
  return null;
}

function validarTextoObligatorio(value: string, mensaje: string, max: number): string | null {
  const v = value.trim();
  if (!v) return mensaje;
  if (v.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

/**
 * US-64: valida los datos de la persona atendida. Todos los campos del
 * formulario son obligatorios; la cobertura es declarativa (sin padrón).
 */
export function validarPersonaAtendida(
  data: PersonaAtendidaInput,
  hoy: Date = new Date()
): PersonaAtendidaErrors {
  const errors: PersonaAtendidaErrors = {};
  const set = (key: keyof PersonaAtendidaInput, error: string | null) => {
    if (error) errors[key] = error;
  };

  set("firstName", validarNombrePersona(data.firstName, "nombre"));
  set("lastName", validarNombrePersona(data.lastName, "apellido"));
  set(
    "docNumber",
    validarTextoObligatorio(data.docNumber, "Ingresá el número de documento.", MAX_LENGTHS.docNumber)
  );
  set("birthDate", validarFechaNacimientoPersona(data.birthDate, hoy));

  const entity = data.healthInsuranceEntity.trim();
  if (!entity) {
    errors.healthInsuranceEntity = "Seleccioná la entidad de la obra social.";
  } else if (!ENTITY_VALUES.includes(entity)) {
    errors.healthInsuranceEntity = "Seleccioná una entidad válida.";
  }
  set(
    "healthInsurancePlan",
    validarTextoObligatorio(
      data.healthInsurancePlan,
      "Ingresá el plan de la obra social.",
      MAX_LENGTHS.healthInsurancePlan
    )
  );
  set(
    "healthInsuranceNumber",
    validarTextoObligatorio(
      data.healthInsuranceNumber,
      "Ingresá el número de afiliado.",
      MAX_LENGTHS.healthInsuranceNumber
    )
  );
  return errors;
}

/** Normaliza el documento para comparar personas ya cargadas (sin puntos ni espacios). */
export function normalizarDocumento(doc: string): string {
  return doc.replace(/[.\s-]/g, "").trim();
}

/** US-16: fila del listado «Mis turnos». */
export type MiTurnoEstado = "RESERVADO" | "CUMPLIDO" | "AUSENTE" | "CANCELADO";

export type MiTurno = {
  /** Id del turno (reservas vigentes) o de la cancelación (historial). */
  id: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  startTime: string;
  doctorNombre: string;
  aNombreDe: string;
  estado: MiTurnoEstado;
  /** Solo los turnos reservados se pueden cancelar. */
  cancelable: boolean;
  /** Está reservado pero ya no está dentro del plazo de cancelación. */
  fueraDePlazo: boolean;
};

/**
 * Orden del listado: primero los turnos reservados, del más próximo al más
 * lejano; después el resto (historial), del más reciente al más antiguo.
 */
export function ordenarMisTurnos(turnos: MiTurno[]): MiTurno[] {
  const clave = (t: MiTurno) => `${t.fecha} ${t.startTime}`;
  const reservados = turnos
    .filter((t) => t.estado === "RESERVADO")
    .sort((a, b) => clave(a).localeCompare(clave(b)));
  const resto = turnos
    .filter((t) => t.estado !== "RESERVADO")
    .sort((a, b) => clave(b).localeCompare(clave(a)));
  return [...reservados, ...resto];
}
