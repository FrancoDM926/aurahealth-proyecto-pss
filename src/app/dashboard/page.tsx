import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { BrandLogo } from "@/components/logo";
import { HeartPulseIcon } from "@/components/icons";
import { getCurrentUserProfile } from "@/actions/user";
import Link from "next/link";

export const metadata = {
  title: "Dashboard",
  description: "Tu espacio de salud en AuraHealth.",
};

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect("/completar-perfil");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <BrandLogo />
          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/dashboard"
              className="border-b-2 border-primary pb-1 text-sm font-bold text-primary"
            >
              Inicio
            </Link>
            <Link
              href="/dashboard/mis-datos"
              className="text-sm font-medium text-ink-secondary hover:text-ink transition"
            >
              Mi cuenta
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-ink sm:inline">
            {profile.firstName} {profile.lastName}
          </span>
          <UserButton />
        </div>
      </header>

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
      </section>
    </main>
  );
}
