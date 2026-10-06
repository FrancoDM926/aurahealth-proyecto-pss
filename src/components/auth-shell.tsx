import Image from "next/image";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/logo";
import { serviceIcons, type ServiceIcon } from "@/components/icons";

const services: {
  icon: ServiceIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: "calendar",
    title: "Turnos online",
    description: "Reservá tu turno en pocos pasos",
  },
  {
    icon: "clipboard",
    title: "Historial clínico",
    description: "Tu información médica siempre disponible",
  },
  {
    icon: "syringe",
    title: "Vacunas",
    description: "Gestionamos el stock y te avisamos",
  },
  {
    icon: "wallet",
    title: "Pagos y coberturas",
    description: "Comprobantes y facturas al instante",
  },
];

export function AuthShell({
  intro,
  auth,
  footer,
  children,
}: {
  intro: { eyebrow: string; heading: string; description: string };
  auth: { badge: string; heading: string; description: string };
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="@container flex flex-col justify-center gap-[clamp(0.75rem,2.5vh,2.5rem)] bg-surface px-6 py-[clamp(1.25rem,4vh,3rem)] sm:px-10 lg:px-12 xl:px-16">
        <BrandLogo />

        <div>
          <p className="text-[clamp(0.625rem,1.4vh,0.75rem)] font-bold tracking-[0.2em] text-secondary uppercase">
            {intro.eyebrow}
          </p>
          <h1 className="mt-[clamp(0.5rem,1.5vh,1.25rem)] text-[clamp(1.75rem,4.6vh,3.25rem)] leading-[1.08] font-bold tracking-tight text-balance text-primary-dark">
            {intro.heading}
          </h1>
          <p className="mt-[clamp(0.5rem,1.6vh,1.25rem)] text-[clamp(0.875rem,1.8vh,1.125rem)] leading-relaxed text-pretty text-ink-secondary">
            {intro.description}
          </p>

          <ul className="mt-[clamp(1rem,3.5vh,2.5rem)] grid gap-x-5 gap-y-[clamp(0.625rem,2vh,1.25rem)] @min-[26rem]:grid-cols-2">
            {services.map((service) => {
              const Icon = serviceIcons[service.icon];

              return (
                <li key={service.title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary @min-[26rem]:size-10">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {service.title}
                    </span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-snug text-pretty text-ink-secondary @min-[26rem]:text-sm">
                      {service.description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="flex items-center gap-2.5 border-t border-line pt-[clamp(0.625rem,2vh,1.5rem)] text-[clamp(0.8125rem,1.7vh,0.9375rem)] font-medium text-ink-secondary">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden
            >
              <path d="M12 20.5S3.8 15.4 3.8 9.3A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.2 2.7c0 6.1-8.2 11.2-8.2 11.2Z" />
            </svg>
          </span>
          Cuidamos lo más importante
        </p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-[clamp(1rem,3vh,2.5rem)] sm:px-8 lg:px-12">
        <Image
          src="/images/aurahealth_fondo.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="absolute inset-0 object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-primary-dark/30" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary-dark/55 via-primary-dark/10 to-primary-dark/60"
        />

        <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
          <span className="text-[clamp(0.625rem,1.4vh,0.75rem)] font-bold tracking-[0.2em] text-surface/90 uppercase [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            {auth.badge}
          </span>
          <h2 className="mt-[clamp(0.375rem,1.2vh,0.875rem)] text-[clamp(1.25rem,3.4vh,1.75rem)] leading-tight font-bold tracking-tight text-balance text-surface [text-shadow:0_2px_14px_rgba(0,0,0,0.55)]">
            {auth.heading}
          </h2>
          <p className="mt-1.5 max-w-xs text-[clamp(0.8125rem,1.7vh,0.9375rem)] leading-snug text-pretty text-surface/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]">
            {auth.description}
          </p>

          <div className="mt-[clamp(0.75rem,2.5vh,1.5rem)] w-full">{children}</div>

          <div className="mt-[clamp(0.75rem,2.5vh,1.5rem)] w-full">{footer}</div>
        </div>
      </section>
    </main>
  );
}
