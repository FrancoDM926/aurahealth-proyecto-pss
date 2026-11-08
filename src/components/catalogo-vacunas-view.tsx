"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearVacuna,
  desactivarVacuna,
  modificarVacuna,
  reactivarVacuna,
  type VacunaActionResult,
  type VacunaItem,
} from "@/actions/vacunas";
import {
  MAX_DOSIS_ESQUEMA,
  describirEsquema,
  dosisPorDefecto,
  type DosisInput,
  type EsquemaErrores,
  type VacunaErrores,
  type VacunaInput,
} from "@/lib/vacunas";

const VACIO: VacunaInput = { denominacion: "", laboratorio: "", esquemaDosis: "" };

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm";

type Props = {
  vacunas: VacunaItem[];
};

export function CatalogoVacunasView({ vacunas }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<VacunaInput>(VACIO);
  const [editing, setEditing] = useState<VacunaItem | null>(null);
  const [errors, setErrors] = useState<VacunaErrores>({});
  const [dosis, setDosis] = useState<DosisInput[]>(dosisPorDefecto());
  const [esquemaErrors, setEsquemaErrors] = useState<EsquemaErrores | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setField = (key: keyof VacunaInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(VACIO);
    setEditing(null);
    setErrors({});
    setDosis(dosisPorDefecto());
    setEsquemaErrors(null);
  };

  const setDosisField = (i: number, patch: Partial<DosisInput>) =>
    setDosis((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const startEdit = (vacuna: VacunaItem) => {
    setMessage(null);
    setErrors({});
    setEditing(vacuna);
    setForm({
      denominacion: vacuna.denominacion,
      laboratorio: vacuna.laboratorio,
      esquemaDosis: vacuna.esquemaDosis,
    });
    setDosis(
      vacuna.dosis.length > 0
        ? vacuna.dosis.map((d) => ({
            etiqueta: d.etiqueta,
            diasDesdeAnterior: d.diasDesdeAnterior,
          }))
        : dosisPorDefecto()
    );
    setEsquemaErrors(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrors({});
    setEsquemaErrors(null);
    setSaving(true);
    let result: VacunaActionResult;
    try {
      result = editing
        ? await modificarVacuna(editing.id, form, dosis)
        : await crearVacuna(form, dosis);
    } catch (err) {
      console.error("catálogo de vacunas:", err);
      setSaving(false);
      setMessage("No se pudo guardar. Probá de nuevo en unos segundos.");
      return;
    }
    setSaving(false);
    setMessage(result.message ?? null);
    if (!result.success) {
      setErrors(result.errors ?? {});
      setEsquemaErrors(result.esquemaErrors ?? null);
      return;
    }
    resetForm();
    router.refresh();
  };

  const runRowAction = async (
    vacuna: VacunaItem,
    action: (id: string) => Promise<VacunaActionResult>
  ) => {
    setMessage(null);
    setBusyId(vacuna.id);
    try {
      const result = await action(vacuna.id);
      setMessage(result.message ?? null);
      if (result.success) {
        if (editing?.id === vacuna.id) resetForm();
        router.refresh();
      }
    } catch (err) {
      console.error("catálogo de vacunas:", err);
      setMessage("No se pudo completar la acción. Probá de nuevo.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeactivate = (vacuna: VacunaItem) => {
    const confirmed = window.confirm(
      `¿Desactivar ${vacuna.denominacion} (${vacuna.laboratorio})? Ya no podrá asignarse a turnos nuevos.`
    );
    if (confirmed) void runRowAction(vacuna, desactivarVacuna);
  };

  return (
    <div className="space-y-10">
      {message && (
        <div
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink"
          role="status"
        >
          {message}
        </div>
      )}

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <h2 className="text-lg font-bold text-ink">
          {editing ? "Modificar vacuna" : "Nueva vacuna"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="denominacion">
                Denominación
              </label>
              <input
                id="denominacion"
                className={INPUT_CLASS}
                placeholder="Ej.: Antigripal"
                maxLength={80}
                value={form.denominacion}
                onChange={(e) => setField("denominacion", e.target.value)}
              />
              {errors.denominacion && (
                <p className="mt-1 text-xs text-error">{errors.denominacion}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="laboratorio">
                Laboratorio
              </label>
              <input
                id="laboratorio"
                className={INPUT_CLASS}
                placeholder="Ej.: Laboratorio X"
                maxLength={80}
                value={form.laboratorio}
                onChange={(e) => setField("laboratorio", e.target.value)}
              />
              {errors.laboratorio && (
                <p className="mt-1 text-xs text-error">{errors.laboratorio}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="esquemaDosis">
                Esquema de dosis
              </label>
              <input
                id="esquemaDosis"
                className={INPUT_CLASS}
                placeholder="Ej.: dosis única"
                maxLength={200}
                value={form.esquemaDosis}
                onChange={(e) => setField("esquemaDosis", e.target.value)}
              />
              {errors.esquemaDosis && (
                <p className="mt-1 text-xs text-error">{errors.esquemaDosis}</p>
              )}
            </div>
          </div>

          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-ink">Dosis del esquema</legend>
            <p className="mb-3 text-xs text-ink-secondary">
              Se usan para elegir la dosis al aplicarla y para indicar si el esquema del carnet
              quedó incompleto.
            </p>
            <div className="space-y-2">
              {dosis.map((d, i) => (
                <div key={i} className="flex flex-wrap items-start gap-2">
                  <span className="mt-2 w-6 text-sm font-semibold text-ink-secondary">{i + 1}.</span>
                  <div>
                    <input
                      aria-label={`Nombre de la dosis ${i + 1}`}
                      className={INPUT_CLASS}
                      placeholder="Ej.: 1ª dosis, Refuerzo"
                      maxLength={40}
                      value={d.etiqueta}
                      onChange={(e) => setDosisField(i, { etiqueta: e.target.value })}
                    />
                    {esquemaErrors?.filas[i] && (
                      <p className="mt-1 text-xs text-error">{esquemaErrors.filas[i]}</p>
                    )}
                  </div>
                  {i > 0 && (
                    <input
                      aria-label={`Días desde la dosis anterior (dosis ${i + 1})`}
                      type="number"
                      min={1}
                      className={`${INPUT_CLASS} w-52`}
                      placeholder="Días desde la anterior"
                      value={d.diasDesdeAnterior ?? ""}
                      onChange={(e) =>
                        setDosisField(i, {
                          diasDesdeAnterior: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  )}
                  {dosis.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDosis((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-background"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            {esquemaErrors?.general && (
              <p className="mt-2 text-xs text-error">{esquemaErrors.general}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={dosis.length >= MAX_DOSIS_ESQUEMA}
                onClick={() =>
                  setDosis((prev) => [...prev, { etiqueta: "", diasDesdeAnterior: null }])
                }
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-background disabled:opacity-60"
              >
                Agregar dosis
              </button>
              <button
                type="button"
                onClick={() => setField("esquemaDosis", describirEsquema(dosis))}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-background"
              >
                Completar la descripción con las dosis
              </button>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Agregar vacuna"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium"
              >
                Cancelar edición
              </button>
            )}
          </div>
          <p className="text-xs text-ink-secondary">
            No se permiten dos vacunas activas con la misma denominación y laboratorio.
          </p>
        </form>
      </section>

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <h2 className="text-lg font-bold text-ink">Vacunas del catálogo</h2>

        {vacunas.length === 0 ? (
          <p className="mt-4 text-sm text-ink-secondary">
            Todavía no hay vacunas cargadas. Agregá la primera con el formulario de arriba.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-secondary">
                  <th className="py-2 pr-4 font-semibold">Denominación</th>
                  <th className="py-2 pr-4 font-semibold">Laboratorio</th>
                  <th className="py-2 pr-4 font-semibold">Esquema de dosis</th>
                  <th className="py-2 pr-4 font-semibold">Estado</th>
                  <th className="py-2 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {vacunas.map((vacuna) => (
                  <tr key={vacuna.id} className="border-b border-line/80">
                    <td className="py-3 pr-4">{vacuna.denominacion}</td>
                    <td className="py-3 pr-4">{vacuna.laboratorio}</td>
                    <td className="py-3 pr-4">
                      {vacuna.esquemaDosis}
                      <span className="block text-xs text-ink-secondary">
                        {vacuna.dosis.map((d) => d.etiqueta).join(" · ")}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          vacuna.isActive
                            ? "inline-flex rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary"
                            : "inline-flex rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-secondary"
                        }
                      >
                        {vacuna.isActive ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(vacuna)}
                          disabled={busyId === vacuna.id}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-background disabled:opacity-60"
                        >
                          Editar
                        </button>
                        {vacuna.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(vacuna)}
                            disabled={busyId === vacuna.id}
                            className="rounded-lg border border-error px-3 py-1.5 text-xs font-semibold text-error hover:bg-background disabled:opacity-60"
                          >
                            {busyId === vacuna.id ? "Desactivando…" : "Desactivar"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void runRowAction(vacuna, reactivarVacuna)}
                            disabled={busyId === vacuna.id}
                            className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-light disabled:opacity-60"
                          >
                            {busyId === vacuna.id ? "Reactivando…" : "Reactivar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-ink-secondary">
          Una vacuna desactivada no puede asignarse a turnos nuevos de vacunación. El catálogo es
          la única fuente de datos de vacunas para el resto del módulo.
        </p>
      </section>

      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-secondary">
        El catálogo no administra existencias: se asume que toda vacuna activa tiene stock
        disponible.
      </div>
    </div>
  );
}
