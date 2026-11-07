"use client";

import { useState } from "react";
import { saveCancelacionAntelacion } from "@/actions/configuracion";
import {
  ANTELACION_CANCELACION_MAX_HORAS,
  ANTELACION_CANCELACION_MIN_HORAS,
} from "@/lib/reservas";

export function CancelacionAntelacionForm({ initial }: { initial: number }) {
  const [horas, setHoras] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const horasNum = Number(horas);
  const horasValidas =
    Number.isInteger(horasNum) &&
    horasNum >= ANTELACION_CANCELACION_MIN_HORAS &&
    horasNum <= ANTELACION_CANCELACION_MAX_HORAS;

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveCancelacionAntelacion(horasNum);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Cancelación de turnos</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Antelación mínima con la que el paciente puede cancelar un turno desde «Mis turnos». El
        valor inicial del sistema son 24 horas.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cancelacionAntelacion">
            Antelación mínima (horas)
          </label>
          <input
            id="cancelacionAntelacion"
            type="number"
            min={ANTELACION_CANCELACION_MIN_HORAS}
            max={ANTELACION_CANCELACION_MAX_HORAS}
            step={1}
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className="w-40 rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          disabled={loading || !horasValidas}
          onClick={handleSave}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {!horasValidas && (
        <p className="mt-2 text-sm text-error">
          Ingresá un número entero entre {ANTELACION_CANCELACION_MIN_HORAS} y{" "}
          {ANTELACION_CANCELACION_MAX_HORAS} horas.
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
    </section>
  );
}
