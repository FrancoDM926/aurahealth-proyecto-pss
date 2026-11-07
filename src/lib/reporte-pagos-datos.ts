import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SPECIALTY_LABELS } from "@/lib/roles";
import {
  armarReportePagos,
  fechaEnArgentina,
  inicioDiaArgentina,
  PARTICULAR_LABEL,
  type FiltrosReportePagos,
  type PagoReporte,
  type ReportePagos,
} from "@/lib/reporte-pagos";
import { sumarDias } from "@/lib/pagos";
import type { MedicalSpecialty } from "@/generated/prisma/client";

export type OpcionProfesional = { id: string; nombre: string; especialidadLabel: string };

/**
 * US-47: lee los pagos del período con los filtros pedidos y arma el reporte.
 * El período se interpreta en hora de Argentina sobre la fecha del cobro.
 */
export async function consultarReportePagos(
  filtros: FiltrosReportePagos
): Promise<ReportePagos> {
  const where: Prisma.PagoWhereInput = {
    createdAt: {
      gte: inicioDiaArgentina(filtros.desde),
      lt: inicioDiaArgentina(sumarDias(filtros.hasta, 1)),
    },
    ...(filtros.medio ? { medio: filtros.medio } : {}),
    ...(filtros.obraSocial === "PARTICULAR"
      ? { coberturaEntidad: null }
      : filtros.obraSocial
        ? { coberturaEntidad: filtros.obraSocial }
        : {}),
    turno: {
      ...(filtros.profesionalId ? { doctorId: filtros.profesionalId } : {}),
      ...(filtros.especialidad
        ? { doctor: { specialty: filtros.especialidad as MedicalSpecialty } }
        : {}),
    },
  };

  const pagos = await db.pago.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      turno: {
        select: {
          doctorId: true,
          doctor: { select: { firstName: true, lastName: true, specialty: true } },
        },
      },
    },
  });

  const filas: PagoReporte[] = pagos.map((p) => ({
    fecha: fechaEnArgentina(p.createdAt),
    medio: p.medio,
    coberturaEntidad: p.coberturaEntidad,
    importeCentavos: p.importeCentavos,
    estado: p.estado,
    profesionalId: p.turno.doctorId,
    profesionalNombre: `Dr. ${p.turno.doctor.firstName} ${p.turno.doctor.lastName}`,
    especialidadLabel: p.turno.doctor.specialty
      ? SPECIALTY_LABELS[p.turno.doctor.specialty]
      : "Consulta médica",
  }));

  return armarReportePagos(filas, filtros);
}

/** Opciones de los selectores de filtro: profesionales y obras sociales (más «Particular»). */
export async function opcionesFiltrosReportePagos(): Promise<{
  profesionales: OpcionProfesional[];
  obrasSociales: string[];
}> {
  const [medicos, obras] = await Promise.all([
    db.user.findMany({
      where: { role: "MEDICO" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, specialty: true },
    }),
    db.obraSocial.findMany({ orderBy: { nombre: "asc" }, select: { nombre: true } }),
  ]);

  return {
    profesionales: medicos.map((m) => ({
      id: m.id,
      nombre: `Dr. ${m.firstName} ${m.lastName}`,
      especialidadLabel: m.specialty ? SPECIALTY_LABELS[m.specialty] : "Consulta médica",
    })),
    obrasSociales: [PARTICULAR_LABEL, ...obras.map((o) => o.nombre)],
  };
}
