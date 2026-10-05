import { getAgendaGeneradaPreview } from "@/actions/turnos";
import { AgendaGeneradaView } from "@/components/agenda-generada-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export const metadata = {
  title: "US-08 — Agenda generada | AuraHealth",
  description:
    "Vista previa y generación automática de turnos de 30 minutos a partir de la disponibilidad confirmada.",
};

export const dynamic = "force-dynamic";

export default async function AgendaGeneradaPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO", "ADMINISTRADOR"]);
  const params = await searchParams;

  const year = params.year ? Number(params.year) : 2026;
  const month = params.month ? Number(params.month) : 9;

  const initialData = await getAgendaGeneradaPreview({
    doctorId: profile.id,
    year,
    month,
  });

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda-generada"
    >
      <AgendaGeneradaView initialData={initialData} />
    </DashboardShell>
  );
}
