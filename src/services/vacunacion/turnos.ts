import { db as dbPorDefecto } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCancelacionAntelacion } from "@/lib/configuracion";
import { fechaUtcString } from "@/lib/fecha-utc";
import {
  estaEnPlazoDeCancelacion,
  normalizarDocumento,
  validarPersonaAtendida,
  type PersonaAtendidaErrors,
  type PersonaAtendidaInput,
} from "@/lib/reservas";
import {
  MENSAJE_NO_DISPONIBLE_VACUNACION,
  ahoraEnArgentina,
  motivoNoReservable,
  nombreVacuna,
  validarDosisPrevista,
} from "@/lib/turnos-vacunacion";
import { parseBirthDate } from "@/lib/validation";
import type { CancelacionVacunacionData } from "@/services/notificaciones/turno-vacunacion";

/**
 * Núcleo de negocio del turno de vacunación (US-28), sin autorización ni envío de
 * email: lo invocan las server actions del paciente y del mostrador, y puede
 * invocarlo el mostrador de US-17 (reserva / cancelación / reprogramación =
 * cancelar + reservar). Quien llama es responsable de validar el rol.
 */

export type ReservarVacunacionInput = {
  turnoId: string;
  vacunaId: string;
  /** Dosis que se prevé aplicar (informativa). */
  dosisPrevistaOrden?: number | null;
  /** Usuario registrado a cuyo nombre queda el turno: recibe los emails. */
  titularId: string;
  /** Empleado de mostrador que lo otorga; nulo si lo saca el propio usuario. */
  otorgadoPorId?: string | null;
  /** Ausente = el turno es para el titular. US-64: persona ya cargada o nueva. */
  paraOtraPersona?: { personaId: string } | { nueva: PersonaAtendidaInput };
};

export type ReservarVacunacionResult =
  | { success: true; turnoId: string }
  | {
      success: false;
      code: "NO_DISPONIBLE" | "INVALIDO" | "ERROR";
      message: string;
      personaErrors?: PersonaAtendidaErrors;
    };

/** Cliente de base de datos; se inyecta solo en las pruebas. */
export type DbCliente = typeof dbPorDefecto;

class TurnoNoDisponibleError extends Error {}
class PersonaInexistenteError extends Error {}

