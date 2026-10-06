import { DashboardShell } from "@/components/dashboard-shell";
import { LimitesJornadasForm } from "@/components/limites-jornadas-form";
import { requireRoles } from "@/lib/auth-session";
import { getLimitesJornadas } from "@/lib/configuracion";

export const metadata = {
  title: "Administración — Configuración",
  description: "Parámetros del sistema que ajusta el administrador.",
};

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const limites = await getLimitesJornadas();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="configuracion"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Administración — Configuración
        </h1>

        <div className="mt-8">
          <LimitesJornadasForm initial={limites} />
        </div>
      </div>
    </DashboardShell>
  );
}
