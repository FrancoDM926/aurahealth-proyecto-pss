import { listarCatalogoVacunas } from "@/actions/vacunas";
import { CatalogoVacunasView } from "@/components/catalogo-vacunas-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";

export const metadata = {
  title: "Catálogo de vacunas",
  description: "Alta, modificación y desactivación de las vacunas que aplica la sala.",
};

export const dynamic = "force-dynamic";

export default async function CatalogoVacunasPage() {
  const { role, profile } = await requireRoles(["ENFERMERA"]);
  const vacunas = await listarCatalogoVacunas();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="catalogo-vacunas"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Administración — Catálogo de vacunas
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Datos normalizados de las vacunas que aplica la sala, en lugar de texto libre.
        </p>

        <div className="mt-8">
          <CatalogoVacunasView vacunas={vacunas} />
        </div>
      </div>
    </DashboardShell>
  );
}
