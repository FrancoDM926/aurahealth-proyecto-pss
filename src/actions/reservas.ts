"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { ahoraEnArgentina, esTurnoFuturo } from "@/lib/busqueda-turnos";
import { getCancelacionAntelacion } from "@/lib/configuracion";
import {
  estaEnPlazoDeCancelacion,
  normalizarDocumento,
  validarMotivoConsulta,
  validarPersonaAtendida,
  type PersonaAtendidaErrors,
  type PersonaAtendidaInput,
} from "@/lib/reservas";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { parseBirthDate } from "@/lib/validation";
import { enviarConfirmacionTurnoMedico } from "@/services/notificaciones/turno-confirmacion";
import { enviarAvisoCancelacionTurno } from "@/services/notificaciones/turno-cancelacion";
import { Prisma } from "@/generated/prisma/client";

/**
 * US-13: reserva de turno con confirmación atómica y control de concurrencia
 * (RF-TUR-09, RNF-05). US-64: la reserva puede ser a nombre de otra persona.
 * US-16: cancelación del turno por el paciente, con liberación del horario.
 */

/** Fecha "YYYY-MM-DD" (UTC) de un `Turno.date`. */
function toUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PATHS_TURNOS = [
  "/dashboard/turnos",
  "/dashboard/reservar",
  "/dashboard/mis-turnos",
  "/dashboard/agenda",
  "/dashboard/estado-turnos",
];

function revalidarTurnos() {
  for (const path of PATHS_TURNOS) revalidatePath(path);
}

export type ReservarTurnoInput = {
  turnoId: string;
  motivoConsulta?: string;
  /**
   * US-64: ausente cuando el turno es para quien reserva. Si es para otra
   * persona, se elige una ya cargada (`personaId`) o se cargan sus datos.
   */
  paraOtraPersona?: { personaId: string } | { nueva: PersonaAtendidaInput };
};

export type ReservarTurnoResult =
  | { success: true }
  | {
      success: false;
      /** NO_DISPONIBLE: otro paciente lo reservó antes o el turno ya no se ofrece. */
      code: "NO_DISPONIBLE" | "INVALIDO" | "SIN_PERMISO" | "ERROR";
      message: string;
      personaErrors?: PersonaAtendidaErrors;
    };

/** Corta la transacción cuando el turno ya no está disponible. */
class TurnoNoDisponibleError extends Error {}

const MENSAJE_NO_DISPONIBLE =
  "Ups — alguien reservó este turno un instante antes que vos. Volvé a los resultados de búsqueda, que ya están actualizados.";

/**
 * US-13: reserva el turno para el usuario autenticado. El pasaje a RESERVADO es
 * un UPDATE condicional sobre el registro del turno: si dos pacientes intentan
 * reservarlo a la vez, solo uno prospera y nunca hay dos reservas activas.
 */
