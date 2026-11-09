import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";
import { db } from "@/lib/db";

type PageProps = {
  searchParams: Promise<{ patientKey?: string }>;
};

export const metadata = {
  title: "Ficha consolidada | AuraHealth",
  description: "Consulta de las fichas clínicas del paciente por profesional.",
};

export const dynamic = "force-dynamic";

export default async function FichaConsolidadaPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const { patientKey } = await searchParams;
  const key = patientKey?.trim() ?? "";
  const fichas = key
    ? await db.fichaDiagnostico.findMany({
        where: { patientKey: key },
        orderBy: { updatedAt: "desc" },
        include: {
          doctor: { select: { firstName: true, lastName: true } },
          entradas: {
            orderBy: [{ consultationDate: "desc" }, { consultationTime: "desc" }],
          },
        },
      })
    : [];
  const patientName = fichas[0]?.patientName ?? "Paciente";

  return (
    <DashboardShell userName={`${profile.firstName} ${profile.lastName}`} role={role} activeNav="agenda">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">US-40 · Vista consolidada</p>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Fichas de {patientName}</h1>
        <p className="mt-1 text-sm text-ink-secondary">Solo lectura para cualquier médico de la sala.</p>

        {fichas.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-secondary">
            No se encontraron fichas para este paciente.
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {fichas.map((ficha) => (
              <section key={ficha.id} className="rounded-xl border-2 border-line bg-surface p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-ink">Dr. {ficha.doctor.firstName} {ficha.doctor.lastName}</h2>
                  <Link href={`/dashboard/ficha-diagnostico?fichaId=${ficha.id}`} className="text-sm font-semibold text-primary">
                    Abrir ficha
                  </Link>
                </div>
                <ul className="mt-4 space-y-3">
                  {ficha.entradas.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-line bg-background p-4 text-sm text-ink">
                      <p className="font-semibold">{entry.consultationDate.toISOString().slice(0, 10)} {entry.consultationTime} · {entry.authorName}</p>
                      <p className="mt-2"><strong>Diagnóstico:</strong> {entry.diagnosis}</p>
                      <p><strong>Tratamiento:</strong> {entry.treatment}</p>
                      <p><strong>Observaciones:</strong> {entry.observations}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <Link href="/dashboard/agenda" className="mt-5 inline-block text-sm font-semibold text-primary">Volver a mi agenda</Link>
      </div>
    </DashboardShell>
  );
}
