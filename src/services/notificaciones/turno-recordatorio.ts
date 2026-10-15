import { db } from "@/lib/db";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { todayInArgentina } from "@/lib/availability-rn02";
import { getRecordatorioAntelacion } from "@/lib/configuracion";
import { sendNotificationEmail } from "@/services/email";
import type { MedicalSpecialty } from "@/generated/prisma/client";
import type { RecordatorioTurnoParams, SendNotificationResult } from "@/services/email/types";
import {
  buildRecordatorioTurnoParams,
  esTurnoRecordable,
  horasHastaTurno,
  seleccionarTurnosARecordar,
  type TurnoRecordatoriable,
} from "@/lib/recordatorios";

/**
 * US-15 — Recordatorio automático de turno (RF-TUR-04, RF-NOT-01).
 *
 * El envío delega en el servicio único de US-21 (plantilla RECORDATORIO_TURNO,
 * auditoría en EmailAuditLog). La originalidad de esta capa es la idempotencia:
 * cada turno se "reclama" con un UPDATE condicional sobre `recordatorioEstado`
 * (PENDIENTE → ENVIADO). Correr el proceso varias veces —reintentos del cron—
 * no duplica correos: una vez ENVIADO, el turno no vuelve a reclamarse.
 *
 * Si el envío falla, el turno vuelve a PENDIENTE y queda registrado el error
 * para que una próxima corrida lo reintente.
 *
 * Sobre "envío programado de Gmail": la API de Gmail no ofrece envío diferido;
 * por eso el envío programado lo aporta el scheduler del sistema (Vercel Cron o
 * cron del SO) y Gmail se usa como servidor SMTP (con contraseña de aplicación).
 */

