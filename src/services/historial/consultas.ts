/**
 * Consultas del historial clínico (US-40, US-41 y US-62).
 *
 * Único punto de acceso a las tablas del historial. El modelo canónico es el de
 * US-39: `FichaDiagnostico` (una por médico y `patientKey`) y
 * `FichaDiagnosticoEntrada` (entradas firmadas). US-62 agrega `AdjuntoEstudio`
 * sobre esas entradas. Si cambia el modelo, se adapta acá sin tocar pantallas.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MedicalSpecialty } from "@/generated/prisma/client";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { parseFechaUtc } from "@/lib/fecha-utc";
import {
  agruparEntradasPorFicha,
  especialidadDe,
  formatearFechaHoraEntrada,
  formatearTamanoArchivo,
  nombreProfesional,
  ordenarEntradasDesc,
  type FiltrosHistorial,
} from "@/lib/historial";

export type AdjuntoResumen = {
  id: string;
  nombreArchivo: string;
  tipoMime: string;
  tipoLabel: "Imagen" | "PDF";
  tamanoBytes: number;
  tamanoTexto: string;
  subidoEn: Date;
  subidoEnTexto: string;
  subidoPorNombre: string;
};

export type EntradaHistorial = {
  id: string;
  fichaId: string;
  medicoId: string;
  medicoNombre: string;
  especialidadLabel: string;
  diagnostico: string;
  tratamiento: string;
  observaciones: string;
  /** Instante de la consulta (fecha + hora de la sala). */
  firmadoEn: Date;
  firmadoEnTexto: string;
  /** Última modificación de la entrada (US-39 la actualiza al editar). */
  editadaEn: Date;
  editadaEnTexto: string;
  firmadoPorNombre: string;
  adjuntos: AdjuntoResumen[];
};

export type FichaConsolidada = {
  fichaId: string;
  medicoId: string;
  medicoNombre: string;
  especialidadLabel: string;
  pacienteKey: string;
  pacienteNombre: string;
  pacienteDocumento: string;
  entradas: EntradaHistorial[];
};

export type OpcionesFiltrosHistorial = {
  profesionales: Array<{
    id: string;
    nombre: string;
    especialidadLabel: string;
    specialty: MedicalSpecialty | null;
  }>;
  especialidades: Array<{ value: MedicalSpecialty; label: string }>;
};

/** `patientKey` de US-39 para un usuario-paciente. */
export function patientKeyDeUsuario(userId: string): string {
  return `USER:${userId}`;
}

/**
 * Fecha `@db.Date` + hora "HH:mm" de la sala como instante UTC. Argentina es
 * UTC−3 todo el año, así que la hora local se corre tres horas hacia adelante.
 */
export function instanteConsulta(fecha: Date, hora: string): Date {
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate(),
      (hh || 0) + 3,
      mm || 0
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda de pacientes (documento o apellido)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca `patientKey` de usuarios y de personas atendidas por nombre, apellido o
 * documento. El documento se compara solo con dígitos, para que «30123456»
 * encuentre «30.123.456».
 */
export async function buscarPatientKeysPorTexto(texto: string): Promise<string[]> {
  const q = texto.trim();
  if (!q) return [];
  const like = `%${q}%`;
  const digitos = q.replace(/\D/g, "");
  const docLike = digitos.length >= 3 ? `%${digitos}%` : like;

  const filas = await db.$queryRaw<Array<{ key: string }>>(Prisma.sql`
    SELECT 'USER:' || "id" AS key FROM "User"
    WHERE "firstName" ILIKE ${like}
       OR "lastName" ILIKE ${like}
       OR regexp_replace(coalesce("docNumber", ''), '[^0-9]', '', 'g') LIKE ${docLike}
    UNION
    SELECT 'PERSONA:' || "id" AS key FROM "PersonaAtendida"
    WHERE "firstName" ILIKE ${like}
       OR "lastName" ILIKE ${like}
       OR regexp_replace(coalesce("docNumber", ''), '[^0-9]', '', 'g') LIKE ${docLike}
    LIMIT 200
  `);
  return filas.map((f) => f.key);
}

/** Documento de cada `patientKey`, resolviendo usuarios y personas atendidas. */
export async function documentosPorPatientKey(
  keys: string[]
): Promise<Map<string, string>> {
  const userIds = keys.filter((k) => k.startsWith("USER:")).map((k) => k.slice(5));
  const personaIds = keys
    .filter((k) => k.startsWith("PERSONA:"))
    .map((k) => k.slice(8));

  const [usuarios, personas] = await Promise.all([
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, docNumber: true },
        })
      : [],
    personaIds.length
      ? db.personaAtendida.findMany({
          where: { id: { in: personaIds } },
          select: { id: true, docNumber: true },
        })
      : [],
  ]);

  const documentos = new Map<string, string>();
  for (const u of usuarios) documentos.set(`USER:${u.id}`, u.docNumber ?? "—");
  for (const p of personas) documentos.set(`PERSONA:${p.id}`, p.docNumber ?? "—");
  return documentos;
}

