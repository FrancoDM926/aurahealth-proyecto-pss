"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  revertirBloqueoFranjaAction,
  type ResumenBloqueoRegistrado,
} from "@/actions/bloqueos";
import type { EmailStatus, Role } from "@/generated/prisma/client";

type Props = {
  actorRole: Role;
  bloqueos: ResumenBloqueoRegistrado[];
  initialBloqueoId?: string;
};

const AVISO_BADGE_CLASSES: Record<EmailStatus, string> = {
  SENT: "border-primary/30 bg-primary-soft text-primary-dark",
  PENDING: "border-warning/40 bg-warning/20 text-ink",
  FAILED: "border-danger/30 bg-danger-soft text-danger",
};

export function AvisoBloqueoView({
  actorRole,
  bloqueos,
  initialBloqueoId,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(
    initialBloqueoId && bloqueos.some((b) => b.id === initialBloqueoId)
      ? initialBloqueoId
      : (bloqueos[0]?.id ?? "")
  );
  const [reverting, setReverting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tipo: "ok" | "error";
    mensaje: string;
  } | null>(null);

  const bloqueoActual =
    bloqueos.find((b) => b.id === selectedId) ?? bloqueos[0] ?? null;

  async function handleRevertir(bloqueoId: string) {
    setFeedback(null);
    setReverting(true);
    try {
      const res = await revertirBloqueoFranjaAction({ bloqueoId });
      setFeedback({
        tipo: res.success ? "ok" : "error",
        mensaje: res.message,
      });
      if (res.success) {
        router.refresh();
      }
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              Bloqueos — Aviso a pacientes
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Detalle de las franjas bloqueadas, aviso enviado por email y listado de pacientes con
              turno reservado a contactar para su reprogramación.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/bloqueo-franja"
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark"
            >
              + Bloquear una franja
            </Link>
          </div>
        </div>

        {feedback && (
          <div
            role="status"
            className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
              feedback.tipo === "ok"
                ? "border-primary/40 bg-primary-soft text-primary-dark"
                : "border-danger/40 bg-danger-soft text-danger"
            }`}
          >
            {feedback.mensaje}
          </div>
        )}

        {bloqueos.length === 0 || !bloqueoActual ? (
          <div className="mt-6 rounded-xl border border-line bg-background p-8 text-center">
            <p className="text-sm font-medium text-ink">
              No hay bloqueos de agenda registrados.
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              Cuando un médico o el personal administrativo bloquee una franja publicada, aquí se
              mostrarán los datos del bloqueo y el listado de pacientes afectados.
            </p>
            <div className="mt-4">
              <Link
                href="/dashboard/bloqueo-franja"
                className="inline-block cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark"
              >
                Ir a Bloqueo de una franja
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Selector de bloqueo registrado */}
            {bloqueos.length > 1 && (
              <div className="mt-6 flex flex-col gap-1.5">
                <label
                  htmlFor="selectorBloqueo"
                  className="text-xs font-semibold text-ink"
                >
                  Seleccionar bloqueo registrado
                </label>
                <select
                  id="selectorBloqueo"
                  value={bloqueoActual.id}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setFeedback(null);
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                >
                  {bloqueos.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.doctorNombre} — {b.fechaRangoFormateada} ({b.desde} a {b.hasta}) ·{" "}
                      {b.cantidadReservadosAfectados} reservado(s) ·{" "}
                      {b.revertedAt ? "Revertido" : "Activo"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Datos del bloqueo */}
            <section className="mt-6 rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-ink">Datos del bloqueo</h2>
                  <p className="mt-2 text-sm text-ink">
                    <strong>{bloqueoActual.doctorNombre}</strong> —{" "}
                    {bloqueoActual.fechaRangoFormateada}, de {bloqueoActual.desde} a{" "}
                    {bloqueoActual.hasta}. Registrado el {bloqueoActual.registradoElTexto}.
                  </p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    Motivo: <span className="font-medium text-ink">{bloqueoActual.motivo}</span> ·{" "}
                    Turnos libres bloqueados:{" "}
                    <span className="font-semibold text-ink">
                      {bloqueoActual.cantidadTurnosBloqueados}
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm text-ink-secondary">
                    {bloqueoActual.cantidadReservadosAfectados === 1
                      ? "1 turno reservado en la franja quedó fuera del bloqueo y no se modificó."
                      : `${bloqueoActual.cantidadReservadosAfectados} turnos reservados en la franja quedaron fuera del bloqueo y no se modificaron.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bloqueoActual.revertedAt ? (
                    <span className="rounded-full border border-line bg-background px-3 py-1 text-xs font-medium text-ink-muted">
                      Revertido el {bloqueoActual.revertedAt}
                    </span>
                  ) : (
                    <>
                      <span className="rounded-full border border-warning/40 bg-warning/20 px-3 py-1 text-xs font-semibold text-ink">
                        Bloqueo activo
                      </span>
                      {bloqueoActual.reversible && (
                        <button
                          type="button"
                          onClick={() => handleRevertir(bloqueoActual.id)}
                          disabled={reverting}
                          className="cursor-pointer rounded-lg border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reverting ? "Revirtiendo..." : "Revertir bloqueo"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Aviso que reciben los pacientes */}
            <section className="mt-6 rounded-xl border border-line bg-surface p-5">
              <h2 className="text-base font-bold text-ink">
                Aviso que reciben los pacientes
              </h2>
              <div className="mt-3 rounded-lg border border-line bg-background px-4 py-3 text-sm leading-relaxed text-ink">
                <p>
                  <strong>Asunto:</strong> {bloqueoActual.previewEmail.subject}
                </p>
                <p className="mt-1">{bloqueoActual.previewEmail.bodyText}</p>
              </div>
            </section>

            {/* Listado para el administrativo — Pacientes a contactar */}
            <section className="mt-6 rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-ink">
                    {actorRole === "ADMINISTRATIVO"
                      ? "Listado para el administrativo — Pacientes a contactar"
                      : "Pacientes con turno reservado a contactar"}
                  </h2>
                </div>
              </div>

              {bloqueoActual.pacientesAContactar.length === 0 ? (
                <p className="mt-4 rounded-lg border border-line bg-background px-4 py-3 text-sm text-ink-secondary">
                  No había turnos reservados dentro de esta franja al momento del bloqueo.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-background text-xs font-bold uppercase tracking-wider text-ink-secondary">
                        <th className="px-4 py-2.5">Paciente</th>
                        <th className="px-4 py-2.5">Contacto</th>
                        <th className="px-4 py-2.5">Turno afectado</th>
                        <th className="px-4 py-2.5">Aviso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {bloqueoActual.pacientesAContactar.map((p) => (
                        <tr key={p.id} className="hover:bg-background/50">
                          <td className="px-4 py-2.5 font-medium text-ink">
                            {p.pacienteNombre}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-ink-secondary">
                            {p.contactoTexto}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">
                            {p.turnoAfectadoTexto}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                AVISO_BADGE_CLASSES[p.emailStatus]
                              }`}
                            >
                              {p.estadoAvisoLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
