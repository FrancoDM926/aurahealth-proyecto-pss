import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT_CLASS,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import {
  normalizarFiltrosReporteAusentismo,
} from "@/lib/reporte-ausentismo";
import {
  consultarReporteAusentismo,
  opcionesFiltrosReporteAusentismo,
} from "@/lib/reporte-ausentismo-datos";

export const metadata = {
  title: "Reportes — Asistencia y ausentismo | AuraHealth",
  description: "Reporte administrativo de asistencia y ausentismo de pacientes.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    profesionalId?: string;
  }>;
};

export default async function ReporteAusentismoPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const filtros = normalizarFiltrosReporteAusentismo(await searchParams, todayInArgentina());

  const [opciones, reporte] = await Promise.all([
    opcionesFiltrosReporteAusentismo(),
    filtros.error ? Promise.resolve(null) : consultarReporteAusentismo(filtros),
  ]);

  const exportQs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.profesionalId) exportQs.set("profesionalId", filtros.profesionalId);
  const exportHref = (formato: "pdf" | "csv") => `/api/reportes/ausentismo?${exportQs}&format=${formato}`;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="reportes"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Cabecera y acciones principales */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Reportes — Asistencia y ausentismo
            </h1>
          </div>
          {reporte && (
            <div className="flex items-center gap-2">
              <a href={exportHref("pdf")} className={BTN_SECONDARY}>
                Exportar PDF
              </a>
              <a href={exportHref("csv")} className={BTN_SECONDARY}>
                Exportar CSV
              </a>
            </div>
          )}
        </div>

        {/* Pestañas de reportes */}
        <div className="mt-4 flex gap-4 border-b border-line text-sm">
          <Link
            href="/dashboard/admin/reportes/pagos"
            className="pb-2 font-medium text-ink-secondary transition hover:text-ink"
          >
            Pagos realizados
          </Link>
          <Link
            href="/dashboard/admin/reportes/ausentismo"
            className="border-b-2 border-primary pb-2 font-bold text-primary"
          >
            Asistencia y ausentismo
          </Link>
        </div>

        {/* Panel de Filtros */}
        <section className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-2xs sm:p-6">
          <form method="get" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="desde">
                  Desde
                </label>
                <input
                  id="desde"
                  name="desde"
                  type="date"
                  defaultValue={filtros.desde}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="hasta">
                  Hasta
                </label>
                <input
                  id="hasta"
                  name="hasta"
                  type="date"
                  defaultValue={filtros.hasta}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="profesionalId">
                  Profesional
                </label>
                <select
                  id="profesionalId"
                  name="profesionalId"
                  defaultValue={filtros.profesionalId}
                  className={INPUT_CLASS}
                >
                  <option value="">Todos los profesionales</option>
                  {opciones.profesionales.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.especialidadLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" className={BTN_PRIMARY}>
                Generar reporte
              </button>
              <Link href="/dashboard/admin/reportes/ausentismo" className={BTN_SECONDARY}>
                Restablecer
              </Link>
            </div>
          </form>

          {filtros.error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {filtros.error}
            </div>
          )}
        </section>

        {reporte && (
          <div className="mt-6 space-y-6">
            {/* Panel de Métricas Clave (KPIs) */}
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface p-5 shadow-2xs">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Ausentismo general
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-primary">
                    {reporte.porcentajeGeneralLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  Sobre el total de turnos reservados computables.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-2xs">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Turnos ausentes
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-red-600">
                    {reporte.totalAusentes}
                  </span>
                  <span className="text-xs text-ink-secondary">turnos sin asistencia</span>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  Pacientes que no se presentaron a su cita.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface p-5 shadow-2xs">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  Turnos reservados
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-ink">
                    {reporte.totalReservados}
                  </span>
                  <span className="text-xs text-ink-secondary">turnos totales</span>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  Excluye turnos cancelados por la sala.
                </p>
              </div>
            </section>

            {/* Desglose de Asistencia */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-2xs sm:p-6">
              <h2 className="text-lg font-bold text-ink">Desglose de asistencia</h2>
              <div className="mt-5 space-y-6">
                {/* Desglose por profesional */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Por profesional</h3>
                  <Tabla>
                    <thead>
                      <tr className={THEAD_TR}>
                        <th className={TH}>Profesional</th>
                        <th className={`${TH} text-right`}>Reservados</th>
                        <th className={`${TH} text-right`}>Ausentes</th>
                        <th className={`${TH} text-right`}>% Ausentismo</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {reporte.porProfesional.map((f) => (
                        <tr key={f.etiqueta}>
                          <td className={`${TD} font-medium`}>{f.etiqueta}</td>
                          <td className={`${TD} text-right`}>{f.reservados}</td>
                          <td className={`${TD} text-right`}>{f.ausentes}</td>
                          <td className={`${TD} text-right font-semibold`}>{f.porcentajeLabel}</td>
                        </tr>
                      ))}
                      {reporte.porProfesional.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`${TD} text-center text-ink-secondary`}>
                            No se registran turnos para los filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Tabla>
                </div>

                {/* Desglose por especialidad */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Por especialidad</h3>
                  <Tabla>
                    <thead>
                      <tr className={THEAD_TR}>
                        <th className={TH}>Especialidad</th>
                        <th className={`${TH} text-right`}>Reservados</th>
                        <th className={`${TH} text-right`}>Ausentes</th>
                        <th className={`${TH} text-right`}>% Ausentismo</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {reporte.porEspecialidad.map((f) => (
                        <tr key={f.etiqueta}>
                          <td className={`${TD} font-medium`}>{f.etiqueta}</td>
                          <td className={`${TD} text-right`}>{f.reservados}</td>
                          <td className={`${TD} text-right`}>{f.ausentes}</td>
                          <td className={`${TD} text-right font-semibold`}>{f.porcentajeLabel}</td>
                        </tr>
                      ))}
                      {reporte.porEspecialidad.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`${TD} text-center text-ink-secondary`}>
                            No se registran turnos para los filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Tabla>
                </div>

                {/* Desglose por tipo de turno */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Por tipo de turno</h3>
                  <Tabla>
                    <thead>
                      <tr className={THEAD_TR}>
                        <th className={TH}>Tipo de turno</th>
                        <th className={`${TH} text-right`}>Reservados</th>
                        <th className={`${TH} text-right`}>Ausentes</th>
                        <th className={`${TH} text-right`}>% Ausentismo</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {reporte.porTipoTurno.map((f) => (
                        <tr key={f.etiqueta}>
                          <td className={`${TD} font-medium`}>{f.etiqueta}</td>
                          <td className={`${TD} text-right`}>{f.reservados}</td>
                          <td className={`${TD} text-right`}>{f.ausentes}</td>
                          <td className={`${TD} text-right font-semibold`}>{f.porcentajeLabel}</td>
                        </tr>
                      ))}
                      {reporte.porTipoTurno.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`${TD} text-center text-ink-secondary`}>
                            No se registran turnos para los filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Tabla>
                </div>
              </div>
            </section>

            {/* Distribución y Reincidencia */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-2xs sm:p-6">
              <h2 className="text-lg font-bold text-ink">Distribución y pacientes</h2>
              <div className="mt-5 space-y-6">
                {/* Desglose por día de la semana */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Distribución por día de la semana</h3>
                  <Tabla>
                    <thead>
                      <tr className={THEAD_TR}>
                        <th className={TH}>Día de la semana</th>
                        <th className={`${TH} text-right`}>Reservados</th>
                        <th className={`${TH} text-right`}>Ausentes</th>
                        <th className={`${TH} text-right`}>% Ausentismo</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {reporte.porDiaSemana.map((f) => (
                        <tr key={f.etiqueta}>
                          <td className={`${TD} font-medium`}>{f.etiqueta}</td>
                          <td className={`${TD} text-right`}>{f.reservados}</td>
                          <td className={`${TD} text-right`}>{f.ausentes}</td>
                          <td className={`${TD} text-right font-semibold`}>{f.porcentajeLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                </div>

                {/* Pacientes con más ausencias */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Pacientes con mayor cantidad de ausencias</h3>
                  <Tabla>
                    <thead>
                      <tr className={THEAD_TR}>
                        <th className={TH}>Paciente</th>
                        <th className={`${TH} text-right`}>Reservados</th>
                        <th className={`${TH} text-right`}>Ausentes</th>
                      </tr>
                    </thead>
                    <tbody className={TBODY}>
                      {reporte.pacientesReincidentes.map((p) => (
                        <tr key={p.pacienteNombre}>
                          <td className={`${TD} font-medium`}>{p.pacienteNombre}</td>
                          <td className={`${TD} text-right`}>{p.reservados}</td>
                          <td className={`${TD} text-right font-semibold text-red-600`}>
                            {p.ausentes}
                          </td>
                        </tr>
                      ))}
                      {reporte.pacientesReincidentes.length === 0 && (
                        <tr>
                          <td colSpan={3} className={`${TD} text-center text-ink-secondary`}>
                            No se registran pacientes con ausencias en este período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Tabla>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a href={exportHref("pdf")} className={BTN_SECONDARY}>
                    Exportar PDF
                  </a>
                  <a href={exportHref("csv")} className={BTN_SECONDARY}>
                    Exportar CSV
                  </a>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
