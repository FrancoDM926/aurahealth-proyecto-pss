import { obtenerTurnosDelDiaParaAsistencia } from "@/actions/estado-turnos";
import { DashboardShell } from "@/components/dashboard-shell";
import { EstadoTurnosView } from "@/components/estado-turnos-view";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{
    doctorId?: string;
  }>;
};

export const metadata = {
  title: "Estado de turnos | AuraHealth",
  description: "Registro del estado de asistencia de los turnos y auditoría de cambios.",
};

export const dynamic = "force-dynamic";

export default async function EstadoTurnosPage({ searchParams }: PageProps) {
  // RNF-03: Acceso exclusivo para los roles MEDICO y ADMINISTRATIVO.
  const { role, profile } = await requireRoles(["MEDICO", "ADMINISTRATIVO"]);
  const params = await searchParams;

  const datos = await obtenerTurnosDelDiaParaAsistencia({
    doctorId: params.doctorId ?? null,
  });

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="estado-turnos"
    >
      <EstadoTurnosView datos={datos} />
    </DashboardShell>
  );
}
