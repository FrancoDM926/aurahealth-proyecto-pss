"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  guardarPrecioConsultaAction,
  type PrecioConsultaDatos,
} from "@/actions/precio-consulta";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import {
  formatearPesos,
  validarPrecioConsulta,
  type EstadoVigencia,
  type PrecioConsultaErrors,
  type VigenciaPrecio,
} from "@/lib/pagos";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Badge,
  Bloque,
  Callout,
  Hint,
  INPUT_CLASS,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";

const ESTADO_BADGE: Record<EstadoVigencia, { label: string; tono: "ok" | "neutro" | "aviso" }> = {
  VIGENTE: { label: "Vigente", tono: "ok" },
  CERRADO: { label: "Cerrado", tono: "neutro" },
  PROGRAMADO: { label: "Programado", tono: "aviso" },
};

/** US-33 (wf_costo_consulta.html): precio de la consulta sin cobertura, con historial de vigencias. */
export function CostoConsultaView({ datos }: { datos: PrecioConsultaDatos }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [monto, setMonto] = useState("");
  const [desde, setDesde] = useState(datos.hoy);
  const [errors, setErrors] = useState<PrecioConsultaErrors>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; texto: string } | null>(null);

  // El historial completo (de la más reciente a la más antigua) alimenta la validación del formulario.
  const vigencias: VigenciaPrecio[] = [
    ...(datos.vigente ? [datos.vigente] : []),
    ...datos.historial,
  ].map((f) => ({ vigenteDesde: f.desde, montoCentavos: f.montoCentavos }));

  const limpiar = () => {
    setMonto("");
    setDesde(datos.hoy);
    setErrors({});
    setFeedback(null);
  };

  const guardar = () => {
    setFeedback(null);
    const locales = validarPrecioConsulta(
      { monto, vigenteDesde: desde },
      { hoy: datos.hoy, vigencias }
    );
    setErrors(locales);
    if (Object.keys(locales).length > 0) return;

    startTransition(async () => {
      const resultado = await guardarPrecioConsultaAction({ monto, vigenteDesde: desde });
      if (resultado.success) {
        setFeedback({ ok: true, texto: resultado.message });
        setMonto("");
        setErrors({});
        router.refresh();
      } else {
        setErrors(resultado.errors ?? {});
        setFeedback({ ok: false, texto: resultado.message });
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Mi consulta — Precio sin cobertura
      </h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Cada médico define un único precio de consulta, sin cobertura. El descuento de cada obra
        social se aplica después, al calcular el importe.
      </p>

      <Bloque num="1 · Precio vigente" titulo="Precio vigente de mi consulta">
        {datos.vigente ? (
          <Tabla>
            <thead>
              <tr className={THEAD_TR}>
                <th className={TH}>Concepto</th>
                <th className={TH}>Precio vigente</th>
                <th className={TH}>Desde</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              <tr>
                <td className={TD}>Consulta sin cobertura (particular)</td>
                <td className={`${TD} font-semibold`}>{formatearPesos(datos.vigente.montoCentavos)}</td>
                <td className={TD}>{formatearFechaAr(datos.vigente.desde)}</td>
                <td className={TD}>
                  <Badge tono="ok">Vigente</Badge>
                </td>
              </tr>
            </tbody>
          </Tabla>
        ) : (
          <Callout>
            Todavía no tenés un precio de consulta vigente. Definilo abajo: sin precio configurado no se
            puede cobrar tus consultas.
          </Callout>
        )}
        <Hint>
          Cargás un único precio de consulta, sin cobertura. No cargás un precio distinto por cada obra
          social: el descuento de la obra social del paciente se aplica sobre este precio al calcular el
          importe.
        </Hint>
      </Bloque>

      <Bloque num="2 · Actualizar precio" titulo="Definir un precio nuevo">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="monto">
              Precio de la consulta (sin cobertura)
            </label>
            <input
              id="monto"
              inputMode="decimal"
              autoComplete="off"
              placeholder="$ 0,00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              aria-invalid={Boolean(errors.monto)}
              aria-describedby={errors.monto ? "monto-error" : undefined}
              className={INPUT_CLASS}
            />
            {errors.monto && (
              <p id="monto-error" className="mt-1 text-xs text-error">
                {errors.monto}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="desde">
              Vigente desde
            </label>
            <input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              aria-invalid={Boolean(errors.vigenteDesde)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <Callout>
          Al guardar, el precio anterior no se borra: queda en el historial de vigencias y sigue
          aplicándose a las consultas anteriores a la nueva fecha.
        </Callout>
        {errors.vigenteDesde && <Callout tipo="error">{errors.vigenteDesde}</Callout>}
        {feedback && (
          <div role={feedback.ok ? "status" : "alert"}>
            <Callout tipo={feedback.ok ? "success" : "error"}>{feedback.texto}</Callout>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={guardar} disabled={pending} className={BTN_PRIMARY}>
            {pending ? "Guardando…" : "Guardar precio"}
          </button>
          <button type="button" onClick={limpiar} disabled={pending} className={BTN_SECONDARY}>
            Cancelar
          </button>
        </div>
      </Bloque>

      <Bloque num="3 · Historial" titulo="Historial de vigencias">
        {datos.historial.length === 0 ? (
          <Callout>Todavía no hay vigencias anteriores ni programadas.</Callout>
        ) : (
          <Tabla>
            <thead>
              <tr className={THEAD_TR}>
                <th className={TH}>Desde</th>
                <th className={TH}>Hasta</th>
                <th className={TH}>Precio</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {datos.historial.map((fila) => (
                <tr key={fila.desde}>
                  <td className={TD}>{formatearFechaAr(fila.desde)}</td>
                  <td className={TD}>{fila.hasta ? formatearFechaAr(fila.hasta) : "—"}</td>
                  <td className={`${TD} font-semibold`}>{formatearPesos(fila.montoCentavos)}</td>
                  <td className={TD}>
                    <Badge tono={ESTADO_BADGE[fila.estado].tono}>{ESTADO_BADGE[fila.estado].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        <Hint>
          Insumo del cálculo del importe de cada consulta (US-34): se toma el precio sin cobertura
          vigente a la fecha de la consulta y se le aplica el descuento de la obra social de la persona
          atendida.
        </Hint>
      </Bloque>
    </div>
  );
}
