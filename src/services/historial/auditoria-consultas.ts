/**
 * US-44 — consultas de la auditoría de accesos al historial clínico.
 *
 * Único punto de lectura de `AccesoHistorialLog`. US-40, US-41 y US-62 escriben
 * el log; esta vista solo lo consulta (RNF-04). No expone altas, bajas ni
 * modificaciones: la auditoría es inmutable.
 */

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  ResultadoAccesoHistorial,
  TipoAccesoHistorial,
} from "@/generated/prisma/client";
import { formatearAutorCambioEstado, formatearFechaHoraAuditoriaAr } from "@/lib/estado-turno";
import {
  LIMITE_ACCESOS_AUDITORIA,
  combinarOpcionesUsuarios,
  rangoInstantesAuditoria,
  type FiltrosAuditoriaHistorial,
} from "@/lib/auditoria-historial";
import { buscarPatientKeysPorTexto } from "@/services/historial/consultas";

export type AccesoAuditoria = {
  id: string;
  fechaHora: Date;
  /** «14/11/2026 10:42», en hora de Argentina. */
  fechaHoraTexto: string;
  usuarioId: string;
  usuarioNombre: string;
  pacienteKey: string | null;
  pacienteNombre: string;
  tipo: TipoAccesoHistorial;
  resultado: ResultadoAccesoHistorial;
  detalle: string | null;
};

export type AuditoriaAccesos = {
  filas: AccesoAuditoria[];
  /** Total de accesos que cumplen los filtros, aunque la vista muestre un tope. */
  total: number;
  truncado: boolean;
};

export type OpcionesFiltrosAuditoria = {
  usuarios: Array<{ id: string; nombre: string }>;
};

/**
 * Filtros del wireframe: usuario, paciente (apellido o documento), rango de
 * fechas, tipo de acceso y resultado. El paciente se resuelve a `patientKey`
 * (`USER:<id>` / `PERSONA:<id>`) y además se busca por el nombre guardado en el
 * log, porque los accesos rechazados pueden no tener `patientKey`.
 */
function whereAuditoria(
  filtros: FiltrosAuditoriaHistorial,
  patientKeys: string[]
): Prisma.AccesoHistorialLogWhereInput {
  const rango = rangoInstantesAuditoria(filtros.desde, filtros.hasta);

  return {
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.resultado ? { resultado: filtros.resultado } : {}),
    ...(rango ? { createdAt: rango } : {}),
    ...(filtros.paciente
      ? {
          OR: [
            ...(patientKeys.length ? [{ pacienteKey: { in: patientKeys } }] : []),
            {
              pacienteNombre: {
                contains: filtros.paciente,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
}

/** US-44: accesos registrados, del más reciente al más antiguo. */
export async function consultarAuditoriaAccesos(
  filtros: FiltrosAuditoriaHistorial
): Promise<AuditoriaAccesos> {
  const patientKeys = filtros.paciente
    ? await buscarPatientKeysPorTexto(filtros.paciente)
    : [];
  const where = whereAuditoria(filtros, patientKeys);

  const [registros, total] = await Promise.all([
    db.accesoHistorialLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMITE_ACCESOS_AUDITORIA,
      select: {
        id: true,
        createdAt: true,
        usuarioId: true,
        usuarioNombre: true,
        pacienteKey: true,
        pacienteNombre: true,
        tipo: true,
        resultado: true,
        detalle: true,
      },
    }),
    db.accesoHistorialLog.count({ where }),
  ]);

  return {
    filas: registros.map((registro) => ({
      ...registro,
      fechaHora: registro.createdAt,
      fechaHoraTexto: formatearFechaHoraAuditoriaAr(registro.createdAt),
    })),
    total,
    truncado: total > registros.length,
  };
}

/**
 * Opciones del selector «Usuario»: la unión de los usuarios activos y de los
 * actores que ya figuran en el log.
 *
 * Antes solo se listaban quienes tenían accesos registrados, así que Enfermería
 * o el Administrativo —que nunca acceden al historial y solo aparecen si un
 * intento quedó rechazado— no existían en el filtro y la pantalla parecía no
 * tener sus datos. Los actores del log se conservan por si la cuenta fue dada de
 * baja.
 */
export async function opcionesFiltrosAuditoria(): Promise<OpcionesFiltrosAuditoria> {
  const [usuariosActivos, actoresDelLog] = await Promise.all([
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
    db.accesoHistorialLog.groupBy({ by: ["usuarioId", "usuarioNombre"] }),
  ]);

  return {
    usuarios: combinarOpcionesUsuarios(
      usuariosActivos.map((usuario) => ({
        id: usuario.id,
        nombre: formatearAutorCambioEstado(usuario),
      })),
      actoresDelLog.map((actor) => ({
        id: actor.usuarioId,
        nombre: actor.usuarioNombre,
      }))
    ),
  };
}
