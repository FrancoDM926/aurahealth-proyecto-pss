"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarAgendaVacunatorio, type FranjaVacunatorioItem } from "@/actions/agenda-vacunatorio";
import { isPastDate, opcionesHoraFin, opcionesHoraInicio } from "@/lib/availability-rn02";
import {
  cantidadTurnosDeFranja,
  claveFranja,
  formatearFechaAr,
  franjasSolapadas,
  ordenarFranjas,
  validarFranjaSimple,
  ERROR_SOLAPAMIENTO,
  type FranjaVacunatorio,
} from "@/lib/agenda-vacunatorio";

/**
 * US-63 — Agenda mensual del vacunatorio (wf_agenda_vacunatorio).
 * 1 · Franjas del mes (vista mensual) · 2 · Nueva franja · 3 · Guardar y publicar.
 */

type Props = {
  year: number;
  month: number;
  /** Franjas guardadas del mes. */
  inicial: FranjaVacunatorioItem[];
  /** Hoy ("YYYY-MM-DD") en la hora de la sala. */
  today: string;
};

type FranjaEditable = FranjaVacunatorio & { turnosReservados: number };

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const INPUT_CLASS = "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";
const HORAS_INICIO = opcionesHoraInicio();

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function nombreMes(year: number, month: number): string {
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function AgendaVacunatorioView({ year, month, inicial, today }: Props) {
  const router = useRouter();
  const [franjas, setFranjas] = useState<FranjaEditable[]>(() =>
    inicial.map((f) => ({
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      turnosReservados: f.turnosReservados,
    }))
  );
  const [dia, setDia] = useState("");
  const [desde, setDesde] = useState("08:00");
  const [hasta, setHasta] = useState("12:00");
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const ordenadas = useMemo(() => ordenarFranjas(franjas), [franjas]);
  const porDia = useMemo(() => {
    const map = new Map<string, FranjaEditable[]>();
    for (const f of ordenadas) map.set(f.date, [...(map.get(f.date) ?? []), f]);
    return map;
  }, [ordenadas]);

  const hayCambios = useMemo(() => {
    const a = new Set(inicial.map(claveFranja));
    const b = new Set(franjas.map(claveFranja));
    return a.size !== b.size || [...a].some((c) => !b.has(c));
  }, [inicial, franjas]);

  const totalTurnos = franjas.reduce((acc, f) => acc + cantidadTurnosDeFranja(f), 0);
  const opcionesFin = opcionesHoraFin(desde);

  const cambiarDesde = (value: string) => {
    setDesde(value);
    if (!opcionesHoraFin(value).includes(hasta)) setHasta(opcionesHoraFin(value)[0] ?? "");
  };

  const agregar = () => {
    setMessage(null);
    const nueva: FranjaVacunatorio = { date: dia, startTime: desde, endTime: hasta };
    const error = validarFranjaSimple(nueva);
    if (error) return setErrorNueva(error);
    if (!dia.startsWith(`${year}-${pad(month)}-`)) {
      return setErrorNueva("El día debe pertenecer al mes seleccionado.");
    }
    if (isPastDate(dia, today)) return setErrorNueva("No se pueden cargar franjas en fechas pasadas.");
    if (franjas.some((f) => franjasSolapadas(f, nueva))) return setErrorNueva(ERROR_SOLAPAMIENTO);
    setErrorNueva(null);
    setFranjas((prev) => [...prev, { ...nueva, turnosReservados: 0 }]);
  };

  const quitar = (f: FranjaEditable) => {
    if (f.turnosReservados > 0) {
      setMessage("No se puede quitar una franja con turnos reservados.");
      return;
    }
    setMessage(null);
    setFranjas((prev) => prev.filter((x) => claveFranja(x) !== claveFranja(f)));
  };

  const descartar = () => {
    setFranjas(
      inicial.map((f) => ({
        date: f.date,
        startTime: f.startTime,
        endTime: f.endTime,
        turnosReservados: f.turnosReservados,
      }))
    );
    setMessage(null);
    setErrorNueva(null);
  };

  const guardar = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await guardarAgendaVacunatorio(
        year,
        month,
        franjas.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }))
      );
      setMessage(result.message ?? null);
      if (result.success) router.refresh();
    } catch (err) {
      console.error("agenda del vacunatorio:", err);
      setMessage("No se pudo guardar la agenda. Probá de nuevo en unos segundos.");
    } finally {
      setSaving(false);
    }
  };

  const navegar = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    router.push(`/dashboard/agenda-vacunatorio?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}`);
  };

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" role="status">
          {message}
        </div>
      )}

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">1 · Franjas del mes — {nombreMes(year, month)}</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => navegar(-1)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium">
              ← Mes anterior
            </button>
            <button type="button" onClick={() => navegar(1)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium">
              Mes siguiente →
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs sm:gap-2 sm:text-sm">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="py-1 font-semibold text-ink-secondary">
              {h}
            </div>
          ))}
          {cells.map((d, idx) => {
            if (d === null) return <div key={`e-${idx}`} className="min-h-16" />;
            const key = dateKey(year, month, d);
            const delDia = porDia.get(key) ?? [];
            const past = isPastDate(key, today);
            return (
              <button
                key={key}
                type="button"
                disabled={past}
                onClick={() => setDia(key)}
                title={past ? "Fecha pasada" : "Elegir este día para una nueva franja"}
                className={`min-h-16 rounded-lg border p-1 transition ${
                  delDia.length > 0
                    ? "border-primary bg-primary-light text-primary"
                    : dia === key
                      ? "border-primary"
                      : "border-line bg-background hover:border-primary/50"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="font-semibold">{d}</span>
                {delDia.map((f) => (
                  <small key={claveFranja(f)} className="block text-[10px] leading-tight sm:text-xs">
                    {f.startTime}–{f.endTime}
                  </small>
                ))}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-ink-secondary">
          Vista mensual. La agenda del vacunatorio es independiente de las agendas médicas y es compartida: ambas
          enfermeras trabajan sobre la misma. No aplica la regla de 2 a 7 jornadas semanales.
        </p>
      </section>

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <h2 className="text-lg font-bold text-ink">2 · Nueva franja</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="dia" className="mb-1 block text-sm font-medium text-ink">
              Día
            </label>
            <input
              id="dia"
              type="date"
              className={INPUT_CLASS}
              min={today}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="desde" className="mb-1 block text-sm font-medium text-ink">
              Desde
            </label>
            <select id="desde" className={INPUT_CLASS} value={desde} onChange={(e) => cambiarDesde(e.target.value)}>
              {HORAS_INICIO.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hasta" className="mb-1 block text-sm font-medium text-ink">
              Hasta
            </label>
            <select id="hasta" className={INPUT_CLASS} value={hasta} onChange={(e) => setHasta(e.target.value)}>
              {opcionesFin.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={agregar}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Agregar franja
            </button>
          </div>
        </div>
        {errorNueva && <p className="mt-2 text-xs text-error">{errorNueva}</p>}
        <p className="mt-2 text-xs text-ink-secondary">
          El horario «hasta» debe ser posterior a «desde», y la franja no puede solaparse con otra ya cargada ese día.
        </p>

        <h3 className="mt-6 text-sm font-semibold text-ink">Franjas cargadas</h3>
        {ordenadas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-secondary">Todavía no hay franjas cargadas para este mes.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/80">
            {ordenadas.map((f) => (
              <li key={claveFranja(f)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {formatearFechaAr(f.date)} · {f.startTime} a {f.endTime}{" "}
                  <span className="text-xs text-ink-secondary">
                    ({cantidadTurnosDeFranja(f)} turnos
                    {f.turnosReservados > 0 ? `, ${f.turnosReservados} reservados` : ""})
                  </span>{" "}
                  {inicial.some((i) => claveFranja(i) === claveFranja(f)) ? (
                    <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">
                      Publicada
                    </span>
                  ) : (
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-secondary">
                      Sin publicar
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => quitar(f)}
                  disabled={f.turnosReservados > 0}
                  title={f.turnosReservados > 0 ? "Tiene turnos reservados" : undefined}
                  className="rounded-lg border border-error px-3 py-1 text-xs font-semibold text-error hover:bg-background disabled:opacity-50"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <h2 className="text-lg font-bold text-ink">3 · Guardar</h2>
        <p className="mt-2 text-sm text-ink-secondary">
          Al guardar, el sistema genera los turnos de 30 minutos de cada franja y los publica para reserva. Quitar una
          franja sin turnos reservados elimina sus turnos publicados. Total de la agenda del mes: {totalTurnos} turnos.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={saving || !hayCambios}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? "Publicando…" : "Guardar y publicar agenda"}
          </button>
          <button
            type="button"
            onClick={descartar}
            disabled={saving || !hayCambios}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Descartar cambios
          </button>
        </div>
      </section>
    </div>
  );
}
