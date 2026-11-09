import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Badge,
  Bloque,
  Callout,
  Hint,
  INPUT_CLASS,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import {
  RESULTADO_ACCESO_LABELS,
  RESULTADOS_ACCESO_HISTORIAL,
  TIPO_ACCESO_HISTORIAL_LABELS,
  TIPOS_ACCESO_HISTORIAL,
  normalizarFiltrosAuditoriaHistorial,
  tonoResultadoAcceso,
} from "@/lib/auditoria-historial";
import {
  consultarAuditoriaAccesos,
  opcionesFiltrosAuditoria,
} from "@/services/historial/auditoria-consultas";

export const metadata = {
  title: "Auditoría — Accesos al historial | AuraHealth",
  description:
    "Registro de solo lectura de cada acceso al historial clínico, exitoso o rechazado.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    usuarioId?: string;
    paciente?: string;
    desde?: string;
    hasta?: string;
    tipo?: string;
    resultado?: string;
  }>;
};

/**
 * US-44 (wf_auditoria_accesos.html): el administrador investiga accesos
 * indebidos a información sensible. La vista es de solo lectura y muestra tanto
 * los accesos exitosos como los intentos rechazados por RNF-03.
 */
export default async function AuditoriaAccesosPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const filtros = normalizarFiltrosAuditoriaHistorial(await searchParams);

  const [opciones, auditoria] = await Promise.all([
    opcionesFiltrosAuditoria(),
    filtros.error ? Promise.resolve(null) : consultarAuditoriaAccesos(filtros),
  ]);

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="auditoria"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Auditoría — Accesos al historial
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Registro de solo lectura de cada acceso al historial de los pacientes.
        </p>

        <Bloque num="1 · Filtros" titulo="Buscar accesos registrados">
          <form method="get" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="usuarioId">
                  Usuario
                </label>
                <select
                  id="usuarioId"
                  name="usuarioId"
                  defaultValue={filtros.usuarioId}
                  className={INPUT_CLASS}
                >
                  <option value="">Todos los usuarios</option>
                  {opciones.usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="paciente">
                  Paciente
                </label>
                <input
                  id="paciente"
                  name="paciente"
                  defaultValue={filtros.paciente}
                  placeholder="Apellido o número de documento"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-ink">Rango de fechas</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="sr-only" htmlFor="desde">
                      Desde
                    </label>
                    <input
                      id="desde"
                      name="desde"
                      type="date"
                      defaultValue={filtros.desde}
                      className={INPUT_CLASS}
                      aria-label="Desde"
                    />
                  </div>
                  <div>
                    <label className="sr-only" htmlFor="hasta">
                      Hasta
                    </label>
                    <input
                      id="hasta"
                      name="hasta"
                      type="date"
                      defaultValue={filtros.hasta}
                      className={INPUT_CLASS}
                      aria-label="Hasta"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="tipo">
                  Tipo de acceso
                </label>
                <select id="tipo" name="tipo" defaultValue={filtros.tipo} className={INPUT_CLASS}>
                  <option value="">Todos</option>
                  {TIPOS_ACCESO_HISTORIAL.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {TIPO_ACCESO_HISTORIAL_LABELS[tipo]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="resultado">
                  Resultado
                </label>
                <select
                  id="resultado"
                  name="resultado"
                  defaultValue={filtros.resultado}
                  className={INPUT_CLASS}
                >
                  <option value="">Todos</option>
                  {RESULTADOS_ACCESO_HISTORIAL.map((resultado) => (
                    <option key={resultado} value={resultado}>
                      {resultado === "EXITOSO" ? "Exitosos" : "Rechazados"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={BTN_PRIMARY}>
                Buscar
              </button>
              <Link
                href="/dashboard/admin/auditoria"
                className={`${BTN_SECONDARY} inline-block`}
              >
                Limpiar filtros
              </Link>
            </div>
          </form>
          {filtros.error && <Callout tipo="error">{filtros.error}</Callout>}
        </Bloque>

        {auditoria && (
          <Bloque num="2 · Registro" titulo="Accesos registrados">
            {auditoria.filas.length === 0 ? (
              <Callout>No hay accesos registrados para los filtros elegidos.</Callout>
            ) : (
              <Tabla>
                <thead>
                  <tr className={THEAD_TR}>
                    <th className={TH}>Fecha y hora</th>
                    <th className={TH}>Usuario</th>
                    <th className={TH}>Paciente</th>
                    <th className={TH}>Tipo de acceso</th>
                    <th className={TH}>Resultado</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {auditoria.filas.map((fila) => (
                    <tr key={fila.id} title={fila.detalle ?? undefined}>
                      <td className={`${TD} whitespace-nowrap`}>{fila.fechaHoraTexto}</td>
                      <td className={TD}>{fila.usuarioNombre}</td>
                      <td className={TD}>{fila.pacienteNombre}</td>
                      <td className={TD}>{TIPO_ACCESO_HISTORIAL_LABELS[fila.tipo]}</td>
                      <td className={TD}>
                        <Badge tono={tonoResultadoAcceso(fila.resultado)}>
                          {RESULTADO_ACCESO_LABELS[fila.resultado]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
            {auditoria.truncado && (
              <Hint>
                Se muestran los {auditoria.filas.length} accesos más recientes de{" "}
                {auditoria.total}. Ajustá los filtros para ver otros.
              </Hint>
            )}
            <Hint>
              Se registran los accesos exitosos y también los intentos rechazados. La vista es de
              solo lectura: no permite modificar ni eliminar registros.
            </Hint>
            <Callout>
              Este registro implementa la auditoría transversal definida en RNF-04 y da
              trazabilidad a los accesos de US-40 y US-41.
            </Callout>
          </Bloque>
        )}
      </div>
    </DashboardShell>
  );
}
