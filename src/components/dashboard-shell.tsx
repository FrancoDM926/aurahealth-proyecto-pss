import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/logo";
import type { Role } from "@/generated/prisma/client";

type NavKey =
  | "inicio"
  | "mis-datos"
  | "usuarios"
  | "configuracion"
  | "disponibilidad"
  | "agenda-generada";

type DashboardShellProps = {
  userName: string;
  role: Role;
  activeNav: NavKey;
  children: React.ReactNode;
};

export function DashboardShell({
  userName,
  role,
  activeNav,
  children,
}: DashboardShellProps) {
  const links: { key: NavKey; href: string; label: string; roles: Role[] }[] = [
    { key: "inicio", href: "/dashboard", label: "Inicio", roles: ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRATIVO", "ADMINISTRADOR"] },
    { key: "disponibilidad", href: "/dashboard/disponibilidad", label: "Disponibilidad", roles: ["MEDICO"] },
    { key: "agenda-generada", href: "/dashboard/agenda-generada", label: "Generación de turnos", roles: ["MEDICO"] },
    { key: "usuarios", href: "/dashboard/admin/usuarios", label: "Usuarios", roles: ["ADMINISTRADOR"] },
    { key: "configuracion", href: "/dashboard/admin/configuracion", label: "Configuración", roles: ["ADMINISTRADOR"] },
    { key: "mis-datos", href: "/dashboard/mis-datos", label: "Mi cuenta", roles: ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRATIVO", "ADMINISTRADOR"] },
  ];

  const visible = links.filter((l) => l.roles.includes(role));

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <BrandLogo />
          <nav className="hidden items-center gap-4 sm:flex">
            {visible.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={
                  activeNav === link.key
                    ? "border-b-2 border-primary pb-1 text-sm font-bold text-primary"
                    : "text-sm font-medium text-ink-secondary transition hover:text-ink"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-ink sm:inline">{userName}</span>
          <UserButton />
        </div>
      </header>
      {children}
    </main>
  );
}
