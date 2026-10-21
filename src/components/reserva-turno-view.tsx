"use client";

import { useState } from "react";
import Link from "next/link";
import { reservarTurnoAction } from "@/actions/reservas";
import { formatearDiaLargo } from "@/lib/busqueda-turnos";
import {
  MAX_MOTIVO_CONSULTA,
  validarPersonaAtendida,
  type PersonaAtendidaErrors,
  type PersonaAtendidaInput,
} from "@/lib/reservas";
import { ENTITY_OPTIONS, MAX_LENGTHS } from "@/lib/validation";

export type TurnoAReservar = {
  id: string;
  doctorNombre: string;
  especialidad: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  startTime: string;
  endTime: string;
  sala: string;
};

export type PersonaCargada = {
  id: string;
  nombre: string;
  documento: string;
  obraSocial: string;
};

type Paso = "datos" | "persona" | "confirmada" | "no-disponible";

/** Persona elegida para el turno «para otra persona» (US-64). */
type PersonaElegida =
  | { tipo: "existente"; id: string; nombre: string }
  | { tipo: "nueva"; datos: PersonaAtendidaInput };

const PERSONA_VACIA: PersonaAtendidaInput = {
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

function nombrePersona(persona: PersonaElegida): string {
  return persona.tipo === "existente"
    ? persona.nombre
    : `${persona.datos.firstName.trim()} ${persona.datos.lastName.trim()}`;
}

/**
 * US-13: resumen del turno, datos de la reserva, confirmación y error de
 * concurrencia. US-64: paso adicional para reservar a nombre de otra persona.
 */
export function ReservaTurnoView({
  turno,
  personas,
}: {
  turno: TurnoAReservar | null;
  personas: PersonaCargada[];
}) {
  const [paso, setPaso] = useState<Paso>(turno ? "datos" : "no-disponible");
  const [paraOtra, setParaOtra] = useState(false);
  const [persona, setPersona] = useState<PersonaElegida | null>(null);
  const [nueva, setNueva] = useState<PersonaAtendidaInput>(PERSONA_VACIA);
  const [personaErrors, setPersonaErrors] = useState<PersonaAtendidaErrors>({});
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegirParaMi = () => {
    setParaOtra(false);
    setPersona(null);
    setError(null);
  };

  const elegirParaOtra = () => {
    setParaOtra(true);
    setError(null);
    setPaso("persona");
  };

  const usarPersonaCargada = (p: PersonaCargada) => {
    setPersona({ tipo: "existente", id: p.id, nombre: p.nombre });
    setPersonaErrors({});
    setPaso("datos");
  };

  const continuarConPersonaNueva = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors = validarPersonaAtendida(nueva);
    setPersonaErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPersona({ tipo: "nueva", datos: nueva });
    setPaso("datos");
  };

  const volverDePersona = () => {
    // Sin persona elegida, el turno sigue siendo para quien reserva.
    if (!persona) setParaOtra(false);
    setPersonaErrors({});
    setPaso("datos");
  };

  const confirmar = async () => {
    if (!turno) return;
    if (paraOtra && !persona) {
      setPaso("persona");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await reservarTurnoAction({
      turnoId: turno.id,
      motivoConsulta: motivo,
      paraOtraPersona:
        paraOtra && persona
          ? persona.tipo === "existente"
            ? { personaId: persona.id }
            : { nueva: persona.datos }
          : undefined,
    });
    setLoading(false);

    if (result.success) {
      setPaso("confirmada");
      return;
    }
    if (result.code === "NO_DISPONIBLE") {
      setPaso("no-disponible");
      return;
    }
    if (result.personaErrors) {
      setPersonaErrors(result.personaErrors);
      setPersona(null);
      setPaso("persona");
    }
    setError(result.message);
  };

  const titulo =
    paso === "persona" ? "Reservar para otra persona" : "Confirmar reserva";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{titulo}</h1>

      {/* BLOQUE 1: RESUMEN */}
      {turno && (paso === "datos" || paso === "confirmada") && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">Turno seleccionado</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Dato label="Profesional" value={turno.doctorNombre} />
            <Dato label="Especialidad" value={turno.especialidad} />
            <Dato
              label="Fecha y hora"
              value={`${formatearDiaLargo(turno.fecha)} · ${turno.startTime} – ${turno.endTime}`}
            />
            <Dato label="Sala" value={turno.sala} />
          </dl>
        </section>
      )}

      {/* BLOQUE 2: DATOS DE LA RESERVA */}
      {turno && paso === "datos" && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">¿Para quién es el turno?</h2>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="radio" name="para" checked={!paraOtra} onChange={elegirParaMi} />
              Para mí
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="para" checked={paraOtra} onChange={elegirParaOtra} />
              Para otra persona
            </label>
          </div>
          {paraOtra && persona ? (
            <p className="mt-2 text-sm text-ink">
              Turno a nombre de <span className="font-semibold">{nombrePersona(persona)}</span>.{" "}
              <button
                type="button"
                onClick={() => setPaso("persona")}
                className="text-xs font-semibold text-ink-secondary underline hover:text-ink"
              >
                Cambiar persona
              </button>
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-secondary">
              Si elegís «para otra persona» pasás a cargar sus datos y su obra social antes de
              confirmar.
            </p>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="motivo">
              Motivo de la consulta (opcional)
            </label>
            <input
              id="motivo"
              value={motivo}
              maxLength={MAX_MOTIVO_CONSULTA}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: control, dolor, estudio"
              className={INPUT_CLASS}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={confirmar} disabled={loading} className={BTN_PRIMARY}>
              {loading ? "Reservando…" : "Confirmar reserva"}
            </button>
            <Link href="/dashboard/turnos" className={BTN_SECONDARY}>
              Cancelar y volver
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-secondary">
            Un turno reservado no puede modificarse: la única operación disponible después es la
            cancelación.
          </p>
        </section>
      )}

      {/* US-64 · BLOQUE 1: PERSONA YA CARGADA */}
      {paso === "persona" && personas.length > 0 && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">¿Reservás para alguien que ya cargaste antes?</h2>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-background">
            {personas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="grid gap-0.5 sm:grid-cols-3 sm:gap-6">
                  <span className="font-semibold text-ink">{p.nombre}</span>
                  <span className="text-ink-secondary">{p.documento}</span>
                  <span className="text-ink-secondary">{p.obraSocial}</span>
                </div>
                <button type="button" onClick={() => usarPersonaCargada(p)} className={BTN_SECONDARY}>
                  Usar esta persona
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-secondary">
            Si la persona ya fue cargada en una reserva anterior, elegila de este listado sin
            reingresar sus datos.
          </p>
        </section>
      )}

      {/* US-64 · BLOQUE 2: PERSONA NUEVA */}
      {paso === "persona" && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">Datos de la persona atendida</h2>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}
          <form onSubmit={continuarConPersonaNueva} noValidate className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo id="firstName" label="Nombre" error={personaErrors.firstName}>
                <input
                  id="firstName"
                  value={nueva.firstName}
                  maxLength={MAX_LENGTHS.firstName}
                  onChange={(e) => setNueva({ ...nueva, firstName: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
              <Campo id="lastName" label="Apellido" error={personaErrors.lastName}>
                <input
                  id="lastName"
                  value={nueva.lastName}
                  maxLength={MAX_LENGTHS.lastName}
                  onChange={(e) => setNueva({ ...nueva, lastName: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
              <Campo id="docNumber" label="Documento" error={personaErrors.docNumber}>
                <input
                  id="docNumber"
                  value={nueva.docNumber}
                  maxLength={MAX_LENGTHS.docNumber}
                  onChange={(e) => setNueva({ ...nueva, docNumber: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
              <Campo id="birthDate" label="Fecha de nacimiento" error={personaErrors.birthDate}>
                <input
                  id="birthDate"
                  type="date"
                  value={nueva.birthDate}
                  onChange={(e) => setNueva({ ...nueva, birthDate: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
              <Campo
                id="healthInsuranceEntity"
                label="Obra social — entidad"
                error={personaErrors.healthInsuranceEntity}
              >
                <select
                  id="healthInsuranceEntity"
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
              </Campo>
              <Campo
                id="healthInsurancePlan"
                label="Obra social — plan"
                error={personaErrors.healthInsurancePlan}
              >
                <input
                  id="healthInsurancePlan"
                  value={nueva.healthInsurancePlan}
                  maxLength={MAX_LENGTHS.healthInsurancePlan}
                  onChange={(e) => setNueva({ ...nueva, healthInsurancePlan: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
              <Campo
                id="healthInsuranceNumber"
                label="N.º de afiliado"
                error={personaErrors.healthInsuranceNumber}
              >
                <input
                  id="healthInsuranceNumber"
                  value={nueva.healthInsuranceNumber}
                  maxLength={MAX_LENGTHS.healthInsuranceNumber}
                  onChange={(e) => setNueva({ ...nueva, healthInsuranceNumber: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Campo>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={BTN_PRIMARY}>
                Continuar con la reserva
              </button>
              <button type="button" onClick={volverDePersona} className={BTN_SECONDARY}>
                Volver
              </button>
            </div>
          </form>
        </section>
      )}

      {/* BLOQUE 3: CONFIRMACIÓN */}
      {turno && paso === "confirmada" && (
        <section
          role="status"
          className="mt-6 rounded-xl border-2 border-success/50 bg-success/5 p-4 sm:p-6"
        >
          <h2 className="text-lg font-bold text-ink">Reserva confirmada</h2>
          <p className="mt-2 text-sm text-ink">
            Turno reservado para el{" "}
            {formatearDiaLargo(turno.fecha).charAt(0).toLowerCase() +
              formatearDiaLargo(turno.fecha).slice(1)}{" "}
            a las {turno.startTime} con {turno.doctorNombre}
            {paraOtra && persona ? `, a nombre de ${nombrePersona(persona)}` : ""}.
          </p>
          <p className="mt-1 text-sm text-ink-secondary">
            Vas a recibir un email de confirmación en los próximos minutos.
          </p>
        </section>
      )}

      {/* BLOQUE 4: ERROR DE CONCURRENCIA */}
      {paso === "no-disponible" && (
        <section role="alert" className="mt-6 rounded-xl border-2 border-error/50 bg-error/5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">El turno ya no está disponible</h2>
          <p className="mt-2 text-sm text-ink">
            Ups — alguien reservó este turno un instante antes que vos. Volvé a los resultados de
            búsqueda, que ya están actualizados.
          </p>
          <div className="mt-4">
            <Link href="/dashboard/turnos" className={BTN_PRIMARY}>
              Volver a buscar turnos
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-background p-3">
      <dt className="text-xs font-medium text-ink-secondary">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Campo({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
