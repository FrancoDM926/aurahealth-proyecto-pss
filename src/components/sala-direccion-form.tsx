"use client";

import { useState } from "react";
import { saveSalaDireccion } from "@/actions/configuracion";

export function SalaDireccionForm({ initial }: { initial: string }) {
  const [direccion, setDireccion] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  
  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveSalaDireccion(direccion);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Dirección de la sala</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Se incluye en el email de confirmación que recibe el paciente al reservar un turno.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium" htmlFor="salaDireccion">
          Dirección
        </label>
        <input
          id="salaDireccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Av. Siempre Viva 742, Piso 1, Consultorio 3"
          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
        />
      </div>

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

      <button
        type="button"
        disabled={loading || direccion.trim().length === 0 || direccion.trim().length > 200}
        onClick={handleSave}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Guardar"}
      </button>
    </section>
  );
}
