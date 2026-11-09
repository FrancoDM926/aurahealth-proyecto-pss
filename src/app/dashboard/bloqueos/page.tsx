import { DashboardShell } from "@/components/dashboard-shell";
import { AvisoBloqueoView } from "@/components/aviso-bloqueo-view";
import { requireRoles } from "@/lib/auth-session";
import { obtenerListadoBloqueosYAvisos } from "@/actions/bloqueos";

export const metadata = {
  title: "Bloqueos — Aviso a pacientes",
  description: "Aviso por modificación de agenda y listado de pacientes a contactar (US-22).",
};

export const dynamic = "force-dynamic";

export default async function BloqueosPage({
  searchParams,
}: {
  searchParams: Promise<{ bloqueoId?: string }>;
}) {
  const { role, profile } = await requireRoles(["MEDICO", "ADMINISTRATIVO"]);
  const params = await searchParams;
  const { bloqueos } = await obtenerListadoBloqueosYAvisos();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="bloqueos"
    >
      <AvisoBloqueoView
        actorRole={role}
        bloqueos={bloqueos}
        initialBloqueoId={params.bloqueoId}
      />
    </DashboardShell>
  );
}
