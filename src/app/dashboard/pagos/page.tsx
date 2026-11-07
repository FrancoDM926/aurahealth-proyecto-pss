import Link from "next/link";
import { listarTurnosParaCobro } from "@/actions/pagos";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Badge,
  Callout,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { formatearNumeroComprobante } from "@/lib/pagos";

export const metadata = {
  title: "Pagos | AuraHealth",
  description: "Cobro de las consultas cumplidas.",
};

export const dynamic = "force-dynamic";

const LINK_CLASS =
  "inline-flex rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink";

/**
 * US-35: punto de entrada al cobro. Lista los turnos cumplidos (US-18) con su
 * estado de cobro; desde cada uno se calcula el importe (US-34) y se registra el pago.
 */
export default async function PagosPage() {
  const { role, profile } = await requireRoles(["ADMINISTRATIVO"]);
  const turnos = await listarTurnosParaCobro();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="pagos"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Pagos — Consultas a cobrar</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Solo los turnos cumplidos se pueden cobrar. El importe se calcula según la obra social de la
          persona atendida.
        </p>

        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs sm:p-6">
          {turnos.length === 0 ? (
            <Callout>Todavía no hay turnos cumplidos para cobrar.</Callout>
          ) : (
            <Tabla>
              <thead>
                <tr className={THEAD_TR}>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Profesional</th>
                  <th className={TH}>Paciente</th>
                  <th className={TH}>Cobro</th>
                  <th className={TH}>Acción</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {turnos.map((t) => (
                  <tr key={t.id}>
                    <td className={`${TD} whitespace-nowrap`}>
                      {formatearFechaAr(t.fecha)} {t.startTime}
                    </td>
                    <td className={TD}>{t.doctorNombre}</td>
                    <td className={TD}>{t.pacienteNombre}</td>
                    <td className={TD}>
                      {t.pago ? (
                        <Badge tono="ok">Cobrado · N.º {formatearNumeroComprobante(t.pago.comprobanteNumero)}</Badge>
                      ) : (
                        <Badge tono="aviso">Pendiente de cobro</Badge>
                      )}
                    </td>
                    <td className={TD}>
                      {t.pago ? (
                        <a href={`/api/comprobantes/${t.pago.id}`} className={LINK_CLASS}>
                          Descargar comprobante
                        </a>
                      ) : (
                        <Link href={`/dashboard/pagos/${t.id}`} className={LINK_CLASS}>
                          Cobrar
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
