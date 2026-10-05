"use server";

import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  FranjaInput,
  generateTurnosFromFranjasList,
  filterTurnosForIdempotency,
  FranjaPreview,
  GenerationSummary,
} from "@/lib/turno-generator";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { loadSession } from "@/lib/auth-session";

export type AgendaPreviewData = {
  doctorId: string;
  doctorName: string;
  specialty: string;
  month: number;
  year: number;
  monthLabel: string;
  summary: GenerationSummary;
  previews: FranjaPreview[];
  franjasRaw: FranjaInput[];
  alreadyGenerated: boolean;
  existingTurnosCount: number;
  isFromPersistedAvailability: boolean;
};

export type GenerateTurnosResult = {
  success: boolean;
  message: string;
  createdCount: number;
  existingCount: number;
  totalSlots: number;
  turnos?: Array<{
    id?: string;
    startTime: string;
    endTime: string;
    date: string;
    status: string;
  }>;
};

// Franjas de referencia basadas en el wireframe wf_agenda_generada.html
// 8 jornadas configuradas que generan exactamente 96 turnos de 30 minutos (RN-09)
// y validan entre 2 y 7 jornadas semanales (RN-02).
const WIREFRAME_DEFAULT_FRANJAS: FranjaInput[] = [
  {
    id: "franja-1",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-02",
    startTime: "08:00",
    endTime: "13:00", // 5h = 10 turnos
  },
  {
    id: "franja-2",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-04",
    startTime: "08:00",
    endTime: "15:00", // 7h = 14 turnos
  },
  {
    id: "franja-3",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-09",
    startTime: "14:00",
    endTime: "19:00", // 5h = 10 turnos
  },
  {
    id: "franja-4",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-11",
    startTime: "08:00",
    endTime: "13:00", // 5h = 10 turnos
  },
  {
    id: "franja-5",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-16",
    startTime: "08:00",
    endTime: "15:00", // 7h = 14 turnos
  },
  {
    id: "franja-6",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-18",
    startTime: "14:00",
    endTime: "20:00", // 6h = 12 turnos
  },
  {
    id: "franja-7",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-23",
    startTime: "08:00",
    endTime: "15:00", // 7h = 14 turnos
  },
  {
    id: "franja-8",
    doctorId: "medico-carlos-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "Clínica médica",
    date: "2026-09-25",
    startTime: "08:00",
    endTime: "14:00", // 6h = 12 turnos
  },
]; // Total: 10 + 14 + 10 + 10 + 14 + 12 + 14 + 12 = 96 turnos

function formatUtcDateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Obtiene la previsualización de la agenda a generar (US-08) consumiendo
 * la disponibilidad mensual persistida por US-06 (MonthlyAvailability / AvailabilityJornada).
 */