export async function reservarTurnoAction(
  input: ReservarTurnoInput
): Promise<ReservarTurnoResult> {
  let reservador;
  try {
    ({ profile: reservador } = await assertRoles(["USUARIO"]));
  } catch {
    return {
      success: false,
      code: "SIN_PERMISO",
      message: "Solo un usuario registrado puede reservar turnos.",
    };
  }

  const turnoId = input.turnoId?.trim();
  if (!turnoId) {
    return { success: false, code: "INVALIDO", message: "Turno inválido." };
  }

  const motivoConsulta = input.motivoConsulta?.trim() ?? "";
  const errorMotivo = validarMotivoConsulta(motivoConsulta);
  if (errorMotivo) {
    return { success: false, code: "INVALIDO", message: errorMotivo };
  }

  const otra = input.paraOtraPersona;
  if (otra && "nueva" in otra) {
    const personaErrors = validarPersonaAtendida(otra.nueva);
    if (Object.keys(personaErrors).length > 0) {
      return {
        success: false,
        code: "INVALIDO",
        message: "Revisá los datos de la persona atendida.",
        personaErrors,
      };
    }
  }

  const turno = await db.turno.findUnique({
    where: { id: turnoId },
    select: { date: true, startTime: true, status: true, doctor: { select: { isActive: true } } },
  });
  if (
    !turno ||
    turno.status !== "DISPONIBLE" ||
    !turno.doctor.isActive ||
    !esTurnoFuturo(
      { date: toUtcDateString(turno.date), startTime: turno.startTime },
      ahoraEnArgentina()
    )
  ) {
    return { success: false, code: "NO_DISPONIBLE", message: MENSAJE_NO_DISPONIBLE };
  }

  try {
    await db.$transaction(async (tx) => {
      let persona: { id: string; firstName: string; lastName: string } | null = null;

      if (otra && "personaId" in otra) {
        persona = await tx.personaAtendida.findFirst({
          where: { id: otra.personaId, userId: reservador.id },
          select: { id: true, firstName: true, lastName: true },
        });
        if (!persona) throw new Error("PERSONA_INEXISTENTE");
      } else if (otra && "nueva" in otra) {
        const datos = otra.nueva;
        persona = await tx.personaAtendida.create({
          data: {
            userId: reservador.id,
            firstName: datos.firstName.trim(),
            lastName: datos.lastName.trim(),
            docNumber: normalizarDocumento(datos.docNumber),
            birthDate: parseBirthDate(datos.birthDate.trim())!,
            healthInsuranceEntity: datos.healthInsuranceEntity.trim(),
            healthInsurancePlan: datos.healthInsurancePlan.trim(),
            healthInsuranceNumber: datos.healthInsuranceNumber.trim(),
          },
          select: { id: true, firstName: true, lastName: true },
        });
      }

      const updated = await tx.turno.updateMany({
        where: { id: turnoId, status: "DISPONIBLE" },
        data: {
          status: "RESERVADO",
          reservedById: reservador.id,
          personaAtendidaId: persona?.id ?? null,
          patientFirstName: persona?.firstName ?? null,
          patientLastName: persona?.lastName ?? null,
          motivoConsulta: motivoConsulta.length > 0 ? motivoConsulta : null,
          reservedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new TurnoNoDisponibleError();
    });
  } catch (error) {
    if (error instanceof TurnoNoDisponibleError) {
      revalidarTurnos();
      return { success: false, code: "NO_DISPONIBLE", message: MENSAJE_NO_DISPONIBLE };
    }
    if (error instanceof Error && error.message === "PERSONA_INEXISTENTE") {
      return {
        success: false,
        code: "INVALIDO",
        message: "La persona elegida no existe. Volvé a elegirla del listado.",
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        code: "INVALIDO",
        message: "Ya cargaste una persona con ese documento: elegila del listado.",
        personaErrors: { docNumber: "Ya cargaste una persona con este documento." },
      };
    }
    console.error("reservarTurnoAction:", error);
    return { success: false, code: "ERROR", message: "No se pudo registrar la reserva. Intentá de nuevo." };
  }

  // US-14: confirmación por email dentro del minuto, sin bloquear la respuesta.
  after(() => enviarConfirmacionTurnoMedico(turnoId));

  revalidarTurnos();
  return { success: true };
}

export type CancelarTurnoResult =
  | { success: true }
  | { success: false; code: "FUERA_DE_PLAZO" | "NO_CANCELABLE" | "SIN_PERMISO" | "ERROR"; message: string };

/** Corta la transacción cuando el turno ya no está reservado por este usuario. */
class TurnoNoCancelableError extends Error {}

/**
 * US-16: el usuario cancela un turno que reservó (propio o a nombre de otra
 * persona). El horario vuelve a DISPONIBLE y la cancelación queda en el
 * historial (TurnoCancelacion): no se elimina.
 */
export async function cancelarTurnoAction(turnoId: string): Promise<CancelarTurnoResult> {
  let usuario;
  try {
    ({ profile: usuario } = await assertRoles(["USUARIO"]));
  } catch {
    return { success: false, code: "SIN_PERMISO", message: "No tenés permisos para esta acción." };
  }

  const id = turnoId?.trim();
  if (!id) {
    return { success: false, code: "NO_CANCELABLE", message: "Turno inválido." };
  }

  const turno = await db.turno.findFirst({
    where: { id, reservedById: usuario.id, status: "RESERVADO" },
    include: { doctor: { select: { firstName: true, lastName: true, specialty: true } } },
  });
  if (!turno) {
    return {
      success: false,
      code: "NO_CANCELABLE",
      message: "Este turno ya no está reservado a tu nombre.",
    };
  }

  const antelacion = await getCancelacionAntelacion();
  if (!estaEnPlazoDeCancelacion(turno, new Date(), antelacion)) {
    return {
      success: false,
      code: "FUERA_DE_PLAZO",
      message: `Este turno empieza en menos de ${antelacion} horas y ya no puede cancelarse desde esta pantalla. Comunicate con el mostrador si necesitás resolverlo.`,
    };
  }

  const doctorNombre = `Dr. ${turno.doctor.firstName} ${turno.doctor.lastName}`;

  try {
    await db.$transaction(async (tx) => {
      // Libera el horario solo si sigue reservado por este usuario.
      const liberado = await tx.turno.updateMany({
        where: { id, reservedById: usuario.id, status: "RESERVADO" },
        data: {
          status: "DISPONIBLE",
          reservedById: null,
          personaAtendidaId: null,
          patientFirstName: null,
          patientLastName: null,
          motivoConsulta: null,
          reservedAt: null,
          // US-15: la próxima reserva del horario vuelve a tener su recordatorio.
          recordatorioEstado: "PENDIENTE",
          recordatorioEnviadoAt: null,
          recordatorioIntentos: 0,
          recordatorioUltimoError: null,
          recordatorioEmailLogId: null,
        },
      });
      if (liberado.count === 0) throw new TurnoNoCancelableError();

      await tx.turnoCancelacion.create({
        data: {
          turnoId: id,
          reservedById: usuario.id,
          doctorNombre,
          date: turno.date,
          startTime: turno.startTime,
          endTime: turno.endTime,
          patientFirstName: turno.patientFirstName,
          patientLastName: turno.patientLastName,
        },
      });
    });
  } catch (error) {
    if (error instanceof TurnoNoCancelableError) {
      return {
        success: false,
        code: "NO_CANCELABLE",
        message: "Este turno ya no está reservado a tu nombre.",
      };
    }
    console.error("cancelarTurnoAction:", error);
    return { success: false, code: "ERROR", message: "No se pudo cancelar el turno. Intentá de nuevo." };
  }

  after(() =>
    enviarAvisoCancelacionTurno({
      reservador: { nombre: `${usuario.firstName} ${usuario.lastName}`, email: usuario.email },
      doctorNombre,
      especialidad: turno.doctor.specialty
        ? SPECIALTY_LABELS[turno.doctor.specialty]
        : "Consulta médica",
      fecha: turno.date,
      startTime: turno.startTime,
    })
  );

  revalidarTurnos();
  return { success: true };
}
