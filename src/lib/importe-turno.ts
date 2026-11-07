import { db } from "@/lib/db";
import { toFecha } from "@/lib/agenda-profesional";
import { SPECIALTY_LABELS } from "@/lib/roles";
import {
  calcularImporte,
  descuentoParaCobertura,
  precioVigenteEn,
  resolverCobertura,
  type CoberturaPersona,
  type ImporteCalculado,
} from "@/lib/pagos";
import type { EstadoTurno } from "@/generated/prisma/client";

/**
 * US-34: todo lo que se necesita para cobrar un turno — la persona atendida y su
 * cobertura, el precio del médico vigente a la fecha de la consulta, el descuento
 * de la obra social y el importe resultante. Se calcula siempre en el servidor, a
 * partir de los datos guardados: el cliente nunca aporta importes.
 */
export type ImporteTurno = {
  turnoId: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  startTime: string;
  status: EstadoTurno;
  doctor: { id: string; nombre: string; especialidadLabel: string };
  paciente: {
    nombre: string;
    documento: string | null;
    cobertura: CoberturaPersona;
    /** Quien reservó el turno (titular de la cuenta). */
    reservadoPorNombre: string | null;
    esOtraPersona: boolean;
  };
  /** Precio sin cobertura vigente a la fecha de la consulta; `null` si el médico no lo configuró. */
  precio: { montoCentavos: number; vigenteDesde: string } | null;
  /** La entidad figura en el listado de obras sociales del administrador. */
  obraSocialConfigurada: boolean;
  /** `null` mientras no haya precio: no hay importe que cobrar. */
  importe: ImporteCalculado | null;
  /** Pago activo ya registrado para este turno, si existe. */
  pagoActivo: { id: string; comprobanteNumero: number } | null;
};

export async function calcularImporteTurno(turnoId: string): Promise<ImporteTurno | null> {
  const turno = await db.turno.findUnique({
    where: { id: turnoId },
    include: {
      doctor: { select: { id: true, firstName: true, lastName: true, specialty: true } },
      reservedBy: {
        select: {
          firstName: true,
          lastName: true,
          docNumber: true,
          coverageType: true,
          healthInsuranceEntity: true,
          healthInsurancePlan: true,
        },
      },
      personaAtendida: true,
      pagos: { where: { estado: "ACTIVO" }, select: { id: true, comprobanteNumero: true }, take: 1 },
    },
  });
  if (!turno) return null;

  const fecha = toFecha(turno.date);
  const [precios, obrasSociales] = await Promise.all([
    db.precioConsulta.findMany({ where: { doctorId: turno.doctorId } }),
    db.obraSocial.findMany({ select: { nombre: true, descuentoPorcentaje: true } }),
  ]);

  const persona = turno.personaAtendida;
  const nombreTercero = `${turno.patientFirstName ?? ""} ${turno.patientLastName ?? ""}`.trim();
  const titular = turno.reservedBy;
  const esOtraPersona = Boolean(persona) || nombreTercero.length > 0;

  // Turno a nombre de un tercero sin su cobertura guardada (reservas anteriores a US-64):
  // no hay dato para aplicar un descuento, así que se lo trata como particular.
  const cobertura: CoberturaPersona =
    esOtraPersona && !persona
      ? { entidad: null, plan: null }
      : resolverCobertura({
          personaAtendida: persona,
          titular: titular ?? { coverageType: "PARTICULAR", healthInsuranceEntity: null, healthInsurancePlan: null },
        });

  const nombrePaciente = persona
    ? `${persona.firstName} ${persona.lastName}`
    : nombreTercero ||
      (titular ? `${titular.firstName} ${titular.lastName}`.trim() : "Paciente");

  const vigente = precioVigenteEn(
    precios.map((p) => ({ vigenteDesde: toFecha(p.vigenteDesde), montoCentavos: p.montoCentavos })),
    fecha
  );
  const { descuentoPorcentaje, configurada } = descuentoParaCobertura(cobertura, obrasSociales);

  return {
    turnoId: turno.id,
    fecha,
    startTime: turno.startTime,
    status: turno.status,
    doctor: {
      id: turno.doctor.id,
      nombre: `Dr. ${turno.doctor.firstName} ${turno.doctor.lastName}`,
      especialidadLabel: turno.doctor.specialty ? SPECIALTY_LABELS[turno.doctor.specialty] : "Consulta médica",
    },
    paciente: {
      nombre: nombrePaciente,
      documento: persona ? persona.docNumber : esOtraPersona ? null : (titular?.docNumber ?? null),
      cobertura,
      reservadoPorNombre: titular ? `${titular.firstName} ${titular.lastName}`.trim() : null,
      esOtraPersona,
    },
    precio: vigente
      ? { montoCentavos: vigente.montoCentavos, vigenteDesde: vigente.vigenteDesde }
      : null,
    obraSocialConfigurada: configurada,
    importe: vigente ? calcularImporte(vigente.montoCentavos, descuentoPorcentaje) : null,
    pagoActivo: turno.pagos[0] ?? null,
  };
}
