"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  confirmarBloqueoFranjaAction,
  previsualizarBloqueoFranjaAction,
  type DoctorOpcionBloqueo,
  type ResumenBloqueoRegistrado,
} from "@/actions/bloqueos";
import type { PreviewBloqueoFranja } from "@/lib/bloqueo-agenda";
import type { Role } from "@/generated/prisma/client";

type Props = {
  actorRole: Role;
  initialDoctorId: string;
  doctores: DoctorOpcionBloqueo[];
  hoy: string;
  initialDia: string;
  initialDesde: string;
  initialHasta: string;
  initialPreview: PreviewBloqueoFranja | null;
  bloqueosRegistrados?: ResumenBloqueoRegistrado[];
};

export function BloqueoFranjaView({
  actorRole,
  initialDoctorId,
  doctores,
  hoy,
  initialDia,
  initialDesde,
  initialHasta,
  initialPreview,
}: Props) {
  const router = useRouter();
  const [doctorId, setDoctorId] = useState(initialDoctorId);
  const [dia, setDia] = useState(initialDia);
  const [diaHasta, setDiaHasta] = useState(initialDia);
  const [desde, setDesde] = useState(initialDesde);
  const [hasta, setHasta] = useState(initialHasta);
  const [motivo, setMotivo] = useState("");
  const [preview, setPreview] = useState<PreviewBloqueoFranja | null>(initialPreview);
  const [feedback, setFeedback] = useState<{
    tipo: "ok" | "error";
    mensaje: string;
    bloqueoId?: string;
  } | null>(null);

  // Modal simple: confirmación previa y aviso de éxito.
  const [modal, setModal] = useState<"confirmar" | "exito" | null>(null);

  const [isPendingPreview, startPreviewTransition] = useTransition();
  const [isPendingConfirm, startConfirmTransition] = useTransition();

  function handleVerTurnos(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startPreviewTransition(async () => {
      const res = await previsualizarBloqueoFranjaAction({
        doctorId,
        dia,
        diaHasta: diaHasta || dia,
        desde,
        hasta,
        motivo,
      });

      if (!res.success || !res.preview) {
        setFeedback({
          tipo: "error",
          mensaje: res.message ?? "No se pudieron consultar los turnos de la franja.",
        });
        return;
      }

      setPreview(res.preview);
    });
  }

  function handleConfirmarBloqueo() {
    setFeedback(null);

    startConfirmTransition(async () => {
      const res = await confirmarBloqueoFranjaAction({
        doctorId,
        dia,
        diaHasta: diaHasta || dia,
        desde,
        hasta,
        motivo,
      });

      if (!res.success) {
        setModal(null);
        setFeedback({
          tipo: "error",
          mensaje: res.message,
        });
        return;
      }

      setModal("exito");
      setFeedback({
        tipo: "ok",
        mensaje: res.message,
        bloqueoId: res.bloqueoId,
      });
      setMotivo("");

      const refreshed = await previsualizarBloqueoFranjaAction({
        doctorId,
        dia,
        diaHasta: diaHasta || dia,
        desde,
        hasta,
      });
      if (refreshed.success && refreshed.preview) {
        setPreview(refreshed.preview);
      }

      router.refresh();
    });
  }

  function handleCancelarSeleccion() {
    setPreview(null);
    setMotivo("");
    setFeedback(null);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {/* Encabezado */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              {actorRole === "MEDICO"
                ? "Mi agenda — Bloqueo de una franja"
                : "Agenda — Bloqueo de una franja"}
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Bloqueá los turnos aún libres de una franja publicada por ausencia o licencia, sin
              modificar los turnos ya reservados.
            </p>
          </div>
          {actorRole === "MEDICO" && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard/agenda"
                className="cursor-pointer rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-primary/50 hover:bg-background"
              >
                ← Volver a Mi agenda
              </Link>
            </div>
          )}
        </div>

        {/* Mensajes de estado */}
        {feedback && (
          <div
            role="status"
            className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
              feedback.tipo === "ok"
                ? "border-primary/40 bg-primary-soft text-primary-dark"
                : "border-danger/40 bg-danger-soft text-danger"
            }`}
          >
            <span>{feedback.mensaje}</span>
            {feedback.tipo === "ok" && feedback.bloqueoId && (
              <Link
                href={`/dashboard/bloqueos?bloqueoId=${feedback.bloqueoId}`}
                className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark"
              >
                Ver aviso y listado de pacientes →
              </Link>
            )}
          </div>
        )}

        {/* Elegir la franja a bloquear */}
        <section className="mt-6 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-bold text-ink">Elegir la franja a bloquear</h2>

          <form onSubmit={handleVerTurnos} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {actorRole === "ADMINISTRATIVO" && (
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <label htmlFor="doctorId" className="text-xs font-semibold text-ink">
                    Profesional médico
                  </label>
                  <select
                    id="doctorId"
                    value={doctorId}
                    onChange={(e) => {
                      setDoctorId(e.target.value);
                      setPreview(null);
                    }}
                    className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                  >
                    {doctores.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.fullName} — {doc.specialtyLabel}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="dia" className="text-xs font-semibold text-ink">
                  Día desde
                </label>
                <input
                  id="dia"
                  type="date"
                  min={hoy}
                  value={dia}
                  onChange={(e) => {
                    const nextDia = e.target.value;
                    setDia(nextDia);
                    if (!diaHasta || diaHasta < nextDia) {
                      setDiaHasta(nextDia);
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="diaHasta" className="text-xs font-semibold text-ink">
                  Día hasta
                </label>
                <input
                  id="diaHasta"
                  type="date"
                  min={dia || hoy}
                  value={diaHasta}
                  onChange={(e) => setDiaHasta(e.target.value)}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="desde" className="text-xs font-semibold text-ink">
                  Desde
                </label>
                <input
                  id="desde"
                  type="time"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="hasta" className="text-xs font-semibold text-ink">
                  Hasta
                </label>
                <input
                  id="hasta"
                  type="time"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="motivo" className="text-xs font-semibold text-ink">
                Motivo del bloqueo
              </label>
              <input
                id="motivo"
                type="text"
                maxLength={300}
                placeholder="Ej.: Ausencia por congreso médico, licencia o imprevisto"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:border-primary/50 focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isPendingPreview}
                className="cursor-pointer rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-primary/50 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPendingPreview ? "Consultando..." : "Ver turnos de la franja"}
              </button>
            </div>
          </form>
        </section>

        {/* Turnos de la franja */}
        {preview && (
          <>
            <section className="mt-6 rounded-xl border border-line bg-surface p-5">
              <h2 className="text-base font-bold text-ink">
                Turnos de la franja ({preview.doctorName} · Día {preview.fechaRangoFormateada}, de{" "}
                {preview.desde} a {preview.hasta})
              </h2>

              {/* Turnos reservados (no se bloquean) */}
              <div className="mt-4">
                <h3 className="text-sm font-bold text-ink">
                  Turnos reservados (no se bloquean)
                </h3>

                <div className="mt-2 rounded-lg border border-warning/40 bg-warning/15 px-4 py-2.5 text-sm text-ink">
                  {preview.mensajeAdvertenciaReservados}
                </div>

                {preview.turnosReservados.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-background text-xs font-bold uppercase tracking-wider text-ink-secondary">
                          <th className="px-4 py-2.5">Horario</th>
                          <th className="px-4 py-2.5">Paciente</th>
                          <th className="px-4 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {preview.turnosReservados.map((t) => (
                          <tr key={t.id} className="hover:bg-background/50">
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">
                              {preview.dia !== preview.diaHasta
                                ? `${t.fechaFormateada} · ${t.horario}`
                                : t.horario}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-ink">
                              {t.pacienteNombre}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-block rounded-full border border-warning/40 bg-warning/20 px-2.5 py-0.5 text-xs font-semibold text-ink">
                                {t.estadoLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Turnos libres de la franja */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-ink">Turnos libres de la franja</h3>

                {preview.turnosLibres.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-line bg-background px-4 py-3 text-sm text-ink-secondary">
                    No hay turnos libres disponibles para bloquear en este rango horario.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-background text-xs font-bold uppercase tracking-wider text-ink-secondary">
                          <th className="px-4 py-2.5">Horario</th>
                          <th className="px-4 py-2.5">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {preview.turnosLibres.map((t) => (
                          <tr key={t.id} className="hover:bg-background/50">
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">
                              {preview.dia !== preview.diaHasta
                                ? `${t.fechaFormateada} · ${t.horario}`
                                : t.horario}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-block rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary-dark">
                                Libre
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Confirmar el bloqueo */}
            <section className="mt-6 rounded-xl border border-line bg-surface p-5">
              <h2 className="text-base font-bold text-ink">Confirmar el bloqueo</h2>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setModal("confirmar")}
                  disabled={
                    isPendingConfirm ||
                    (preview.cantidadLibres === 0 && preview.cantidadReservados === 0)
                  }
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPendingConfirm ? "Bloqueando..." : "Bloquear turnos libres"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelarSeleccion}
                  disabled={isPendingConfirm}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-primary/50 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </section>
          </>
        )}
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bloqueo-modal-titulo"
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
            {modal === "confirmar" ? (
              <>
                <h2 id="bloqueo-modal-titulo" className="text-lg font-bold text-ink">
                  ¿Estás seguro?
                </h2>
                <p className="mt-2 text-sm text-ink-secondary">
                  Se van a bloquear los turnos libres de la franja seleccionada
                  {preview ? ` (${preview.cantidadLibres})` : ""}. Los turnos ya reservados no se
                  modifican.
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    disabled={isPendingConfirm}
                    className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-primary/50 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarBloqueo}
                    disabled={isPendingConfirm}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPendingConfirm ? "Bloqueando..." : "Sí, bloquear"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="bloqueo-modal-titulo" className="text-lg font-bold text-ink">
                  Turnos bloqueados
                </h2>
                <p className="mt-2 text-sm text-ink-secondary">
                  Se bloquearon los turnos libres de la franja seleccionada.
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
                  >
                    Aceptar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
