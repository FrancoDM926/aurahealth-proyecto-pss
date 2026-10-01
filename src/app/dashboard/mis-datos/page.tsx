import { MisDatosForm } from "@/components/mis-datos-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireUserProfile } from "@/lib/auth-session";

export const metadata = {
  title: "Mi cuenta — Datos personales y cobertura | AuraHealth",
  description: "Consultá y actualizá tus datos personales y cobertura médica.",
};

export default async function MisDatosPage() {
  const user = await requireUserProfile();

  return (
    <DashboardShell
      userName={`${user.firstName} ${user.lastName}`}
      role={user.role}
      activeNav="mis-datos"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <span className="text-xs font-semibold tracking-wider text-primary uppercase">
            Datos y Cobertura
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Mi cuenta
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Consultá y actualizá tus datos personales y de cobertura médica.
          </p>
        </div>

        <MisDatosForm user={user} />
      </div>
    </DashboardShell>
  );
}
