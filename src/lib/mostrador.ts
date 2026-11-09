/**
 * US-17: Gestión de turnos desde mostrador (RF-TUR-06, RF-AGE-09, RN-10).
 *
 * Criterios de aceptación cubiertos:
 * 1. El administrativo busca al paciente por documento, apellido o email.
 * 2. Puede registrar un paciente nuevo desde el mismo flujo si no está en el sistema,
 *    incluyendo su obra social.
 * 3. Puede gestionar turnos de ambos tipos: consulta médica (`Turno`) y vacunación (`TurnoVacunacion`).
 * 4. La reprogramación se resuelve como cancelación del turno original más reserva de uno
 *    nuevo, en una sola operación atendida por el sistema. En ningún caso se edita un turno reservado.
 * 5. El paciente recibe el email correspondiente a la acción realizada.
 * 6. Toda operación queda registrada indicando qué usuario la realizó.
 */

import type { EstadoTurno, MedicalSpecialty, Role } from "@/generated/prisma/client";
import {
  esTurnoFuturo,
  formatearFechaAr,
  type InstanteArgentina,
} from "@/lib/busqueda-turnos";
import {
  ESTADO_TURNO_LABELS,
  efectosEstadoTurno,
  puedeModificarEstadoEnFecha,
} from "@/lib/estado-turno";
import { SPECIALTY_LABELS } from "@/lib/roles";
import {
  parseBirthDate,
  validateCompleteProfileData,
  validateEmailFormat,
} from "@/lib/validation";

export type TipoTurnoMostrador = "MEDICO" | "VACUNACION";

export type TipoOperacionMostrador =
  | "ALTA_PACIENTE"
  | "RESERVA"
  | "REPROGRAMACION"
  | "CANCELACION"
  | "ASISTENCIA";

export const TIPO_OPERACION_LABELS: Record<TipoOperacionMostrador, string> = {
  ALTA_PACIENTE: "Alta de paciente",
  RESERVA: "Reserva de turno",
  REPROGRAMACION: "Reprogramación de turno",
  CANCELACION: "Cancelación de turno",
  ASISTENCIA: "Marca de asistencia",
};

export type FiltrosBusquedaPacienteInput = {
  documento?: string | null;
  apellido?: string | null;
  email?: string | null;
};

export type PacienteMostradorItem = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  docType: string;
  docNumber: string | null;
  email: string;
  phone: string | null;
  coverageType: "OBRA_SOCIAL" | "PARTICULAR";
  healthInsuranceEntity: string | null;
  healthInsurancePlan: string | null;
  healthInsuranceNumber: string | null;
  coberturaLabel: string;
};

export type AltaPacienteMostradorInput = {
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  /** "YYYY-MM-DD" */
  birthDate: string;
  phone: string;
  email: string;
  address?: string;
  coverageType: "OBRA_SOCIAL" | "PARTICULAR";
  healthInsuranceEntity?: string;
  healthInsurancePlan?: string;
  healthInsuranceNumber?: string;
};

export type TurnoDisponibleMostradorItem = {
  id: string;
  tipoTurno: TipoTurnoMostrador;
  /** "YYYY-MM-DD" */
  date: string;
  fechaFormateada: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  profesionalId: string;
  profesionalNombre: string;
  especialidadOVacunatorio: string;
  specialty: MedicalSpecialty | null;
  status?: EstadoTurno;
  bloqueado?: boolean;
};

export type TurnoPacienteMostradorItem = {
  id: string;
  tipoTurno: TipoTurnoMostrador;
  /** "YYYY-MM-DD" */
  date: string;
  fechaFormateada: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  profesionalId: string;
  profesionalNombre: string;
  especialidadOVacunatorio: string;
  status: EstadoTurno;
  estadoLabel: string;
  vacunaId: string | null;
  vacunaNombre: string | null;
  dosisPrevistaOrden?: number | null;
  motivoConsulta: string | null;
  esFuturo: boolean;
  puedeReprogramarOCancelar: boolean;
  puedeMarcarAsistenciaHoy: boolean;
  habilitaPago: boolean;
  pagoId?: string | null;
  comprobanteNumero?: number | null;
};

