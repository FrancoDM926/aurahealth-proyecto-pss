import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Badge,
  Bloque,
  Callout,
  Hint,
  INPUT_CLASS,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { MEDIOS_PAGO, MEDIO_PAGO_LABELS, formatearPesos } from "@/lib/pagos";
import {
  ESTADO_PAGO_LABELS,
  PARTICULAR_LABEL,
  formatearPeriodo,
  normalizarFiltrosReportePagos,
} from "@/lib/reporte-pagos";
import { consultarReportePagos, opcionesFiltrosReportePagos } from "@/lib/reporte-pagos-datos";
import { SPECIALTY_LABELS } from "@/lib/roles";

export const metadata = {
  title: "Reportes — Pagos | AuraHealth",
  description: "Pagos realizados por período, medio de pago y obra social.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    medio?: string;
    obraSocial?: string;
    profesionalId?: string;
    especialidad?: string;
  }>;
};

/** US-47 (wf_reporte_pagos.html): importes por período, medio de pago y obra social. */
export default async function ReportePagosPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const filtros = normalizarFiltrosReportePagos(await searchParams, todayInArgentina());

  const [opciones, reporte] = await Promise.all([
    opcionesFiltrosReportePagos(),
    filtros.error ? Promise.resolve(null) : consultarReportePagos(filtros),
  ]);

  const exportQs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.medio) exportQs.set("medio", filtros.medio);
  if (filtros.obraSocial) exportQs.set("obraSocial", filtros.obraSocial);
  if (filtros.profesionalId) exportQs.set("profesionalId", filtros.profesionalId);
  if (filtros.especialidad) exportQs.set("especialidad", filtros.especialidad);
  const exportHref = (formato: "pdf" | "csv") => `/api/reportes/pagos?${exportQs}&format=${formato}`;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="reportes"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Reportes — Pagos realizados
        </h1>
        {/* Pestañas de reportes */}
        <div className="mt-4 flex gap-4 border-b border-line text-sm">
          <Link
            href="/dashboard/admin/reportes"
            className="pb-2 font-medium text-ink-secondary transition hover:text-ink"
          >
            Turnos por especialidad
          </Link>
          <Link
            href="/dashboard/admin/reportes/pagos"
            className="border-b-2 border-primary pb-2 font-bold text-primary"
          >
            Pagos realizados
          </Link>
          <Link
            href="/dashboard/admin/reportes/ausentismo"
            className="pb-2 font-medium text-ink-secondary transition hover:text-ink"
          >
            Asistencia y ausentismo
          </Link>
        </div>

        <p className="mt-2 text-sm text-ink-secondary">
          Importes por período, medio de pago y obra social.
        </p>

        <Bloque num="1 · Filtros" titulo="Parámetros del reporte">
          <form method="get" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="desde">
                  Desde
                </label>
                <input id="desde" name="desde" type="date" defaultValue={filtros.desde} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="hasta">
                  Hasta
                </label>
                <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="medio">
                  Medio de pago
                </label>
                <select id="medio" name="medio" defaultValue={filtros.medio} className={INPUT_CLASS}>
                  <option value="">Todos</option>
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m} value={m}>
                      {MEDIO_PAGO_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="obraSocial">
                  Obra social
                </label>
                <select id="obraSocial" name="obraSocial" defaultValue={filtros.obraSocial} className={INPUT_CLASS}>
                  <option value="">Todas</option>
                  {opciones.obrasSociales.map((nombre) => (
                    <option key={nombre} value={nombre === PARTICULAR_LABEL ? "PARTICULAR" : nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="profesionalId">
                  Profesional
                </label>
                <select id="profesionalId" name="profesionalId" defaultValue={filtros.profesionalId} className={INPUT_CLASS}>
                  <option value="">Todos</option>
                  {opciones.profesionales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="especialidad">
                  Especialidad
                </label>
                <select id="especialidad" name="especialidad" defaultValue={filtros.especialidad} className={INPUT_CLASS}>
                  <option value="">Todas</option>
                  {Object.entries(SPECIALTY_LABELS).map(([valor, label]) => (
                    <option key={valor} value={valor}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <button type="submit" className={BTN_PRIMARY}>
                Generar reporte
              </button>
            </div>
          </form>
          {filtros.error && <Callout tipo="error">{filtros.error}</Callout>}
        </Bloque>

        {reporte && (
          <>
            <Bloque num="2 · Detalle" titulo="Importes por período, medio y obra social">
              {reporte.detalle.length === 0 ? (
                <Callout>No hay pagos registrados para los filtros elegidos.</Callout>
              ) : (
                <Tabla>
                  <thead>
                    <tr className={THEAD_TR}>
                      <th className={TH}>Período</th>
                      <th className={TH}>Medio</th>
                      <th className={TH}>Obra social</th>
                      <th className={`${TH} text-right`}>Importe</th>
                      <th className={TH}>Estado</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {reporte.detalle.map((fila) => (
                      <tr
                        key={`${fila.periodoDesde}-${fila.medio}-${fila.obraSocial}-${fila.estado}`}
                        className={fila.estado === "ANULADO" ? "text-ink-secondary line-through" : undefined}
                      >
                        <td className={`${TD} whitespace-nowrap`}>
                          {formatearPeriodo(fila.periodoDesde, fila.periodoHasta)}
                        </td>
                        <td className={TD}>{MEDIO_PAGO_LABELS[fila.medio]}</td>
                        <td className={TD}>{fila.obraSocial}</td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          {formatearPesos(fila.importeCentavos)}
                        </td>
                        <td className={TD}>
                          <Badge tono={fila.estado === "ANULADO" ? "error" : "ok"}>
                            {ESTADO_PAGO_LABELS[fila.estado]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
              <Callout>
                <strong>Total del período: {formatearPesos(reporte.totalCentavos)}</strong> — no incluye los
                pagos anulados.
                <br />
                Consultas particulares: {formatearPesos(reporte.totalParticularesCentavos)} · Consultas con
                cobertura: {formatearPesos(reporte.totalConCoberturaCentavos)}
                {reporte.porMedio.map((m) => (
                  <span key={m.medio}>
                    {" · "}
                    {MEDIO_PAGO_LABELS[m.medio]}: {formatearPesos(m.importeCentavos)}
                  </span>
                ))}
              </Callout>
              <Hint>
                Los pagos anulados se listan con su estado y no suman al total. Los pacientes particulares se
                distinguen del resto de las obras sociales del listado.
              </Hint>
            </Bloque>

            <Bloque num="3 · Desglose" titulo="Desglose por especialidad y profesional">
              {reporte.porProfesional.length === 0 ? (
                <Callout>Sin pagos vigentes para desglosar.</Callout>
              ) : (
                <Tabla>
                  <thead>
                    <tr className={THEAD_TR}>
                      <th className={TH}>Profesional</th>
                      <th className={TH}>Especialidad</th>
                      <th className={`${TH} text-right`}>Importe</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {reporte.porProfesional.map((p) => (
                      <tr key={`${p.profesionalNombre}-${p.especialidadLabel}`}>
                        <td className={TD}>{p.profesionalNombre}</td>
                        <td className={TD}>{p.especialidadLabel}</td>
                        <td className={`${TD} text-right whitespace-nowrap`}>
                          {formatearPesos(p.importeCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
              <div className="flex flex-wrap gap-2">
                <a href={exportHref("pdf")} className={`${BTN_SECONDARY} inline-block`}>
                  Exportar PDF
                </a>
                <a href={exportHref("csv")} className={`${BTN_SECONDARY} inline-block`}>
                  Exportar CSV
                </a>
              </div>
            </Bloque>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