export async function getAgendaGeneradaPreview(params?: {
  doctorId?: string;
  month?: number;
  year?: number;
}): Promise<AgendaPreviewData> {
  const now = new Date();
  const month = params?.month ?? 9;
  const year = params?.year ?? 2026;

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const monthLabel = `${monthNames[month - 1]} ${year}`;

  let doctorId = params?.doctorId;
  let doctorName = "Dr. Carlos Méndez";
  let specialty = "Clínica médica";
  let franjasToProcess: FranjaInput[] = WIREFRAME_DEFAULT_FRANJAS;
  let existingTurnosCount = 0;
  let isFromPersistedAvailability = false;

  try {
    const sessionResult = await loadSession();
    if (sessionResult.ok) {
      const { profile } = sessionResult.context;
      doctorId = profile.id;
      doctorName = `Dr. ${profile.firstName} ${profile.lastName}`;
      if (profile.specialty) {
        specialty = SPECIALTY_LABELS[profile.specialty] || specialty;
      }

      // Buscar disponibilidad mensual guardada por US-06
      const persistedAvailability = await db.monthlyAvailability.findUnique({
        where: {
          userId_year_month: {
            userId: profile.id,
            year,
            month,
          },
        },
        include: {
          jornadas: {
            orderBy: { date: "asc" },
          },
        },
      });

      if (persistedAvailability && persistedAvailability.jornadas.length > 0) {
        isFromPersistedAvailability = true;
        franjasToProcess = persistedAvailability.jornadas.map((j) => ({
          id: j.id,
          doctorId: profile.id,
          doctorName,
          specialty,
          date: formatUtcDateString(j.date),
          startTime: j.startTime,
          endTime: j.endTime,
        }));
      }

      // Contar turnos ya generados en BD para este médico y mes
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

      existingTurnosCount = await db.turno.count({
        where: {
          doctorId: profile.id,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    }
  } catch (error) {
    console.warn("Aviso en previsualización de turnos:", error);
  }

  // Generar la previsualización según RN-09 y criterios de US-08
  const { previews, summary } = generateTurnosFromFranjasList(franjasToProcess);

  return {
    doctorId: doctorId || "medico-carlos-mendez",
    doctorName,
    specialty,
    month,
    year,
    monthLabel,
    summary,
    previews,
    franjasRaw: franjasToProcess,
    alreadyGenerated: existingTurnosCount > 0,
    existingTurnosCount,
    isFromPersistedAvailability,
  };
}

/**
 * US-08: Acción de servidor para generar automáticamente los turnos de 30 minutos.
 * Cumple con los 5 Criterios de Aceptación:
 * 1. Genera un turno por cada intervalo consecutivo de 30 minutos dentro de la franja.
 * 2. Duración fija de 30 minutos para todas las consultas y especialidades (no configurable).
 * 3. Un remanente menor a 30 minutos no genera turno.
 * 4. Cada turno queda en estado disponible (DISPONIBLE), asociado al médico, fecha y hora.
 * 5. Generación idempotente: reconfirmar no duplica turnos.
 */
export async function generateTurnosAction(input: {
  doctorId: string;
  franjas: FranjaInput[];
  month: number;
  year: number;
}): Promise<GenerateTurnosResult> {
  if (!input.franjas || input.franjas.length === 0) {
    return {
      success: false,
      message: "No hay franjas horarias cargadas para generar turnos.",
      createdCount: 0,
      existingCount: 0,
      totalSlots: 0,
    };
  }

  // 1. Ejecutar el generador puro de US-08
  const { turnos } = generateTurnosFromFranjasList(input.franjas);

  try {
    let finalDoctorId = input.doctorId;

    // Obtener sesión activa si existe
    const session = await loadSession();
    if (session.ok) {
      finalDoctorId = session.context.profile.id;
    } else {
      // Si el doctorId no existe en BD (ej. usuario demo), buscar primer médico
      const existingDoctor = await db.user.findUnique({
        where: { id: finalDoctorId },
      });

      if (!existingDoctor) {
        const firstDoctor = await db.user.findFirst({
          where: { role: "MEDICO" },
        });

        if (firstDoctor) {
          finalDoctorId = firstDoctor.id;
        } else {
          // Crear médico de demostración
          const demoDoc = await db.user.create({
            data: {
              clerkUserId: `demo_doc_${Date.now()}`,
              email: "carlos.mendez@aurahealth.com",
              firstName: "Carlos",
              lastName: "Méndez",
              docNumber: "20123456",
              birthDate: new Date("1980-05-15"),
              phone: "011-4567-8900",
              role: "MEDICO",
              specialty: "CLINICA_MEDICA",
            },
          });
          finalDoctorId = demoDoc.id;
        }
      }
    }

    const turnosWithDoc = turnos.map((t) => ({
      ...t,
      doctorId: finalDoctorId,
    }));

    // Criterio 5: Idempotencia en BD. Consultar turnos ya existentes
    const dates = turnosWithDoc.map((t) => t.date);
    const existingTurnosInDb = await db.turno.findMany({
      where: {
        doctorId: finalDoctorId,
        date: { in: dates },
      },
      select: {
        doctorId: true,
        date: true,
        startTime: true,
      },
    });

    const existingKeys = new Set(
      existingTurnosInDb.map(
        (t) =>
          `${t.doctorId}_${t.date.toISOString().split("T")[0]}_${t.startTime}`
      )
    );

    const { toCreate, existingCount } = filterTurnosForIdempotency(
      turnosWithDoc,
      existingKeys
    );

    let createdCount = 0;
    if (toCreate.length > 0) {
      const createResult = await db.turno.createMany({
        data: toCreate.map((t) => ({
          doctorId: t.doctorId,
          jornadaId: t.franjaId?.startsWith("franja-") ? undefined : t.franjaId,
          date: t.date,
          startTime: t.startTime,
          endTime: t.endTime,
          duration: t.duration,
          status: "DISPONIBLE",
        })),
        skipDuplicates: true,
      });
      createdCount = createResult.count;
    }

    // Marcar disponibilidad como confirmada si existe en BD
    await db.monthlyAvailability.updateMany({
      where: {
        userId: finalDoctorId,
        year: input.year,
        month: input.month,
      },
      data: {
        isConfirmed: true,
        confirmedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/agenda-generada");
    revalidatePath("/dashboard/disponibilidad");

    return {
      success: true,
      message:
        existingCount > 0
          ? `Se procesaron ${turnos.length} turnos: ${createdCount} nuevos creados y ${existingCount} existentes preservados (idempotente).`
          : `Se generaron exitosamente ${createdCount} turnos de 30 minutos en estado disponible.`,
      createdCount,
      existingCount,
      totalSlots: turnos.length,
      turnos: turnos.slice(0, 20).map((t) => ({
        startTime: t.startTime,
        endTime: t.endTime,
        date: t.date.toISOString().split("T")[0],
        status: t.status,
      })),
    };
  } catch (error) {
    console.error("generateTurnosAction:", error);
    return {
      success: false,
      message: "Ocurrió un error al guardar los turnos en la base de datos.",
      createdCount: 0,
      existingCount: 0,
      totalSlots: turnos.length,
    };
  }
}

/**
 * Punto de integración directo para la US-06:
 * Cuando US-06 confirma la disponibilidad mensual de un médico, invoca esta función
 * para generar automáticamente los turnos de 30 minutos correspondientes.
 */
export async function generateTurnosForDisponibilidad(
  monthlyAvailabilityId: string
): Promise<GenerateTurnosResult> {
  const availability = await db.monthlyAvailability.findUnique({
    where: { id: monthlyAvailabilityId },
    include: {
      jornadas: { orderBy: { date: "asc" } },
      user: true,
    },
  });

  if (!availability) {
    throw new Error(
      `Disponibilidad con ID ${monthlyAvailabilityId} no encontrada.`
    );
  }

  const franjasInput: FranjaInput[] = availability.jornadas.map((j) => ({
    id: j.id,
    doctorId: availability.userId,
    doctorName: `Dr. ${availability.user.firstName} ${availability.user.lastName}`,
    specialty: availability.user.specialty
      ? SPECIALTY_LABELS[availability.user.specialty]
      : undefined,
    date: formatUtcDateString(j.date),
    startTime: j.startTime,
    endTime: j.endTime,
  }));

  const result = await generateTurnosAction({
    doctorId: availability.userId,
    franjas: franjasInput,
    month: availability.month,
    year: availability.year,
  });

  return result;
}