export type OperacionMostradorAuditoriaItem = {
  id: string;
  tipoOperacion: TipoOperacionMostrador;
  tipoOperacionLabel: string;
  tipoTurno: TipoTurnoMostrador | null;
  pacienteId: string;
  pacienteNombre: string;
  turnoId: string | null;
  turnoOriginalId: string | null;
  detalle: string;
  realizadoPorId: string;
  realizadoPorNombre: string;
  realizadoPorRole: Role;
  fechaHoraFormateada: string;
};

function normalizarSinAcentos(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarDocumento(valor: string): string {
  return valor.replace(/[.\-\s]/g, "").toLowerCase().trim();
}

export function formatearCoberturaPaciente(paciente: {
  coverageType: string;
  healthInsuranceEntity?: string | null;
  healthInsurancePlan?: string | null;
}): string {
  if (
    paciente.coverageType === "OBRA_SOCIAL" &&
    paciente.healthInsuranceEntity &&
    paciente.healthInsuranceEntity.trim()
  ) {
    const entidad = paciente.healthInsuranceEntity.trim();
    const plan = paciente.healthInsurancePlan?.trim();
    return plan ? `${entidad} (${plan})` : entidad;
  }
  return "Particular";
}

export function formatearProfesionalMostrador(prof: {
  firstName: string;
  lastName: string;
  role: Role;
}): string {
  const prefijo = prof.role === "ENFERMERA" ? "Enf." : "Dr.";
  const apellido = prof.lastName === "-" ? "" : ` ${prof.lastName}`;
  return `${prefijo} ${prof.firstName}${apellido}`.trim();
}

export function resolverTipoTurnoPorRol(role: Role): TipoTurnoMostrador {
  return role === "ENFERMERA" ? "VACUNACION" : "MEDICO";
}

/**
 * Criterio 1: Filtra pacientes por documento, apellido o email.
 */
export function filtrarPacientesMostrador(
  pacientes: PacienteMostradorItem[],
  filtros: FiltrosBusquedaPacienteInput
): PacienteMostradorItem[] {
  const docQuery = normalizarDocumento(filtros.documento ?? "");
  const apeQuery = normalizarSinAcentos(filtros.apellido ?? "");
  const emailQuery = (filtros.email ?? "").trim().toLowerCase();

  return pacientes.filter((p) => {
    if (docQuery) {
      const docPaciente = normalizarDocumento(p.docNumber ?? "");
      if (!docPaciente.includes(docQuery)) return false;
    }
    if (apeQuery) {
      const apePaciente = normalizarSinAcentos(p.lastName);
      const fullPaciente = normalizarSinAcentos(p.fullName);
      if (!apePaciente.includes(apeQuery) && !fullPaciente.includes(apeQuery)) {
        return false;
      }
    }
    if (emailQuery) {
      if (!p.email.toLowerCase().includes(emailQuery)) return false;
    }
    return true;
  });
}

/**
 * Criterio 2: Valida los datos para registrar un paciente nuevo desde el mostrador,
 * incluyendo sus datos personales, de contacto y su obra social o particular.
 */
export function validarAltaPacienteMostrador(input: AltaPacienteMostradorInput): {
  valid: boolean;
  errors: Record<string, string>;
  parsedBirthDate: Date | null;
} {
  const errors = validateCompleteProfileData({
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    docType: input.docType || "DNI",
    docNumber: input.docNumber ?? "",
    birthDate: input.birthDate ?? "",
    phone: input.phone ?? "",
    address: input.address,
    coverageType: input.coverageType === "OBRA_SOCIAL" ? "OBRA_SOCIAL" : "PARTICULAR",
    healthInsuranceEntity: input.healthInsuranceEntity,
    healthInsurancePlan: input.healthInsurancePlan || "General",
    healthInsuranceNumber: input.healthInsuranceNumber,
  });

  const emailErr = validateEmailFormat(input.email ?? "");
  if (emailErr) {
    errors.email = emailErr;
  }

  const parsedBirthDate = errors.birthDate ? null : parseBirthDate(input.birthDate ?? "");
  if (!errors.birthDate && !parsedBirthDate) {
    errors.birthDate = "Ingresá una fecha de nacimiento válida.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    parsedBirthDate,
  };
}

/**
 * Criterio 3: Filtra los turnos disponibles en mostrador para cualquiera de los
 * dos tipos de turno (`MEDICO` o `VACUNACION`), especialidad y profesional.
 */
export function filtrarTurnosDisponiblesMostrador(
  turnos: TurnoDisponibleMostradorItem[],
  filtros: {
    tipoTurno: TipoTurnoMostrador;
    specialty?: MedicalSpecialty | "";
    profesionalId?: string;
  },
  ahora: InstanteArgentina
): TurnoDisponibleMostradorItem[] {
  const esp = filtros.specialty || "";
  const profId = (filtros.profesionalId ?? "").trim();

  return turnos
    .filter((t) => {
      if (t.status && t.status !== "DISPONIBLE") return false;
      if (t.bloqueado) return false;
      if (t.tipoTurno !== filtros.tipoTurno) return false;
      if (!esTurnoFuturo(t, ahora)) return false;

      if (filtros.tipoTurno === "MEDICO" && esp && t.specialty !== esp) {
        return false;
      }
      if (filtros.tipoTurno === "MEDICO" && profId && t.profesionalId !== profId) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.profesionalNombre.localeCompare(b.profesionalNombre, "es")
    );
}

/**
 * Clasifica los turnos de un paciente para las secciones del mostrador:
 * - Turnos activos/futuros para reprogramar o cancelar (Sección 3 del wireframe).
 * - Turnos ya ocurridos (del día de hoy o anteriores) para marcar asistencia y pago (Sección 4).
 */
export function construirTurnosPacienteMostrador(
  turnos: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: EstadoTurno;
    doctorId: string;
    doctorFirstName: string;
    doctorLastName: string;
    doctorRole: Role;
    doctorSpecialty: MedicalSpecialty | null;
    tipoTurno?: TipoTurnoMostrador;
    profesionalNombreCustom?: string;
    vacunaId?: string | null;
    vacunaNombre?: string | null;
    dosisPrevistaOrden?: number | null;
    motivoConsulta?: string | null;
    pagoId?: string | null;
    comprobanteNumero?: number | null;
  }>,
  ahora: InstanteArgentina
): {
  turnosParaGestion: TurnoPacienteMostradorItem[];
  turnosAsistenciaYPago: TurnoPacienteMostradorItem[];
} {
  const items: TurnoPacienteMostradorItem[] = turnos.map((t) => {
    const tipoTurno = t.tipoTurno ?? resolverTipoTurnoPorRol(t.doctorRole);
    const profesionalNombre =
      t.profesionalNombreCustom ??
      formatearProfesionalMostrador({
        firstName: t.doctorFirstName,
        lastName: t.doctorLastName,
        role: t.doctorRole,
      });
    const especialidadOVacunatorio =
      tipoTurno === "VACUNACION"
        ? t.vacunaNombre
          ? `Vacunatorio (${t.vacunaNombre})`
          : "Vacunatorio"
        : t.doctorSpecialty
          ? SPECIALTY_LABELS[t.doctorSpecialty]
          : "Consulta médica";

    const futuro = esTurnoFuturo({ date: t.date, startTime: t.startTime }, ahora);
    const puedeModificarFecha = puedeModificarEstadoEnFecha(t.date, ahora.fecha);
    const efectos = efectosEstadoTurno(t.status);

    return {
      id: t.id,
      tipoTurno,
      date: t.date,
      fechaFormateada: formatearFechaAr(t.date),
      startTime: t.startTime,
      endTime: t.endTime,
      profesionalId: t.doctorId,
      profesionalNombre,
      especialidadOVacunatorio,
      status: t.status,
      estadoLabel: ESTADO_TURNO_LABELS[t.status],
      vacunaId: t.vacunaId ?? null,
      vacunaNombre: t.vacunaNombre ?? null,
      dosisPrevistaOrden: t.dosisPrevistaOrden ?? null,
      motivoConsulta: t.motivoConsulta ?? null,
      esFuturo: futuro,
      puedeReprogramarOCancelar: t.status === "RESERVADO",
      // D-12: los turnos de vacunación pasan a CUMPLIDO al registrar la dosis (US-29);
      // desde el mostrador se marca asistencia sobre consultas médicas (y permite cobro US-34/35).
      puedeMarcarAsistenciaHoy:
        tipoTurno === "MEDICO" && t.status === "RESERVADO" && puedeModificarFecha,
      habilitaPago: tipoTurno === "MEDICO" && efectos.habilitaRegistroPago,
      pagoId: t.pagoId ?? null,
      comprobanteNumero: t.comprobanteNumero ?? null,
    };
  });

  const turnosParaGestion = items
    .filter((i) => i.status === "RESERVADO" || i.status === "CANCELADO")
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)
    );

  const turnosAsistenciaYPago = items
    .filter(
      (i) =>
        i.date <= ahora.fecha &&
        (i.status === "RESERVADO" || i.status === "CUMPLIDO" || i.status === "AUSENTE")
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)
    );

  return { turnosParaGestion, turnosAsistenciaYPago };
}

