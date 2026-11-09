"use client";

import { useState } from "react";
import { saveAdjuntoMaxMB } from "@/actions/configuracion";
import { ADJUNTO_MAX_MB_LIMITE } from "@/lib/historial";

/** US-62: tamaño máximo configurable de los estudios adjuntos a la ficha. */
export function AdjuntoMaxForm({ initial }: { initial: number }) {
  const [mb, setMb] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const valor = Number(mb);
  const valido = Number.isInteger(valor) && valor >= 1 && valor <= ADJUNTO_MAX_MB_LIMITE;

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveAdjuntoMaxMB(valor);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Estudios adjuntos a la ficha</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Tamaño máximo de cada imagen o PDF que el médico adjunta a una entrada del historial
        clínico. El valor inicial del sistema son 10 MB.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="adjuntoMaxMB">
            Tamaño máximo (MB)
          </label>
          <input
            id="adjuntoMaxMB"
            type="number"
            min={1}
            max={ADJUNTO_MAX_MB_LIMITE}
            step={1}
            value={mb}
            onChange={(e) => setMb(e.target.value)}
            className="w-40 rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          disabled={loading || !valido}
          onClick={handleSave}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {!valido && (
        <p className="mt-2 text-sm text-error">
          Ingresá un número entero entre 1 y {ADJUNTO_MAX_MB_LIMITE} MB.
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
