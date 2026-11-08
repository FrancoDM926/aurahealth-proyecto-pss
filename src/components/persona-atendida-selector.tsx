"use client";

import { useState } from "react";
import {
  validarPersonaAtendida,
  type PersonaAtendidaErrors,
  type PersonaAtendidaInput,
} from "@/lib/reservas";
import { ENTITY_OPTIONS, MAX_LENGTHS } from "@/lib/validation";

/**
 * US-64 — elegir a la persona atendida: una ya cargada o una nueva (wf_reserva_terceros).
 * Usado por el turno de vacunación (US-28) tanto del paciente como del mostrador; no
 * toca el flujo del turno médico.
 */

export type PersonaOpcion = {
  id: string;
  nombre: string;
  documento: string;
  obraSocial: string;
};

export type PersonaSeleccionada =
  | { tipo: "existente"; id: string; nombre: string }
  | { tipo: "nueva"; datos: PersonaAtendidaInput };

export const PERSONA_VACIA: PersonaAtendidaInput = {
  firstName: "",
  lastName: "",
  docNumber: "",
  birthDate: "",
  healthInsuranceEntity: "",
  healthInsurancePlan: "",
  healthInsuranceNumber: "",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const BTN_PRIMARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50";

export function nombreDePersona(p: PersonaSeleccionada): string {
  return p.tipo === "existente" ? p.nombre : `${p.datos.firstName.trim()} ${p.datos.lastName.trim()}`;
}

export function PersonaAtendidaSelector({
  personas,
  serverErrors,
  onElegir,
  onVolver,
}: {
  personas: PersonaOpcion[];
  /** Errores devueltos por el servidor (por ejemplo, documento repetido). */
  serverErrors?: PersonaAtendidaErrors;
  onElegir: (persona: PersonaSeleccionada) => void;
  onVolver: () => void;
}) {
  const [nueva, setNueva] = useState<PersonaAtendidaInput>(PERSONA_VACIA);
  const [errores, setErrores] = useState<PersonaAtendidaErrors>({});
  const errs = { ...errores, ...serverErrors };

  const continuar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors = validarPersonaAtendida(nueva);
    setErrores(errors);
    if (Object.keys(errors).length > 0) return;
    onElegir({ tipo: "nueva", datos: nueva });
  };

  const campo = (
    key: keyof PersonaAtendidaInput,
    label: string,
    props: { type?: string; max?: number } = {}
  ) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink" htmlFor={`persona-${key}`}>
        {label}
      </label>
      <input
        id={`persona-${key}`}
        type={props.type ?? "text"}
        value={nueva[key]}
        maxLength={props.max}
        onChange={(e) => setNueva({ ...nueva, [key]: e.target.value })}
        className={INPUT_CLASS}
      />
      {errs[key] && <p className="mt-1 text-xs text-error">{errs[key]}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {personas.length > 0 && (
        <section className="rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h3 className="text-base font-bold text-ink">¿Es para alguien que ya cargaste antes?</h3>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-background">
            {personas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="grid gap-0.5 sm:grid-cols-3 sm:gap-6">
                  <span className="font-semibold text-ink">{p.nombre}</span>
                  <span className="text-ink-secondary">{p.documento}</span>
                  <span className="text-ink-secondary">{p.obraSocial}</span>
                </div>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => onElegir({ tipo: "existente", id: p.id, nombre: p.nombre })}
                >
                  Usar esta persona
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <h3 className="text-base font-bold text-ink">Datos de la persona atendida</h3>
        <form onSubmit={continuar} noValidate className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campo("firstName", "Nombre", { max: MAX_LENGTHS.firstName })}
            {campo("lastName", "Apellido", { max: MAX_LENGTHS.lastName })}
            {campo("docNumber", "Documento", { max: MAX_LENGTHS.docNumber })}
            {campo("birthDate", "Fecha de nacimiento", { type: "date" })}
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="persona-entidad">
                Obra social — entidad
              </label>
              <select
                id="persona-entidad"
                value={nueva.healthInsuranceEntity}
                onChange={(e) => setNueva({ ...nueva, healthInsuranceEntity: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Seleccioná una entidad</option>
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {errs.healthInsuranceEntity && (
                <p className="mt-1 text-xs text-error">{errs.healthInsuranceEntity}</p>
              )}
            </div>
            {campo("healthInsurancePlan", "Obra social — plan", { max: MAX_LENGTHS.healthInsurancePlan })}
            {campo("healthInsuranceNumber", "N.º de afiliado", { max: MAX_LENGTHS.healthInsuranceNumber })}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={BTN_PRIMARY}>
              Continuar con la reserva
            </button>
            <button type="button" onClick={onVolver} className={BTN_SECONDARY}>
              Volver
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
