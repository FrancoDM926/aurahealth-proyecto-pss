import { listarAplicacionesAction } from "@/actions/aplicaciones-dosis";
import { DashboardShell } from "@/components/dashboard-shell";
import { DosisAplicadasView } from "@/components/dosis-aplicadas-view";
import { requireRoles } from "@/lib/auth-session";

export const metadata = {
  title: "Dosis aplicadas | AuraHealth",
  description: "Registro de la dosis aplicada, con la enfermera responsable, y anulación con motivo.",
};

export const dynamic = "force-dynamic";

/** US-29: solo enfermería registra y anula dosis aplicadas. */
export default async function DosisAplicadasPage() {
  const { role, profile } = await requireRoles(["ENFERMERA"]);
  const recientes = await listarAplicacionesAction();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="dosis-aplicadas"
    >
      <DosisAplicadasView enfermeraNombre={`${profile.firstName} ${profile.lastName}`} recientes={recientes} />
    </DashboardShell>
  );
}
