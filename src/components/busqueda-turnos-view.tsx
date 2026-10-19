"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sumarDias } from "@/lib/agenda-profesional";
import {
  ESPECIALIDADES_BUSQUEDA,
  formatearDiaLargo,
  MENSAJE_SIN_RESULTADOS,
  type FiltrosBusquedaNormalizados,
  type GrupoDiaTurnos,
  type ProfesionalBusqueda,
  type TurnoDisponiblePaciente,
} from "@/lib/busqueda-turnos";
import { SPECIALTY_LABELS } from "@/lib/roles";
import type { MedicalSpecialty } from "@/generated/prisma/client";

type BusquedaTurnosViewProps = {
  filtros: FiltrosBusquedaNormalizados;
  rangoDefecto: { desde: string; hasta: string };
  profesionales: ProfesionalBusqueda[];
  turnos: TurnoDisponiblePaciente[];
  gruposPorDia: GrupoDiaTurnos[];
  mensajeVacio: string | null;
};

export function BusquedaTurnosView({
  filtros,
  rangoDefecto,
  profesionales,
  turnos,
  gruposPorDia,
  mensajeVacio,
}: BusquedaTurnosViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [specialty, setSpecialty] = useState<MedicalSpecialty | "">(filtros.specialty);
  const [doctorId, setDoctorId] = useState<string>(filtros.doctorId);
  const [desde, setDesde] = useState<string>(filtros.desde);
  const [hasta, setHasta] = useState<string>(filtros.hasta);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<TurnoDisponiblePaciente | null>(null);

  const ejecutarBusqueda = (params: {
    specialty: string;
    doctorId: string;
    desde: string;
    hasta: string;
  }) => {
    const query = new URLSearchParams();
    if (params.specialty) query.set("especialidad", params.specialty);
    if (params.doctorId) query.set("profesional", params.doctorId);
    if (params.desde && params.desde !== rangoDefecto.desde) {
      query.set("desde", params.desde);
    }
    if (params.hasta && params.hasta !== rangoDefecto.hasta) {
      query.set("hasta", params.hasta);
    }

    const qs = query.toString();
    startTransition(() => {
      router.push(qs ? `/dashboard/turnos?${qs}` : "/dashboard/turnos", { scroll: false });
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTurnoSeleccionado(null);
    ejecutarBusqueda({ specialty, doctorId, desde, hasta });
  };

  const handleLimpiarFiltros = () => {
    setSpecialty("");
    setDoctorId("");
    setDesde(rangoDefecto.desde);
    setHasta(rangoDefecto.hasta);
    setTurnoSeleccionado(null);
    startTransition(() => {
      router.push("/dashboard/turnos", { scroll: false });
    });
  };

  const handleAmpliarRango = () => {
    const nuevoHasta = sumarDias(hasta, 30);
    setHasta(nuevoHasta);
    setTurnoSeleccionado(null);
    ejecutarBusqueda({ specialty, doctorId, desde, hasta: nuevoHasta });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Turnos disponibles — Vista del paciente
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          La agenda del mes se abre automáticamente cuando el profesional confirma su disponibilidad; podés buscar por especialidad, profesional y rango de fechas.
        </p>
      </div>

      {/* BLOQUE 1: FILTROS DE BÚSQUEDA */}
      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Buscar turnos</h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="esp">
                Especialidad
              </label>
              <select
                id="esp"
                name="especialidad"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value as MedicalSpecialty | "")}
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              >
                <option value="">Todas las especialidades</option>
                {ESPECIALIDADES_BUSQUEDA.map((esp) => (
                  <option key={esp} value={esp}>
                    {SPECIALTY_LABELS[esp]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="prof">
                Profesional
              </label>
              <select
                id="prof"
                name="profesional"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              >
                <option value="">Todos los profesionales</option>
                {profesionales.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.fullName} — {prof.specialtyLabel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="desde">
                Fecha desde
              </label>
              <input
                id="desde"
                name="desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="hasta">
                Fecha hasta
              </label>
              <input
                id="hasta"
                name="hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? "Buscando..." : "Buscar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleLimpiarFiltros}
              className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50"
            >
              Limpiar filtros
            </button>
          </div>
        </form>
      </section>

      {/* ERROR DE VALIDACIÓN DE RANGO */}
      {filtros.error && (
        <section
          role="alert"
          className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900 sm:p-6"
        >
          <h2 className="text-base font-bold text-red-900">Rango de fechas inválido</h2>
          <p className="mt-1">{filtros.error}</p>
        </section>
      )}

      {/* RESUMEN DEL TURNO SELECCIONADO (CONEXIÓN CON US-13) */}
      {turnoSeleccionado && (
        <section
          aria-live="polite"
          className="mt-6 rounded-xl border-2 border-primary bg-surface p-4 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-primary-dark">
              Turno seleccionado para reservar
            </h2>
            <button
              type="button"
              onClick={() => setTurnoSeleccionado(null)}
              className="text-xs font-semibold text-ink-secondary underline hover:text-ink"
            >
              Cerrar resumen
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-background p-3">
              <dt className="text-xs font-medium text-ink-secondary">Profesional</dt>
              <dd className="mt-0.5 font-semibold text-ink">{turnoSeleccionado.doctorName}</dd>
            </div>
            <div className="rounded-lg border border-line bg-background p-3">
              <dt className="text-xs font-medium text-ink-secondary">Especialidad</dt>
              <dd className="mt-0.5 font-semibold text-ink">{turnoSeleccionado.specialtyLabel}</dd>
            </div>
            <div className="rounded-lg border border-line bg-background p-3">
              <dt className="text-xs font-medium text-ink-secondary">Fecha y horario</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {formatearDiaLargo(turnoSeleccionado.date)} · {turnoSeleccionado.startTime} –{" "}
                {turnoSeleccionado.endTime}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* BLOQUE 2: RESULTADOS AGRUPADOS POR DÍA Y ORDENADOS CRONOLÓGICAMENTE */}
      {!filtros.error && turnos.length > 0 && (
        <section
          aria-busy={pending}
          className={`mt-6 rounded-xl border-2 border-line bg-surface p-4 transition-opacity sm:p-6 ${
            pending ? "opacity-60" : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">
              Turnos disponibles ({turnos.length}) · ordenados por fecha
            </h2>
          </div>

          <div className="mt-4 space-y-6">
            {gruposPorDia.map((grupo) => (
              <div
                key={grupo.date}
                className="overflow-hidden rounded-xl border border-line bg-background"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
                  <h3 className="text-sm font-bold text-ink sm:text-base">
                    {grupo.etiquetaLarga}
                  </h3>
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    {grupo.turnos.length}{" "}
                    {grupo.turnos.length === 1 ? "turno disponible" : "turnos disponibles"}
                  </span>
                </div>

                {/* Vista en tabla para pantallas >= sm */}
                <div className="hidden sm:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                        <th className="px-4 py-2.5">Día</th>
                        <th className="px-4 py-2.5">Horario</th>
                        <th className="px-4 py-2.5">Profesional</th>
                        <th className="px-4 py-2.5">Especialidad</th>
                        <th className="px-4 py-2.5 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {grupo.turnos.map((turno) => (
                        <tr key={turno.id} className="transition hover:bg-background/50">
                          <td className="px-4 py-3 font-medium text-ink">{turno.diaCorto}</td>
                          <td className="px-4 py-3 font-semibold text-ink">
                            {turno.startTime} – {turno.endTime}
                          </td>
                          <td className="px-4 py-3 text-ink">{turno.doctorName}</td>
                          <td className="px-4 py-3 text-ink-secondary">{turno.specialtyLabel}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setTurnoSeleccionado(turno)}
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark"
                            >
                              Reservar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Vista adaptable para celulares >= 360px (RNF-08: sin desplazamiento horizontal) */}
                <ul className="divide-y divide-line bg-surface sm:hidden">
                  {grupo.turnos.map((turno) => (
                    <li key={turno.id} className="flex flex-col gap-2 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">
                          {turno.diaCorto} · {turno.startTime} – {turno.endTime}
                        </span>
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Disponible
                        </span>
                      </div>
                      <div className="text-xs text-ink">
                        <p className="font-semibold">{turno.doctorName}</p>
                        <p className="text-ink-secondary">{turno.specialtyLabel}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTurnoSeleccionado(turno)}
                        className="mt-1 inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark"
                      >
                        Reservar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* BLOQUE 3: ESTADO VACÍO (CRITERIO 6) */}
      {!filtros.error && turnos.length === 0 && (
        <section
          aria-live="polite"
          className="mt-6 rounded-xl border-2 border-line bg-surface p-5 sm:p-6"
        >
          <h2 className="text-lg font-bold text-ink">Sin resultados para el filtro elegido</h2>
          <div
            role="status"
            className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900"
          >
            {mensajeVacio ?? MENSAJE_SIN_RESULTADOS}
          </div>
          <p className="mt-3 text-xs text-ink-secondary">
            Este mensaje también contempla el caso en que ningún profesional haya confirmado todavía su disponibilidad para el período consultado.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={handleAmpliarRango}
              className="inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
            >
              Ampliar rango 30 días más
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleLimpiarFiltros}
              className="inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-xs font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50"
            >
              Restablecer filtros por defecto
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
