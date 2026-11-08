"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reservarTurnoVacunacionAction } from "@/actions/turnos-vacunacion";
import {
  buscarTitularesAction,
  listarPersonasDelTitularAction,
  type TitularBuscado,
} from "@/actions/pacientes";
import { formatearDiaLargo, formatearFechaAr } from "@/lib/busqueda-turnos";
import { MENSAJE_PACIENTE_NO_REGISTRADO } from "@/lib/pacientes";
import type { PersonaAtendidaErrors } from "@/lib/reservas";
import type { FiltrosVacunacion, GrupoDiaVacunacion, TurnoVacunacionDisponible } from "@/lib/turnos-vacunacion";
import {
  PersonaAtendidaSelector,
  nombreDePersona,
  type PersonaOpcion,
  type PersonaSeleccionada,
} from "@/components/persona-atendida-selector";

/**
 * US-28 — Turno de vacunación (wf_turno_vacunacion).
 * Una sola vista para el paciente (`/dashboard/turnos-vacunacion`) y para el
 * mostrador (`/dashboard/mostrador/vacunacion`, enfermera o administrativo).
 *   1 · Persona (solo mostrador) · 2 · Vacuna y horario · 3 · Confirmación.
 */

export type VacunaOpcion = {
  id: string;
  nombre: string;
  dosis: { orden: number; etiqueta: string }[];
};

type Props = {
  modo: "paciente" | "mostrador";
  vacunas: VacunaOpcion[];
  filtros: FiltrosVacunacion;
  rangoDefecto: { desde: string; hasta: string };
  gruposPorDia: GrupoDiaVacunacion[];
  mensajeVacio: string | null;
  /** Personas que cargó el propio usuario (modo paciente). */
  personasPropias: PersonaOpcion[];
  basePath: string;
};

type Paso = "lista" | "persona" | "confirmar" | "ok" | "no-disponible";

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const BTN_PRIMARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50";

