"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  agruparPorDia,
  diasDelRango,
  ESTADO_LABELS,
  etiquetaDia,
  etiquetaPeriodo,
  FILTRO_LABELS,
  huecosLibres,
  inicioDeSemana,
  moverPeriodo,
  pasaFiltro,
  rangoDeVista,
  resumenDelDia,
  VISTA_LABELS,
  VISTAS,
  type EstadoTurnoAgenda,
  type FiltroAgenda,
  type TurnoAgenda,
  type VistaAgenda,
} from "@/lib/agenda-profesional";

type Props = {
  doctorName: string;
  vista: VistaAgenda;
  fecha: string;
  hoy: string;
  turnos: TurnoAgenda[];
};

const ESTADO_CLASES: Record<EstadoTurnoAgenda, string> = {
  DISPONIBLE: "border-emerald-300 bg-emerald-50 text-emerald-900",
  RESERVADO: "border-sky-300 bg-sky-50 text-sky-900",
  CUMPLIDO: "border-slate-300 bg-slate-100 text-slate-700",
  AUSENTE: "border-amber-300 bg-amber-50 text-amber-900",
  CANCELADO: "border-red-300 bg-red-50 text-red-800",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function AgendaProfesionalView({ doctorName, vista, fecha, hoy, turnos }: Props) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroAgenda>("todos");
  const [pending, startTransition] = useTransition();

  /** Cambia de vista o de período sin recargar la pantalla (navegación del lado del cliente). */
  const ir = (nuevaVista: VistaAgenda, nuevaFecha: string) => {
    startTransition(() => {
      router.push(`/dashboard/agenda?vista=${nuevaVista}&fecha=${nuevaFecha}`, { scroll: false });
    });
  };

  const visibles = turnos.filter((t) => pasaFiltro(t, filtro));
  const porDia = agruparPorDia(visibles);
  const [year, month] = fecha.split("-").map(Number);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <span className="text-xs font-semibold uppercase tracking-wider text-primary">
        US-11 · Vista de agenda profesional · Sprint 1
      </span>
      <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Mi agenda — {doctorName}</h1>

      {/* Período de consulta: "Vista" y "Mostrar" lado a lado, como el wireframe */}
      <section className="mt-8 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-bold text-ink">Período de consulta</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="vista">
              Vista
            </label>
            {/* Como el wireframe: la vista y su período en el mismo selector. */}
            <select
              id="vista"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              value={vista}
              onChange={(e) => ir(e.target.value as VistaAgenda, fecha)}
            >
              {VISTAS.map((v) => (
                <option key={v} value={v}>
                  {VISTA_LABELS[v]} — {etiquetaPeriodo(v, fecha)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="mostrar">
              Mostrar
            </label>
            <select
              id="mostrar"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as FiltroAgenda)}
            >
              {(Object.keys(FILTRO_LABELS) as FiltroAgenda[]).map((f) => (
                <option key={f} value={f}>
                  {FILTRO_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Agenda */}
      <section
        aria-busy={pending}
        className={`mt-6 rounded-xl border-2 border-line bg-surface p-4 transition-opacity sm:p-6 ${
          pending ? "opacity-60" : ""
        }`}
      >
        {/* Título a la izquierda y navegación del período a la derecha. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink" aria-live="polite">
            {vista === "dia"
              ? "Turnos del día"
              : vista === "semana"
                ? "Turnos de la semana"
                : "Turnos del mes"}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Período anterior"
              onClick={() => ir(vista, moverPeriodo(vista, fecha, -1))}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-background"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => ir(vista, hoy)}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-background"
            >
              Hoy
            </button>
            <button
              type="button"
              aria-label="Período siguiente"
              onClick={() => ir(vista, moverPeriodo(vista, fecha, 1))}
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-background"
            >
              Siguiente →
            </button>
          </div>
        </div>

        <div className="mt-4">
          {turnos.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-secondary">
              No hay turnos generados en este período.
            </p>
          ) : visibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-secondary">
              Ningún turno coincide con «{FILTRO_LABELS[filtro]}».
            </p>
          ) : vista === "dia" ? (
            <VistaDiaria turnos={porDia.get(fecha) ?? []} />
          ) : vista === "semana" ? (
            <VistaSemanal fecha={fecha} hoy={hoy} porDia={porDia} onDia={(d) => ir("dia", d)} />
          ) : (
            <VistaMensual fecha={fecha} hoy={hoy} porDia={porDia} onDia={(d) => ir("dia", d)} />
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/dashboard/agenda-generada?year=${year}&month=${month}`}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-background"
          >
            Ver generación
          </Link>
          <Link
            href={`/dashboard/disponibilidad?year=${year}&month=${month}`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Cargar disponibilidad
          </Link>
        </div>
      </section>
    </div>
  );
}

function Turno({ turno }: { turno: TurnoAgenda }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 text-xs ${ESTADO_CLASES[turno.status]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold tabular-nums">
          {turno.startTime}–{turno.endTime}
        </span>
        <span className="font-semibold">{ESTADO_LABELS[turno.status]}</span>
      </div>
    </div>
  );
}

/** Vista diaria: orden cronológico e identificación de los huecos libres. */
function VistaDiaria({ turnos }: { turnos: TurnoAgenda[] }) {
  if (turnos.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-secondary">Sin turnos este día.</p>;
  }
  const huecos = huecosLibres(turnos);
  const resumen = resumenDelDia(turnos);

  return (
    <div>
      <p className="text-sm text-ink-secondary">
        {resumen.total} turnos · {resumen.DISPONIBLE} libres · {resumen.RESERVADO} reservados
      </p>
      {huecos.length > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>Huecos libres:</strong>{" "}
          {huecos
            .map(
              (h) =>
                `${h.startTime}–${h.endTime} (${h.turnos} turno${h.turnos === 1 ? "" : "s"})`
            )
            .join(" · ")}
        </div>
      )}
      <ul className="mt-4 space-y-1.5">
        {turnos.map((t) => (
          <li key={t.id}>
            <Turno turno={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Vista semanal: una columna por día con sus turnos (solo los días que tienen
 * turnos, como el wireframe). En celular las columnas se apilan.
 */
function VistaSemanal({
  fecha,
  hoy,
  porDia,
  onDia,
}: {
  fecha: string;
  hoy: string;
  porDia: Map<string, TurnoAgenda[]>;
  onDia: (fecha: string) => void;
}) {
  const dias = diasDelRango(rangoDeVista("semana", inicioDeSemana(fecha))).filter((d) =>
    porDia.has(d)
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      {dias.map((d) => {
        const e = etiquetaDia(d);
        return (
          <div
            key={d}
            className={`rounded-lg border p-2 ${d === hoy ? "border-primary" : "border-line"}`}
          >
            <button
              type="button"
              onClick={() => onDia(d)}
              className={`mb-2 w-full text-left text-sm font-semibold hover:text-primary ${
                d === hoy ? "text-primary" : "text-ink"
              }`}
            >
              {e.corto} {e.numero}
            </button>
            <ul className="space-y-1.5">
              {(porDia.get(d) ?? []).map((t) => (
                <li key={t.id}>
                  <Turno turno={t} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Vista mensual: calendario con libres y reservados por día. Tocando un día se abre la vista diaria. */
function VistaMensual({
  fecha,
  hoy,
  porDia,
  onDia,
}: {
  fecha: string;
  hoy: string;
  porDia: Map<string, TurnoAgenda[]>;
  onDia: (fecha: string) => void;
}) {
  const rango = rangoDeVista("mes", fecha);
  const dias = diasDelRango(rango);
  const relleno = DIAS_SEMANA.indexOf(etiquetaDia(rango.desde).corto);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-secondary">
        {DIAS_SEMANA.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: relleno }).map((_, i) => (
          <div key={`vacio-${i}`} />
        ))}
        {dias.map((d) => {
          const r = resumenDelDia(porDia.get(d) ?? []);
          return (
            <button
              key={d}
              type="button"
              disabled={r.total === 0}
              onClick={() => onDia(d)}
              className={`min-h-14 rounded-md border p-1 text-left text-xs disabled:cursor-default disabled:opacity-50 sm:min-h-16 ${
                d === hoy ? "border-primary" : "border-line"
              } enabled:hover:bg-background`}
            >
              <span className="font-bold text-ink">{etiquetaDia(d).numero}</span>
              {r.total > 0 && (
                <span className="mt-0.5 block leading-tight">
                  <span className="block text-emerald-700">{r.DISPONIBLE} lib.</span>
                  <span className="block text-sky-700">{r.RESERVADO} res.</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-secondary">
        lib. = libres · res. = reservados · Tocá un día para ver el detalle.
      </p>
    </div>
  );
}
