import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUserProfile } from "@/actions/user";
import { MisDatosForm } from "@/components/mis-datos-form";
import { BrandLogo } from "@/components/logo";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export const metadata = {
  title: "Mi cuenta — Datos personales y cobertura | AuraHealth",
  description: "Consultá y actualizá tus datos personales y cobertura médica.",
};

export default async function MisDatosPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await getCurrentUserProfile();

  if (!user) {
    redirect("/completar-perfil");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {/* Topbar del sistema médico según wireframe */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <BrandLogo />
          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-ink-secondary hover:text-ink transition"
            >
              Inicio
            </Link>
            <Link
              href="/dashboard/mis-datos"
              className="border-b-2 border-primary pb-1 text-sm font-bold text-primary"
            >
              Mi cuenta
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-ink sm:inline">
            {user.firstName} {user.lastName}
          </span>
          <UserButton />
        </div>
      </header>

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
    </main>
  );
}
