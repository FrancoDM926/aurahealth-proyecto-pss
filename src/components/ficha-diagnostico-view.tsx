"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  editarEntradaDiagnostico,
  guardarEntradaDiagnostico,
  type FichaDiagnosticoData,
} from "@/actions/ficha-diagnostico";

type Props = {
  result:
    | { success: true; data: FichaDiagnosticoData }
    | { success: false; message: string };
};

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";

export function FichaDiagnosticoView({ result }: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correctionOfId, setCorrectionOfId] = useState<string | null>(null);
  const [form, setForm] = useState({ diagnosis: "", treatment: "", observations: "" });

  if (!result.success) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-900">
          {result.message}
        </div>
        <Link href="/dashboard/agenda" className="mt-4 inline-block text-sm font-semibold text-primary">
          Volver a mi agenda
        </Link>
      </div>
    );
  }

  const { data } = result;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const response = editingId
      ? await editarEntradaDiagnostico({ entryId: editingId, ...form })
      : await guardarEntradaDiagnostico({
          turnoId: data.turno.id,
          correctionOfId,
          ...form,
        });
    setSaving(false);
    setFeedback({ ok: response.success, message: response.message });
    if (response.success) {
      setEditingId(null);
      setCorrectionOfId(null);
      setForm({ diagnosis: "", treatment: "", observations: "" });
      router.refresh();
    }
  };

  const edit = (entry: FichaDiagnosticoData["entries"][number]) => {
    setEditingId(entry.id);
    setCorrectionOfId(null);
    setForm({
      diagnosis: entry.diagnosis,
      treatment: entry.treatment,
      observations: entry.observations,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const correction = (entry: FichaDiagnosticoData["entries"][number]) => {
    setEditingId(null);
    setCorrectionOfId(entry.id);
    setForm({ diagnosis: entry.diagnosis, treatment: entry.treatment, observations: entry.observations });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setFeedback({ ok: true, message: "Modificá los datos y guardalos como nueva entrada de corrección." });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">US-39 · Ficha de diagnóstico</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Consulta de {data.patientName}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{data.doctorName} · turno {data.turno.date} a las {data.turno.startTime}</p>
      </div>

      {feedback && (
        <div role={feedback.ok ? "status" : "alert"} className={`mt-5 rounded-xl border p-4 text-sm ${feedback.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          {feedback.message}
        </div>
      )}

      {data.canCreateEntry && (
        <form onSubmit={submit} className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">{editingId ? "Editar entrada" : "Diagnóstico y tratamiento"}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink">
              Diagnóstico
              <input required className={inputClass} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="Ej.: esguince de tobillo" />
            </label>
            <label className="text-sm font-medium text-ink">
              Tratamiento indicado
              <input required className={inputClass} value={form.treatment} onChange={(e) => setForm({ ...form, treatment: e.target.value })} placeholder="Ej.: inmovilización 10 días" />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium text-ink">
            Observaciones
            <textarea required className={`${inputClass} min-h-28`} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </label>
          <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            La entrada se firma como {data.doctorName} con la fecha y hora del turno. La última edición se registra automáticamente.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar entrada"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setCorrectionOfId(null); setForm({ diagnosis: "", treatment: "", observations: "" }); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink">
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      )}

      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Historial de esta ficha</h2>
          <span className="text-sm text-ink-secondary">{data.entries.length} entrada{data.entries.length === 1 ? "" : "s"}</span>
        </div>
        {data.entries.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line p-5 text-center text-sm text-ink-secondary">Todavía no hay entradas. Cargá la evolución de esta consulta.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.entries.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{entry.consultationDate} {entry.consultationTime} · {entry.authorName}</p>
                    <p className="mt-1 text-xs text-ink-secondary">Última edición: {new Date(entry.updatedAt).toLocaleString("es-AR")}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${entry.canEdit ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-line bg-surface text-ink-secondary"}`}>
                    {entry.canEdit ? "Editable hoy" : "Solo lectura"}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-ink sm:grid-cols-3">
                  <div><dt className="font-semibold">Diagnóstico</dt><dd>{entry.diagnosis}</dd></div>
                  <div><dt className="font-semibold">Tratamiento</dt><dd>{entry.treatment}</dd></div>
                  <div><dt className="font-semibold">Observaciones</dt><dd>{entry.observations}</dd></div>
                </dl>
                {(entry.canEdit || entry.canCorrect) && data.canCreateEntry && (
                  <div className="mt-3 flex gap-2">
                    {entry.canEdit && <button type="button" onClick={() => edit(entry)} className="text-sm font-semibold text-primary">Editar</button>}
                    {entry.canCorrect && <button type="button" onClick={() => correction(entry)} className="text-sm font-semibold text-primary">Registrar corrección</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-ink-secondary">Todas las entradas son visibles para los médicos de la sala. Después del día de la consulta quedan en solo lectura y las correcciones se agregan como una nueva entrada.</p>
      </section>

      <Link href={`/dashboard/ficha-consolidada?patientKey=${encodeURIComponent(data.patientKey)}`} className="mt-5 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-background">
        Ver fichas de este paciente
      </Link>
      <Link href="/dashboard/agenda" className="mt-5 inline-block text-sm font-semibold text-primary">Volver a mi agenda</Link>
    </div>
  );
}
