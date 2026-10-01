import Link from "next/link";
import { HeartPulseIcon } from "@/components/icons";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireUserProfile } from "@/lib/auth-session";

export const metadata = {
  title: "Dashboard",
  description: "Tu espacio de salud en AuraHealth.",
};

export default async function DashboardPage() {
  const profile = await requireUserProfile();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={profile.role}
      activeNav="inicio"
    >
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:py-24">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary-light text-primary">
          <HeartPulseIcon className="size-8" />
        </span>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-primary-dark sm:text-4xl">
          ¡Hola, {profile.firstName}!
        </h1>
        <p className="mt-4 text-lg text-pretty text-ink">
          Tu cuenta con rol <span className="font-semibold text-primary">{profile.role}</span> está lista.
        </p>
        <p className="mt-4 max-w-md text-pretty text-ink-secondary">
          Podés consultar o actualizar tu información y obra social ingresando a{" "}
          <Link
            href="/dashboard/mis-datos"
            className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
          >
            Mi cuenta
          </Link>
          .
        </p>
        {profile.role === "MEDICO" && (
          <Link
            href="/dashboard/disponibilidad"
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Cargar disponibilidad mensual
          </Link>
        )}
        {profile.role === "ADMINISTRADOR" && (
          <Link
            href="/dashboard/admin/usuarios"
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Gestionar usuarios internos
          </Link>
        )}
      </section>
    </DashboardShell>
  );
}
