"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { fechaArgentina, horaArgentina, type DosisEsquema } from "@/lib/dosis";
import { fechaUtcString } from "@/lib/fecha-utc";
import { esPacienteRefValido, type PacienteRef } from "@/lib/pacientes";
import { nombreVacuna } from "@/lib/turnos-vacunacion";
import { anularAplicacion, registrarDosis } from "@/services/vacunacion/dosis";

/**
 * US-29 — Registro de dosis aplicada. Solo enfermería; la enfermera responsable sale
 * de la sesión (Clerk + perfil), nunca de un parámetro.
 */

const SOLO_ENFERMERIA = "Solo el personal de enfermería registra dosis aplicadas.";

function revalidar() {
  revalidatePath("/dashboard/dosis-aplicadas");
  revalidatePath("/dashboard/carnet");
  revalidatePath("/dashboard/mis-turnos");
}

export type VacunaConEsquema = { id: string; nombre: string; activa: boolean; dosis: DosisEsquema[] };

export type TurnoDelPaciente = {
  id: string;
  fecha: string;
  startTime: string;
  vacunaId: string | null;
  vacunaNombre: string | null;
  dosisPrevistaOrden: number | null;
};

export type AplicacionPrevia = { vacunaId: string; dosisOrden: number; aplicadaAt: string };

export type ContextoPaciente = {
  vacunas: VacunaConEsquema[];
  turnos: TurnoDelPaciente[];
  /** Aplicaciones ACTIVAS del paciente (para advertir sobre intervalos y duplicados). */
  aplicaciones: AplicacionPrevia[];
};

/** Datos para registrar una dosis a un paciente: vacunas, turnos reservados y dosis ya aplicadas. */
export async function obtenerContextoPacienteAction(
  paciente: PacienteRef
): Promise<ContextoPaciente | null> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return null;
  }
  if (!esPacienteRefValido(paciente)) return null;

  const esUser = paciente.tipo === "USER";
  const [turnos, aplicaciones, activas] = await Promise.all([
    db.turnoVacunacion.findMany({
      where: {
        status: "RESERVADO",
        ...(esUser ? { reservedById: paciente.id, personaAtendidaId: null } : { personaAtendidaId: paciente.id }),
      },
      include: { vacuna: { select: { denominacion: true, laboratorio: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.aplicacionDosis.findMany({
      where: { estado: "ACTIVA", ...(esUser ? { pacienteUserId: paciente.id } : { personaAtendidaId: paciente.id }) },
      select: { vacunaId: true, dosisOrden: true, aplicadaAt: true },
    }),
    db.vacuna.findMany({
      where: { isActive: true },
      include: { dosis: { orderBy: { orden: "asc" } } },
      orderBy: [{ denominacion: "asc" }, { laboratorio: "asc" }],
    }),
  ]);

  // Una vacuna desactivada después de reservar el turno sigue siendo aplicable a ese turno.
  const idsActivas = new Set(activas.map((v) => v.id));
  const faltantes = [...new Set(turnos.map((t) => t.vacunaId).filter((id): id is string => !!id && !idsActivas.has(id)))];
  const extra = faltantes.length
    ? await db.vacuna.findMany({ where: { id: { in: faltantes } }, include: { dosis: { orderBy: { orden: "asc" } } } })
    : [];

  return {
    vacunas: [...activas, ...extra].map((v) => ({
      id: v.id,
      nombre: nombreVacuna(v),
      activa: v.isActive,
      dosis: v.dosis.map((d) => ({ orden: d.orden, etiqueta: d.etiqueta, diasDesdeAnterior: d.diasDesdeAnterior })),
    })),
    turnos: turnos.map((t) => ({
      id: t.id,
      fecha: fechaUtcString(t.date),
      startTime: t.startTime,
      vacunaId: t.vacunaId,
      vacunaNombre: t.vacuna ? nombreVacuna(t.vacuna) : null,
      dosisPrevistaOrden: t.dosisPrevistaOrden,
    })),
    aplicaciones: aplicaciones.map((a) => ({
      vacunaId: a.vacunaId,
      dosisOrden: a.dosisOrden,
      aplicadaAt: a.aplicadaAt.toISOString(),
    })),
  };
}

export type RegistrarDosisActionResult =
  | { success: true; message: string; advertencias: string[] }
  | { success: false; message: string };

export async function registrarDosisAction(input: {
  paciente: PacienteRef;
  vacunaId: string;
  dosisOrden: number;
  turnoId?: string | null;
}): Promise<RegistrarDosisActionResult> {
  let sesion;
  try {
    sesion = await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }
  if (!esPacienteRefValido(input.paciente) || !input.vacunaId || !Number.isInteger(input.dosisOrden)) {
    return { success: false, message: "Completá paciente, vacuna y dosis." };
  }

  const r = await registrarDosis({
    enfermera: { id: sesion.profile.id, nombre: `${sesion.profile.firstName} ${sesion.profile.lastName}` },
    paciente: input.paciente,
    vacunaId: input.vacunaId,
    dosisOrden: input.dosisOrden,
    turnoId: input.turnoId ?? null,
  });
  if (!r.success) return r;

  revalidar();
  return { success: true, message: "Dosis registrada.", advertencias: r.advertencias };
}

export async function anularAplicacionAction(input: {
  id: string;
  motivo: string;
}): Promise<{ success: boolean; message: string }> {
  let sesion;
  try {
    sesion = await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }
  const r = await anularAplicacion({
    id: input.id,
    motivo: input.motivo,
    anuladaPor: { id: sesion.profile.id, nombre: `${sesion.profile.firstName} ${sesion.profile.lastName}` },
  });
  if (!r.success) return r;
  revalidar();
  return { success: true, message: "Registro anulado. Queda en el historial de la persona." };
}

export type AplicacionListada = {
  id: string;
  fecha: string;
  hora: string;
  pacienteNombre: string;
  pacienteDocumento: string | null;
  vacunaNombre: string;
  dosisEtiqueta: string;
  enfermeraNombre: string;
  conTurno: boolean;
  anulada: boolean;
  anuladaMotivo: string | null;
  anuladaPorNombre: string | null;
};

/** Últimas aplicaciones registradas (activas y anuladas), de la más reciente a la más antigua. */
export async function listarAplicacionesAction(): Promise<AplicacionListada[]> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return [];
  }
  const filas = await db.aplicacionDosis.findMany({ orderBy: { aplicadaAt: "desc" }, take: 50 });
  return filas.map((a) => ({
    id: a.id,
    fecha: fechaArgentina(a.aplicadaAt),
    hora: horaArgentina(a.aplicadaAt),
    pacienteNombre: a.pacienteNombre,
    pacienteDocumento: a.pacienteDocumento,
    vacunaNombre: a.vacunaNombre,
    dosisEtiqueta: a.dosisEtiqueta,
    enfermeraNombre: a.enfermeraNombre,
    conTurno: a.turnoVacunacionId !== null,
    anulada: a.estado === "ANULADA",
    anuladaMotivo: a.anuladaMotivo,
    anuladaPorNombre: a.anuladaPorNombre,
  }));
}
