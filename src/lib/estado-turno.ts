/**
 * US-18: Registro del estado del turno (RF-TUR-07).
 *
 * Criterios de aceptación:
 * 1. Los estados posibles son reservado, cumplido, ausente y cancelado.
 * 2. El estado solo puede modificarse el día del turno o posteriormente; el
 *    cambio de estado no constituye una modificación de la reserva en los
 *    términos de RF-AGE-09.
 * 3. Un turno cumplido habilita la carga de la ficha de diagnóstico y el
 *    registro del pago.
 * 4. El sistema deja constancia de quién cambió el estado y cuándo.
 */

import type { EstadoTurno, Role } from "@/generated/prisma/client";
import { ROLE_LABELS } from "@/lib/roles";

export const ESTADOS_TURNO_US18: EstadoTurno[] = [
  "RESERVADO",
  "CUMPLIDO",
  "AUSENTE",
  "CANCELADO",
];

export const ESTADOS_REGISTRO_ASISTENCIA: EstadoTurno[] = [
  "CUMPLIDO",
  "AUSENTE",
  "CANCELADO",
];

export const ROLES_AUTORIZADOS_ESTADO_TURNO: Role[] = [
  "MEDICO",
  "ADMINISTRATIVO",
];

export const ESTADO_TURNO_LABELS: Record<EstadoTurno, string> = {
  DISPONIBLE: "Disponible",
  RESERVADO: "Reservado",
  CUMPLIDO: "Cumplido",
  AUSENTE: "Ausente",
  CANCELADO: "Cancelado",
};

export type EfectosEstadoTurno = {
  /** US-39: habilita la carga de la ficha de diagnóstico del paciente. */
  habilitaFichaDiagnostico: boolean;
  /** US-35: habilita el registro del pago en efectivo o por transferencia. */
  habilitaRegistroPago: boolean;
  /** RF-AGE-09: el cambio de estado no modifica los datos de la reserva original. */
  modificaReservaOriginal: false;
};

/**
 * Criterio 3: Un turno cumplido habilita la carga de la ficha de diagnóstico
 * (US-39) y el registro del pago (US-35). Ningún otro estado los habilita.
 */
export function efectosEstadoTurno(status: EstadoTurno): EfectosEstadoTurno {
  const esCumplido = status === "CUMPLIDO";
  return {
    habilitaFichaDiagnostico: esCumplido,
    habilitaRegistroPago: esCumplido,
    modificaReservaOriginal: false,
  };
}

/**
 * Criterio 2: El estado solo puede modificarse el día del turno o posteriormente
 * (fechaTurno <= hoy en hora de Argentina).
 */
export function puedeModificarEstadoEnFecha(
  fechaTurno: string,
  hoyArgentina: string
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTurno) || !/^\d{4}-\d{2}-\d{2}$/.test(hoyArgentina)) {
    return false;
  }
  return fechaTurno <= hoyArgentina;
}

export function esEstadoDestinoValido(valor: unknown): valor is EstadoTurno {
  return (
    typeof valor === "string" &&
    (ESTADOS_REGISTRO_ASISTENCIA as string[]).includes(valor)
  );
}

export type ValidacionCambioEstadoInput = {
  turno: {
    id: string;
    doctorId: string;
    /** "YYYY-MM-DD" */
    date: string;
    status: EstadoTurno;
  };
  nuevoEstado: unknown;
  actor: {
    id: string;
    role: Role;
  };
  /** "YYYY-MM-DD" en huso horario de Argentina */
  hoyArgentina: string;
};

export type ValidacionCambioEstadoResult =
  | { valid: true; nuevoEstado: EstadoTurno }
  | { valid: false; error: string };

/**
 * Valida todas las reglas de negocio de US-18 antes de persistir el cambio de estado:
 * - Rol autorizado: únicamente MEDICO o ADMINISTRATIVO (RNF-03).
 * - Si es MEDICO, solo puede modificar el estado de sus propios turnos.
 * - El turno debe estar en estado RESERVADO.
 * - El estado destino debe ser válido (CUMPLIDO, AUSENTE o CANCELADO).
 * - La fecha del turno debe ser hoy o anterior (Criterio 2).
 */
export function validarCambioEstadoTurno(
  input: ValidacionCambioEstadoInput
): ValidacionCambioEstadoResult {
  const { turno, nuevoEstado, actor, hoyArgentina } = input;

  if (!ROLES_AUTORIZADOS_ESTADO_TURNO.includes(actor.role)) {
    return {
      valid: false,
      error: "Solo un médico o personal administrativo puede registrar el estado del turno.",
    };
  }

  if (actor.role === "MEDICO" && turno.doctorId !== actor.id) {
    return {
      valid: false,
      error: "Un médico solo puede registrar el estado de los turnos de su propia agenda.",
    };
  }

  if (!esEstadoDestinoValido(nuevoEstado)) {
    return {
      valid: false,
      error: "El estado seleccionado no es válido. Los valores admitidos son cumplido, ausente o cancelado.",
    };
  }

  if (turno.status === "DISPONIBLE") {
    return {
      valid: false,
      error: "No se puede registrar asistencia sobre un turno disponible sin reserva.",
    };
  }

  if (turno.status !== "RESERVADO") {
    return {
      valid: false,
      error: `El turno ya fue registrado como ${ESTADO_TURNO_LABELS[turno.status].toLowerCase()}.`,
    };
  }

  if (!puedeModificarEstadoEnFecha(turno.date, hoyArgentina)) {
    return {
      valid: false,
      error: "El estado del turno solo puede modificarse el día del turno o posteriormente.",
    };
  }

  return {
    valid: true,
    nuevoEstado,
  };
}

/**
 * Criterio 4: Formatea el nombre del usuario que realizó el cambio de estado
 * siguiendo el formato del wireframe:
 * - Médico: "Dr. Carlos Méndez"
 * - Administrativo: "Ana López (Administrativo)"
 */
export function formatearAutorCambioEstado(actor: {
  firstName: string;
  lastName: string;
  role: Role;
}): string {
  const nombreCompleto = `${actor.firstName} ${actor.lastName}`.trim();
  if (actor.role === "MEDICO") {
    return `Dr. ${nombreCompleto}`;
  }
  return `${nombreCompleto} (${ROLE_LABELS[actor.role]})`;
}

/**
 * Formatea la fecha y hora de auditoría en huso horario de Argentina
 * como "DD/MM/YYYY HH:mm" (ej.: "01/10/2026 09:05" en el wireframe).
 */
export function formatearFechaHoraAuditoriaAr(fecha: Date): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");

  return `${get("day").padStart(2, "0")}/${get("month").padStart(2, "0")}/${get("year")} ${hour}:${minute}`;
}

/**
 * Resuelve el nombre del paciente a mostrar para un turno reservado:
 * prioriza los datos de la persona atendida (patientFirstName/patientLastName)
 * y cae al usuario titular que reservó (reservedBy).
 */
export function resolverNombrePacienteTurno(turno: {
  status: EstadoTurno;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  reservedBy?: { firstName: string; lastName: string } | null;
}): string {
  if (turno.status === "DISPONIBLE") return "—";
  const nombrePaciente = `${turno.patientFirstName ?? ""} ${turno.patientLastName ?? ""}`.trim();
  if (nombrePaciente) return nombrePaciente;
  if (turno.reservedBy) {
    const titular = `${turno.reservedBy.firstName} ${turno.reservedBy.lastName}`.trim();
    if (titular) return titular;
  }
  return "Paciente reservado";
}
