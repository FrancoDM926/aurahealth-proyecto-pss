import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { RegistroPagoForm } from "@/components/registro-pago-form";
import { requireRoles } from "@/lib/auth-session";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { calcularImporteTurno } from "@/lib/importe-turno";
import { formatearPesos } from "@/lib/pagos";

export const metadata = {
  title: "Registrar pago | AuraHealth",
  description: "Registro del pago de una consulta en efectivo o por transferencia.",
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ turnoId: string }> };

/** US-35 (wf_registro_pago.html): registro del pago de un turno cumplido. */
export default async function RegistrarPagoPage({ params }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRATIVO"]);
  const { turnoId } = await params;

  const datos = await calcularImporteTurno(turnoId);
  if (!datos) notFound();
  // Sin turno cumplido, precio o con un pago ya activo, el desglose (US-34) explica por qué no se puede cobrar.
  if (datos.status !== "CUMPLIDO" || !datos.importe || datos.pagoActivo) {
    redirect(`/dashboard/pagos/${turnoId}`);
  }

  const { importe, paciente, doctor } = datos;
  const entidad = paciente.cobertura.entidad;
  const detalleImporte = entidad
    ? `precio sin cobertura ${formatearPesos(importe.precioSinCoberturaCentavos)} con el descuento de ${entidad} aplicado`
    : `precio sin cobertura ${formatearPesos(importe.precioSinCoberturaCentavos)}, sin descuento`;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="pagos"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Pagos — Registrar pago</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Efectivo o transferencia, sobre un turno cumplido.
        </p>

        <RegistroPagoForm
          turnoId={datos.turnoId}
          resumenTurno={`Turno cumplido — ${formatearFechaAr(datos.fecha)} ${datos.startTime} — ${doctor.nombre} — ${paciente.nombre}.`}
          importeTexto={formatearPesos(importe.importeCentavos)}
          detalleImporte={detalleImporte}
        />
      </div>
    </DashboardShell>
  );
}
