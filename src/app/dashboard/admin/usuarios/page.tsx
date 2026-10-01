import { DashboardShell } from "@/components/dashboard-shell";
import { InternalUsersPanel } from "@/components/internal-users-panel";
import { listInternalUsers } from "@/actions/internal-users";
import { requireRoles } from "@/lib/auth-session";

export const metadata = {
  title: "Administración — Usuarios internos",
  description: "Alta, baja y consulta de usuarios internos (US-03).",
};

export default async function InternalUsersPage() {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const users = await listInternalUsers();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="usuarios"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          US-03 · Alta y baja de usuarios internos
        </span>
        <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
          Administración — Usuarios internos
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Solo visible para el rol autorizado. Rol y especialidad (médico) en el alta.
        </p>

        <div className="mt-8">
          <InternalUsersPanel users={users} />
        </div>
      </div>
    </DashboardShell>
  );
}
