import { DashboardShell } from "@/components/dashboard-shell";
import { MonthlyAvailabilityForm } from "@/components/monthly-availability-form";
import { getMonthlyAvailability } from "@/actions/availability";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

function formatUtcDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const metadata = {
  title: "Agenda médica — Disponibilidad mensual",
  description: "Carga de disponibilidad y validación de jornadas (US-06).",
};

export default async function DisponibilidadPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const params = await searchParams;

  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) : now.getMonth() + 1;

  const availability = await getMonthlyAvailability(year, month);
  const initialJornadas =
    availability?.jornadas.map((j) => ({
      date: formatUtcDateOnly(j.date),
      startTime: j.startTime,
      endTime: j.endTime,
    })) ?? [];

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="disponibilidad"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          US-06 · Carga de disponibilidad y validación de jornadas
        </span>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Agenda médica — Disponibilidad mensual
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Declaración de jornadas y franjas horarias para el mes seleccionado.
        </p>

        <div className="mt-8">
          <MonthlyAvailabilityForm
            key={`${year}-${month}`}
            initialYear={year}
            initialMonth={month}
            initialJornadas={initialJornadas}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
