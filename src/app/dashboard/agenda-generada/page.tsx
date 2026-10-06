import { getAgendaGeneradaPreview } from "@/actions/turnos";
import { AgendaGeneradaView } from "@/components/agenda-generada-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export const metadata = {
  title: "Agenda generada | AuraHealth",
  description:
    "Vista previa y generación automática de turnos de 30 minutos a partir de la disponibilidad confirmada.",
};

export const dynamic = "force-dynamic";

export default async function AgendaGeneradaPage({ searchParams }: PageProps) {
  // US-06 / US-08: la agenda es del médico. El administrador no genera turnos.
  const { role, profile } = await requireRoles(["MEDICO"]);
  const params = await searchParams;

  // Sin parámetros, el mes en curso (antes quedaba fijo en septiembre de 2026).
  const [currentYear, currentMonth] = todayInArgentina().split("-").map(Number);
  const year = Number(params.year) || currentYear;
  const parsedMonth = Number(params.month);
  const month = parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : currentMonth;

  const initialData = await getAgendaGeneradaPreview({ year, month });

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda-generada"
    >
      <AgendaGeneradaView key={`${year}-${month}`} initialData={initialData} />
    </DashboardShell>
  );
}
