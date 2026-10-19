"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registrarEstadoTurnoAction,
  type DatosPaginaEstadoTurnos,
} from "@/actions/estado-turnos";
import { formatearDiaLargo, formatearFechaAr } from "@/lib/busqueda-turnos";
import { ESTADO_TURNO_LABELS } from "@/lib/estado-turno";
import type { EstadoTurno } from "@/generated/prisma/client";

type EstadoTurnosViewProps = {
  datos: DatosPaginaEstadoTurnos;
};

const ESTADO_BADGE_CLASSES: Record<EstadoTurno, string> = {
  DISPONIBLE: "border-emerald-300 bg-emerald-50 text-emerald-900",
  RESERVADO: "border-sky-300 bg-sky-50 text-sky-900",
  CUMPLIDO: "border-indigo-300 bg-indigo-50 text-indigo-900",
  AUSENTE: "border-amber-300 bg-amber-50 text-amber-900",
  CANCELADO: "border-red-300 bg-red-50 text-red-800",
};

export function EstadoTurnosView({ datos }: EstadoTurnosViewProps) {
  const router = useRouter();
  const [pendingNav, startNavTransition] = useTransition();
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tipo: "ok" | "error";
    mensaje: string;
  } | null>(null);

  const filtrarPorProfesional = (nuevoDoctorId: string) => {
    const qs = new URLSearchParams();
    if (datos.viewerRole === "ADMINISTRATIVO" && nuevoDoctorId) {
      qs.set("doctorId", nuevoDoctorId);
    }
    const query = qs.toString();
    startNavTransition(() => {
      router.push(
        query ? `/dashboard/estado-turnos?${query}` : "/dashboard/estado-turnos",
        { scroll: false }
      );
    });
  };

  const handleMarcarEstado = async (turnoId: string, nuevoEstado: EstadoTurno) => {
    setFeedback(null);
    setProcesandoId(turnoId);
    try {
      const resultado = await registrarEstadoTurnoAction({
        turnoId,
        nuevoEstado,
      });
      if (resultado.success) {
        setFeedback({ tipo: "ok", mensaje: resultado.message });
        router.refresh();
      } else {
        setFeedback({ tipo: "error", mensaje: resultado.message });
      }
    } catch {
      setFeedback({
        tipo: "error",
        mensaje: "Ocurrió un error inesperado al actualizar el estado del turno.",
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const mostrarColumnaProfesional =
    datos.viewerRole === "ADMINISTRATIVO" && !datos.doctorFiltroId;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Agenda del día — Marcar asistencia
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Registro del estado del turno para reflejar si el paciente asistió, no asistió o fue atendido.
        </p>
      </div>

      {feedback && (
        <div
          role={feedback.tipo === "error" ? "alert" : "status"}
          className={`mt-6 rounded-xl border p-4 text-sm font-medium ${
            feedback.tipo === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {feedback.mensaje}
        </div>
      )}

      {/* BLOQUE 1: TURNOS DE HOY */}
      <section
        aria-busy={pendingNav}
        className={`mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs transition-opacity sm:p-6 ${
          pendingNav ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
              Turnos de hoy
            </span>
            <h2 className="mt-0.5 text-lg font-bold text-ink">
              {formatearDiaLargo(datos.hoy)}
            </h2>
          </div>

          {datos.viewerRole === "ADMINISTRATIVO" && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por profesional"
                value={datos.doctorFiltroId}
                onChange={(e) => filtrarPorProfesional(e.target.value)}
                className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
              >
                <option value="">Todos los profesionales</option>
                {datos.profesionales.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.fullName} — {prof.specialtyLabel}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {datos.turnos.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-background p-6 text-center text-sm text-ink-secondary">
            No hay turnos registrados para hoy ({formatearFechaAr(datos.hoy)}).
          </div>
        ) : (
          <>
            {/* Vista de tabla para pantallas >= sm */}
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                    <th className="px-4 py-2.5">Horario</th>
                    {mostrarColumnaProfesional && (
                      <th className="px-4 py-2.5">Profesional</th>
                    )}
                    <th className="px-4 py-2.5">Paciente</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {datos.turnos.map((turno) => {
                    const enProceso = procesandoId === turno.id;
                    return (
                      <tr key={turno.id} className="transition hover:bg-background/40">
                        <td className="px-4 py-3 font-semibold text-ink">
                          {turno.startTime}
                        </td>
                        {mostrarColumnaProfesional && (
                          <td className="px-4 py-3 text-ink">
                            <span className="font-medium">{turno.doctorName}</span>
                            <span className="block text-xs text-ink-secondary">
                              {turno.specialtyLabel}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-ink">
                          <span>{turno.pacienteNombre}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              ESTADO_BADGE_CLASSES[turno.status]
                            }`}
                          >
                            {ESTADO_TURNO_LABELS[turno.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {turno.puedeModificarHoy ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={enProceso}
                                onClick={() => handleMarcarEstado(turno.id, "CUMPLIDO")}
                                className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                              >
                                Marcar cumplido
                              </button>
                              <button
                                type="button"
                                disabled={enProceso}
                                onClick={() => handleMarcarEstado(turno.id, "AUSENTE")}
                                className="cursor-pointer rounded-lg border border-line bg-background px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50"
                              >
                                Marcar ausente
                              </button>
                            </div>
                          ) : (
                            <span className="text-ink-secondary">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista adaptable para celulares >= 360px (RNF-08) */}
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-background sm:hidden">
              {datos.turnos.map((turno) => {
                const enProceso = procesandoId === turno.id;
                return (
                  <li key={turno.id} className="flex flex-col gap-2 bg-surface p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-ink">
                        {turno.startTime} · {turno.pacienteNombre}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          ESTADO_BADGE_CLASSES[turno.status]
                        }`}
                      >
                        {ESTADO_TURNO_LABELS[turno.status]}
                      </span>
                    </div>
                    {mostrarColumnaProfesional && (
                      <p className="text-xs text-ink-secondary">
                        {turno.doctorName} ({turno.specialtyLabel})
                      </p>
                    )}
                    {turno.puedeModificarHoy && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleMarcarEstado(turno.id, "CUMPLIDO")}
                          className="flex-1 cursor-pointer rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                        >
                          Marcar cumplido
                        </button>
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleMarcarEstado(turno.id, "AUSENTE")}
                          className="flex-1 cursor-pointer rounded-lg border border-line bg-background px-3 py-2 text-xs font-semibold text-ink transition hover:border-ink disabled:opacity-50"
                        >
                          Marcar ausente
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* BLOQUE 2: TRAZABILIDAD / AUDITORÍA DEL CAMBIO */}
      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs sm:p-6">
        <h2 className="text-lg font-bold text-ink">Auditoría del cambio</h2>

        {datos.auditoria.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-line bg-background p-4 text-sm text-ink-secondary">
            Aún no se registraron cambios de estado para los turnos de hoy.
          </div>
        ) : (
          <>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-background/60 text-xs uppercase tracking-wider text-ink-secondary">
                    <th className="px-4 py-2.5">Turno</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Cambiado por</th>
                    <th className="px-4 py-2.5">Fecha y hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {datos.auditoria.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium text-ink">
                        {item.turnoDescripcion}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            ESTADO_BADGE_CLASSES[item.newStatus]
                          }`}
                        >
                          {item.newStatusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink">{item.changedByName}</td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {item.fechaHoraFormateada}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-background sm:hidden">
              {datos.auditoria.map((item) => (
                <li key={item.id} className="space-y-1 bg-surface p-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">{item.turnoDescripcion}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        ESTADO_BADGE_CLASSES[item.newStatus]
                      }`}
                    >
                      {item.newStatusLabel}
                    </span>
                  </div>
                  <p className="text-ink">Cambiado por: {item.changedByName}</p>
                  <p className="text-ink-secondary">{item.fechaHoraFormateada}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
