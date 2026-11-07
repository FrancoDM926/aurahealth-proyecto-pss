"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearObraSocialAction,
  guardarDescuentoObraSocialAction,
} from "@/actions/obras-sociales";
import { MAX_NOMBRE_OBRA_SOCIAL, validarDescuentoPorcentaje } from "@/lib/pagos";

type ObraSocialItem = { id: string; nombre: string; descuentoPorcentaje: number };

/**
 * US-34 (RN-14): descuento porcentual predefinido de cada obra social. Se aplica
 * sobre el precio de consulta sin cobertura que define cada médico (US-33); los
 * pacientes particulares no reciben descuento.
 */
export function ObrasSocialesForm({ initial }: { initial: ObraSocialItem[] }) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((o) => [o.id, String(o.descuentoPorcentaje)]))
  );
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoDescuento, setNuevoDescuento] = useState("0");
  const [creando, setCreando] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const guardar = async (obra: ObraSocialItem) => {
    setMessage(null);
    setGuardandoId(obra.id);
    const result = await guardarDescuentoObraSocialAction(obra.id, Number(valores[obra.id]));
    setGuardandoId(null);
    setMessage({ ok: result.success, text: result.message });
    if (result.success) router.refresh();
  };

  const crear = async () => {
    setMessage(null);
    setCreando(true);
    const result = await crearObraSocialAction(nuevoNombre, Number(nuevoDescuento));
    setCreando(false);
    setMessage({ ok: result.success, text: result.message });
    if (result.success) {
      setNuevoNombre("");
      setNuevoDescuento("0");
      router.refresh();
    }
  };

  const descuentoInvalido = (valor: string) =>
    valor.trim() === "" || validarDescuentoPorcentaje(Number(valor)) !== null;

  return (
    <section className="rounded-xl border-2 border-line bg-surface p-6">
      <h2 className="text-lg font-bold text-ink">Obras sociales y descuentos</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Descuento porcentual de cada obra social, que se aplica sobre el precio de consulta sin cobertura
        del médico. Los pacientes particulares no reciben descuento. Un cambio rige para los pagos que se
        registren desde ese momento: los ya registrados conservan el descuento con que se cobraron.
      </p>

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {initial.map((obra) => {
          const invalido = descuentoInvalido(valores[obra.id] ?? "");
          return (
            <li key={obra.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-ink">{obra.nombre}</span>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`desc-${obra.id}`}>
                  Descuento de {obra.nombre} (%)
                </label>
                <input
                  id={`desc-${obra.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={valores[obra.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [obra.id]: e.target.value }))}
                  className="w-24 rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
                <span className="text-sm text-ink-secondary">%</span>
                <button
                  type="button"
                  disabled={invalido || guardandoId === obra.id}
                  onClick={() => guardar(obra)}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {guardandoId === obra.id ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </li>
          );
        })}
        {initial.length === 0 && (
          <li className="px-4 py-3 text-sm text-ink-secondary">Todavía no hay obras sociales cargadas.</li>
        )}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="nuevaObraNombre">
            Nueva obra social
          </label>
          <input
            id="nuevaObraNombre"
            value={nuevoNombre}
            maxLength={MAX_NOMBRE_OBRA_SOCIAL}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="w-56 rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="nuevaObraDescuento">
            Descuento (%)
          </label>
          <input
            id="nuevaObraDescuento"
            type="number"
            min={0}
            max={100}
            step={1}
            value={nuevoDescuento}
            onChange={(e) => setNuevoDescuento(e.target.value)}
            className="w-28 rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={creando || !nuevoNombre.trim() || descuentoInvalido(nuevoDescuento)}
          onClick={crear}
          className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-background disabled:opacity-50"
        >
          {creando ? "Agregando…" : "Agregar"}
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
    </section>
  );
}
