import { DashboardShell } from "@/components/dashboard-shell";
import { HistorialEntradaCard } from "@/components/historial-entrada-card";
import { Bloque, Callout, Hint } from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { consultarHistorialPaciente } from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const metadata = {
  title: "Mi historial clínico | AuraHealth",
  description: "Diagnósticos y tratamientos de todas tus fichas, en modo de solo lectura.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ paciente?: string }>;
};

/**
 * US-41 (wf_historial_paciente.html): el paciente consulta su historial completo
 * en modo de solo lectura y puede descargarlo en PDF. Solo accede a su propia
 * información; un intento sobre otro paciente se rechaza y queda auditado.
 */
export default async function MiHistorialPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["USUARIO"]);
  const { paciente } = await searchParams;

  const actor = {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role,
  };
  const nombrePropio = `${profile.firstName} ${profile.lastName}`.trim();

  const intentoAjeno = Boolean(
    paciente && paciente !== profile.id && paciente !== `USER:${profile.id}`
  );
  if (intentoAjeno) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: paciente ?? null,
      pacienteNombre: "Paciente ajeno",
      tipo: "HISTORIAL_PACIENTE",
      resultado: "RECHAZADO",
      detalle: `Intento de acceder al historial de otro paciente (${paciente})`,
    });
  }

  const entradas = intentoAjeno ? [] : await consultarHistorialPaciente(profile.id);

  if (!intentoAjeno) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: `USER:${profile.id}`,
      pacienteNombre: nombrePropio,
      tipo: "HISTORIAL_PACIENTE",
      resultado: "EXITOSO",
      detalle: "Consulta del historial propio",
    });
  }

  return (
    <DashboardShell
      userName={nombrePropio}
      role={role}
      activeNav="mi-historial"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Mi historial clínico
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Diagnósticos y tratamientos de todas tus fichas, en modo de solo lectura.
        </p>

        {intentoAjeno ? (
          <div className="mt-6">
            <Callout tipo="error">
              No podés acceder al historial de otro paciente. El intento quedó registrado en la
              auditoría.
            </Callout>
          </div>
        ) : (
          <>
            <Bloque num="1 · Mi historial" titulo="Vista de solo lectura">
              <Callout>
                Podés consultar tu historial completo, pero no editar ni corregir ninguna entrada.
              </Callout>
              <Hint>
                Se muestran las entradas de todas tus fichas —las de todos los médicos que te
                atendieron—, sin notas internas.
              </Hint>
            </Bloque>

            <Bloque num="2 · Entradas" titulo="Entradas clínicas">
              {entradas.length === 0 ? (
                <Callout>
                  Todavía no hay entradas clínicas cargadas. El profesional las registra sobre un
                  turno cumplido.
                </Callout>
              ) : (
                <div className="space-y-3">
                  {entradas.map((entrada) => (
                    <HistorialEntradaCard key={entrada.id} entrada={entrada} mostrarMedico />
                  ))}
                </div>
              )}
            </Bloque>

            <Bloque num="3 · Descargar" titulo="Descarga del historial">
              <a
                href="/api/historial/pdf"
                className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
              >
                Descargar PDF
              </a>
              <Hint>
                Solo accedés a tu propia información. La descarga también queda registrada en la
                auditoría.
              </Hint>
            </Bloque>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
