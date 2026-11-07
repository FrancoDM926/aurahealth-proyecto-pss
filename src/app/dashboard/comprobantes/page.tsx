import { listarComprobantesDelUsuario } from "@/actions/pagos";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BTN_PRIMARY,
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
import {
  AVISO_COMPROBANTE_INTERNO,
  MEDIO_PAGO_LABELS,
  SALA_NOMBRE,
  formatearNumeroComprobante,
  formatearPesos,
} from "@/lib/pagos";

export const metadata = {
  title: "Comprobantes | AuraHealth",
  description: "Comprobantes de pago en PDF.",
};

export const dynamic = "force-dynamic";

/**
 * US-36 (wf_comprobante.html): comprobantes de pago del paciente, con descarga
 * en PDF. Incluye los pagos de los turnos que reservó a nombre de otra persona.
 */
export default async function ComprobantesPage() {
  const { role, profile } = await requireRoles(["USUARIO"]);
  const comprobantes = await listarComprobantesDelUsuario();
  const ultimo = comprobantes[0] ?? null;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="comprobantes"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Mi cuenta — Comprobantes</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Descarga para el titular y para quien reservó el turno.
        </p>

        {!ultimo ? (
          <Bloque num="1 · Último comprobante" titulo="Todavía no tenés comprobantes">
            <Callout>
              Cuando la sala registre el pago de una de tus consultas, vas a ver acá su comprobante para
              descargarlo en PDF.
            </Callout>
          </Bloque>
        ) : (
          <>
            <Bloque
              num="1 · Último comprobante"
              titulo={`Comprobante N.º ${formatearNumeroComprobante(ultimo.numero)}`}
            >
              <Tabla>
                <thead>
                  <tr className={THEAD_TR}>
                    <th className={TH}>Dato</th>
                    <th className={TH}>Detalle</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  <tr>
                    <td className={TD}>Sala</td>
                    <td className={TD}>{SALA_NOMBRE}</td>
                  </tr>
                  <tr>
                    <td className={TD}>Paciente</td>
                    <td className={TD}>{ultimo.pacienteNombre}</td>
                  </tr>
                  <tr>
                    <td className={TD}>Prestación</td>
                    <td className={TD}>
                      {ultimo.prestacion} — {ultimo.profesionalNombre}
                    </td>
                  </tr>
                  <tr>
                    <td className={TD}>Fecha</td>
                    <td className={TD}>
                      {formatearFechaAr(ultimo.fecha)} {ultimo.hora}
                    </td>
                  </tr>
                  <tr>
                    <td className={TD}>Importe</td>
                    <td className={TD}>{formatearPesos(ultimo.importeCentavos)}</td>
                  </tr>
                  <tr>
                    <td className={TD}>Medio de pago</td>
                    <td className={TD}>{MEDIO_PAGO_LABELS[ultimo.medio]}</td>
                  </tr>
                </tbody>
              </Tabla>
              <Callout>{AVISO_COMPROBANTE_INTERNO}</Callout>
            </Bloque>

            <Bloque num="2 · Descargar" titulo="Descarga del comprobante">
              <div>
                <a href={`/api/comprobantes/${ultimo.id}`} className={`${BTN_PRIMARY} inline-block`}>
                  Descargar PDF
                </a>
              </div>
              <Hint>
                Disponible para el titular, la persona que reservó el turno y el personal administrativo.
              </Hint>
            </Bloque>

            <Bloque num="3 · Mis pagos" titulo="Comprobantes anteriores">
              <Tabla>
                <thead>
                  <tr className={THEAD_TR}>
                    <th className={TH}>N.º</th>
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Prestación</th>
                    <th className={TH}>Importe</th>
                    <th className={TH}>Medio</th>
                    <th className={TH}>Descargar</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {comprobantes.map((c) => (
                    <tr key={c.id}>
                      <td className={TD}>{formatearNumeroComprobante(c.numero)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{formatearFechaAr(c.fecha)}</td>
                      <td className={TD}>
                        {c.prestacion}
                        <span className="block text-xs text-ink-secondary">{c.pacienteNombre}</span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{formatearPesos(c.importeCentavos)}</td>
                      <td className={TD}>{MEDIO_PAGO_LABELS[c.medio]}</td>
                      <td className={TD}>
                        <a
                          href={`/api/comprobantes/${c.id}`}
                          className="inline-flex rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink"
                        >
                          Descargar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Hint>Numeración correlativa: sin huecos ni duplicados.</Hint>
            </Bloque>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