/**
 * Criterio 4: Valida que la reprogramación pueda resolverse como cancelación del
 * turno original más reserva de un turno nuevo distinto, sin editar jamás el turno original.
 */
export function validarReprogramacionMostrador(params: {
  turnoOriginal: {
    id: string;
    status: EstadoTurno;
    reservedById: string | null;
    tipoTurno: TipoTurnoMostrador;
    date: string;
    startTime: string;
    doctorId: string;
  };
  turnoNuevo: {
    id: string;
    status: EstadoTurno;
    bloqueoId?: string | null;
    tipoTurno: TipoTurnoMostrador;
    date: string;
    startTime: string;
    doctorId: string;
  };
  pacienteId: string;
  ahora: InstanteArgentina;
}):
  | {
      ok: true;
      plan: {
        seEditaTurnoOriginal: false;
        cancelacionOriginal: {
          turnoId: string;
          previousStatus: "RESERVADO";
          newStatus: "CANCELADO";
          preservaFechaHoraProfesional: {
            date: string;
            startTime: string;
            doctorId: string;
          };
        };
        reservaNueva: {
          turnoId: string;
          previousStatus: "DISPONIBLE";
          newStatus: "RESERVADO";
          reservedById: string;
        };
      };
    }
  | { ok: false; error: string } {
  const { turnoOriginal, turnoNuevo, pacienteId, ahora } = params;

  if (turnoOriginal.id === turnoNuevo.id) {
    return {
      ok: false,
      error: "Para reprogramar debés elegir un turno nuevo distinto al turno original.",
    };
  }

  if (turnoOriginal.status !== "RESERVADO") {
    return {
      ok: false,
      error: "Solo se puede reprogramar un turno que se encuentre en estado reservado.",
    };
  }

  if (turnoOriginal.reservedById !== pacienteId) {
    return {
      ok: false,
      error: "El turno original no pertenece al paciente seleccionado.",
    };
  }

  if (turnoNuevo.status !== "DISPONIBLE" || turnoNuevo.bloqueoId) {
    return {
      ok: false,
      error: "El nuevo horario elegido ya no está disponible.",
    };
  }

  if (!esTurnoFuturo({ date: turnoNuevo.date, startTime: turnoNuevo.startTime }, ahora)) {
    return {
      ok: false,
      error: "No se puede reprogramar hacia un turno cuyo horario ya pasó.",
    };
  }

  if (turnoOriginal.tipoTurno !== turnoNuevo.tipoTurno) {
    return {
      ok: false,
      error: "El nuevo turno debe ser del mismo tipo (consulta médica o vacunación) que el turno original.",
    };
  }

  return {
    ok: true,
    plan: {
      seEditaTurnoOriginal: false,
      cancelacionOriginal: {
        turnoId: turnoOriginal.id,
        previousStatus: "RESERVADO",
        newStatus: "CANCELADO",
        preservaFechaHoraProfesional: {
          date: turnoOriginal.date,
          startTime: turnoOriginal.startTime,
          doctorId: turnoOriginal.doctorId,
        },
      },
      reservaNueva: {
        turnoId: turnoNuevo.id,
        previousStatus: "DISPONIBLE",
        newStatus: "RESERVADO",
        reservedById: pacienteId,
      },
    },
  };
}
