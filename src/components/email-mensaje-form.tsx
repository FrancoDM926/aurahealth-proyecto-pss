"use client";

import { useState } from "react";
import { saveMensajePlantillaAction } from "@/actions/email-admin";
import { validarMensajePlantilla } from "@/services/email/catalogo";

type Props = {
  /** NotificationTemplateType de la plantilla en edición. */
  clave: string;
  /** Nombre que muestra la pantalla (ej. «Confirmación de turno»). */
  nombre: string;
  /** Asunto fijo por plantilla: no se edita desde esta pantalla. */
  asunto: string;
  /** Mensaje vigente (guardado o por defecto). */
  mensajeInicial: string;
  /** Variables disponibles para esta plantilla. */
  variables: readonly string[];
};

/**
 * Bloque «Edición» de la pantalla «Emails» (US-21 / wireframe
 * `wf_servicio_email.html`): el asunto se muestra deshabilitado y solo se
 * edita el cuerpo del mensaje.
 */
export function EmailMensajeForm({
  clave,
  nombre,
  asunto,
  mensajeInicial,
  variables,
}: Props) {
  const [mensaje, setMensaje] = useState(mensajeInicial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const error = validarMensajePlantilla(clave, mensaje);

  const handleSave = async () => {
    setMessage(null);
    setLoading(true);
    const result = await saveMensajePlantillaAction(clave, mensaje);
    setLoading(false);
    setMessage({ ok: result.success, text: result.message ?? "" });
  };

  const handleCancel = () => {
    setMensaje(mensajeInicial);
    setMessage(null);
  };

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Editar mensaje — {nombre}</h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor={`asunto-${clave}`}>
            Asunto (no editable)
          </label>
          <input
            id={`asunto-${clave}`}
            type="text"
            value={asunto}
            disabled
            readOnly
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink-secondary disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor={`mensaje-${clave}`}>
            Mensaje
          </label>
          <textarea
            id={`mensaje-${clave}`}
            rows={6}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            aria-invalid={Boolean(error)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed"
          />
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
          <p className="mt-2 text-sm text-ink-secondary">
            Variables disponibles para este mensaje:{" "}
            {variables.map((v) => `{{${v}}}`).join(", ")}. Se reemplazan al momento del
            envío.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || Boolean(error)}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar mensaje"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleCancel}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-background disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>

        {message && (
          <p
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm ${
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
