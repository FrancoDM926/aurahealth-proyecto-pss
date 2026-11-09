"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { toFecha } from "@/lib/agenda-profesional";

type ActionResult = { success: boolean; message: string };

export type FichaEntrada = {
  id: string;
  turnoId: string;
  diagnosis: string;
  treatment: string;
  observations: string;
  consultationDate: string;
  consultationTime: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canCorrect: boolean;
};

export type FichaDiagnosticoData = {
  fichaId: string;
  patientKey: string;
  patientName: string;
  doctorName: string;
  turno: {
    id: string;
    date: string;
    startTime: string;
    status: "CUMPLIDO";
  };
  entries: FichaEntrada[];
  canCreateEntry: boolean;
};

function texto(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function patientFromTurno(turno: {
  reservedById: string | null;
  personaAtendidaId: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  reservedBy?: { firstName: string; lastName: string } | null;
  personaAtendida?: { firstName: string; lastName: string } | null;
}) {
  const patientKey = turno.personaAtendidaId
      ? `PERSONA:${turno.personaAtendidaId}`
      : turno.reservedById
        ? `USER:${turno.reservedById}`
        : null;
  const patient = turno.personaAtendida ?? turno.reservedBy;
  const patientName = [
    turno.patientFirstName ?? patient?.firstName,
    turno.patientLastName ?? patient?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { patientKey, patientName };
}

async function getTurnoForDoctor(turnoId: string, doctorId: string) {
  return db.turno.findFirst({
    where: { id: turnoId, doctorId },
    select: {
      id: true,
      doctorId: true,
      date: true,
      startTime: true,
      status: true,
      reservedById: true,
      personaAtendidaId: true,
      patientFirstName: true,
      patientLastName: true,
      reservedBy: { select: { firstName: true, lastName: true } },
      personaAtendida: { select: { firstName: true, lastName: true } },
      doctor: { select: { firstName: true, lastName: true } },
    },
  });
}

function validateFields(input: {
  diagnosis: string;
  treatment: string;
  observations: string;
}): string | null {
  if (!texto(input.diagnosis)) return "El diagnóstico es obligatorio.";
  if (!texto(input.treatment)) return "El tratamiento indicado es obligatorio.";
  if (!texto(input.observations)) return "Las observaciones son obligatorias.";
  return null;
}

export async function obtenerFichaDiagnostico(input: {
  turnoId?: string;
  fichaId?: string;
}): Promise<{ success: true; data: FichaDiagnosticoData } | { success: false; message: string }> {
  let session;
  try {
    session = await assertRoles(["MEDICO"]);
  } catch {
    return { success: false, message: "Solo un médico puede consultar fichas de diagnóstico." };
  }

  try {
    const turnoId = texto(input.turnoId);
    const fichaId = texto(input.fichaId);
    const sourceTurno = turnoId
      ? await getTurnoForDoctor(turnoId, session.profile.id)
      : null;
    if (sourceTurno && sourceTurno.status !== "CUMPLIDO") {
      return { success: false, message: "La ficha solo puede cargarse sobre un turno cumplido del médico." };
    }

    let resolvedFicha = fichaId
      ? await db.fichaDiagnostico.findUnique({
          where: { id: fichaId },
          include: {
            doctor: { select: { firstName: true, lastName: true } },
            entradas: {
              orderBy: [{ consultationDate: "desc" }, { consultationTime: "desc" }],
            },
          },
        })
      : null;

    if (!resolvedFicha && turnoId) {
      if (!sourceTurno || sourceTurno.status !== "CUMPLIDO") {
        return { success: false, message: "La ficha solo puede cargarse sobre un turno cumplido del médico." };
      }
      const patient = patientFromTurno(sourceTurno);
      if (!patient.patientKey || !patient.patientName) {
        return { success: false, message: "El turno no tiene un paciente identificado." };
      }
      resolvedFicha = await db.fichaDiagnostico.findUnique({
        where: {
          doctorId_patientKey: {
            doctorId: session.profile.id,
            patientKey: patient.patientKey,
          },
        },
        include: {
          doctor: { select: { firstName: true, lastName: true } },
          entradas: {
            orderBy: [{ consultationDate: "desc" }, { consultationTime: "desc" }],
          },
        },
      });
    }

    if (!resolvedFicha && !sourceTurno) {
      return { success: false, message: "No se encontró la ficha solicitada." };
    }

    const currentDoctorOwnsTurno = sourceTurno?.doctorId === session.profile.id;
    const today = todayInArgentina();
    const entries = (resolvedFicha?.entradas ?? []).map((entry) => ({
      id: entry.id,
      turnoId: entry.turnoId,
      diagnosis: entry.diagnosis,
      treatment: entry.treatment,
      observations: entry.observations,
      consultationDate: toFecha(entry.consultationDate),
      consultationTime: entry.consultationTime,
      authorName: entry.authorName,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      canEdit: entry.authorId === session.profile.id && toFecha(entry.consultationDate) === today,
      canCorrect: currentDoctorOwnsTurno && toFecha(entry.consultationDate) !== today,
    }));

    const turno = sourceTurno ?? await db.turno.findFirst({
      where: {
        id: entries[0]?.turnoId ?? "",
        doctorId: resolvedFicha?.doctorId ?? session.profile.id,
        status: "CUMPLIDO",
      },
      select: { id: true, date: true, startTime: true, status: true },
    });
    if (!turno) {
      return { success: false, message: "No se encontró una consulta cumplida asociada a la ficha." };
    }

    return {
      success: true,
      data: {
        fichaId: resolvedFicha?.id ?? "",
        patientKey: resolvedFicha?.patientKey ?? patientFromTurno(sourceTurno!).patientKey!,
        patientName: resolvedFicha?.patientName ?? patientFromTurno(sourceTurno!).patientName,
        doctorName: resolvedFicha
          ? `Dr. ${resolvedFicha.doctor.firstName} ${resolvedFicha.doctor.lastName}`
          : `Dr. ${sourceTurno!.doctor.firstName} ${sourceTurno!.doctor.lastName}`,
        turno: { id: turno.id, date: toFecha(turno.date), startTime: turno.startTime, status: "CUMPLIDO" },
        entries,
        canCreateEntry: currentDoctorOwnsTurno,
      },
    };
  } catch (error) {
    console.error("obtenerFichaDiagnostico:", error);
    return { success: false, message: "No se pudo cargar la ficha de diagnóstico." };
  }
}

export async function guardarEntradaDiagnostico(input: {
  turnoId: string;
  diagnosis: string;
  treatment: string;
  observations: string;
  correctionOfId?: string | null;
}): Promise<ActionResult> {
  let session;
  try {
    session = await assertRoles(["MEDICO"]);
  } catch {
    return { success: false, message: "Solo un médico puede registrar diagnósticos." };
  }

  const validation = validateFields(input);
  if (validation) return { success: false, message: validation };

  try {
    const turno = await getTurnoForDoctor(texto(input.turnoId), session.profile.id);
    if (!turno || turno.status !== "CUMPLIDO") {
      return { success: false, message: "La carga requiere un turno cumplido del médico autenticado." };
    }
    const patient = patientFromTurno(turno);
    if (!patient.patientKey || !patient.patientName) {
      return { success: false, message: "El turno no tiene un paciente identificado." };
    }

    const ficha = await db.fichaDiagnostico.upsert({
      where: {
        doctorId_patientKey: {
          doctorId: session.profile.id,
          patientKey: patient.patientKey,
        },
      },
      create: {
        doctorId: session.profile.id,
        patientKey: patient.patientKey,
        patientName: patient.patientName,
      },
      update: { patientName: patient.patientName },
    });

    if (input.correctionOfId) {
      const replaced = await db.fichaDiagnosticoEntrada.findFirst({
        where: { id: input.correctionOfId, fichaId: ficha.id },
        select: { id: true, consultationDate: true },
      });
      if (!replaced) return { success: false, message: "La entrada a corregir no pertenece a esta ficha." };
    } else {
      const original = await db.fichaDiagnosticoEntrada.findFirst({
        where: { fichaId: ficha.id, turnoId: turno.id, replacesEntryId: null },
        select: { id: true },
      });
      if (original) return { success: false, message: "Este turno ya tiene una entrada; las correcciones deben registrarse como una nueva entrada." };
    }

    await db.fichaDiagnosticoEntrada.create({
      data: {
        fichaId: ficha.id,
        turnoId: turno.id,
        authorId: session.profile.id,
        diagnosis: texto(input.diagnosis),
        treatment: texto(input.treatment),
        observations: texto(input.observations),
        consultationDate: turno.date,
        consultationTime: turno.startTime,
        authorName: `Dr. ${session.profile.firstName} ${session.profile.lastName}`,
        replacesEntryId: texto(input.correctionOfId) || null,
      },
    });

    revalidatePath(`/dashboard/ficha-diagnostico`);
    return { success: true, message: "La entrada clínica se guardó correctamente." };
  } catch (error) {
    console.error("guardarEntradaDiagnostico:", error);
    return { success: false, message: "No se pudo guardar la entrada clínica." };
  }
}

export async function editarEntradaDiagnostico(input: {
  entryId: string;
  diagnosis: string;
  treatment: string;
  observations: string;
}): Promise<ActionResult> {
  let session;
  try {
    session = await assertRoles(["MEDICO"]);
  } catch {
    return { success: false, message: "Solo un médico puede editar diagnósticos." };
  }
  const validation = validateFields(input);
  if (validation) return { success: false, message: validation };

  try {
    const entry = await db.fichaDiagnosticoEntrada.findUnique({
      where: { id: texto(input.entryId) },
      select: { authorId: true, consultationDate: true },
    });
    if (!entry) return { success: false, message: "La entrada no existe." };
    if (entry.authorId !== session.profile.id || toFecha(entry.consultationDate) !== todayInArgentina()) {
      return { success: false, message: "Solo el autor puede editar la entrada durante el día de la consulta." };
    }
    await db.fichaDiagnosticoEntrada.update({
      where: { id: texto(input.entryId) },
      data: {
        diagnosis: texto(input.diagnosis),
        treatment: texto(input.treatment),
        observations: texto(input.observations),
      },
    });
    revalidatePath("/dashboard/ficha-diagnostico");
    return { success: true, message: "La entrada clínica se actualizó correctamente." };
  } catch (error) {
    console.error("editarEntradaDiagnostico:", error);
    return { success: false, message: "No se pudo editar la entrada clínica." };
  }
}
