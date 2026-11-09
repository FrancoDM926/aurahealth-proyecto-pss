import { DashboardShell } from "@/components/dashboard-shell";
import { MostradorView } from "@/components/mostrador-view";
import { obtenerDatosInicialesMostrador } from "@/actions/mostrador";
import { requireRoles } from "@/lib/auth-session";

export const metadata = {
  title: "Mostrador — Turnos de pacientes | AuraHealth",
  description:
    "US-17: Gestión de turnos de pacientes desde mostrador (consulta médica y vacunación).",
};

type PageProps = {
  searchParams?: Promise<{
    pacienteId?: string;
  }>;
};

export default async function MostradorPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRATIVO"]);
  const resolved = searchParams ? await searchParams : undefined;
  const initialData = await obtenerDatosInicialesMostrador({
    pacienteId: resolved?.pacienteId,
  });

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="mostrador"
    >
      <MostradorView initialData={initialData} />
    </DashboardShell>
  );
}
