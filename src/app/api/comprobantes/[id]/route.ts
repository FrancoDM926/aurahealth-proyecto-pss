import { NextResponse } from "next/server";
import { loadSession } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { toFecha } from "@/lib/agenda-profesional";
import { getSalaDireccion } from "@/lib/configuracion";
import { generarComprobantePdf } from "@/lib/comprobante-pdf";
import { formatearFechaHoraAuditoriaAr } from "@/lib/estado-turno";
import {
  SALA_NOMBRE,
  formatearNumeroComprobante,
  puedeDescargarComprobante,
} from "@/lib/pagos";

export const dynamic = "force-dynamic";

/**
 * GET /api/comprobantes/[id] — US-36: descarga el comprobante de pago en PDF.
 * Solo para el paciente titular (quien reservó el turno) y el personal
 * administrativo (RNF-03). Se puede descargar todas las veces que haga falta.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await loadSession();
  if (!session.ok) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { role, profile } = session.context;

  const { id } = await params;
  const pago = await db.pago.findUnique({
    where: { id },
    include: { turno: { select: { date: true, startTime: true, reservedById: true } } },
  });

  // Para quien no puede verlo, un comprobante ajeno es indistinguible de uno inexistente.
  if (
    !pago ||
    !puedeDescargarComprobante({
      rol: role,
      usuarioId: profile.id,
      turnoReservadoPorId: pago.turno.reservedById,
    })
  ) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }
  if (pago.estado === "ANULADO") {
    return NextResponse.json(
      { error: "El comprobante fue invalidado: el pago se anuló." },
      { status: 410 }
    );
  }

  const pdf = generarComprobantePdf({
    numero: pago.comprobanteNumero,
    salaNombre: SALA_NOMBRE,
    salaDireccion: await getSalaDireccion(),
    pacienteNombre: pago.pacienteNombre,
    pacienteDocumento: pago.pacienteDocumento,
    prestacion: pago.prestacion,
    profesionalNombre: pago.profesionalNombre,
    fechaTurno: toFecha(pago.turno.date),
    horaTurno: pago.turno.startTime,
    importeCentavos: pago.importeCentavos,
    precioSinCoberturaCentavos: pago.precioSinCoberturaCentavos,
    descuentoPorcentaje: pago.descuentoPorcentaje,
    descuentoCentavos: pago.descuentoCentavos,
    coberturaEntidad: pago.coberturaEntidad,
    medio: pago.medio,
    referencia: pago.referencia,
    registradoEn: formatearFechaHoraAuditoriaAr(pago.createdAt),
    registradoPorNombre: pago.registradoPorNombre,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="comprobante-${formatearNumeroComprobante(pago.comprobanteNumero)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
