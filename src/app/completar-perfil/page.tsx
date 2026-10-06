import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUserProfile } from "@/actions/user";
import { CompleteProfileForm } from "@/components/complete-profile-form";
import { BrandLogo } from "@/components/logo";

export const metadata = {
  title: "Completar perfil | AuraHealth",
  description: "Completá tus datos de contacto y obra social para operar en la plataforma.",
};

export default async function CompleteProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const existingProfile = await getCurrentUserProfile();

  // Si ya completó su perfil, va al dashboard
  if (existingProfile) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex flex-col items-center text-center">
          <BrandLogo />
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Completá tu cuenta
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Ingresá tus datos personales e información de cobertura médica para finalizar tu registro.
          </p>
        </header>

        <CompleteProfileForm />
      </div>
    </main>
  );
}
