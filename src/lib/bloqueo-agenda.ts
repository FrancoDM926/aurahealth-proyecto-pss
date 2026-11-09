/**
 * US-30: Bloqueo de turnos disponibles de una franja publicada (RF-AGE-06, RF-AGE-09, RF-NOT-02, RN-10).
 * US-22: Aviso por modificación de agenda (RF-NOT-02, RF-AGE-06, RF-AGE-09, RN-10).
 *
 * Criterios de aceptación cubiertos por esta lógica pura:
 * - US-30 (1): El médico selecciona un rango de fechas u horas y confirma el bloqueo indicando el motivo.
 * - US-30 (2): El personal administrativo también puede bloquear franjas a pedido de los médicos.
 * - US-30 (3): Los turnos disponibles del rango dejan de ofrecerse.
 * - US-30 (4): Los turnos ya reservados quedan fuera del bloqueo y no se modifican (RF-AGE-09):
 *              se listan aparte y disparan el aviso a los pacientes afectados.
 * - US-30 (5): El sistema advierte la cantidad de turnos reservados involucrados antes de confirmar.
 * - US-30 (6): El bloqueo puede revertirse mientras no hayan pasado las fechas involucradas.
 * - US-22 (1-4): Identificación de turnos reservados afectados, preservación del turno sin modificar,
 *                contenido del aviso con instrucciones de reprogramación y listado de pacientes a contactar.
 */

import type { EmailStatus, EstadoTurno, Role } from "@/generated/prisma/client";
import { esFechaValida } from "@/lib/agenda-profesional";
import { formatearFechaAr, type InstanteArgentina } from "@/lib/busqueda-turnos";

export const ROLES_AUTORIZADOS_BLOQUEO: Role[] = ["MEDICO", "ADMINISTRATIVO"];
export const MAX_MOTIVO_BLOQUEO = 300;

export type ActorBloqueo = {
  id: string;
  role: Role;
  fullName: string;
};

export type DatosFranjaBloqueoInput = {
  doctorId?: string | null;
  /** "YYYY-MM-DD" */
  dia?: string | null;
  /** "YYYY-MM-DD" opcional (por defecto igual a `dia`) */
  diaHasta?: string | null;
  /** "HH:mm" */
  desde?: string | null;
  /** "HH:mm" */
  hasta?: string | null;
  motivo?: string | null;
};

export type FranjaBloqueoValidada = {
  doctorId: string;
  dia: string;
  diaHasta: string;
  desde: string;
  hasta: string;
  motivo: string;
};

export type TurnoEnFranjaCandidato = {
  id: string;
  doctorId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  status: EstadoTurno;
  bloqueoId?: string | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  reservedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  } | null;
};

export type TurnoLibrePreview = {
  id: string;
  date: string;
  fechaFormateada: string;
  startTime: string;
  endTime: string;
  horario: string;
};

export type TurnoReservadoPreview = {
  id: string;
  date: string;
  fechaFormateada: string;
  startTime: string;
  endTime: string;
  horario: string;
  pacienteNombre: string;
  pacienteEmail: string;
  pacienteTelefono: string | null;
  contactoTexto: string;
  estadoLabel: "Reservado";
};

export type PreviewBloqueoFranja = {
  dia: string;
  diaHasta: string;
  fechaRangoFormateada: string;
  desde: string;
  hasta: string;
  doctorId: string;
  doctorName: string;
  turnosLibres: TurnoLibrePreview[];
  turnosReservados: TurnoReservadoPreview[];
  cantidadLibres: number;
  cantidadReservados: number;
  mensajeAdvertenciaReservados: string;
};

export type PacienteAContactar = {
  id: string;
  turnoId: string;
  pacienteNombre: string;
  pacienteEmail: string;
  pacienteTelefono: string | null;
  contactoTexto: string;
  fechaTurno: string;
  fechaTurnoFormateada: string;
  startTime: string;
  endTime: string;
  turnoAfectadoTexto: string;
  emailStatus: EmailStatus;
  estadoAvisoLabel: "Enviado" | "Pendiente" | "Fallido";
};

