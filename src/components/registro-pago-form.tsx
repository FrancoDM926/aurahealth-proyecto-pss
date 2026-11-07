"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registrarPagoAction } from "@/actions/pagos";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Bloque,
  Callout,
  Hint,
  INPUT_CLASS,
} from "@/components/pagos-ui";
import {
  MAX_REFERENCIA_PAGO,
  MEDIOS_PAGO,
  MEDIO_PAGO_LABELS,
  esMedioPagoValido,
  formatearNumeroComprobante,
} from "@/lib/pagos";
import type { MedioPago } from "@/generated/prisma/client";

type RegistroPagoFormProps = {
  turnoId: string;
  /** "Turno cumplido — 14/11/2026 10:30 — Dr. Carlos Méndez — María García." */
  resumenTurno: string;
  /** "$ 12.600" */
  importeTexto: string;
  /** "precio sin cobertura $ 18.000 con el descuento de IOMA aplicado" */
  detalleImporte: string;
};

/** US-35 (wf_registro_pago.html): efectivo o transferencia sobre un turno cumplido. */
export function RegistroPagoForm({
  turnoId,
  resumenTurno,
  importeTexto,
  detalleImporte,
}: RegistroPagoFormProps) {
  const [pending, startTransition] = useTransition();
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [resultado, setResultado] = useState<{
    ok: boolean;
    texto: string;
    pagoId?: string;
    comprobanteNumero?: number;
    pagoExistente?: boolean;
  } | null>(null);

  const esTransferencia = medio === "TRANSFERENCIA";
  const registrado = resultado?.ok === true;

  const registrar = () => {
    setResultado(null);
    if (esTransferencia && !referencia.trim()) {
      setResultado({ ok: false, texto: "Ingresá la referencia de la transferencia (N.º de operación)." });
      return;
    }
    startTransition(async () => {
      const r = await registrarPagoAction({
        turnoId,
        medio,
        referencia: esTransferencia ? referencia : undefined,
      });
      setResultado({
        ok: r.success,
        texto: r.message,
        pagoId: r.pagoId,
        comprobanteNumero: r.comprobanteNumero,
        pagoExistente: r.pagoExistente,
      });
    });
  };

  return (
    <>
      <Bloque num="1 · Turno" titulo="Consulta a cobrar">
        <Callout>{resumenTurno}</Callout>
        <Callout>
          Importe calculado: <strong>{importeTexto}</strong> ({detalleImporte}).
        </Callout>
        <Hint>El importe surge del cálculo según la obra social de la persona atendida (US-34).</Hint>
      </Bloque>

      <Bloque num="2 · Medio de pago" titulo="Cómo abona el paciente">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="medio">
              Medio de pago
            </label>
            <select
              id="medio"
              value={medio}
              disabled={registrado}
              onChange={(e) => {
                if (esMedioPagoValido(e.target.value)) setMedio(e.target.value);
              }}
              className={INPUT_CLASS}
            >
              {MEDIOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {MEDIO_PAGO_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="referencia">
              Referencia de la transferencia
            </label>
            <input
              id="referencia"
              value={referencia}
              disabled={!esTransferencia || registrado}
              maxLength={MAX_REFERENCIA_PAGO}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="N.º de operación o comprobante"
              className={`${INPUT_CLASS} disabled:opacity-50`}
            />
          </div>
        </div>
        <Callout>
          El efectivo solo puede registrarlo un administrativo en el mostrador. La transferencia se
          registra contra la referencia de su comprobante.
        </Callout>
        <Hint>El sistema no procesa pagos online: el registro es presencial.</Hint>
      </Bloque>

      <Bloque num="3 · Confirmación" titulo="Confirmar el registro">
        <Callout>
          Un turno no admite dos pagos activos: si ya existe un pago registrado, el sistema lo advierte.
        </Callout>

        {resultado && (
          <div role={resultado.ok ? "status" : "alert"}>
            <Callout tipo={resultado.ok ? "success" : "error"}>
              {resultado.texto}
              {resultado.ok && resultado.pagoId && (
                <>
                  {" "}
                  <a
                    href={`/api/comprobantes/${resultado.pagoId}`}
                    className="font-semibold underline underline-offset-2"
                  >
                    Descargar comprobante N.º {formatearNumeroComprobante(resultado.comprobanteNumero ?? 0)}
                  </a>
                </>
              )}
            </Callout>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={registrar}
            disabled={pending || registrado}
            className={BTN_PRIMARY}
          >
            {pending ? "Registrando…" : "Registrar pago"}
          </button>
          <Link href="/dashboard/pagos" className={BTN_SECONDARY}>
            {registrado ? "Volver a pagos" : "Cancelar"}
          </Link>
        </div>
        <Hint>
          Queda registrado fecha y hora, importe, medio y usuario. El comprobante se genera automáticamente
          (US-36).
        </Hint>
      </Bloque>
    </>
  );
}
