import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Bloque,
  Callout,
  Hint,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { calcularImporteTurno } from "@/lib/importe-turno";
import { formatearNumeroComprobante, formatearPesos } from "@/lib/pagos";

export const metadata = {
  title: "Importe de la consulta | AuraHealth",
  description: "Desglose del importe a abonar según la obra social del paciente.",
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ turnoId: string }> };

/**
 * US-34 (wf_calculo_importe.html): desglose del importe antes de registrar el
 * pago — precio sin cobertura del médico, menos el descuento de la obra social de
 * la persona atendida.
 */
export default async function ImporteTurnoPage({ params }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRATIVO"]);
  const { turnoId } = await params;

  const datos = await calcularImporteTurno(turnoId);
  if (!datos) notFound();

  const { paciente, doctor, precio, importe, pagoActivo } = datos;
  const esCumplido = datos.status === "CUMPLIDO";
  const puedeContinuar = esCumplido && importe !== null && pagoActivo === null;
  const entidad = paciente.cobertura.entidad;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="pagos"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Mostrador — Importe de la consulta
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Desglose antes de registrar el pago: precio sin cobertura del médico menos el descuento de la
          obra social. Turno del {formatearFechaAr(datos.fecha)} {datos.startTime} con {doctor.nombre}.
        </p>

        <Bloque num="1 · Persona atendida" titulo="Datos de la consulta">
          <div className="grid gap-3 sm:grid-cols-3">
            <Callout>
              <strong>{paciente.nombre}</strong>
              <br />
              {paciente.documento ?? "Documento no informado"}
            </Callout>
            <Callout>
              {entidad ? (
                <>
                  <strong>Obra social: {entidad}</strong>
                  <br />
                  {paciente.cobertura.plan ? `Plan ${paciente.cobertura.plan}` : "Plan no informado"}
                </>
              ) : (
                <strong>Sin cobertura (particular)</strong>
              )}
            </Callout>
            <Callout>
              <strong>Reservado por</strong>
              <br />
              {paciente.reservadoPorNombre ?? "—"}
            </Callout>
          </div>
          <Callout>
            Se aplica la obra social de la persona atendida, no la de quien reservó el turno (US-64).
          </Callout>
        </Bloque>

        <Bloque num="2 · Desglose" titulo="Importe a abonar">
          {importe && precio ? (
            <Tabla>
              <thead>
                <tr className={THEAD_TR}>
                  <th className={TH}>Concepto</th>
                  <th className={`${TH} text-right`}>Importe</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                <tr>
                  <td className={TD}>
                    Precio de consulta sin cobertura — {doctor.nombre}, vigente desde{" "}
                    {formatearFechaAr(precio.vigenteDesde)}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {formatearPesos(importe.precioSinCoberturaCentavos)}
                  </td>
                </tr>
                <tr>
                  <td className={TD}>
                    Descuento por obra social — {entidad ?? "Sin cobertura"} ({importe.descuentoPorcentaje}%)
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {importe.descuentoCentavos > 0
                      ? `− ${formatearPesos(importe.descuentoCentavos)}`
                      : formatearPesos(0)}
                  </td>
                </tr>
                <tr>
                  <td className={`${TD} font-bold`}>Importe final a abonar</td>
                  <td className={`${TD} text-right font-bold whitespace-nowrap`}>
                    {formatearPesos(importe.importeCentavos)}
                  </td>
                </tr>
              </tbody>
            </Tabla>
          ) : (
            <Callout>El importe no se puede calcular: falta el precio de la consulta del médico.</Callout>
          )}
          <Hint>
            El precio sin cobertura sale del historial de vigencias del médico (US-33), vigente a la fecha
            de la consulta; el descuento sale del listado de obras sociales que mantiene el administrador.
          </Hint>
        </Bloque>

        <Bloque num="3 · Casos" titulo="Sin cobertura y sin precio configurado">
          {!esCumplido && (
            <Callout tipo="error">Solo se puede cobrar un turno cumplido (US-18).</Callout>
          )}
          {!entidad && (
            <Callout>
              Sin cobertura: el paciente abona el precio sin cobertura definido por el médico que lo atendió,
              sin ningún descuento.
            </Callout>
          )}
          {entidad && !datos.obraSocialConfigurada && (
            <Callout>
              La obra social {entidad} no figura en el listado del administrador, por lo que no se aplica
              ningún descuento.
            </Callout>
          )}
          {!importe && (
            <Callout tipo="error">
              Si el médico no tiene configurado el precio de su consulta, el sistema lo advierte y no
              permite cerrar el cobro.
            </Callout>
          )}
          {pagoActivo && (
            <Callout tipo="error">
              Este turno ya tiene un pago registrado (comprobante N.º{" "}
              {formatearNumeroComprobante(pagoActivo.comprobanteNumero)}).
            </Callout>
          )}

          <div className="flex flex-wrap gap-2">
            {puedeContinuar ? (
              <Link href={`/dashboard/pagos/${datos.turnoId}/registrar`} className={BTN_PRIMARY}>
                Continuar al registro de pago
              </Link>
            ) : (
              <span aria-disabled="true" className={`${BTN_PRIMARY} opacity-50`}>
                Continuar al registro de pago
              </span>
            )}
            <Link href="/dashboard/pagos" className={BTN_SECONDARY}>
              Cancelar
            </Link>
          </div>
        </Bloque>
      </div>
    </DashboardShell>
  );
}
