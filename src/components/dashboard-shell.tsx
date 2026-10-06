import Link from "next/link";
import Image from "next/image";
import { UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/logo";
import type { Role } from "@/generated/prisma/client";

type NavKey =
  | "inicio"
  | "mis-datos"
  | "usuarios"
  | "configuracion"
  | "agenda"
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
  const roleBackground: Record<Role, string> = {
    USUARIO: "/images/aurahealth_interfaz_medico.png",
    MEDICO: "/images/aurahealth_interfaz_medico.png",
    ENFERMERA: "/images/aurahealth_interfaz_enfermera.png",
    ADMINISTRATIVO: "/images/aurahealth_interfaz_medico.png",
    ADMINISTRADOR: "/images/aurahealth_interfaz_administrador.png",
  };

  const links: { key: NavKey; href: string; label: string; roles: Role[] }[] = [
    { key: "inicio", href: "/dashboard", label: "Inicio", roles: ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRATIVO", "ADMINISTRADOR"] },
    { key: "agenda", href: "/dashboard/agenda", label: "Mi agenda", roles: ["MEDICO"] },
    { key: "disponibilidad", href: "/dashboard/disponibilidad", label: "Disponibilidad", roles: ["MEDICO"] },
    { key: "agenda-generada", href: "/dashboard/agenda-generada", label: "Generación de turnos", roles: ["MEDICO"] },
    { key: "usuarios", href: "/dashboard/admin/usuarios", label: "Usuarios", roles: ["ADMINISTRADOR"] },
    { key: "configuracion", href: "/dashboard/admin/configuracion", label: "Configuración", roles: ["ADMINISTRADOR"] },
    { key: "mis-datos", href: "/dashboard/mis-datos", label: "Mi cuenta", roles: ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRATIVO", "ADMINISTRADOR"] },
  ];

  const visible = links.filter((l) => l.roles.includes(role));

  const linkClass = (key: NavKey) =>
    activeNav === key
      ? "border-b-2 border-primary pb-1 text-sm font-bold text-primary"
      : "text-sm font-medium text-ink-secondary transition hover:text-ink";

  return (
    <main className="relative flex min-h-dvh flex-col">
      <Image
        src={roleBackground[role]}
        alt=""
        priority
        width={1815}
        height={866}
        sizes="100vw"
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
      />
      <header className="relative z-10 flex items-center justify-between border-b border-line bg-surface px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <BrandLogo />
          <nav className="hidden items-center gap-4 lg:flex">
            {visible.map((link) => (
              <Link key={link.key} href={link.href} className={linkClass(link.key)}>
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
      {/* Celular y tablet (RNF-08): el menú pasa a una fila propia debajo del encabezado. */}
      <nav
        aria-label="Menú"
        className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-6 py-3 lg:hidden"
      >
        {visible.map((link) => (
          <Link key={link.key} href={link.href} className={linkClass(link.key)}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="relative z-10 flex-1">{children}</div>
    </main>
  );
}
