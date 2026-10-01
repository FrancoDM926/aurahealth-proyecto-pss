import Link from "next/link";
import { BrandLogo } from "@/components/logo";

export const metadata = {
  title: "Acceso denegado",
  description: "No tenés permisos para acceder a este recurso.",
};

export default function AccesoDenegadoPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <BrandLogo />
      <h1 className="mt-8 text-2xl font-bold text-ink">Acceso denegado</h1>
      <p className="mt-2 max-w-md text-center text-sm text-ink-secondary">
        Tu rol no tiene permisos para ver esta sección, o tu cuenta fue dada de baja.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
