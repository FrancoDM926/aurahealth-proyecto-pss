"use client";

import { useState } from "react";
import {
  ejecutarRecordatoriosAhoraAction,
  saveRecordatorioAntelacion,
  type EjecutarRecordatoriosResult,
} from "@/actions/configuracion";

export function RecordatorioAntelacionForm({ initial }: { initial: number }) {
  const [horas, setHoras] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState<EjecutarRecordatoriosResult | null>(null);

  const horasNum = Number(horas);
  const horasValidas = Number.isInteger(horasNum) && horasNum >= 1 && horasNum <= 168;

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveRecordatorioAntelacion(horasNum);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  const handleRun = async () => {
    setRunResult(null);
    setRunLoading(true);
    const result = await ejecutarRecordatoriosAhoraAction();
    setRunLoading(false);
    setRunResult(result);
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Recordatorio de turnos</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Con cuánta antelación se avisa por email al paciente antes de su turno. El valor inicial
        del sistema son 24 horas.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="recordatorioAntelacion">
            Antelación (horas)
          </label>
          <input
            id="recordatorioAntelacion"
            type="number"
            min={1}
            max={168}
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

        <button
          type="button"
          disabled={runLoading}
          onClick={handleRun}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-background disabled:opacity-50"
        >
          {runLoading ? "Ejecutando…" : "Ejecutar recordatorios ahora"}
        </button>
      </div>

      {!horasValidas && (
        <p className="mt-2 text-sm text-error">Ingresá un número entero entre 1 y 168 horas.</p>
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

      {runResult && (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
            runResult.success
              ? "border-success/40 bg-success/5 text-ink"
              : "border-error/40 bg-error/5 text-error"
          }`}
        >
          <p>{runResult.message}</p>
          {runResult.resumen && (
            <ul className="mt-2 list-inside list-disc text-ink-secondary">
              <li>Antelación vigente: {runResult.resumen.antelacionHoras} h</li>
              <li>Candidatos: {runResult.resumen.candidatos}</li>
              <li>En ventana: {runResult.resumen.enVentana}</li>
              <li>Enviados: {runResult.resumen.enviados}</li>
              <li>Con error: {runResult.resumen.fallidos}</li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
