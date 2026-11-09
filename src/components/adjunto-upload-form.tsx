"use client";

import { useActionState } from "react";
import { subirAdjuntoAction, type AdjuntoFormState } from "@/actions/historial";

const ADJUNTO_FORM_INICIAL: AdjuntoFormState = { success: false, message: "" };

type AdjuntoUploadFormProps = {
  entradaId: string;
  maxMB: number;
};

/** US-62: alta de un estudio (imagen o PDF) en una entrada de la ficha propia. */
export function AdjuntoUploadForm({ entradaId, maxMB }: AdjuntoUploadFormProps) {
  const [state, formAction, pending] = useActionState(
    subirAdjuntoAction,
    ADJUNTO_FORM_INICIAL
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="entradaId" value={entradaId} />
      <div>
        <label className="mb-1 block text-sm font-medium text-ink" htmlFor="archivo">
          Archivo (imagen o PDF)
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
          required
          className="block w-full cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary"
        />
        <p className="mt-1 text-xs text-ink-secondary">
          Tamaño máximo configurable por el administrador: {maxMB} MB.
        </p>
      </div>

      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`rounded-lg border p-3 text-sm ${
            state.success
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Adjuntando…" : "Adjuntar"}
      </button>
    </form>
  );
}
