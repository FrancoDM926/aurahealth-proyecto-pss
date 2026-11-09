"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ESPECIALIDADES_REPORTE,
  ESPECIALIDAD_REPORTE_LABELS,
  type EspecialidadReporteKey,
  type ResultadoReporteTurnos,
} from "@/lib/reporte-turnos";

type ReporteTurnosViewProps = {
  reporte: ResultadoReporteTurnos;
};

const ESPECIALIDAD_BAR_COLORS: Record<EspecialidadReporteKey, string> = {
  TRAUMATOLOGIA: "border-traumatologia bg-traumatologia/85",
  CLINICA_MEDICA: "border-clinico bg-clinico/85",
  PEDIATRIA: "border-pediatria bg-pediatria/85",
  VACUNATORIO: "border-secondary bg-secondary/85",
};

const ESPECIALIDAD_BADGE_COLORS: Record<EspecialidadReporteKey, string> = {
  TRAUMATOLOGIA: "border-traumatologia/30 bg-traumatologia/10 text-traumatologia",
  CLINICA_MEDICA: "border-clinico/30 bg-clinico/10 text-clinico",
  PEDIATRIA: "border-pediatria/30 bg-pediatria/10 text-pediatria",
  VACUNATORIO: "border-secondary/30 bg-secondary/10 text-secondary",
};

