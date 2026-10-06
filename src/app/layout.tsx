import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AuraHealth | Turnos, vacunas e historial clínico online",
    template: "%s | AuraHealth",
  },
  description:
    "Gestión integral de una sala médica privada: reserva de turnos por especialidad, control de disponibilidad de profesionales, stock de vacunas con alertas, pagos, coberturas e historial clínico.",
  keywords: [
    "turnos médicos",
    "sala médica",
    "agenda médica",
    "vacunas",
    "historial clínico",
  ],
  openGraph: {
    title: "AuraHealth | Turnos, vacunas e historial clínico online",
    description:
      "Reservá turnos con clínica, pediatría y traumatología, y gestioná tu historial clínico desde un solo lugar.",
    locale: "es_AR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#155E75",
          colorPrimaryForeground: "#FFFFFF",
          colorSuccess: "#16A34A",
          colorWarning: "#D97706",
          colorDanger: "#DC2626",
          colorForeground: "#0F172A",
          colorMutedForeground: "#64748B",
          colorBackground: "#FFFFFF",
          colorInput: "#FFFFFF",
          colorBorder: "#E2E8F0",
          borderRadius: "0.625rem",
        },
        elements: {
          rootBox: "mx-auto w-full",
          card: "rounded-xl border border-line bg-surface shadow-[0_18px_50px_-12px_rgba(12,74,90,0.55)]",
          cardBox: "rounded-xl border-0 bg-transparent px-5 py-5 shadow-none",
          header:
            "pointer-events-none absolute m-0 h-0 w-0 overflow-hidden p-0 opacity-0",
          socialButtonsRootBox: "mb-4",
          formButtonPrimary:
            "bg-primary text-surface hover:bg-primary-dark shadow-none",
          footerAction:
            "pointer-events-none absolute m-0 h-0 w-0 overflow-hidden opacity-0",
        },
      }}
    >
      {/* suppressHydrationWarning: extensiones del navegador (ad-blockers,
          gestores de contraseñas, etc.) inyectan clases en <html>/<body> antes
          del hydration. Solo silencia atributos de ESTOS elementos; el resto de
          la app mantiene el chequeo de hydration normal. */}
      <html lang="es" suppressHydrationWarning>
        <body
          className="min-h-dvh bg-background text-ink"
          suppressHydrationWarning
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
