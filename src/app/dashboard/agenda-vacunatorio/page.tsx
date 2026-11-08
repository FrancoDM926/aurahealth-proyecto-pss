import { obtenerAgendaVacunatorio } from "@/actions/agenda-vacunatorio";
import { AgendaVacunatorioView } from "@/components/agenda-vacunatorio-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export const metadata = {
  title: "Agenda del vacunatorio",
  description: "Carga de días y franjas de atención del vacunatorio y publicación de turnos.",
};

export const dynamic = "force-dynamic";

export default async function AgendaVacunatorioPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ENFERMERA"]);
  const params = await searchParams;

  const hoy = todayInArgentina();
  const [hoyYear, hoyMonth] = hoy.split("-").map(Number);
  const year = Number(params.year) || hoyYear;
  const month = Number(params.month) || hoyMonth;
  const validos = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
  const [y, m] = validos ? [year, month] : [hoyYear, hoyMonth];

  const franjas = (await obtenerAgendaVacunatorio(y, m)) ?? [];

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda-vacunatorio"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Vacunatorio — Agenda mensual</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          La enfermera carga días y franjas; el sistema genera los turnos y los publica para reserva.
        </p>
        <div className="mt-8">
          <AgendaVacunatorioView key={`${y}-${m}`} year={y} month={m} inicial={franjas} today={hoy} />
        </div>
      </div>
    </DashboardShell>
  );
}