export function esHoraValida(hora: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(hora.trim());
  if (!match) return false;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

export function horaAMinutos(hora: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizarHora(hora: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!match) return hora.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function formatearFechaCortaDdMm(fecha: string): string {
  const parts = fecha.split("-");
  if (parts.length !== 3) return fecha;
  return `${parts[2]}/${parts[1]}`;
}

export function formatearRangoFechasAr(dia: string, diaHasta?: string): string {
  const fin = diaHasta && diaHasta.trim() ? diaHasta.trim() : dia;
  if (fin === dia) return formatearFechaAr(dia);
  return `${formatearFechaAr(dia)} al ${formatearFechaAr(fin)}`;
}

export function resolverDatosPacienteReservado(turno: {
  patientFirstName?: string | null;
  patientLastName?: string | null;
  reservedBy?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  } | null;
}): {
  pacienteNombre: string;
  pacienteEmail: string;
  pacienteTelefono: string | null;
  contactoTexto: string;
} {
  const nombreOtraPersona = `${turno.patientFirstName ?? ""} ${turno.patientLastName ?? ""}`.trim();
  const nombreTitular = turno.reservedBy
    ? `${turno.reservedBy.firstName} ${turno.reservedBy.lastName}`.trim()
    : "";

  const pacienteNombre = nombreOtraPersona || nombreTitular || "Paciente reservado";
  const pacienteEmail = turno.reservedBy?.email?.trim() ?? "";
  const pacienteTelefono = turno.reservedBy?.phone?.trim() || null;

  const partesContacto: string[] = [];
  if (pacienteEmail) partesContacto.push(pacienteEmail);
  if (pacienteTelefono) partesContacto.push(pacienteTelefono);

  return {
    pacienteNombre,
    pacienteEmail,
    pacienteTelefono,
    contactoTexto: partesContacto.length > 0 ? partesContacto.join(" · ") : "Sin datos de contacto",
  };
}

/**
 * Determina si un turno cae dentro de la franja de fecha(s) y horario `[desde, hasta]`.
 * Un turno de 30 min `[startTime, endTime]` pertenece a la franja si se superpone
 * con `[desde, hasta]` (es decir, `startTime < hasta` y `endTime > desde`, y en particular
 * todo turno cuyo inicio esté en `[desde, hasta)`).
 */
export function turnoPerteneceAFranja(
  turno: { date: string; startTime: string; endTime: string },
  franja: { dia: string; diaHasta?: string; desde: string; hasta: string }
): boolean {
  const finDia = franja.diaHasta && franja.diaHasta.trim() ? franja.diaHasta.trim() : franja.dia;
  if (turno.date < franja.dia || turno.date > finDia) {
    return false;
  }

  const turnoInicio = horaAMinutos(turno.startTime);
  const turnoFin = horaAMinutos(turno.endTime);
  const franjaInicio = horaAMinutos(franja.desde);
  const franjaFin = horaAMinutos(franja.hasta);

  if (turnoInicio < 0 || turnoFin < 0 || franjaInicio < 0 || franjaFin < 0) {
    return false;
  }

  return turnoInicio >= franjaInicio && turnoFin <= franjaFin;
}

/**
 * US-30 Criterios 3, 4 y 5:
 * Clasifica los turnos de la franja en:
 * - `turnosLibres`: turnos en estado `DISPONIBLE` y sin bloqueo activo (son los que se bloquearán).
 * - `turnosReservados`: turnos en estado `RESERVADO` (quedan fuera del bloqueo, no se modifican,
 *   se listan aparte y disparan el aviso de US-22).
 */
export function clasificarTurnosDeFranja(
  turnos: TurnoEnFranjaCandidato[],
  franja: {
    doctorId: string;
    dia: string;
    diaHasta?: string;
    desde: string;
    hasta: string;
  }
): {
  turnosLibres: TurnoLibrePreview[];
  turnosReservados: TurnoReservadoPreview[];
} {
  const enFranja = turnos
    .filter((t) => t.doctorId === franja.doctorId && turnoPerteneceAFranja(t, franja))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        horaAMinutos(a.startTime) - horaAMinutos(b.startTime)
    );

  const turnosLibres: TurnoLibrePreview[] = [];
  const turnosReservados: TurnoReservadoPreview[] = [];

  for (const t of enFranja) {
    const fechaFormateada = formatearFechaAr(t.date);
    const horario = `${t.startTime} – ${t.endTime}`;

    if (t.status === "DISPONIBLE" && !t.bloqueoId) {
      turnosLibres.push({
        id: t.id,
        date: t.date,
        fechaFormateada,
        startTime: t.startTime,
        endTime: t.endTime,
        horario,
      });
    } else if (t.status === "RESERVADO") {
      const paciente = resolverDatosPacienteReservado(t);
      turnosReservados.push({
        id: t.id,
        date: t.date,
        fechaFormateada,
        startTime: t.startTime,
        endTime: t.endTime,
        horario,
        pacienteNombre: paciente.pacienteNombre,
        pacienteEmail: paciente.pacienteEmail,
        pacienteTelefono: paciente.pacienteTelefono,
        contactoTexto: paciente.contactoTexto,
        estadoLabel: "Reservado",
      });
    }
  }

  return { turnosLibres, turnosReservados };
}