export function TurnosVacunacionView({
  modo,
  vacunas,
  filtros,
  rangoDefecto,
  gruposPorDia,
  mensajeVacio,
  personasPropias,
  basePath,
}: Props) {
  const router = useRouter();
  const esMostrador = modo === "mostrador";

  // 1 · Persona (mostrador)
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<TitularBuscado[] | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [titular, setTitular] = useState<TitularBuscado | null>(null);
  const [personasTitular, setPersonasTitular] = useState<PersonaOpcion[]>([]);

  // 2 · Vacuna y horario
  const [vacunaId, setVacunaId] = useState("");
  const [dosisOrden, setDosisOrden] = useState("");
  const [desde, setDesde] = useState(filtros.desde);
  const [hasta, setHasta] = useState(filtros.hasta);

  // 3 · Confirmación
  const [paso, setPaso] = useState<Paso>("lista");
  const [elegido, setElegido] = useState<TurnoVacunacionDisponible | null>(null);
  const [persona, setPersona] = useState<PersonaSeleccionada | null>(null);
  const [personaErrors, setPersonaErrors] = useState<PersonaAtendidaErrors | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vacuna = vacunas.find((v) => v.id === vacunaId) ?? null;
  const personasDisponibles = esMostrador ? personasTitular : personasPropias;
  const puedeReservar = Boolean(vacuna) && (!esMostrador || Boolean(titular));

  const buscarPersona = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setErrorBusqueda(null);
    const r = await buscarTitularesAction(consulta);
    setBuscando(false);
    if (!r.ok) {
      setResultados(null);
      setErrorBusqueda(r.message);
      return;
    }
    setResultados(r.titulares);
    if (r.titulares.length === 0) setErrorBusqueda(MENSAJE_PACIENTE_NO_REGISTRADO);
  };

  const elegirTitular = async (t: TitularBuscado) => {
    setTitular(t);
    setResultados(null);
    setErrorBusqueda(null);
    setPersonasTitular(await listarPersonasDelTitularAction(t.id));
  };

  const limpiarTitular = () => {
    setTitular(null);
    setPersonasTitular([]);
    setConsulta("");
    setResultados(null);
    setPaso("lista");
  };

  const aplicarFiltros = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    router.push(`${basePath}?${params.toString()}`);
  };

  const limpiarFiltros = () => {
    setDesde(rangoDefecto.desde);
    setHasta(rangoDefecto.hasta);
    router.push(basePath);
  };

  const reservar = (turno: TurnoVacunacionDisponible, paraOtra: boolean) => {
    setElegido(turno);
    setError(null);
    setPersona(null);
    setPersonaErrors(undefined);
    setPaso(paraOtra ? "persona" : "confirmar");
  };

  const confirmar = async () => {
    if (!elegido || !vacuna) return;
    setLoading(true);
    setError(null);
    setPersonaErrors(undefined);
    const r = await reservarTurnoVacunacionAction({
      turnoId: elegido.id,
      vacunaId: vacuna.id,
      dosisPrevistaOrden: dosisOrden ? Number(dosisOrden) : null,
      titularId: titular?.id,
      paraOtraPersona: persona
        ? persona.tipo === "existente"
          ? { personaId: persona.id }
          : { nueva: persona.datos }
        : undefined,
    });
    setLoading(false);
    if (r.success) {
      setPaso("ok");
      router.refresh();
      return;
    }
    if (r.code === "NO_DISPONIBLE") {
      setPaso("no-disponible");
      setError(r.message);
      router.refresh();
      return;
    }
    if (r.personaErrors) {
      setPersonaErrors(r.personaErrors);
      setPaso("persona");
    }
    setError(r.message);
  };

  const volverALista = () => {
    setPaso("lista");
    setElegido(null);
    setPersona(null);
    setError(null);
  };

  const nombreTitular = esMostrador ? titular?.nombre : "vos";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {esMostrador ? "Mostrador — Nuevo turno de vacunación" : "Turnos de vacunación"}
      </h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Turno de la agenda del vacunatorio, con vacuna, filtro por rango de fechas y reserva a nombre de otra persona.
      </p>

      {paso === "ok" && elegido && (
        <section role="status" className="mt-6 rounded-xl border-2 border-success/50 bg-success/5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">Turno confirmado</h2>
          <p className="mt-2 text-sm text-ink">
            Turno de {vacuna?.nombre} el {formatearFechaAr(elegido.date)} a las {elegido.startTime}
            {persona ? ` a nombre de ${nombreDePersona(persona)}` : esMostrador ? ` a nombre de ${titular?.nombre}` : ""}.
            Se envió la confirmación por email. El turno queda reservado y solo puede cancelarse desde «Mis turnos».
          </p>
          <button type="button" className={`${BTN_SECONDARY} mt-4`} onClick={volverALista}>
            Sacar otro turno
          </button>
        </section>
      )}

      {paso === "no-disponible" && (
        <section role="alert" className="mt-6 rounded-xl border-2 border-error/50 bg-error/5 p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">El turno ya no está disponible</h2>
          <p className="mt-2 text-sm text-ink">{error}</p>
          <button type="button" className={`${BTN_SECONDARY} mt-4`} onClick={volverALista}>
            Volver a los resultados
          </button>
        </section>
      )}

      {esMostrador && paso !== "ok" && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">1 · Persona</h2>
          {titular ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-background p-3 text-sm">
              <span>
                <strong>{titular.nombre}</strong> — {titular.documento ?? "sin documento"} · {titular.cobertura}
              </span>
              <button type="button" className={BTN_SECONDARY} onClick={limpiarTitular}>
                Cambiar persona
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={buscarPersona} className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1">
                  <label htmlFor="buscar-persona" className="mb-1 block text-sm font-medium text-ink">
                    Documento, apellido o email
                  </label>
                  <input
                    id="buscar-persona"
                    className={INPUT_CLASS}
                    value={consulta}
                    onChange={(e) => setConsulta(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={buscando} className={BTN_PRIMARY}>
                  {buscando ? "Buscando…" : "Buscar"}
                </button>
              </form>
              {errorBusqueda && <p className="mt-2 text-sm text-error">{errorBusqueda}</p>}
              {resultados && resultados.length > 0 && (
                <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-background">
                  {resultados.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                      <span>
                        <strong>{t.nombre}</strong> — {t.documento ?? "sin documento"} · {t.cobertura}
                        <span className="block text-xs text-ink-secondary">{t.email}</span>
                      </span>
                      <button type="button" className={BTN_SECONDARY} onClick={() => elegirTitular(t)}>
                        Seleccionar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {paso === "persona" && (
        <div className="mt-6">
          <PersonaAtendidaSelector
            personas={personasDisponibles}
            serverErrors={personaErrors}
            onElegir={(p) => {
              setPersona(p);
              setPersonaErrors(undefined);
              setPaso("confirmar");
            }}
            onVolver={volverALista}
          />
        </div>
      )}

      {paso === "confirmar" && elegido && vacuna && (
        <section className="mt-6 rounded-xl border-2 border-primary bg-surface p-4 sm:p-6" aria-live="polite">
          <h2 className="text-lg font-bold text-ink">3 · Confirmar el turno</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Dato label="Vacuna" value={vacuna.nombre} />
            <Dato
              label="Dosis"
              value={vacuna.dosis.find((d) => String(d.orden) === dosisOrden)?.etiqueta ?? "A definir al aplicarla"}
            />
            <Dato label="Fecha" value={formatearDiaLargo(elegido.date)} />
            <Dato label="Horario" value={`${elegido.startTime} a ${elegido.endTime}`} />
            <Dato
              label="A nombre de"
              value={persona ? nombreDePersona(persona) : esMostrador ? (titular?.nombre ?? "") : "Vos"}
            />
          </dl>
          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={confirmar} disabled={loading} className={BTN_PRIMARY}>
              {loading ? "Reservando…" : "Confirmar turno"}
            </button>
            <button type="button" onClick={volverALista} disabled={loading} className={BTN_SECONDARY}>
              Cancelar
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-secondary">
            Se envía la confirmación por email a {nombreTitular === "vos" ? "tu cuenta" : titular?.nombre}. El turno queda reservado y
            solo puede cancelarse. La vacunación puede superponerse con un turno médico de la misma persona.
          </p>
        </section>
      )}

      {paso !== "ok" && paso !== "persona" && paso !== "confirmar" && (
        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">{esMostrador ? "2 · Vacuna y horario" : "Vacuna y horario"}</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vacuna" className="mb-1 block text-sm font-medium text-ink">
                Vacuna
              </label>
              <select
                id="vacuna"
                className={INPUT_CLASS}
                value={vacunaId}
                onChange={(e) => {
                  setVacunaId(e.target.value);
                  setDosisOrden("");
                }}
              >
                <option value="">Elegí una vacuna</option>
                {vacunas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dosis" className="mb-1 block text-sm font-medium text-ink">
                Dosis (opcional)
              </label>
              <select
                id="dosis"
                className={INPUT_CLASS}
                value={dosisOrden}
                disabled={!vacuna}
                onChange={(e) => setDosisOrden(e.target.value)}
              >
                <option value="">A definir al aplicarla</option>
                {vacuna?.dosis.map((d) => (
                  <option key={d.orden} value={d.orden}>
                    {d.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <form onSubmit={aplicarFiltros} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="desde" className="mb-1 block text-sm font-medium text-ink">
                Rango de fechas — desde
              </label>
              <input id="desde" type="date" className={INPUT_CLASS} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <label htmlFor="hasta" className="mb-1 block text-sm font-medium text-ink">
                hasta
              </label>
              <input id="hasta" type="date" className={INPUT_CLASS} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <button type="submit" className={BTN_PRIMARY}>
              Buscar
            </button>
            <button type="button" onClick={limpiarFiltros} className={BTN_SECONDARY}>
              Limpiar filtros
            </button>
          </form>
          <p className="mt-2 text-xs text-ink-secondary">
            {filtros.esRangoPorDefecto
              ? "Se muestran los próximos 30 días; podés acotar por rango de fechas."
              : `Mostrando del ${formatearFechaAr(filtros.desde)} al ${formatearFechaAr(filtros.hasta)}.`}
          </p>

          {!puedeReservar && (
            <p className="mt-3 text-sm text-ink-secondary">
              {esMostrador && !titular ? "Elegí primero a la persona (paso 1) y la vacuna." : "Elegí la vacuna para poder reservar."}
            </p>
          )}

          {mensajeVacio ? (
            <p className="mt-4 rounded-lg border border-line bg-background px-4 py-3 text-sm text-ink">{mensajeVacio}</p>
          ) : (
            <div className="mt-4 space-y-5">
              {gruposPorDia.map((g) => (
                <div key={g.date}>
                  <h3 className="text-sm font-semibold text-ink">{g.etiquetaLarga}</h3>
                  <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-background">
                    {g.turnos.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                        <span>
                          <strong>{t.startTime}</strong> <span className="text-ink-secondary">({t.fechaFormateada})</span>
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <button type="button" disabled={!puedeReservar} className={BTN_PRIMARY} onClick={() => reservar(t, false)}>
                            Reservar
                          </button>
                          <button type="button" disabled={!puedeReservar} className={BTN_SECONDARY} onClick={() => reservar(t, true)}>
                            Para otra persona
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-ink-secondary">
            Turnos generados por la agenda del vacunatorio. No se verifica stock de vacunas.
          </p>
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
