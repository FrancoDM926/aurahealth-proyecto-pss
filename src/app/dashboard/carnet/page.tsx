import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";
import { AVISO_CARNET_SALA, CARNET_SIN_APLICACIONES } from "@/lib/carnet";
import { db } from "@/lib/db";
import { obtenerDatosCarnet } from "@/services/vacunacion/carnet";

type PageProps = {
  searchParams: Promise<{ persona?: string }>;
};

export const metadata = {
  title: "Mi carnet de vacunación | AuraHealth",
  description: "Vacunas aplicadas en la sala, estado del esquema y descarga en PDF.",
};

export const dynamic = "force-dynamic";

/**
 * US-57: el paciente consulta las vacunas que le aplicaron en la sala y, además, las de
 * las personas a su cargo que cargó al reservar (US-64).
 */
export default async function CarnetPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["USUARIO"]);
  const { persona } = await searchParams;

  const [datos, personas] = await Promise.all([
    obtenerDatosCarnet(profile, persona || null),
    db.personaAtendida.findMany({
      where: { userId: profile.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  // Una persona que no es del usuario se trata como inexistente: vuelve al carnet propio.
  const actual = datos ?? (await obtenerDatosCarnet(profile, null))!;
  const personaActiva = datos && persona ? persona : "";
  const pdfHref = personaActiva ? `/api/carnet/pdf?persona=${encodeURIComponent(personaActiva)}` : "/api/carnet/pdf";
  const { carnet } = actual;

  return (
    <DashboardShell userName={`${profile.firstName} ${profile.lastName}`} role={role} activeNav="carnet">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Mi carnet de vacunación</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Aplicaciones registradas en la sala, con el estado del esquema.
        </p>

        {personas.length > 0 && (
          <nav aria-label="Carnet de" className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/dashboard/carnet"
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                !personaActiva ? "border-primary bg-primary-light text-primary" : "border-line text-ink hover:bg-surface"
              }`}
            >
              Mi carnet
            </Link>
            {personas.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/carnet?persona=${p.id}`}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  personaActiva === p.id ? "border-primary bg-primary-light text-primary" : "border-line text-ink hover:bg-surface"
                }`}
              >
                {p.firstName} {p.lastName}
              </Link>
            ))}
          </nav>
        )}

        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">1 · Vacunas aplicadas — {actual.pacienteNombre}</h2>
          {carnet.filas.length === 0 ? (
            <p className="mt-3 text-sm text-ink-secondary">{CARNET_SIN_APLICACIONES}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-secondary">
                    <th className="py-2 pr-4 font-semibold">Vacuna</th>
                    <th className="py-2 pr-4 font-semibold">Dosis</th>
                    <th className="py-2 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {carnet.filas.map((f, i) => (
                    <tr key={i} className="border-b border-line/80">
                      <td className="py-3 pr-4">{f.vacuna}</td>
                      <td className="py-3 pr-4">{f.dosis}</td>
                      <td className="py-3">{f.fecha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-secondary">{AVISO_CARNET_SALA}</p>
        </section>

        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">2 · Estado del esquema</h2>
          {carnet.esquemas.length === 0 ? (
            <p className="mt-3 text-sm text-ink-secondary">Sin vacunas para evaluar.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {carnet.esquemas.map((e) => (
                <li
                  key={e.vacunaId}
                  className={`rounded-lg border px-3 py-2 ${
                    e.completo ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  {e.completo ? `Esquema completo: ${e.vacuna}.` : e.aviso}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
          <h2 className="text-lg font-bold text-ink">3 · Descargar</h2>
          <a
            href={pdfHref}
            className="mt-3 inline-flex min-h-[38px] items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            Descargar carnet en PDF
          </a>
        </section>
      </div>
    </DashboardShell>
  );
}
