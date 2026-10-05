"use client";

import { useState } from "react";
import { saveLimitesJornadas } from "@/actions/configuracion";
import { validarLimitesJornadas, type LimitesJornadas } from "@/lib/availability-rn02";

const OPCIONES = [1, 2, 3, 4, 5, 6, 7];

export function LimitesJornadasForm({ initial }: { initial: LimitesJornadas }) {
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const error = validarLimitesJornadas({ min, max });

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveLimitesJornadas(min, max);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Agenda médica · RN-02
      </span>
      <h2 className="mt-2 text-lg font-bold text-ink">Jornadas por semana</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Cantidad de jornadas que cada médico tiene que cargar por semana al declarar su
        disponibilidad mensual.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="min">
            Mínimo
          </label>
          <select
            id="min"
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
          >
            {OPCIONES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="max">
            Máximo
          </label>
          <select
            id="max"
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          >
            {OPCIONES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-success/40 bg-success/5 text-ink"
              : "border-error/40 bg-error/5 text-error"
          }`}
        >
          {message.text}
        </p>
      )}

      <p className="mt-3 text-xs text-ink-secondary">
        El cambio rige para las próximas cargas de disponibilidad. Las ya confirmadas no se
        modifican.
      </p>

      <button
        type="button"
        disabled={loading || Boolean(error)}
        onClick={handleSave}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Guardar"}
      </button>
    </section>
  );
}
