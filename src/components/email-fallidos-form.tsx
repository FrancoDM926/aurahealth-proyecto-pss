"use client";

import { useState } from "react";
import { saveEnviosFallidosAction } from "@/actions/email-admin";
import {
  ENVIOS_FALLIDOS_MAX,
  ENVIOS_FALLIDOS_MIN,
} from "@/services/email/catalogo";

/**
 * Bloque «Configuración» de la pantalla «Emails» (US-21 / wireframe
 * `wf_servicio_email.html`): cuántos envíos fallidos puede acumular un mismo
 * destinatario antes de que el servicio deje de reintentarle el envío.
 */
export function EmailFallidosForm({ initial }: { initial: number }) {
  const [valor, setValor] = useState(String(initial));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const numero = Number(valor);
  const valido =
    Number.isInteger(numero) && numero >= ENVIOS_FALLIDOS_MIN && numero <= ENVIOS_FALLIDOS_MAX;

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveEnviosFallidosAction(numero);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Envíos fallidos</h2>

      <div className="mt-4">
        <div className="max-w-xs">
          <label className="mb-1 block text-sm font-medium" htmlFor="max-fallidos">
            Cantidad máxima de envíos fallidos por usuario
          </label>
          <input
            id="max-fallidos"
            type="number"
            min={ENVIOS_FALLIDOS_MIN}
            max={ENVIOS_FALLIDOS_MAX}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>

        <p className="mt-2 text-sm text-ink-secondary">
          Define cuántos envíos fallidos puede acumular un mismo destinatario antes de que el
          sistema deje de reintentarle el envío.
        </p>

        {!valido && (
          <p className="mt-2 text-sm text-error">
            Ingresá un número entero entre {ENVIOS_FALLIDOS_MIN} y {ENVIOS_FALLIDOS_MAX}.
          </p>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={loading || !valido}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar"}
          </button>
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
      </div>
    </section>
  );
}
