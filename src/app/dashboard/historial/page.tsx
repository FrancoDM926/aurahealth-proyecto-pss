import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { HistorialEntradaCard } from "@/components/historial-entrada-card";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Bloque,
  Callout,
  Hint,
  INPUT_CLASS,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { normalizarFiltrosHistorial } from "@/lib/historial";
import {
  consultarFichasConsolidadas,
  opcionesFiltrosHistorial,
} from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const metadata = {
  title: "Historial — Fichas del paciente | AuraHealth",
  description: "Fichas de todos los médicos de la sala, con autor, especialidad y solo lectura.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    paciente?: string;
    patientKey?: string;
    profesionalId?: string;
    especialidad?: string;
    desde?: string;
    hasta?: string;
  }>;
};

/**
 * US-40 (wf_ficha_consolidada.html): el médico consulta las fichas de todos los
 * profesionales de la sala para un paciente. La vista es siempre de solo
 * lectura; la edición vive en US-39.
 */
export default async function HistorialPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const filtros = normalizarFiltrosHistorial(await searchParams, todayInArgentina());

  const [opciones, fichas] = await Promise.all([
    opcionesFiltrosHistorial(),
    filtros.error ? Promise.resolve([]) : consultarFichasConsolidadas(filtros),
  ]);

  const totalEntradas = fichas.reduce((total, ficha) => total + ficha.entradas.length, 0);

  // RNF-04: cada acceso a una ficha queda registrado. Si la búsqueda abarcó
  // varios pacientes, se registra uno por paciente (máximo 20 por consulta).
  if (!filtros.error) {
    const pacientes = new Map(fichas.map((f) => [f.pacienteKey, f.pacienteNombre]));
    const actor = {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role,
    };
    if (pacientes.size === 0) {
      await registrarAccesoHistorial({
        actor,
        pacienteNombre: filtros.paciente || "Todos los pacientes",
        tipo: "FICHA_CONSOLIDADA",
        resultado: "EXITOSO",
        detalle: "Búsqueda sin resultados",
      });
    } else {
      await Promise.all(
        [...pacientes.entries()].slice(0, 20).map(([pacienteKey, pacienteNombre]) =>
          registrarAccesoHistorial({
            actor,
            pacienteKey,
            pacienteNombre,
            tipo: "FICHA_CONSOLIDADA",
            resultado: "EXITOSO",
            detalle: filtros.paciente ? `Búsqueda: ${filtros.paciente}` : "Consulta general",
          })
        )
      );
    }
  }

  const limpiarHref = "/dashboard/historial";

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="historial"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Historial — Fichas del paciente
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Fichas de todos los médicos, con autor y especialidad. Vista siempre de solo lectura.
        </p>

        <Bloque num="1 · Filtros" titulo="Buscar fichas de pacientes">
          <form method="get" className="space-y-4">
            {filtros.patientKey && !filtros.paciente && (
              <input type="hidden" name="patientKey" value={filtros.patientKey} />
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="paciente">
                  Paciente (documento o apellido)
                </label>
                <input
                  id="paciente"
                  name="paciente"
                  defaultValue={filtros.paciente}
                  placeholder="30.123.456 / García"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="profesionalId">
                  Profesional
                </label>
                <select
                  id="profesionalId"
                  name="profesionalId"
                  defaultValue={filtros.profesionalId}
                  className={INPUT_CLASS}
                >
                  <option value="">Todos</option>
                  {opciones.profesionales.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.nombre} — {prof.especialidadLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="especialidad">
                  Especialidad
                </label>
                <select
                  id="especialidad"
                  name="especialidad"
                  defaultValue={filtros.especialidad}
                  className={INPUT_CLASS}
                >
                  <option value="">Todas</option>
                  {opciones.especialidades.map((esp) => (
                    <option key={esp.value} value={esp.value}>
                      {esp.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="desde">
                  Desde
                </label>
                <input
                  id="desde"
                  name="desde"
                  type="date"
                  defaultValue={filtros.desde}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="hasta">
                  Hasta
                </label>
                <input
                  id="hasta"
                  name="hasta"
                  type="date"
                  defaultValue={filtros.hasta}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BTN_PRIMARY}>
                Buscar
              </button>
              <Link href={limpiarHref} className={`${BTN_SECONDARY} inline-block`}>
                Limpiar filtros
              </Link>
            </div>
          </form>
          {filtros.error && <Callout tipo="error">{filtros.error}</Callout>}
          <Hint>
            El filtro por paciente es el punto de entrada; profesional, especialidad y rango de
            fechas acotan el resultado dentro de las fichas de ese paciente.
          </Hint>
        </Bloque>

        <Bloque num="2 · Fichas del paciente" titulo="Entradas de todos los médicos">
          {filtros.error ? (
            <Callout tipo="error">Corregí los filtros para ver el historial.</Callout>
          ) : fichas.length === 0 ? (
            <Callout>
              No hay fichas cargadas para los filtros elegidos. Las entradas se cargan desde
              «Estado de turnos» sobre un turno cumplido (US-39).
            </Callout>
          ) : (
            <>
              <Hint>
                {fichas.length} ficha(s) y {totalEntradas} entrada(s), en orden cronológico
                inverso. Las entradas se muestran en modo lectura, incluida la ficha propia del
                día.
              </Hint>
              <div className="space-y-6">
                {fichas.map((ficha) => {
                  const esPropia = ficha.medicoId === profile.id;
                  return (
                    <section
                      key={ficha.fichaId}
                      className="rounded-lg border border-line bg-surface p-4"
                    >
                      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                        <div>
                          <h3 className="text-base font-bold text-ink">
                            {ficha.pacienteNombre}
                            <span className="font-normal text-ink-secondary">
                              {" "}
                              — {ficha.pacienteDocumento}
                            </span>
                          </h3>
                          <p className="text-sm text-ink-secondary">
                            {ficha.medicoNombre} · {ficha.especialidadLabel}
                          </p>
                          <Link
                            href={`/dashboard/ficha-diagnostico?fichaId=${ficha.fichaId}`}
                            className="mt-1 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            Abrir ficha
                          </Link>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            esPropia
                              ? "border-primary/40 bg-primary-light text-primary"
                              : "border-line bg-background text-ink-secondary"
                          }`}
                        >
                          {esPropia ? "Mi ficha — lectura" : "Lectura"}
                        </span>
                      </header>
                      <div className="mt-3 space-y-3">
                        {ficha.entradas.map((entrada) => (
                          <HistorialEntradaCard
                            key={entrada.id}
                            entrada={entrada}
                            mostrarMedico={false}
                            hrefEstudios={`/dashboard/historial/entradas/${entrada.id}`}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              <Hint>
                Esta vista consolidada es siempre de solo lectura: para cargar o editar una
                entrada, el médico va a «Estado de turnos» (US-39). Cada acceso queda registrado
                en la auditoría.
              </Hint>
            </>
          )}
        </Bloque>
      </div>
    </DashboardShell>
  );
}
