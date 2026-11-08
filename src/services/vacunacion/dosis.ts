import { db as dbPorDefecto } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { evaluarAplicacion, validarMotivoAnulacion } from "@/lib/dosis";
import { nombreVacuna } from "@/lib/turnos-vacunacion";
import type { PacienteRef } from "@/lib/pacientes";

/**
 * Núcleo de negocio del registro de dosis (US-29), sin autorización: las server
 * actions validan que quien llama sea ENFERMERA y pasan su identidad (nunca viene
 * de un campo de entrada).
 */

export type DbCliente = typeof dbPorDefecto;

export type RegistrarDosisInput = {
  enfermera: { id: string; nombre: string };
  paciente: PacienteRef;
  vacunaId: string;
  dosisOrden: number;
  /** Turno de vacunación asociado, si existió. */
  turnoId?: string | null;
};

export type RegistrarDosisResult =
  | { success: true; aplicacionId: string; advertencias: string[] }
  | { success: false; message: string };

class TurnoNoVigenteError extends Error {}

export async function registrarDosis(
  input: RegistrarDosisInput,
  db: DbCliente = dbPorDefecto
): Promise<RegistrarDosisResult> {
  const { paciente } = input;

  // Paciente: usuario registrado o persona atendida (D-15).
  let pacienteNombre: string;
  let pacienteDocumento: string | null;
  if (paciente.tipo === "USER") {
    const u = await db.user.findUnique({ where: { id: paciente.id } });
    if (!u || !u.isActive) return { success: false, message: "El paciente no está registrado." };
    pacienteNombre = `${u.firstName} ${u.lastName}`;
    pacienteDocumento = u.docNumber;
  } else {
    const p = await db.personaAtendida.findUnique({ where: { id: paciente.id } });
    if (!p) return { success: false, message: "La persona no está registrada." };
    pacienteNombre = `${p.firstName} ${p.lastName}`;
    pacienteDocumento = p.docNumber;
  }

  const vacuna = await db.vacuna.findUnique({
    where: { id: input.vacunaId },
    include: { dosis: { orderBy: { orden: "asc" } } },
  });
  if (!vacuna) return { success: false, message: "La vacuna no existe." };

  // Turno asociado (opcional): debe estar reservado a esta persona y ser de esta vacuna.
  let turnoId: string | null = null;
  if (input.turnoId) {
    const turno = await db.turnoVacunacion.findUnique({ where: { id: input.turnoId } });
    const esDelPaciente =
      turno &&
      (paciente.tipo === "USER"
        ? turno.reservedById === paciente.id && turno.personaAtendidaId === null
        : turno.personaAtendidaId === paciente.id);
    if (!turno || turno.status !== "RESERVADO" || !esDelPaciente) {
      return { success: false, message: "El turno elegido ya no está reservado a esta persona." };
    }
    if (turno.vacunaId && turno.vacunaId !== vacuna.id) {
      return { success: false, message: "El turno es de otra vacuna: elegí la vacuna del turno." };
    }
    turnoId = turno.id;
  } else if (!vacuna.isActive) {
    // Sin turno solo se aplican vacunas activas del catálogo (US-24).
    return { success: false, message: "La vacuna está desactivada en el catálogo." };
  }

  const previas = await db.aplicacionDosis.findMany({
    where: {
      vacunaId: vacuna.id,
      estado: "ACTIVA",
      ...(paciente.tipo === "USER" ? { pacienteUserId: paciente.id } : { personaAtendidaId: paciente.id }),
    },
    select: { dosisOrden: true, aplicadaAt: true },
  });
  const evaluacion = evaluarAplicacion({
    esquema: vacuna.dosis,
    dosisOrden: input.dosisOrden,
    aplicacionesActivas: previas,
    ahora: new Date(),
  });
  if (evaluacion.error) return { success: false, message: evaluacion.error };
  const dosis = vacuna.dosis.find((d) => d.orden === input.dosisOrden)!;

  try {
    const creada = await db.$transaction(async (tx) => {
      const aplicacion = await tx.aplicacionDosis.create({
        data: {
          pacienteUserId: paciente.tipo === "USER" ? paciente.id : null,
          personaAtendidaId: paciente.tipo === "PERSONA" ? paciente.id : null,
          pacienteNombre,
          pacienteDocumento,
          vacunaId: vacuna.id,
          vacunaNombre: nombreVacuna(vacuna),
          dosisOrden: dosis.orden,
          dosisEtiqueta: dosis.etiqueta,
          // La enfermera responsable es la del usuario autenticado (criterio de US-29).
          enfermeraId: input.enfermera.id,
          enfermeraNombre: input.enfermera.nombre,
          turnoVacunacionId: turnoId,
        },
        select: { id: true },
      });
      if (turnoId) {
        // La aplicación efectiva cumple el turno (D-12).
        const cumplido = await tx.turnoVacunacion.updateMany({
          where: { id: turnoId, status: "RESERVADO" },
          data: { status: "CUMPLIDO" },
        });
        if (cumplido.count === 0) throw new TurnoNoVigenteError();
      }
      return aplicacion;
    });
    return { success: true, aplicacionId: creada.id, advertencias: evaluacion.advertencias };
  } catch (error) {
    if (error instanceof TurnoNoVigenteError) {
      return { success: false, message: "El turno ya no está reservado: refrescá la pantalla." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        message: "Esa dosis ya está registrada para esta persona (o el turno ya tiene una aplicación).",
      };
    }
    console.error("registrarDosis:", error);
    return { success: false, message: "No se pudo registrar la dosis. Intentá de nuevo." };
  }
}

export type AnularAplicacionResult = { success: true } | { success: false; message: string };

/**
 * Una dosis registrada no se elimina: se anula con motivo y queda en el historial.
 * El turno asociado permanece CUMPLIDO (la asistencia ocurrió, D-13).
 */
export async function anularAplicacion(
  input: { id: string; motivo: string; anuladaPor: { id: string; nombre: string } },
  db: DbCliente = dbPorDefecto
): Promise<AnularAplicacionResult> {
  const errorMotivo = validarMotivoAnulacion(input.motivo);
  if (errorMotivo) return { success: false, message: errorMotivo };

  try {
    const r = await db.aplicacionDosis.updateMany({
      where: { id: input.id, estado: "ACTIVA" },
      data: {
        estado: "ANULADA",
        anuladaAt: new Date(),
        anuladaMotivo: input.motivo.trim(),
        anuladaPorId: input.anuladaPor.id,
        anuladaPorNombre: input.anuladaPor.nombre,
      },
    });
    if (r.count === 0) return { success: false, message: "El registro no existe o ya está anulado." };
    return { success: true };
  } catch (error) {
    console.error("anularAplicacion:", error);
    return { success: false, message: "No se pudo anular el registro. Intentá de nuevo." };
  }
}
