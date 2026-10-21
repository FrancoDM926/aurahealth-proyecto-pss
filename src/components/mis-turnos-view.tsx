"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarTurnoAction } from "@/actions/reservas";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import { ESTADO_TURNO_LABELS } from "@/lib/estado-turno";
import type { MiTurno } from "@/lib/reservas";

const BTN_PRIMARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50";
const BTN_CANCELAR =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-error/50 bg-surface px-3.5 py-1.5 text-xs font-semibold text-error transition hover:bg-error/5";

const ESTADO_STYLES: Record<MiTurno["estado"], string> = {
  RESERVADO: "border-blue-300 bg-blue-50 text-blue-800",
  CUMPLIDO: "border-emerald-300 bg-emerald-50 text-emerald-800",
  AUSENTE: "border-amber-300 bg-amber-50 text-amber-800",
  CANCELADO: "border-red-300 bg-red-50 text-red-800",
};

type Aviso =
  | { tipo: "confirmar"; turno: MiTurno }
  | { tipo: "cancelado" }
  | { tipo: "fuera-de-plazo"; mensaje?: string };

function fechaHora(turno: MiTurno): string {
  return `${formatearFechaAr(turno.fecha)} ${turno.startTime}`;
}

/**
 * US-16: listado de turnos, confirmación previa, estado tras cancelar y caso
 * fuera del plazo mínimo de cancelación.
 */
export function MisTurnosView({
  turnos,
  antelacionHoras,
}: {
  turnos: MiTurno[];
  antelacionHoras: number;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedirCancelacion = (turno: MiTurno) => {
    setError(null);
    setAviso(turno.fueraDePlazo ? { tipo: "fuera-de-plazo" } : { tipo: "confirmar", turno });
  };

  const confirmarCancelacion = async (turno: MiTurno) => {
    setLoading(true);
    setError(null);
    const result = await cancelarTurnoAction(turno.id);
    setLoading(false);
    if (result.success) {
      setAviso({ tipo: "cancelado" });
      router.refresh();
      return;
    }
    if (result.code === "FUERA_DE_PLAZO") {
      setAviso({ tipo: "fuera-de-plazo", mensaje: result.message });
      return;
    }
    setError(result.message);
  };

  const accion = (turno: MiTurno) =>
    turno.cancelable ? (
      <button type="button" onClick={() => pedirCancelacion(turno)} className={BTN_CANCELAR}>
        Cancelar
      </button>
    ) : (
      <span className="text-ink-secondary">—</span>
    );

  const badge = (turno: MiTurno) => (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ESTADO_STYLES[turno.estado]}`}
    >
      {ESTADO_TURNO_LABELS[turno.estado]}
    </span>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Mis turnos — Cancelar</h1>

      {/* BLOQUE 2: CONFIRMACIÓN PREVIA */}
      {aviso?.tipo === "confirmar" && (
        <section className="mt-6 rounded-xl border-2 border-primary bg-surface p-4 sm:p-6" aria-live="polite">
          <h2 className="text-lg font-bold text-ink">¿Confirmás la cancelación?</h2>
          <p className="mt-2 text-sm text-ink">
            Turno del {formatearFechaAr(aviso.turno.fecha)} a las {aviso.turno.startTime} con{" "}
            {aviso.turno.doctorNombre}.
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            Si cancelás, el horario vuelve a estar disponible y puede reservarlo otro paciente.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => confirmarCancelacion(aviso.turno)}
              className={BTN_PRIMARY}
            >
              {loading ? "Cancelando…" : "Sí, cancelar turno"}
            </button>
            <button type="button" disabled={loading} onClick={() => setAviso(null)} className={BTN_SECONDARY}>
              No, volver
            </button>
          </div>
        </section>
      )}

      {/* BLOQUE 3: TURNO CANCELADO */}
      {aviso?.tipo === "cancelado" && (
        <section role="status" className="mt-6 rounded-xl border-2 border-success/50 bg-success/5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">Cancelación confirmada</h2>
          <p className="mt-2 text-sm text-ink">
            El turno quedó cancelado y el horario volvió a aparecer en las búsquedas. Tanto vos como
            la sala recibieron un email de aviso de la cancelación.
          </p>
        </section>
      )}

      {/* BLOQUE 4: FUERA DE PLAZO */}
      {aviso?.tipo === "fuera-de-plazo" && (
        <section role="alert" className="mt-6 rounded-xl border-2 border-error/50 bg-error/5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">No se puede cancelar</h2>
          <p className="mt-2 text-sm text-ink">
            {aviso.mensaje ??
              `Este turno empieza en menos de ${antelacionHoras} horas y ya no puede cancelarse desde esta pantalla. Comunicate con el mostrador si necesitás resolverlo.`}
          </p>
          <div className="mt-4">
            <button type="button" onClick={() => setAviso(null)} className={BTN_SECONDARY}>
              Volver
            </button>
          </div>
        </section>
      )}

      {/* BLOQUE 1: LISTADO */}
      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-bold text-ink">Turnos reservados</h2>

        {turnos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">Todavía no reservaste ningún turno.</p>
        ) : (
          <>
            {/* Vista en tabla para pantallas >= sm */}
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-line sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Profesional</th>
                    <th className="px-4 py-2.5">A nombre de</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {turnos.map((turno) => (
                    <tr key={`${turno.estado}-${turno.id}`}>
                      <td className="px-4 py-3 font-semibold text-ink">{fechaHora(turno)}</td>
                      <td className="px-4 py-3 text-ink">{turno.doctorNombre}</td>
                      <td className="px-4 py-3 text-ink">{turno.aNombreDe}</td>
                      <td className="px-4 py-3">{badge(turno)}</td>
                      <td className="px-4 py-3 text-right">{accion(turno)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vista adaptable para celulares (RNF-08: sin desplazamiento horizontal) */}
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface sm:hidden">
              {turnos.map((turno) => (
                <li key={`${turno.estado}-${turno.id}`} className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-ink">{fechaHora(turno)}</span>
                    {badge(turno)}
                  </div>
                  <div className="text-xs text-ink">
                    <p className="font-semibold">{turno.doctorNombre}</p>
                    <p className="text-ink-secondary">A nombre de {turno.aNombreDe}</p>
                  </div>
                  {turno.cancelable && <div>{accion(turno)}</div>}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 text-xs text-ink-secondary">
          Se pueden cancelar tanto los turnos propios como los reservados a nombre de otra persona.
          La cancelación es la única modificación admitida: cambiar de horario implica cancelar y
          volver a reservar.
        </p>
      </section>
    </div>
  );
}
