"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMonthlyAvailability, type JornadaPayload } from "@/actions/availability";
import {
  isPastDate,
  minutosSobrantes,
  opcionesHoraFin,
  opcionesHoraInicio,
  SLOT_DURATION_MINUTES,
  validateMonthlyJornadasRN02,
  type LimitesJornadas,
} from "@/lib/availability-rn02";

type InitialJornada = {
  date: string;
  startTime: string;
  endTime: string;
};

type Props = {
  initialYear: number;
  initialMonth: number;
  initialJornadas: InitialJornada[];
  /** Límites de jornadas semanales vigentes (configurables, RN-02). */
  limites: LimitesJornadas;
  /** Hoy en la hora de la sala ("YYYY-MM-DD"): las fechas anteriores no se pueden cargar. */
  today: string;
};

const HORAS_INICIO = opcionesHoraInicio();

/** Agrega el valor actual si quedó fuera de la grilla (franjas guardadas antes del cambio). */
function conValorActual(opciones: string[], actual: string): string[] {
  return opciones.includes(actual) ? opciones : [...opciones, actual].sort();
}

const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function buildMonthOptions(anchor: Date, count = 6) {
  const options: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + i, 1));
    const label = d.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    options.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }
  return options;
}

export function MonthlyAvailabilityForm({
  initialYear,
  initialMonth,
  initialJornadas,
  limites,
  today,
}: Props) {
  const router = useRouter();
  const monthOptions = useMemo(() => {
    const base = buildMonthOptions(new Date());
    const hasCurrent = base.some(
      (o) => o.year === initialYear && o.month === initialMonth
    );
    if (!hasCurrent) {
      const d = new Date(Date.UTC(initialYear, initialMonth - 1, 1));
      const label = d.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      base.unshift({
        year: initialYear,
        month: initialMonth,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
    }
    return base;
  }, [initialYear, initialMonth]);
  const [period, setPeriod] = useState(`${initialYear}-${initialMonth}`);
  const [jornadas, setJornadas] = useState<Record<string, JornadaPayload>>(() => {
    const map: Record<string, JornadaPayload> = {};
    for (const j of initialJornadas) {
      map[j.date] = j;
    }
    return map;
  });
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("08:00");
  const [draftEnd, setDraftEnd] = useState("13:00");
  const [message, setMessage] = useState<string | null>(null);
  const [dayErrors, setDayErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const [year, month] = period.split("-").map(Number);

  const rn02 = useMemo(
    () =>
      validateMonthlyJornadasRN02(
        Object.values(jornadas).map((j) => ({ date: j.date })),
        year,
        month,
        limites
      ),
    [jornadas, year, month, limites]
  );

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOffset = (firstOfMonth.getUTCDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const openDayEditor = (day: number) => {
    const key = dateKey(year, month, day);
    if (isPastDate(key, today)) return;
    const existing = jornadas[key];
    setEditingDay(key);
    setDraftStart(existing?.startTime ?? "08:00");
    setDraftEnd(existing?.endTime ?? "13:00");
  };

  /** Al cambiar el inicio, si el fin quedó antes, se corre al primer horario válido. */
  const handleStartChange = (value: string) => {
    setDraftStart(value);
    const validEnds = opcionesHoraFin(value);
    if (!validEnds.includes(draftEnd)) {
      setDraftEnd(validEnds[0]);
    }
  };

  const applyDayEditor = () => {
    if (!editingDay) return;
    setJornadas((prev) => ({
      ...prev,
      [editingDay]: {
        date: editingDay,
        startTime: draftStart,
        endTime: draftEnd,
      },
    }));
    setEditingDay(null);
  };

  const removeDay = (key: string) => {
    setJornadas((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (editingDay === key) setEditingDay(null);
  };

  const handlePeriodChange = (value: string) => {
    setPeriod(value);
    setJornadas({});
    setEditingDay(null);
    const [y, m] = value.split("-").map(Number);
    router.replace(`/dashboard/disponibilidad?year=${y}&month=${m}`);
  };

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const list = Object.values(jornadas).sort((a, b) => a.date.localeCompare(b.date));
    const result = await saveMonthlyAvailability(year, month, list);
    setLoading(false);
    setMessage(result.message ?? null);
    setDayErrors(result.errors ?? {});
    if (result.success) {
      router.push(`/dashboard/agenda-generada?year=${year}&month=${month}`);
    }
  };

  return (
    <div className="space-y-8">
      {message && (
        <div
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink"
          role="status"
        >
          {message}
        </div>
      )}

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          1 · Período
        </span>
        <h2 className="mt-2 text-lg font-bold text-ink">Configurar mes</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="month">
              Mes
            </label>
            <select
              id="month"
              className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
            >
              {monthOptions.map((opt) => (
                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Duración del turno</span>
            <div className="rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink-secondary">
              {SLOT_DURATION_MINUTES} minutos · valor fijo del sistema
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-secondary">
          La duración del turno no es configurable (RN-09). El médico declara la{" "}
          <strong>franja horaria</strong> y el sistema la divide en turnos consecutivos de 30
          minutos.
        </p>
      </section>

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          2 · Jornadas
        </span>
        <h2 className="mt-2 text-lg font-bold text-ink">Seleccionar días de atención</h2>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs sm:gap-2 sm:text-sm">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="py-1 font-semibold text-ink-secondary">{h}</div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="min-h-14" />;
            }
            const key = dateKey(year, month, day);
            const j = jornadas[key];
            const selected = Boolean(j);
            const past = isPastDate(key, today);
            return (
              <button
                key={key}
                type="button"
                disabled={past}
                title={past ? "Fecha pasada: no se pueden cargar franjas" : undefined}
                onClick={() => openDayEditor(day)}
                className={`min-h-14 rounded-lg border p-1 transition ${
                  dayErrors[key]
                    ? "border-error bg-error/5 text-error"
                    : selected
                      ? "border-primary bg-primary-light text-primary"
                      : "border-line bg-background hover:border-primary/50"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="font-semibold">{day}</span>
                {j && (
                  <small className="mt-0.5 block text-[10px] leading-tight sm:text-xs">
                    {j.startTime}–{j.endTime}
                  </small>
                )}
              </button>
            );
          })}
        </div>

        {editingDay && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary-light/40 p-4">
            <p className="text-sm font-semibold text-ink">
              Franja para el {editingDay.split("-").reverse().join("/")}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="franja-desde">
                  Desde
                </label>
                <select
                  id="franja-desde"
                  className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                  value={draftStart}
                  onChange={(e) => handleStartChange(e.target.value)}
                >
                  {conValorActual(HORAS_INICIO, draftStart).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="franja-hasta">
                  Hasta
                </label>
                {/* Solo horarios posteriores al inicio: una franja "al revés" no se puede elegir. */}
                <select
                  id="franja-hasta"
                  className="mt-1 block rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                >
                  {conValorActual(opcionesHoraFin(draftStart), draftEnd).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={applyDayEditor}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                Aplicar
              </button>
              <button
                type="button"
                onClick={() => removeDay(editingDay)}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                Quitar día
              </button>
            </div>
            {minutosSobrantes(draftStart, draftEnd) > 0 && (
              <p className="mt-3 text-xs text-ink-secondary">
                Los últimos {minutosSobrantes(draftStart, draftEnd)} minutos no alcanzan para un
                turno de {SLOT_DURATION_MINUTES} minutos y no se van a ofrecer.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-line bg-background p-4 text-sm">
          <strong>Regla de validación (RN-02):</strong> cada semana del mes debe tener{" "}
          <strong>
            entre {limites.min} y {limites.max} jornadas
          </strong>
          . Se evalúan solo las semanas con al menos tres días hábiles dentro del mes. El
          contador por semana es visible mientras se carga. Los días que ya pasaron no se
          pueden cargar.
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rn02.weeks
            .filter((w) => w.applies)
            .map((w) => (
              <div
                key={w.weekKey}
                className={`rounded-lg border p-3 text-sm ${
                  w.valid
                    ? "border-success/40 bg-success/5"
                    : "border-error/40 bg-error/5"
                }`}
              >
                <strong>{w.weekLabel}</strong>
                <br />
                {w.jornadaCount} jornada{w.jornadaCount === 1 ? "" : "s"} ·{" "}
                {w.valid
                  ? "válida"
                  : w.errorType === "too_few"
                    ? "faltan jornadas"
                    : "excede el máximo"}
              </div>
            ))}
        </div>

        {!rn02.isValid && rn02.blockingMessages.length > 0 && (
          <div className="mt-4 space-y-2">
            {rn02.blockingMessages.map((msg) => (
              <div
                key={msg}
                className="rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error"
              >
                {msg}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || !rn02.isValid || Object.keys(jornadas).length === 0}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar disponibilidad"}
          </button>
          {initialJornadas.length > 0 && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/agenda-generada?year=${year}&month=${month}`)}
              className="rounded-lg border-2 border-primary bg-primary-light/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-light"
            >
              Ver turnos a generar (US-08)
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
          >
            Cancelar
          </button>
        </div>
      </section>
    </div>
  );
}