export function construirMensajeAdvertenciaReservados(cantidadReservados: number): string {
  if (cantidadReservados === 0) {
    return "No hay turnos reservados en la franja seleccionada.";
  }
  if (cantidadReservados === 1) {
    return "En la franja hay 1 turno reservado. Queda excluido del bloqueo y se lista aparte para su gestión.";
  }
  return `En la franja hay ${cantidadReservados} turnos reservados. Quedan excluidos del bloqueo y se listan aparte para su gestión.`;
}

export function construirPreviewBloqueoFranja(
  turnos: TurnoEnFranjaCandidato[],
  franja: {
    doctorId: string;
    doctorName: string;
    dia: string;
    diaHasta?: string;
    desde: string;
    hasta: string;
  }
): PreviewBloqueoFranja {
  const diaHasta = franja.diaHasta && franja.diaHasta.trim() ? franja.diaHasta.trim() : franja.dia;
  const { turnosLibres, turnosReservados } = clasificarTurnosDeFranja(turnos, {
    ...franja,
    diaHasta,
  });

  return {
    dia: franja.dia,
    diaHasta,
    fechaRangoFormateada: formatearRangoFechasAr(franja.dia, diaHasta),
    desde: franja.desde,
    hasta: franja.hasta,
    doctorId: franja.doctorId,
    doctorName: franja.doctorName,
    turnosLibres,
    turnosReservados,
    cantidadLibres: turnosLibres.length,
    cantidadReservados: turnosReservados.length,
    mensajeAdvertenciaReservados: construirMensajeAdvertenciaReservados(turnosReservados.length),
  };
}

/**
 * Valida los datos de entrada para previsualizar o confirmar un bloqueo de franja (US-30).
 */
export function validarSolicitudBloqueo(
  input: DatosFranjaBloqueoInput,
  actor: ActorBloqueo,
  ahora: InstanteArgentina,
  opciones: { exigirMotivo?: boolean } = {}
): { ok: true; datos: FranjaBloqueoValidada } | { ok: false; error: string } {
  const exigirMotivo = opciones.exigirMotivo ?? true;

  if (!ROLES_AUTORIZADOS_BLOQUEO.includes(actor.role)) {
    return {
      ok: false,
      error: "Solo un médico o el personal administrativo puede bloquear franjas de agenda.",
    };
  }

  const inputDoctorId = (input.doctorId ?? "").trim();
  let doctorId = inputDoctorId;

  if (actor.role === "MEDICO") {
    if (inputDoctorId && inputDoctorId !== actor.id) {
      return {
        ok: false,
        error: "Un médico solo puede bloquear franjas de su propia agenda.",
      };
    }
    doctorId = actor.id;
  } else if (!doctorId) {
    return {
      ok: false,
      error: "Seleccioná el profesional cuya franja querés bloquear.",
    };
  }

  const dia = (input.dia ?? "").trim();
  const rawDiaHasta = (input.diaHasta ?? "").trim();
  const diaHasta = rawDiaHasta || dia;

  if (!esFechaValida(dia) || !esFechaValida(diaHasta)) {
    return {
      ok: false,
      error: "Ingresá una fecha válida en formato AAAA-MM-DD.",
    };
  }

  if (dia > diaHasta) {
    return {
      ok: false,
      error: "La fecha de inicio no puede ser posterior a la fecha de fin.",
    };
  }

  const desde = normalizarHora(input.desde ?? "");
  const hasta = normalizarHora(input.hasta ?? "");

  if (!esHoraValida(desde) || !esHoraValida(hasta)) {
    return {
      ok: false,
      error: "Ingresá un horario de inicio y fin válidos en formato HH:mm.",
    };
  }

  if (horaAMinutos(desde) >= horaAMinutos(hasta)) {
    return {
      ok: false,
      error: "La hora «Hasta» debe ser posterior a la hora «Desde».",
    };
  }

  // Las fechas involucradas no pueden haber pasado (US-30 Criterio 1 y 6)
  if (dia < ahora.fecha) {
    return {
      ok: false,
      error: "No se puede bloquear una franja de una fecha que ya pasó.",
    };
  }

  if (dia === ahora.fecha && diaHasta === ahora.fecha && horaAMinutos(hasta) <= horaAMinutos(ahora.hora)) {
    return {
      ok: false,
      error: "El horario seleccionado para hoy ya pasó.",
    };
  }

  const motivo = (input.motivo ?? "").trim();
  if (exigirMotivo && !motivo) {
    return {
      ok: false,
      error: "Indicá el motivo del bloqueo (por ejemplo, ausencia o licencia).",
    };
  }

  if (motivo.length > MAX_MOTIVO_BLOQUEO) {
    return {
      ok: false,
      error: `El motivo no puede superar los ${MAX_MOTIVO_BLOQUEO} caracteres.`,
    };
  }

  return {
    ok: true,
    datos: {
      doctorId,
      dia,
      diaHasta,
      desde,
      hasta,
      motivo,
    },
  };
}