async function documentoDe(patientKey: string): Promise<string> {
  return (await documentosPorPatientKey([patientKey])).get(patientKey) ?? "—";
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo común
// ─────────────────────────────────────────────────────────────────────────────

function mapearAdjunto(adjunto: {
  id: string;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
  subidoPorNombre: string;
  createdAt: Date;
}): AdjuntoResumen {
  const tipoLabel =
    adjunto.tipoMime.toLowerCase() === "application/pdf" ? "PDF" : "Imagen";
  return {
    id: adjunto.id,
    nombreArchivo: adjunto.nombreArchivo,
    tipoMime: adjunto.tipoMime,
    tipoLabel,
    tamanoBytes: adjunto.tamanoBytes,
    tamanoTexto: formatearTamanoArchivo(adjunto.tamanoBytes),
    subidoEn: adjunto.createdAt,
    subidoEnTexto: formatearFechaHoraEntrada(adjunto.createdAt),
    subidoPorNombre: adjunto.subidoPorNombre,
  };
}

type MedicoResumen = {
  id: string;
  firstName: string;
  lastName: string;
  specialty: MedicalSpecialty | null;
};

type EntradaConRelaciones = {
  id: string;
  fichaId: string;
  diagnosis: string;
  treatment: string;
  observations: string;
  consultationDate: Date;
  consultationTime: string;
  authorName: string;
  updatedAt: Date;
  adjuntos: Array<{
    id: string;
    nombreArchivo: string;
    tipoMime: string;
    tamanoBytes: number;
    subidoPorNombre: string;
    createdAt: Date;
  }>;
};

function mapearEntrada(
  entrada: EntradaConRelaciones,
  medico: MedicoResumen
): EntradaHistorial {
  const firmadoEn = instanteConsulta(entrada.consultationDate, entrada.consultationTime);
  return {
    id: entrada.id,
    fichaId: entrada.fichaId,
    medicoId: medico.id,
    medicoNombre: nombreProfesional(medico.firstName, medico.lastName),
    especialidadLabel: especialidadDe(medico.specialty, SPECIALTY_LABELS),
    diagnostico: entrada.diagnosis,
    tratamiento: entrada.treatment,
    observaciones: entrada.observations,
    firmadoEn,
    firmadoEnTexto: formatearFechaHoraEntrada(firmadoEn),
    editadaEn: entrada.updatedAt,
    editadaEnTexto: formatearFechaHoraEntrada(entrada.updatedAt),
    firmadoPorNombre: entrada.authorName,
    adjuntos: entrada.adjuntos
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(mapearAdjunto),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// US-40 — vista consolidada por paciente
// ─────────────────────────────────────────────────────────────────────────────

const INCLUDE_FICHA = {
  doctor: {
    select: { id: true, firstName: true, lastName: true, specialty: true },
  },
  entradas: {
    orderBy: [{ consultationDate: "desc" }, { consultationTime: "desc" }],
    include: { adjuntos: true },
  },
} satisfies Prisma.FichaDiagnosticoInclude;

/**
 * US-40: fichas de todos los médicos para los filtros indicados. Las entradas
 * salen en orden cronológico inverso y las fichas, agrupadas por médico.
 */
export async function consultarFichasConsolidadas(
  filtros: FiltrosHistorial
): Promise<FichaConsolidada[]> {
  const patientKeys = filtros.paciente
    ? await buscarPatientKeysPorTexto(filtros.paciente)
    : [];

  const rangoFechas =
    filtros.desde || filtros.hasta
      ? {
          ...(filtros.desde ? { gte: parseFechaUtc(filtros.desde) } : {}),
          ...(filtros.hasta ? { lte: parseFechaUtc(filtros.hasta) } : {}),
        }
      : null;

  const whereEntradas: Prisma.FichaDiagnosticoEntradaWhereInput = rangoFechas
    ? { consultationDate: rangoFechas }
    : {};

  const fichas = await db.fichaDiagnostico.findMany({
    where: {
      ...(filtros.patientKey ? { patientKey: filtros.patientKey } : {}),
      ...(filtros.profesionalId ? { doctorId: filtros.profesionalId } : {}),
      ...(filtros.especialidad ? { doctor: { specialty: filtros.especialidad } } : {}),
      ...(filtros.paciente
        ? {
            OR: [
              ...(patientKeys.length ? [{ patientKey: { in: patientKeys } }] : []),
              {
                patientName: {
                  contains: filtros.paciente,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      entradas: { some: whereEntradas },
    },
    include: {
      ...INCLUDE_FICHA,
      entradas: {
        where: whereEntradas,
        orderBy: [{ consultationDate: "desc" }, { consultationTime: "desc" }],
        take: 500,
        include: { adjuntos: true },
      },
    },
  });

  const documentos = await documentosPorPatientKey(fichas.map((f) => f.patientKey));

  const porFicha = new Map(fichas.map((f) => [f.id, f]));
  const todasLasEntradas = fichas.flatMap((f) => f.entradas);
  const grupos = agruparEntradasPorFicha(
    todasLasEntradas.map((e) => ({
      ...e,
      firmadoEn: instanteConsulta(e.consultationDate, e.consultationTime),
    }))
  );

  const resultado: FichaConsolidada[] = [];
  for (const grupo of grupos) {
    const ficha = porFicha.get(grupo.fichaId);
    if (!ficha) continue;
    resultado.push({
      fichaId: ficha.id,
      medicoId: ficha.doctor.id,
      medicoNombre: nombreProfesional(ficha.doctor.firstName, ficha.doctor.lastName),
      especialidadLabel: especialidadDe(ficha.doctor.specialty, SPECIALTY_LABELS),
      pacienteKey: ficha.patientKey,
      pacienteNombre: ficha.patientName,
      pacienteDocumento: documentos.get(ficha.patientKey) ?? "—",
      entradas: grupo.entradas.map((e) => mapearEntrada(e, ficha.doctor)),
    });
  }

  return resultado.sort((a, b) =>
    `${a.pacienteNombre} ${a.medicoNombre}`.localeCompare(
      `${b.pacienteNombre} ${b.medicoNombre}`,
      "es"
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// US-41 — historial del paciente
// ─────────────────────────────────────────────────────────────────────────────

/** US-41: todas las entradas de las fichas del paciente, en orden inverso. */
export async function consultarHistorialPaciente(
  pacienteUserId: string
): Promise<EntradaHistorial[]> {
  const fichas = await db.fichaDiagnostico.findMany({
    where: { patientKey: patientKeyDeUsuario(pacienteUserId) },
    include: INCLUDE_FICHA,
  });

  const entradas = fichas.flatMap((ficha) =>
    ficha.entradas.map((entrada) => mapearEntrada(entrada, ficha.doctor))
  );

  return ordenarEntradasDesc(entradas);
}

// ─────────────────────────────────────────────────────────────────────────────
// US-62 — entrada y adjuntos
// ─────────────────────────────────────────────────────────────────────────────

export type EntradaDetalle = EntradaHistorial & {
  pacienteKey: string;
  pacienteNombre: string;
  pacienteDocumento: string;
};

export async function obtenerEntradaConAdjuntos(
  entradaId: string
): Promise<EntradaDetalle | null> {
  const entrada = await db.fichaDiagnosticoEntrada.findUnique({
    where: { id: entradaId },
    include: {
      ficha: {
        include: {
          doctor: {
            select: { id: true, firstName: true, lastName: true, specialty: true },
          },
        },
      },
      adjuntos: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!entrada) return null;

  const base = mapearEntrada(entrada, entrada.ficha.doctor);
  return {
    ...base,
    pacienteKey: entrada.ficha.patientKey,
    pacienteNombre: entrada.ficha.patientName,
    pacienteDocumento: await documentoDe(entrada.ficha.patientKey),
  };
}

export type AdjuntoDescargable = {
  id: string;
  nombreArchivo: string;
  tipoMime: string;
  tamanoBytes: number;
  contenido: Uint8Array;
  pacienteKey: string;
  pacienteNombre: string;
  medicoId: string;
};

/** US-62: adjunto con su contenido, para la descarga controlada por rol. */
export async function obtenerAdjuntoParaDescarga(
  adjuntoId: string
): Promise<AdjuntoDescargable | null> {
  const adjunto = await db.adjuntoEstudio.findUnique({
    where: { id: adjuntoId },
    include: {
      entrada: {
        include: {
          ficha: {
            include: {
              doctor: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!adjunto) return null;

  return {
    id: adjunto.id,
    nombreArchivo: adjunto.nombreArchivo,
    tipoMime: adjunto.tipoMime,
    tamanoBytes: adjunto.tamanoBytes,
    contenido: adjunto.contenido,
    pacienteKey: adjunto.entrada.ficha.patientKey,
    pacienteNombre: adjunto.entrada.ficha.patientName,
    medicoId: adjunto.entrada.ficha.doctor.id,
  };
}

/** Opciones de los filtros de US-40: profesionales activos y especialidades. */
export async function opcionesFiltrosHistorial(): Promise<OpcionesFiltrosHistorial> {
  const medicos = await db.user.findMany({
    where: { role: "MEDICO", isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, specialty: true },
  });

  return {
    profesionales: medicos.map((m) => ({
      id: m.id,
      nombre: nombreProfesional(m.firstName, m.lastName),
      especialidadLabel: especialidadDe(m.specialty, SPECIALTY_LABELS),
      specialty: m.specialty,
    })),
    especialidades: Object.entries(SPECIALTY_LABELS).map(([value, label]) => ({
      value: value as MedicalSpecialty,
      label,
    })),
  };
}
