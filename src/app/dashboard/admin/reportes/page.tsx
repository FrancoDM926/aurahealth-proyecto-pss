import { obtenerReporteTurnosPorEspecialidad } from "@/actions/reportes";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReporteTurnosView } from "@/components/reporte-turnos-view";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    especialidad?: string;
  }>;
};

export const metadata = {
  title: "Reportes — Turnos por especialidad | AuraHealth",
  description:
    "Totales y desglose de turnos por especialidad y profesional (US-45).",
};

export const dynamic = "force-dynamic";

export default async function ReporteTurnosPage({ searchParams }: PageProps) {
  // RNF-03: Acceso exclusivo para el rol ADMINISTRADOR.
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const params = await searchParams;

  const reporte = await obtenerReporteTurnosPorEspecialidad({
    desde: params.desde ?? null,
    hasta: params.hasta ?? null,
    especialidad: params.especialidad ?? null,
  });

  const viewKey = `${reporte.filtros.desde}-${reporte.filtros.hasta}-${reporte.filtros.especialidad}`;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="reportes"
    >
      <ReporteTurnosView key={viewKey} reporte={reporte} />
    </DashboardShell>
  );
}
