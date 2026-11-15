"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ADJUNTO_ERROR_TAMANO,
  formatearTamanoArchivo,
  validarAdjunto,
} from "@/lib/historial";

type AdjuntoUploadFormProps = {
  entradaId: string;
  maxMB: number;
};

type Mensaje = { ok: boolean; text: string };

/**
 * US-62: alta de un estudio (imagen o PDF) en una entrada de la ficha propia.
 *
 * El archivo se valida en el cliente antes de enviarse: si supera el máximo
 * configurado, se muestra el error del wireframe y no se hace la petición. La
 * subida va al Route Handler para no chocar con el límite de cuerpo de las
 * Server Actions.
 */
export function AdjuntoUploadForm({ entradaId, maxMB }: AdjuntoUploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [pending, setPending] = useState(false);

  const validacion = archivo
    ? validarAdjunto({
        nombreArchivo: archivo.name,
        tipoMime: archivo.type,
        tamanoBytes: archivo.size,
        maxMB,
      })
    : null;
  const errorArchivo = validacion && !validacion.ok ? validacion.error : null;
  const puedeEnviar = Boolean(archivo && validacion?.ok) && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archivo || !validacion?.ok) return;

    setPending(true);
    setMensaje(null);

    const formData = new FormData();
    formData.append("archivo", archivo);

    try {
      const response = await fetch(`/api/historial/adjuntos/${entradaId}`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      const ok = response.ok && data?.ok === true;

      setMensaje({
        ok,
        text:
          data?.message ??
          (response.status === 413
            ? ADJUNTO_ERROR_TAMANO
            : ok
              ? "Estudio adjuntado a la entrada de la ficha."
              : "No se pudo guardar el estudio. Intentá nuevamente."),
      });

      if (ok) {
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMensaje({
        ok: false,
        text: "No se pudo enviar el archivo. Revisá la conexión e intentá nuevamente.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium text-ink" htmlFor="archivo">
          Archivo (imagen o PDF)
        </label>
        <input
          ref={inputRef}
          id="archivo"
          name="archivo"
          type="file"
          accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => {
            setArchivo(event.target.files?.[0] ?? null);
            setMensaje(null);
          }}
          className="block w-full cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary-light file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary"
        />
        <p className="mt-1 text-xs text-ink-secondary">
          Tamaño máximo configurable por el administrador: {maxMB} MB.
          {archivo && !errorArchivo && ` Archivo: ${formatearTamanoArchivo(archivo.size)}.`}
        </p>
      </div>

      {errorArchivo && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {errorArchivo}
        </p>
      )}

      {mensaje && (
        <p
          role={mensaje.ok ? "status" : "alert"}
          className={`rounded-lg border p-3 text-sm ${
            mensaje.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {mensaje.text}
        </p>
      )}

      <button
        type="submit"
        disabled={!puedeEnviar}
        className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Adjuntando…" : "Adjuntar"}
      </button>
    </form>
  );
}