/**
 * US-30 Criterio 6:
 * El bloqueo puede revertirse mientras no hayan pasado las fechas involucradas.
 */
export function esBloqueoReversible(
  bloqueo: {
    /** "YYYY-MM-DD" */
    date: string;
    /** "YYYY-MM-DD" */
    dateHasta?: string;
    /** "HH:mm" */
    endTime: string;
    revertedAt?: Date | string | null;
  },
  ahora: InstanteArgentina
): { reversible: boolean; motivoNoReversible: string | null } {
  if (bloqueo.revertedAt) {
    return {
      reversible: false,
      motivoNoReversible: "Este bloqueo ya fue revertido.",
    };
  }

  const finDia = bloqueo.dateHasta && bloqueo.dateHasta.trim() ? bloqueo.dateHasta.trim() : bloqueo.date;

  // Si alguna de las fechas involucradas ya pasó, no puede revertirse.
  if (bloqueo.date < ahora.fecha || finDia < ahora.fecha) {
    return {
      reversible: false,
      motivoNoReversible: "No se puede revertir el bloqueo porque las fechas involucradas ya pasaron.",
    };
  }

  if (
    bloqueo.date === ahora.fecha &&
    finDia === ahora.fecha &&
    horaAMinutos(bloqueo.endTime) <= horaAMinutos(ahora.hora)
  ) {
    return {
      reversible: false,
      motivoNoReversible: "No se puede revertir el bloqueo porque el horario involucrado ya pasó.",
    };
  }

  return {
    reversible: true,
    motivoNoReversible: null,
  };
}

export function etiquetaEstadoAviso(status: EmailStatus): "Enviado" | "Pendiente" | "Fallido" {
  switch (status) {
    case "SENT":
      return "Enviado";
    case "FAILED":
      return "Fallido";
    case "PENDING":
    default:
      return "Pendiente";
  }
}

/**
 * US-22 Criterio 3 y wireframe `wf_aviso_bloqueo.html`:
 * Construye el asunto y el cuerpo del email de aviso que reciben los pacientes
 * cuyos turnos reservados quedaron dentro de una franja bloqueada.
 */
export function construirTextoAvisoBloqueo(params: {
  pacienteNombre: string;
  doctorNombre: string;
  /** "DD/MM/YYYY" o rango "DD/MM/YYYY al DD/MM/YYYY" */
  fechaFranjaTexto: string;
  /** "HH:mm" */
  desde: string;
  /** "HH:mm" */
  hasta: string;
  /** "DD/MM/YYYY" */
  fechaTurno: string;
  /** "DD/MM" (opcional, se infiere de fechaTurno si no viene) */
  fechaTurnoCorta?: string;
  /** "HH:mm" */
  horaTurno: string;
  motivo?: string;
}): { subject: string; bodyText: string } {
  const fechaCorta =
    params.fechaTurnoCorta?.trim() ||
    params.fechaTurno.split("/").slice(0, 2).join("/");

  const subject = `Su turno del ${fechaCorta} se vio afectado por un bloqueo de agenda`;
  const prefijoDoctor = params.doctorNombre.startsWith("Dr")
    ? `el ${params.doctorNombre}`
    : `el Dr. ${params.doctorNombre}`;

  const bodyText = `Estimado/a ${params.pacienteNombre}: ${prefijoDoctor} bloqueó la franja del ${params.fechaFranjaTexto} (${params.desde} a ${params.hasta}). Su turno del ${params.fechaTurno} ${params.horaTurno} no fue modificado. Para reprogramarlo, contacte a la sala.`;

  return { subject, bodyText };
}
