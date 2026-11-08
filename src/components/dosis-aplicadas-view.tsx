"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarPacientesAction } from "@/actions/pacientes";
import {
  anularAplicacionAction,
  obtenerContextoPacienteAction,
  registrarDosisAction,
  type AplicacionListada,
  type ContextoPaciente,
} from "@/actions/aplicaciones-dosis";
import { evaluarAplicacion, fechaArgentina, horaArgentina, MAX_MOTIVO_ANULACION } from "@/lib/dosis";
import { formatearFechaAr } from "@/lib/busqueda-turnos";
import type { PacienteResultado } from "@/lib/pacientes";

/**
 * US-29 — Registro de dosis aplicada (wf_dosis_aplicada).
 * 1 · Datos de la aplicación · 2 · Turno asociado · 3 · Anulación.
 */

type Props = {
  enfermeraNombre: string;
  recientes: AplicacionListada[];
};

const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const BTN_PRIMARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-surface disabled:opacity-50";

export function DosisAplicadasView({ enfermeraNombre, recientes }: Props) {
  const router = useRouter();
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<PacienteResultado[] | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  const [paciente, setPaciente] = useState<PacienteResultado | null>(null);
  const [contexto, setContexto] = useState<ContextoPaciente | null>(null);
  const [vacunaId, setVacunaId] = useState("");
  const [dosisOrden, setDosisOrden] = useState("");
  const [turnoId, setTurnoId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string; advertencias?: string[] } | null>(null);

  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  const vacuna = contexto?.vacunas.find((v) => v.id === vacunaId) ?? null;
  const turnosDeLaVacuna = contexto?.turnos.filter((t) => !vacunaId || !t.vacunaId || t.vacunaId === vacunaId) ?? [];

  const evaluacion = useMemo(() => {
    if (!vacuna || !dosisOrden || !contexto) return null;
    return evaluarAplicacion({
      esquema: vacuna.dosis,
      dosisOrden: Number(dosisOrden),
      aplicacionesActivas: contexto.aplicaciones
        .filter((a) => a.vacunaId === vacuna.id)
        .map((a) => ({ dosisOrden: a.dosisOrden, aplicadaAt: new Date(a.aplicadaAt) })),
      ahora: new Date(),
    });
  }, [vacuna, dosisOrden, contexto]);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    setErrorBusqueda(null);
    const r = await buscarPacientesAction(consulta);
    setBuscando(false);
    if (!r.ok) {
      setResultados(null);
      return setErrorBusqueda(r.message);
    }
    setResultados(r.pacientes);
    if (r.pacientes.length === 0) {
      setErrorBusqueda("No se encontró a la persona. Si no está registrada, hay que darla de alta primero.");
    }
  };

  const elegirPaciente = async (p: PacienteResultado) => {
    setPaciente(p);
    setResultados(null);
    setMensaje(null);
    setVacunaId("");
    setDosisOrden("");
    setTurnoId("");
    setContexto(await obtenerContextoPacienteAction(p.ref));
  };

  const elegirTurno = (id: string) => {
    setTurnoId(id);
    const turno = contexto?.turnos.find((t) => t.id === id);
    if (turno?.vacunaId) {
      setVacunaId(turno.vacunaId);
      setDosisOrden(turno.dosisPrevistaOrden ? String(turno.dosisPrevistaOrden) : "");
    }
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paciente || !vacuna || !dosisOrden) return;
    setGuardando(true);
    setMensaje(null);
    const r = await registrarDosisAction({
      paciente: paciente.ref,
      vacunaId: vacuna.id,
      dosisOrden: Number(dosisOrden),
      turnoId: turnoId || null,
    });
    setGuardando(false);
    if (!r.success) return setMensaje({ tipo: "error", texto: r.message });
    setMensaje({ tipo: "ok", texto: r.message, advertencias: r.advertencias });
    setDosisOrden("");
    setTurnoId("");
    setContexto(await obtenerContextoPacienteAction(paciente.ref));
    router.refresh();
  };

  const anular = async (id: string) => {
    setErrorAnulacion(null);
    const r = await anularAplicacionAction({ id, motivo });
    if (!r.success) return setErrorAnulacion(r.message);
    setAnulando(null);
    setMotivo("");
    setMensaje({ tipo: "ok", texto: r.message });
    if (paciente) setContexto(await obtenerContextoPacienteAction(paciente.ref));
    router.refresh();
  };

  const ahora = new Date();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Vacunatorio — Aplicación de dosis</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Registro de la dosis con enfermera responsable, vinculado al turno cuando existió.
      </p>

      {mensaje && (
        <div
          role={mensaje.tipo === "error" ? "alert" : "status"}
          className={`mt-6 rounded-lg border px-4 py-3 text-sm ${
            mensaje.tipo === "error" ? "border-error/40 bg-error/5 text-error" : "border-success/50 bg-success/5 text-ink"
          }`}
        >
          {mensaje.texto}
          {mensaje.advertencias?.map((a) => (
            <p key={a} className="mt-1 text-xs text-ink-secondary">
              Aviso: {a}
            </p>
          ))}
        </div>
      )}

      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-bold text-ink">1 · Datos de la aplicación</h2>

        <h3 className="mt-4 text-sm font-semibold text-ink">Paciente</h3>
        {paciente ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-background p-3 text-sm">
            <span>
              <strong>{paciente.nombre}</strong> — {paciente.documento ?? "sin documento"}
              <span className="block text-xs text-ink-secondary">{paciente.detalle}</span>
            </span>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setPaciente(null);
                setContexto(null);
                setConsulta("");
              }}
            >
              Cambiar paciente
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={buscar} className="mt-2 flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1">
                <label htmlFor="buscar-paciente" className="mb-1 block text-sm font-medium text-ink">
                  Documento, apellido o email
                </label>
                <input id="buscar-paciente" className={INPUT_CLASS} value={consulta} onChange={(e) => setConsulta(e.target.value)} />
              </div>
              <button type="submit" disabled={buscando} className={BTN_PRIMARY}>
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </form>
            {errorBusqueda && <p className="mt-2 text-sm text-error">{errorBusqueda}</p>}
            {resultados && resultados.length > 0 && (
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-background">
                {resultados.map((p) => (
                  <li key={`${p.ref.tipo}-${p.ref.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <span>
                      <strong>{p.nombre}</strong> — {p.documento ?? "sin documento"}
                      <span className="block text-xs text-ink-secondary">{p.detalle}</span>
                    </span>
                    <button type="button" className={BTN_SECONDARY} onClick={() => elegirPaciente(p)}>
                      Seleccionar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {paciente && contexto && (
          <form onSubmit={registrar} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  {contexto.vacunas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                      {v.activa ? "" : " (desactivada)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dosis" className="mb-1 block text-sm font-medium text-ink">
                  Dosis
                </label>
                <select
                  id="dosis"
                  className={INPUT_CLASS}
                  value={dosisOrden}
                  disabled={!vacuna}
                  onChange={(e) => setDosisOrden(e.target.value)}
                >
                  <option value="">Elegí la dosis</option>
                  {vacuna?.dosis.map((d) => (
                    <option key={d.orden} value={d.orden}>
                      {d.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-ink-secondary">
              La fecha, la hora y la enfermera responsable se toman del usuario autenticado: {fechaArgentina(ahora)}{" "}
              {horaArgentina(ahora)} — {enfermeraNombre}. Sin lote ni control de stock.
            </p>

            <div>
              <h3 className="text-sm font-semibold text-ink">2 · Turno asociado</h3>
              <label htmlFor="turno" className="sr-only">
                Turno del paciente
              </label>
              <select id="turno" className={`${INPUT_CLASS} mt-2`} value={turnoId} onChange={(e) => elegirTurno(e.target.value)}>
                <option value="">Sin turno asociado (mostrador)</option>
                {turnosDeLaVacuna.map((t) => (
                  <option key={t.id} value={t.id}>
                    {formatearFechaAr(t.fecha)} {t.startTime} — {t.vacunaNombre ?? "vacuna a definir"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-secondary">
                La dosis puede registrarse sin turno previo; si existió, queda vinculada al turno de vacunación y lo marca
                como cumplido.
              </p>
            </div>

            {evaluacion?.error && <p className="text-sm text-error">{evaluacion.error}</p>}
            {evaluacion?.advertencias.map((a) => (
              <p key={a} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {a}
              </p>
            ))}

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={guardando || !vacuna || !dosisOrden || Boolean(evaluacion?.error)} className={BTN_PRIMARY}>
                {guardando ? "Registrando…" : "Registrar dosis"}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-bold text-ink">3 · Anulación — últimos registros</h2>
        <p className="mt-1 text-xs text-ink-secondary">
          Una dosis registrada no se elimina: se anula con motivo y queda registrada en el historial de la persona.
        </p>
        {recientes.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">Todavía no hay dosis registradas.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-secondary">
                  <th className="py-2 pr-3 font-semibold">Fecha y hora</th>
                  <th className="py-2 pr-3 font-semibold">Paciente</th>
                  <th className="py-2 pr-3 font-semibold">Vacuna y dosis</th>
                  <th className="py-2 pr-3 font-semibold">Enfermera</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((a) => (
                  <tr key={a.id} className="border-b border-line/80 align-top">
                    <td className="py-3 pr-3">
                      {a.fecha} {a.hora}
                    </td>
                    <td className="py-3 pr-3">
                      {a.pacienteNombre}
                      <span className="block text-xs text-ink-secondary">{a.pacienteDocumento ?? ""}</span>
                    </td>
                    <td className="py-3 pr-3">
                      {a.vacunaNombre}
                      <span className="block text-xs text-ink-secondary">
                        {a.dosisEtiqueta}
                        {a.conTurno ? " · con turno" : ""}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{a.enfermeraNombre}</td>
                    <td className="py-3">
                      {a.anulada ? (
                        <span className="text-xs text-error">
                          Anulada — {a.anuladaMotivo} ({a.anuladaPorNombre})
                        </span>
                      ) : anulando === a.id ? (
                        <div className="space-y-2">
                          <input
                            aria-label="Motivo de la anulación"
                            className={INPUT_CLASS}
                            maxLength={MAX_MOTIVO_ANULACION}
                            placeholder="Motivo de la anulación"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                          />
                          {errorAnulacion && <p className="text-xs text-error">{errorAnulacion}</p>}
                          <div className="flex gap-2">
                            <button type="button" className={BTN_PRIMARY} onClick={() => anular(a.id)}>
                              Anular registro
                            </button>
                            <button
                              type="button"
                              className={BTN_SECONDARY}
                              onClick={() => {
                                setAnulando(null);
                                setMotivo("");
                                setErrorAnulacion(null);
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded-lg border border-error/50 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/5"
                          onClick={() => {
                            setAnulando(a.id);
                            setMotivo("");
                            setErrorAnulacion(null);
                          }}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
