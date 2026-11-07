"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import { toFecha } from "@/lib/agenda-profesional";
import { calcularImporteTurno } from "@/lib/importe-turno";
import { validarRegistroPago } from "@/lib/pagos";
import type { MedioPago } from "@/generated/prisma/client";

export type TurnoParaCobro = {
  id: string;
  fecha: string;
  startTime: string;
  doctorNombre: string;
  pacienteNombre: string;
  /** Pago activo del turno, si ya se cobró. */
  pago: { id: string; comprobanteNumero: number } | null;
};

const MAX_TURNOS_LISTADO = 100;

/**
 * US-35: turnos cumplidos —los únicos que habilitan el cobro (US-18)— con su
 * estado de cobro, del más reciente al más antiguo.
 */
export async function listarTurnosParaCobro(): Promise<TurnoParaCobro[]> {
  await assertRoles(["ADMINISTRATIVO"]);

  const turnos = await db.turno.findMany({
    where: { status: "CUMPLIDO" },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
    take: MAX_TURNOS_LISTADO,
    include: {
      doctor: { select: { firstName: true, lastName: true } },
      reservedBy: { select: { firstName: true, lastName: true } },
      pagos: { where: { estado: "ACTIVO" }, select: { id: true, comprobanteNumero: true }, take: 1 },
    },
  });

  return turnos.map((t) => {
    const tercero = `${t.patientFirstName ?? ""} ${t.patientLastName ?? ""}`.trim();
    const titular = t.reservedBy ? `${t.reservedBy.firstName} ${t.reservedBy.lastName}`.trim() : "";
    return {
      id: t.id,
      fecha: toFecha(t.date),
      startTime: t.startTime,
      doctorNombre: `Dr. ${t.doctor.firstName} ${t.doctor.lastName}`,
      pacienteNombre: tercero || titular || "Paciente",
      pago: t.pagos[0] ?? null,
    };
  });
}

export type RegistrarPagoInput = {
  turnoId: string;
  medio: MedioPago;
  /** Referencia de la operación; solo se usa con transferencia. */
  referencia?: string;
};

export type RegistrarPagoResult = {
  success: boolean;
  message: string;
  pagoId?: string;
  comprobanteNumero?: number;
  /** Ya existía un pago activo: el formulario lo muestra como estado de error. */
  pagoExistente?: boolean;
};

/**
 * US-35: registra el pago de una consulta cumplida (efectivo o transferencia).
 * El importe se recalcula acá con los datos guardados (US-34) y se congela en el
 * pago junto con la cobertura aplicada; la numeración correlativa del comprobante
 * (US-36) se asigna en la misma transacción para que no queden huecos ni duplicados.
 */
export async function registrarPagoAction(input: RegistrarPagoInput): Promise<RegistrarPagoResult> {
  let session;
  try {
    session = await assertRoles(["ADMINISTRATIVO"]);
  } catch {
    return { success: false, message: "Solo el personal administrativo puede registrar pagos." };
  }
  const { role, profile } = session;

  const turnoId = (input.turnoId ?? "").trim();
  if (!turnoId) return { success: false, message: "Turno inválido." };

  const datos = await calcularImporteTurno(turnoId);
  if (!datos) return { success: false, message: "El turno indicado no existe." };

  const validacion = validarRegistroPago({
    rol: role,
    turnoStatus: datos.status,
    medio: input.medio,
    referencia: input.referencia,
    tienePagoActivo: datos.pagoActivo !== null,
    tienePrecio: datos.importe !== null,
  });
  if (!validacion.valid) {
    return {
      success: false,
      message: validacion.error,
      pagoExistente: datos.pagoActivo !== null,
    };
  }
  const importe = datos.importe!;
  const precio = datos.precio!;

  try {
    const pago = await db.$transaction(async (tx) => {
      const contador = await tx.comprobanteContador.upsert({
        where: { id: 1 },
        create: { id: 1, ultimo: 1 },
        update: { ultimo: { increment: 1 } },
      });
      return tx.pago.create({
        data: {
          turnoId,
          medio: validacion.medio,
          referencia: validacion.referencia,
          precioSinCoberturaCentavos: importe.precioSinCoberturaCentavos,
          precioVigenteDesde: new Date(`${precio.vigenteDesde}T00:00:00.000Z`),
          coberturaEntidad: datos.paciente.cobertura.entidad,
          descuentoPorcentaje: importe.descuentoPorcentaje,
          descuentoCentavos: importe.descuentoCentavos,
          importeCentavos: importe.importeCentavos,
          comprobanteNumero: contador.ultimo,
          pacienteNombre: datos.paciente.nombre,
          pacienteDocumento: datos.paciente.documento,
          prestacion: `Consulta de ${datos.doctor.especialidadLabel}`,
          profesionalNombre: datos.doctor.nombre,
          registradoPorId: profile.id,
          registradoPorNombre: `${profile.firstName} ${profile.lastName}`.trim(),
        },
      });
    });

    revalidatePath("/dashboard/pagos");
    revalidatePath("/dashboard/comprobantes");
    revalidatePath("/dashboard/admin/reportes/pagos");

    return {
      success: true,
      message: `Pago registrado. Comprobante N.º ${String(pago.comprobanteNumero).padStart(6, "0")} generado.`,
      pagoId: pago.id,
      comprobanteNumero: pago.comprobanteNumero,
    };
  } catch (error) {
    // Índice único parcial: otro administrativo cobró el mismo turno un instante antes.
    if ((error as { code?: string }).code === "P2002") {
      return {
        success: false,
        message: "Ya existe un pago activo para este turno.",
        pagoExistente: true,
      };
    }
    console.error("registrarPagoAction:", error);
    return { success: false, message: "Ocurrió un error al registrar el pago." };
  }
}

export type ComprobanteItem = {
  id: string;
  numero: number;
  fecha: string;
  hora: string;
  prestacion: string;
  profesionalNombre: string;
  pacienteNombre: string;
  importeCentavos: number;
  medio: MedioPago;
};

/**
 * US-36: comprobantes de los pagos de los turnos que el usuario reservó —propios
 * o a nombre de otra persona—, del más reciente al más antiguo.
 */
export async function listarComprobantesDelUsuario(): Promise<ComprobanteItem[]> {
  const { profile } = await assertRoles(["USUARIO"]);

  const pagos = await db.pago.findMany({
    where: { estado: "ACTIVO", turno: { reservedById: profile.id } },
    orderBy: { comprobanteNumero: "desc" },
    include: { turno: { select: { date: true, startTime: true } } },
  });

  return pagos.map((p) => ({
    id: p.id,
    numero: p.comprobanteNumero,
    fecha: toFecha(p.turno.date),
    hora: p.turno.startTime,
    prestacion: p.prestacion,
    profesionalNombre: p.profesionalNombre,
    pacienteNombre: p.pacienteNombre,
    importeCentavos: p.importeCentavos,
    medio: p.medio,
  }));
}