export function ReporteTurnosView({ reporte }: ReporteTurnosViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const { filtros, rangoDefecto, porEspecialidad, porProfesional, totalesGenerales } =
    reporte;

  const [desde, setDesde] = useState<string>(filtros.desde);
  const [hasta, setHasta] = useState<string>(filtros.hasta);
  const [especialidad, setEspecialidad] = useState<EspecialidadReporteKey | "">(
    filtros.especialidad
  );

  const aplicarFiltros = (params: {
    desde: string;
    hasta: string;
    especialidad: string;
  }) => {
    const query = new URLSearchParams();
    if (params.desde && params.desde !== rangoDefecto.desde) {
      query.set("desde", params.desde);
    }
    if (params.hasta && params.hasta !== rangoDefecto.hasta) {
      query.set("hasta", params.hasta);
    }
    if (params.especialidad) {
      query.set("especialidad", params.especialidad);
    }

    const qs = query.toString();
    startTransition(() => {
      router.push(
        qs ? `/dashboard/admin/reportes?${qs}` : "/dashboard/admin/reportes",
        { scroll: false }
      );
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    aplicarFiltros({ desde, hasta, especialidad });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Reportes — Turnos por especialidad
      </h1>

      {/* Pestañas de reportes */}
      <div className="mt-4 flex gap-4 border-b border-line text-sm">
        <Link
          href="/dashboard/admin/reportes"
          className="border-b-2 border-primary pb-2 font-bold text-primary"
        >
          Turnos por especialidad
        </Link>
        <Link
          href="/dashboard/admin/reportes/pagos"
          className="pb-2 font-medium text-ink-secondary transition hover:text-ink"
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
        Totales y desglose de turnos por especialidad y profesional para evaluar la demanda y ajustar la disponibilidad.
      </p>

      {/* FILTROS */}
      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs sm:p-6">
        <h2 className="text-lg font-bold text-ink">
          Parámetros del reporte
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                className="mb-1 block text-sm font-medium text-ink"
                htmlFor="desde"
              >
                Desde
              </label>
              <input
                id="desde"
                name="desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium text-ink"
                htmlFor="hasta"
              >
                Hasta
              </label>
              <input
                id="hasta"
                name="hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium text-ink"
                htmlFor="especialidad"
              >
                Especialidad
              </label>
              <select
                id="especialidad"
                name="especialidad"
                value={especialidad}
                onChange={(e) =>
                  setEspecialidad(e.target.value as EspecialidadReporteKey | "")
                }
                className="w-full cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
              >
                <option value="">Todas</option>
                {ESPECIALIDADES_REPORTE.map((esp) => (
                  <option key={esp} value={esp}>
                    {ESPECIALIDAD_REPORTE_LABELS[esp]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition enabled:hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Generando..." : "Generar reporte"}
            </button>
          </div>
        </form>
      </section>

      {/* ERROR DE VALIDACIÓN DE FECHAS */}
      {filtros.error && (
        <section
          role="alert"
          className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900 sm:p-6"
        >
          <h2 className="text-base font-bold text-red-900">
            Rango de fechas inválido
          </h2>
          <p className="mt-1">{filtros.error}</p>
        </section>
      )}

      {/* TOTALES POR ESPECIALIDAD + REPRESENTACIÓN GRÁFICA */}
      {!filtros.error && (
        <section
          aria-busy={pending}
          className={`mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs transition-opacity sm:p-6 ${
            pending ? "opacity-60" : ""
          }`}
        >
          <h2 className="text-lg font-bold text-ink">
            Turnos por especialidad
          </h2>

          {/* Tabla en pantallas >= sm */}
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                  <th className="px-4 py-2.5">Especialidad</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Cumplidos</th>
                  <th className="px-4 py-2.5 text-right">Ausentes</th>
                  <th className="px-4 py-2.5 text-right">Cancelados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {porEspecialidad.map((fila) => (
                  <tr
                    key={fila.especialidad}
                    className="transition hover:bg-background/40"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                          ESPECIALIDAD_BADGE_COLORS[fila.especialidad]
                        }`}
                      >
                        {fila.especialidadLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-ink">
                      {fila.total}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">
                      {fila.cumplidos}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">
                      {fila.ausentes}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">
                      {fila.cancelados}
                    </td>
                  </tr>
                ))}
              </tbody>
              {porEspecialidad.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-line bg-background/50 font-semibold text-ink">
                    <td className="px-4 py-2.5">Total del período</td>
                    <td className="px-4 py-2.5 text-right font-bold">
                      {totalesGenerales.total}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {totalesGenerales.cumplidos}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {totalesGenerales.ausentes}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {totalesGenerales.cancelados}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Vista adaptable para celulares >= 360px (RNF-08) */}
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-background sm:hidden">
            {porEspecialidad.map((fila) => (
              <li
                key={fila.especialidad}
                className="flex flex-col gap-2 bg-surface p-3.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                      ESPECIALIDAD_BADGE_COLORS[fila.especialidad]
                    }`}
                  >
                    {fila.especialidadLabel}
                  </span>
                  <span className="text-sm font-bold text-ink">
                    Total: {fila.total}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-ink-secondary">
                  <div>
                    Cumplidos:{" "}
                    <strong className="text-ink">{fila.cumplidos}</strong>
                  </div>
                  <div>
                    Ausentes:{" "}
                    <strong className="text-ink">{fila.ausentes}</strong>
                  </div>
                  <div>
                    Cancelados:{" "}
                    <strong className="text-ink">{fila.cancelados}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {totalesGenerales.reservados > 0 && (
            <p className="mt-3 text-xs text-ink-secondary">
              Nota: el total del período incluye{" "}
              <strong>
                {totalesGenerales.reservados}{" "}
                {totalesGenerales.reservados === 1
                  ? "turno reservado pendiente"
                  : "turnos reservados pendientes"}
              </strong>{" "}
              de atención además de los cumplidos, ausentes y cancelados.
            </p>
          )}

          {/* Representación gráfica de la distribución (Criterio 4 y wireframe) */}
          <div
            aria-label="Representación gráfica de la distribución de turnos por especialidad"
            className="mt-6 flex h-44 items-end gap-3 border-b-2 border-line px-2 pt-6 sm:gap-6 sm:px-4"
          >
            {porEspecialidad.map((fila) => {
              const alturaPx =
                fila.total === 0
                  ? 6
                  : Math.max(14, Math.round((fila.porcentajeBarra / 100) * 112));
              return (
                <div
                  key={fila.especialidad}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span className="text-xs font-bold text-ink">
                    {fila.total}
                  </span>
                  <div
                    style={{ height: `${alturaPx}px` }}
                    title={`${fila.especialidadLabel}: ${fila.total} turnos (${fila.cumplidos} cumplidos, ${fila.ausentes} ausentes, ${fila.cancelados} cancelados)`}
                    className={`w-full max-w-36 rounded-t-md border-2 transition-all ${
                      ESPECIALIDAD_BAR_COLORS[fila.especialidad]
                    }`}
                  />
                  <span className="pb-2 text-center text-[11px] font-medium leading-tight text-ink-secondary sm:text-xs">
                    {fila.especialidadLabel}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-ink-secondary">
            El gráfico compara los totales de cada especialidad dentro del período seleccionado.
          </p>
        </section>
      )}

      {/* DESGLOSE POR PROFESIONAL */}
      {!filtros.error && (
        <section
          aria-busy={pending}
          className={`mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs transition-opacity sm:p-6 ${
            pending ? "opacity-60" : ""
          }`}
        >
          <h2 className="text-lg font-bold text-ink">
            Desglose por profesional
          </h2>

          {porProfesional.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-line bg-background p-6 text-center text-sm text-ink-secondary">
              No se registran profesionales ni turnos para los filtros seleccionados.
            </div>
          ) : (
            <>
              {/* Tabla en pantallas >= sm */}
              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                      <th className="px-4 py-2.5">Profesional</th>
                      <th className="px-4 py-2.5">Especialidad</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5 text-right">Cumplidos</th>
                      <th className="px-4 py-2.5 text-right">Ausentes</th>
                      <th className="px-4 py-2.5 text-right">Cancelados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {porProfesional.map((prof) => (
                      <tr
                        key={prof.profesionalId}
                        className="transition hover:bg-background/40"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          {prof.profesionalNombre}
                        </td>
                        <td className="px-4 py-3 text-ink-secondary">
                          {prof.especialidadLabel}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-ink">
                          {prof.total}
                        </td>
                        <td className="px-4 py-3 text-right text-ink">
                          {prof.cumplidos}
                        </td>
                        <td className="px-4 py-3 text-right text-ink">
                          {prof.ausentes}
                        </td>
                        <td className="px-4 py-3 text-right text-ink">
                          {prof.cancelados}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vista adaptable para celulares >= 360px (RNF-08) */}
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-background sm:hidden">
                {porProfesional.map((prof) => (
                  <li
                    key={prof.profesionalId}
                    className="flex flex-col gap-2 bg-surface p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-ink">
                          {prof.profesionalNombre}
                        </p>
                        <p className="text-ink-secondary">
                          {prof.especialidadLabel}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-ink">
                        Total: {prof.total}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-ink-secondary">
                      <div>
                        Cumplidos:{" "}
                        <strong className="text-ink">{prof.cumplidos}</strong>
                      </div>
                      <div>
                        Ausentes:{" "}
                        <strong className="text-ink">{prof.ausentes}</strong>
                      </div>
                      <div>
                        Cancelados:{" "}
                        <strong className="text-ink">{prof.cancelados}</strong>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
