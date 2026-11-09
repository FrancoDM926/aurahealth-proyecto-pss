import { obtenerFichaDiagnostico } from "@/actions/ficha-diagnostico";
import { DashboardShell } from "@/components/dashboard-shell";
import { FichaDiagnosticoView } from "@/components/ficha-diagnostico-view";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{ turnoId?: string; fichaId?: string }>;
};

export const metadata = {
  title: "Ficha de diagnóstico | AuraHealth",
  description: "Registro de diagnóstico, tratamiento y evolución clínica.",
};

export const dynamic = "force-dynamic";

export default async function FichaDiagnosticoPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const params = await searchParams;
  const result = await obtenerFichaDiagnostico({
    turnoId: params.turnoId,
    fichaId: params.fichaId,
  });

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda"
    >
      <FichaDiagnosticoView result={result} />
    </DashboardShell>
  );
}
