import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export const metadata = {
  title: "Crear cuenta",
  description:
    "Creá tu cuenta de AuraHealth para reservar turnos y consultar tu historial clínico.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      intro={{
        eyebrow: "Sala médica privada",
        heading: "Tu salud, nuestra prioridad",
        description:
          "Gestioná tus turnos, consultá tu historial médico y accedé a todos nuestros servicios de forma fácil y segura.",
      }}
      auth={{
        badge: "Nueva cuenta",
        heading: "Creá tu cuenta",
        description:
          "Registrate una vez y después gestioná tus turnos, tu historial clínico y tus pagos.",
      }}
      footer={
        <p className="text-[clamp(0.8125rem,1.7vh,0.9375rem)] text-surface/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
          ¿Ya tenés una cuenta?{" "}
          <Link
            href="/sign-in"
            className="rounded-sm font-semibold text-primary-light underline decoration-primary-light/60 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-surface"
          >
            Iniciá sesión
          </Link>
        </p>
      }
    >
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/completar-perfil" />
    </AuthShell>
  );
}