/** Turno con los datos que necesita el recordatorio. */
export type TurnoParaRecordar = TurnoRecordatoriable & {
  doctor: {
    firstName: string;
    lastName: string;
    specialty: MedicalSpecialty | null;
  };
  reservedBy: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

/**
 * Puerto de persistencia. Se aísla detrás de una interfaz para poder probar la
 * idempotencia sin base de datos real.
 */
export interface RecordatorioStore {
  /** Turnos candidatos (reservados, pendientes, con reservador) en el rango de fechas. */
  candidatos(desde: Date, hasta: Date): Promise<TurnoRecordatoriable[]>;
  /** Reclama el turno de forma atómica; solo el primero que lo logra recibe `true`. */
  reclamar(turnoId: string, ahora: Date): Promise<boolean>;
  obtener(turnoId: string): Promise<TurnoParaRecordar | null>;
  marcarEnviado(turnoId: string, emailLogId: string | undefined, ahora: Date): Promise<void>;
  marcarFallo(turnoId: string, error: string): Promise<void>;
}

/** Envío acotado a la plantilla de recordatorio. Inyectable en pruebas. */
export type RecordatorioSender = (input: {
  to: string;
  params: RecordatorioTurnoParams;
}) => Promise<SendNotificationResult>;

export type ResultadoRecordatorio = {
  turnoId: string;
  enviado: boolean;
  motivo?:
    | "reclamado-por-otro"
    | "inexistente"
    | "turno-no-reservado"
    | "fuera-de-ventana"
    | "sin-destinatario"
    | "error-envio";
  emailLogId?: string;
  error?: string;
};

export type ResumenRecordatorios = {
  ejecutadoEn: string;
  antelacionHoras: number;
  candidatos: number;
  enVentana: number;
  enviados: number;
  fallidos: number;
  resultados: ResultadoRecordatorio[];
};

export type DependenciasRecordatorio = {
  store: RecordatorioStore;
  enviar: RecordatorioSender;
  ahora: Date;
  antelacionHoras: number;
};

function fechaUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function maxError(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.slice(0, 500);
}

/** Implementación real del puerto sobre Prisma. */
export function createPrismaRecordatorioStore(): RecordatorioStore {
  return {
    async candidatos(desde, hasta) {
      return db.turno.findMany({
        where: {
          status: "RESERVADO",
          recordatorioEstado: "PENDIENTE",
          reservedById: { not: null },
          date: { gte: desde, lte: hasta },
        },
        select: {
          id: true,
          status: true,
          date: true,
          startTime: true,
          reservedById: true,
          recordatorioEstado: true,
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });
    },

    async reclamar(turnoId, ahora) {
      // Reclamo atómico: el WHERE exige PENDIENTE, así que si dos corridas
      // simultáneas lo intentan, solo una ve count > 0.
      const res = await db.turno.updateMany({
        where: {
          id: turnoId,
          status: "RESERVADO",
          recordatorioEstado: "PENDIENTE",
        },
        data: {
          recordatorioEstado: "ENVIADO",
          recordatorioEnviadoAt: ahora,
          recordatorioIntentos: { increment: 1 },
          recordatorioUltimoError: null,
        },
      });
      return res.count > 0;
    },

    async obtener(turnoId) {
      return db.turno.findUnique({
        where: { id: turnoId },
        select: {
          id: true,
          status: true,
          date: true,
          startTime: true,
          reservedById: true,
          recordatorioEstado: true,
          doctor: { select: { firstName: true, lastName: true, specialty: true } },
          reservedBy: { select: { firstName: true, lastName: true, email: true } },
        },
      });
    },

    async marcarEnviado(turnoId, emailLogId, ahora) {
      await db.turno.update({
        where: { id: turnoId },
        data: {
          recordatorioEstado: "ENVIADO",
          recordatorioEnviadoAt: ahora,
          recordatorioEmailLogId: emailLogId ?? null,
          recordatorioUltimoError: null,
        },
      });
    },

    async marcarFallo(turnoId, error) {
      await db.turno.update({
        where: { id: turnoId },
        data: {
          // Vuelve a PENDIENTE para reintentar en la próxima corrida. Un turno
          // ENVIADO nunca se toca acá, por eso no hay duplicados.
          recordatorioEstado: "PENDIENTE",
          recordatorioEnviadoAt: null,
          recordatorioUltimoError: error.slice(0, 500),
        },
      });
    },
  };
}

/** Envío real por el servicio de email de US-21. */
export const enviarRecordatorioPorEmail: RecordatorioSender = ({ to, params }) =>
  sendNotificationEmail({ to, template: "RECORDATORIO_TURNO", params });

/**
 * Procesa un único turno: reclama, valida, arma los datos y envía. Nunca lanza:
 * cualquier fallo queda reflejado en el resultado y en `recordatorioUltimoError`.
 */
export async function enviarRecordatorioTurno(
  turnoId: string,
  deps: DependenciasRecordatorio
): Promise<ResultadoRecordatorio> {
  const reclamado = await deps.store.reclamar(turnoId, deps.ahora);
  if (!reclamado) {
    // Otro proceso (o una corrida anterior) ya lo tiene/ya lo envió.
    return { turnoId, enviado: false, motivo: "reclamado-por-otro" };
  }

  try {
    const turno = await deps.store.obtener(turnoId);
    if (!turno) {
      await deps.store.marcarFallo(turnoId, "Turno inexistente");
      return { turnoId, enviado: false, motivo: "inexistente" };
    }

    if (!esTurnoRecordable(turno, deps.ahora, deps.antelacionHoras)) {
      const motivo: ResultadoRecordatorio["motivo"] =
        turno.status !== "RESERVADO" ? "turno-no-reservado" : "fuera-de-ventana";
      await deps.store.marcarFallo(
        turnoId,
        turno.status !== "RESERVADO"
          ? `Turno en estado ${turno.status}: no se recuerda.`
          : "Turno fuera de la ventana de recordatorio."
      );
      return { turnoId, enviado: false, motivo };
    }

    const destinatario = turno.reservedBy;
    if (!destinatario?.email) {
      await deps.store.marcarFallo(turnoId, "Turno sin reservador con email.");
      return { turnoId, enviado: false, motivo: "sin-destinatario" };
    }

    const params = buildRecordatorioTurnoParams({
      destinatarioNombre: `${destinatario.firstName} ${destinatario.lastName}`.trim(),
      doctorNombre: `Dr. ${turno.doctor.firstName} ${turno.doctor.lastName}`,
      especialidad: turno.doctor.specialty
        ? SPECIALTY_LABELS[turno.doctor.specialty]
        : "Consulta médica",
      fecha: turno.date,
      startTime: turno.startTime,
      horasRestantes: horasHastaTurno(turno, deps.ahora) ?? undefined,
    });

    const result = await deps.enviar({ to: destinatario.email, params });

    if (!result.success) {
      await deps.store.marcarFallo(turnoId, result.error ?? "Error desconocido de envío.");
      return { turnoId, enviado: false, motivo: "error-envio", error: result.error };
    }

    await deps.store.marcarEnviado(turnoId, result.logId, deps.ahora);
    return { turnoId, enviado: true, emailLogId: result.logId };
  } catch (error) {
    await deps.store.marcarFallo(turnoId, maxError(error)).catch(() => undefined);
    return { turnoId, enviado: false, motivo: "error-envio", error: maxError(error) };
  }
}

/** Rango de fechas a consultar: de hoy en la sala hasta hoy + antelación. */
export function rangoCandidatos(ahora: Date, antelacionHoras: number): { desde: Date; hasta: Date } {
  const desde = todayInArgentina(ahora);
  const hasta = todayInArgentina(new Date(ahora.getTime() + antelacionHoras * 60 * 60 * 1000));
  return { desde: fechaUTC(desde), hasta: fechaUTC(hasta) };
}

/**
 * Corrida completa del proceso: busca candidatos y envía el recordatorio de los
 * que están en ventana. Es idempotente por el reclamo atómico, así que puede
 * ejecutarse repetidamente (cron) sin duplicar correos.
 */
export async function procesarRecordatoriosPendientes(options?: {
  ahora?: Date;
  antelacionHoras?: number;
  store?: RecordatorioStore;
  enviar?: RecordatorioSender;
}): Promise<ResumenRecordatorios> {
  const ahora = options?.ahora ?? new Date();
  const antelacionHoras = options?.antelacionHoras ?? (await getRecordatorioAntelacion());
  const store = options?.store ?? createPrismaRecordatorioStore();
  const enviar = options?.enviar ?? enviarRecordatorioPorEmail;

  const { desde, hasta } = rangoCandidatos(ahora, antelacionHoras);
  const candidatos = await store.candidatos(desde, hasta);
  const enVentana = seleccionarTurnosARecordar(candidatos, ahora, antelacionHoras);

  const resultados: ResultadoRecordatorio[] = [];
  for (const turno of enVentana) {
    resultados.push(await enviarRecordatorioTurno(turno.id, { store, enviar, ahora, antelacionHoras }));
  }

  const enviados = resultados.filter((r) => r.enviado).length;
  const fallidos = resultados.length - enviados;

  console.log(
    `[US-15] Recordatorios: ${enviados} enviados, ${fallidos} fallidos, ` +
      `${candidatos.length} candidatos (antelación ${antelacionHoras} h).`
  );

  return {
    ejecutadoEn: ahora.toISOString(),
    antelacionHoras,
    candidatos: candidatos.length,
    enVentana: enVentana.length,
    enviados,
    fallidos,
    resultados,
  };
}