export async function reservarTurnoVacunacion(
  input: ReservarVacunacionInput,
  db: DbCliente = dbPorDefecto
): Promise<ReservarVacunacionResult> {
  const turnoId = input.turnoId?.trim();
  if (!turnoId || !input.vacunaId?.trim()) {
    return { success: false, code: "INVALIDO", message: "Turno o vacuna inválidos." };
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

  const [titular, turno, vacuna] = await Promise.all([
    db.user.findUnique({ where: { id: input.titularId }, select: { id: true, isActive: true } }),
    db.turnoVacunacion.findUnique({ where: { id: turnoId } }),
    db.vacuna.findUnique({
      where: { id: input.vacunaId },
      include: { dosis: { select: { orden: true } } },
    }),
  ]);

  if (!titular || !titular.isActive) {
    return { success: false, code: "INVALIDO", message: "El titular del turno no está registrado." };
  }

  const motivo = motivoNoReservable(
    turno ? { status: turno.status, date: fechaUtcString(turno.date), startTime: turno.startTime } : null,
    vacuna,
    ahoraEnArgentina()
  );
  if (motivo === "TURNO_NO_DISPONIBLE") {
    return { success: false, code: "NO_DISPONIBLE", message: MENSAJE_NO_DISPONIBLE_VACUNACION };
  }
  if (motivo === "VACUNA_NO_ASIGNABLE" || !vacuna) {
    return {
      success: false,
      code: "INVALIDO",
      message: "La vacuna elegida no está disponible en el catálogo.",
    };
  }
  const errorDosis = validarDosisPrevista(vacuna.dosis, input.dosisPrevistaOrden);
  if (errorDosis) return { success: false, code: "INVALIDO", message: errorDosis };

  try {
    await db.$transaction(async (tx) => {
      let persona: { id: string; firstName: string; lastName: string } | null = null;

      if (otra && "personaId" in otra) {
        persona = await tx.personaAtendida.findFirst({
          where: { id: otra.personaId, userId: titular.id },
          select: { id: true, firstName: true, lastName: true },
        });
        if (!persona) throw new PersonaInexistenteError();
      } else if (otra && "nueva" in otra) {
        const d = otra.nueva;
        persona = await tx.personaAtendida.create({
          data: {
            userId: titular.id,
            firstName: d.firstName.trim(),
            lastName: d.lastName.trim(),
            docNumber: normalizarDocumento(d.docNumber),
            birthDate: parseBirthDate(d.birthDate.trim())!,
            healthInsuranceEntity: d.healthInsuranceEntity.trim(),
            healthInsurancePlan: d.healthInsurancePlan.trim(),
            healthInsuranceNumber: d.healthInsuranceNumber.trim(),
          },
          select: { id: true, firstName: true, lastName: true },
        });
      }

      // UPDATE condicional sobre el registro del turno (RF-TUR-09): si dos usuarios
      // intentan reservar a la vez, solo uno prospera. Sin verificación de stock.
      const updated = await tx.turnoVacunacion.updateMany({
        where: { id: turnoId, status: "DISPONIBLE" },
        data: {
          status: "RESERVADO",
          vacunaId: vacuna.id,
          dosisPrevistaOrden: input.dosisPrevistaOrden ?? null,
          reservedById: titular.id,
          otorgadoPorId: input.otorgadoPorId ?? null,
          personaAtendidaId: persona?.id ?? null,
          patientFirstName: persona?.firstName ?? null,
          patientLastName: persona?.lastName ?? null,
          reservedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new TurnoNoDisponibleError();
    });
  } catch (error) {
    if (error instanceof TurnoNoDisponibleError) {
      return { success: false, code: "NO_DISPONIBLE", message: MENSAJE_NO_DISPONIBLE_VACUNACION };
    }
    if (error instanceof PersonaInexistenteError) {
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
    console.error("reservarTurnoVacunacion:", error);
    return { success: false, code: "ERROR", message: "No se pudo registrar la reserva. Intentá de nuevo." };
  }

  return { success: true, turnoId };
}

export type CancelarVacunacionInput = {
  turnoId: string;
  /** Quien ejecuta la cancelación (titular o empleado de mostrador). */
  canceladoPorId: string;
  /** Si se indica, el turno debe estar reservado por este titular. */
  soloDelTitularId?: string;
  /** El paciente respeta la antelación mínima; el mostrador puede omitirla. */
  validarPlazo: boolean;
  /** Antelación mínima en horas; por defecto, la configurada por el administrador. */
  antelacionHoras?: number;
};

export type CancelarVacunacionResult =
  | { success: true; aviso: CancelacionVacunacionData }
  | { success: false; code: "FUERA_DE_PLAZO" | "NO_CANCELABLE" | "ERROR"; message: string };

class TurnoNoCancelableError extends Error {}

/**
 * El turno vuelve a DISPONIBLE (reaparece en las búsquedas) y la cancelación queda
 * en `TurnoVacunacionCancelacion`: no se elimina. Devuelve los datos del aviso por
 * email para que quien llama lo envíe.
 */
export async function cancelarTurnoVacunacion(
  input: CancelarVacunacionInput,
  db: DbCliente = dbPorDefecto
): Promise<CancelarVacunacionResult> {
  const id = input.turnoId?.trim();
  const turno = id
    ? await db.turnoVacunacion.findFirst({
        where: {
          id,
          status: "RESERVADO",
          ...(input.soloDelTitularId ? { reservedById: input.soloDelTitularId } : {}),
        },
        include: { reservedBy: true, vacuna: true },
      })
    : null;
  if (!turno || !turno.reservedBy) {
    return { success: false, code: "NO_CANCELABLE", message: "Este turno ya no está reservado a tu nombre." };
  }

  if (input.validarPlazo) {
    const antelacion = input.antelacionHoras ?? (await getCancelacionAntelacion());
    if (!estaEnPlazoDeCancelacion(turno, new Date(), antelacion)) {
      return {
        success: false,
        code: "FUERA_DE_PLAZO",
        message: `Este turno empieza en menos de ${antelacion} horas y ya no puede cancelarse desde esta pantalla. Comunicate con el mostrador si necesitás resolverlo.`,
      };
    }
  }

  const titular = turno.reservedBy;
  const vacunaNombre = turno.vacuna ? nombreVacuna(turno.vacuna) : null;

  try {
    await db.$transaction(async (tx) => {
      const liberado = await tx.turnoVacunacion.updateMany({
        where: { id: turno.id, status: "RESERVADO", reservedById: titular.id },
        data: {
          status: "DISPONIBLE",
          vacunaId: null,
          dosisPrevistaOrden: null,
          reservedById: null,
          otorgadoPorId: null,
          personaAtendidaId: null,
          patientFirstName: null,
          patientLastName: null,
          reservedAt: null,
        },
      });
      if (liberado.count === 0) throw new TurnoNoCancelableError();

      await tx.turnoVacunacionCancelacion.create({
        data: {
          turnoId: turno.id,
          reservedById: titular.id,
          vacunaNombre,
          date: turno.date,
          startTime: turno.startTime,
          endTime: turno.endTime,
          patientFirstName: turno.patientFirstName,
          patientLastName: turno.patientLastName,
          canceladoPorId: input.canceladoPorId,
        },
      });
    });
  } catch (error) {
    if (error instanceof TurnoNoCancelableError) {
      return { success: false, code: "NO_CANCELABLE", message: "Este turno ya no está reservado a tu nombre." };
    }
    console.error("cancelarTurnoVacunacion:", error);
    return { success: false, code: "ERROR", message: "No se pudo cancelar el turno. Intentá de nuevo." };
  }

  return {
    success: true,
    aviso: {
      reservador: { nombre: `${titular.firstName} ${titular.lastName}`, email: titular.email },
      vacunaNombre,
      fecha: turno.date,
      startTime: turno.startTime,
      aNombreDe: turno.patientFirstName
        ? `${turno.patientFirstName} ${turno.patientLastName ?? ""}`.trim()
        : null,
    },
  };
}
