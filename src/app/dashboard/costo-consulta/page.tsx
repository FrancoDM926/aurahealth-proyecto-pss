import { obtenerPrecioConsulta } from "@/actions/precio-consulta";
import { CostoConsultaView } from "@/components/costo-consulta-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";

export const metadata = {
  title: "Costo de consulta | AuraHealth",
  description: "Precio de la consulta sin cobertura y su historial de vigencias.",
};

export const dynamic = "force-dynamic";

/** US-33: cada médico define el precio de su propia consulta (RNF-03: solo el rol MEDICO). */
export default async function CostoConsultaPage() {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const datos = await obtenerPrecioConsulta();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="costo-consulta"
    >
      <CostoConsultaView datos={datos} />
    </DashboardShell>
  );
}
