"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AgendaPreviewData,
  generateTurnosAction,
  GenerateTurnosResult,
} from "@/actions/turnos";
import Link from "next/link";

interface AgendaGeneradaViewProps {
  initialData: AgendaPreviewData;
}

export function AgendaGeneradaView({ initialData }: AgendaGeneradaViewProps) {
  const router = useRouter();
  const [data] = useState<AgendaPreviewData>(initialData);
  const [loading, setLoading] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerateTurnosResult | null>(
    initialData.alreadyGenerated
      ? {
          success: true,
          message: `Agenda ya generada previamente con ${initialData.existingTurnosCount} turnos en estado disponible.`,
          createdCount: 0,
          existingCount: initialData.existingTurnosCount,
          totalSlots: initialData.summary.totalTurnos,
        }
      : null
  );
  const [expandedFranjaIndex, setExpandedFranjaIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isGenerated = Boolean(generationResult?.success);

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await generateTurnosAction({
        month: data.month,
        year: data.year,
      });

      if (result.success) {
        setGenerationResult(result);
        // "Generar y abrir agenda" (wireframe): abre la agenda del profesional (US-11) en ese mes.
        const mm = String(data.month).padStart(2, "0");
        router.push(`/dashboard/agenda?vista=mes&fecha=${data.year}-${mm}-01`);
      } else {
        setErrorMsg(result.message || "No se pudieron generar los turnos.");
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al generar los turnos."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedFranjaIndex((prev) => (prev === index ? null : index));
  };

  // Sin disponibilidad cargada no hay nada que generar: los turnos salen
  // únicamente de lo que el médico declaró en US-06.
  if (!data.hasAvailability) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Agenda médica — Vista previa de generación
        </h1>
        <hr className="my-6 border-t-2 border-ink" />
        <section className="rounded-xl border-2 border-ink bg-surface p-5 text-sm text-ink sm:p-6">
          <p className="font-semibold">
            No cargaste disponibilidad para {data.monthLabel.toLowerCase()}.
          </p>
          <p className="mt-1 text-ink-secondary">
            Los turnos se generan a partir de los días y franjas que declarás en
            «Disponibilidad».
          </p>
          <Link
            href={`/dashboard/disponibilidad?year=${data.year}&month=${data.month}`}
            className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Cargar disponibilidad
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Agenda médica — Vista previa de generación
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Vista previa de los turnos de 30 minutos que se generan a partir de la disponibilidad
        </p>
      </div>

      <hr className="my-6 border-t-2 border-ink" />

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
        >
          ❌ {errorMsg}
        </div>
      )}

      {/* BLOQUE 1: RESUMEN */}
      <section className="mb-6 rounded-xl border-2 border-ink bg-surface p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            {data.monthLabel} · {data.specialty}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-dashed border-line bg-background p-4 text-center sm:text-left">
            <strong className="text-2xl font-bold text-ink">
              {data.summary.totalJornadas}
            </strong>
            <p className="mt-1 text-xs text-ink-secondary font-medium">
              jornadas configuradas
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-line bg-background p-4 text-center sm:text-left">
            <strong className="text-2xl font-bold text-primary">
              {data.summary.totalTurnos}
            </strong>
            <p className="mt-1 text-xs text-ink-secondary font-medium">
              turnos a generar
            </p>
          </div>

          {data.summary.jornadasValidadas ? (
            <div className="rounded-lg border border-dashed border-emerald-400 bg-emerald-50/60 p-4 text-center sm:text-left">
              <strong className="text-2xl font-bold text-emerald-800">
                {data.summary.minJornadasSemana} a {data.summary.maxJornadasSemana}
              </strong>
              <p className="mt-1 text-xs text-emerald-800 font-medium">
                jornadas por semana validadas
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-red-300 bg-red-50 p-4 text-center sm:text-left">
              <strong className="text-2xl font-bold text-red-800">
                {data.summary.minJornadasSemana} a {data.summary.maxJornadasSemana}
              </strong>
              <p className="mt-1 text-xs text-red-800 font-medium">
                jornadas por semana: la disponibilidad no cumple el mínimo. Volvé a editarla.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* BLOQUE 2: VISTA PREVIA */}
      <section className="mb-6 rounded-xl border-2 border-ink bg-surface p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Turnos que se crearán
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-secondary">
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3">Horario</th>
                <th className="py-3 px-3">Profesional</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-3 text-right">Detalle turnos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.previews.map((franja, idx) => {
                const isExpanded = expandedFranjaIndex === idx;
                return (
                  <tr key={franja.id || idx} className="group hover:bg-background/50 transition">
                    <td className="py-3.5 px-3 font-semibold text-ink">
                      {franja.displayDate}
                    </td>
                    <td className="py-3.5 px-3 text-ink">
                      {franja.horario}
                      {franja.sobranteMinutos > 0 && (
                        <span
                          className="ml-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                          title="Intervalo menor a 30 min descartado"
                        >
                          +{franja.sobranteMinutos}m sobrante descartado
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-ink-secondary">
                      {data.doctorName}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          isGenerated
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-gray-100 text-ink-secondary border-gray-300"
                        }`}
                      >
                        {isGenerated ? "Generado" : "Listo"}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleExpand(idx)}
                        className="text-xs font-semibold text-primary hover:text-primary-dark underline cursor-pointer"
                      >
                        {isExpanded
                          ? "Ocultar"
                          : `Ver ${franja.turnosCount} turnos`}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detalle desplegable de turnos para la franja seleccionada */}
        {expandedFranjaIndex !== null && (
          <div className="mt-4 rounded-lg border border-line bg-background p-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                Desglose turno a turno de 30 min · {data.previews[expandedFranjaIndex].displayDate} ({data.previews[expandedFranjaIndex].horario})
              </h4>
              <span className="text-xs text-ink-secondary">
                {data.previews[expandedFranjaIndex].turnosCount} turnos generados
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {data.previews[expandedFranjaIndex].slots.map((slot, sIdx) => (
                <div
                  key={sIdx}
                  className="rounded border border-line bg-surface p-2 text-center text-xs shadow-2xs"
                >
                  <span className="font-bold text-ink">
                    {slot.startTime} – {slot.endTime}
                  </span>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <span className="text-[10px] text-ink-secondary">30 min</span>
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] font-semibold text-emerald-700">
                      DISPONIBLE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-ink-secondary">
          Cada franja se divide en turnos consecutivos de 30 minutos. La tabla muestra una fila por franja; el detalle turno a turno se ve en la agenda del profesional.
        </p>

        {/* Acciones principales según el wireframe */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !data.summary.jornadasValidadas}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="size-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  ></path>
                </svg>
                Generando turnos...
              </span>
            ) : isGenerated ? (
              "Reconfirmar generación (Idempotente)"
            ) : (
              "Generar y abrir agenda"
            )}
          </button>

          <Link
            href={`/dashboard/disponibilidad?year=${data.year}&month=${data.month}`}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border-2 border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface hover:border-ink cursor-pointer"
          >
            Volver a editar
          </Link>
        </div>
      </section>

      {/* BLOQUE 3: CONFIRMACIÓN */}
      <section className="mb-6 rounded-xl border-2 border-ink bg-surface p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Estado posterior
          </h2>
        </div>

        {isGenerated ? (
          <div className="rounded-lg border border-emerald-400 bg-emerald-50/70 p-4 text-sm text-emerald-900">
            <p className="font-semibold text-emerald-800">
              ✅ Agenda generada correctamente. Los turnos quedan publicados y la agenda del mes se abre automáticamente a los pacientes.
            </p>
            <div className="mt-2 text-xs text-emerald-700">
              <p>
                • <strong>Total de intervalos generados:</strong>{" "}
                {generationResult?.totalSlots || data.summary.totalTurnos} turnos de 30 minutos.
              </p>
              {generationResult && generationResult.createdCount > 0 && (
                <p>
                  • <strong>Nuevos turnos creados:</strong> {generationResult.createdCount} en estado DISPONIBLE.
                </p>
              )}
              {generationResult && generationResult.existingCount > 0 && (
                <p>
                  • <strong>Turnos preexistentes preservados (Idempotencia):</strong> {generationResult.existingCount} sin duplicados.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line bg-background p-4 text-xs text-ink-secondary">
            Al pulsar <strong>«Generar y abrir agenda»</strong>, el sistema dividirá automáticamente las franjas horarias en intervalos de 30 minutos y los guardará en estado disponible para el profesional {data.doctorName}.
          </div>
        )}
      </section>
    </div>
  );
}
