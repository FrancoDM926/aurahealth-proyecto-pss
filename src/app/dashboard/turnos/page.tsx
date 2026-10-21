import { buscarTurnosDisponiblesPaciente } from "@/actions/turnos";
import { BusquedaTurnosView } from "@/components/busqueda-turnos-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";

type PageProps = {
  searchParams: Promise<{
    especialidad?: string;
    specialty?: string;
    profesional?: string;
    doctorId?: string;
    desde?: string;
    hasta?: string;
  }>;
};

export const metadata = {
  title: "Turnos disponibles | AuraHealth",
  description: "Búsqueda de turnos por especialidad, profesional y rango de fechas.",
};

export const dynamic = "force-dynamic";

export default async function BusquedaTurnosPage({ searchParams }: PageProps) {
  // RNF-03: Acceso exclusivo para el rol USUARIO (paciente).
  const { role, profile } = await requireRoles(["USUARIO"]);
  const params = await searchParams;

  const resultado = await buscarTurnosDisponiblesPaciente({
    specialty: params.especialidad ?? params.specialty ?? null,
    doctorId: params.profesional ?? params.doctorId ?? null,
    desde: params.desde ?? null,
    hasta: params.hasta ?? null,
  });

  const viewKey = `${resultado.filtros.specialty}-${resultado.filtros.doctorId}-${resultado.filtros.desde}-${resultado.filtros.hasta}`;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="turnos"
    >
      <BusquedaTurnosView
        key={viewKey}
        filtros={resultado.filtros}
        rangoDefecto={resultado.rangoDefecto}
        profesionales={resultado.profesionales}
        turnos={resultado.turnos}
        gruposPorDia={resultado.gruposPorDia}
        mensajeVacio={resultado.mensajeVacio}
      />
    </DashboardShell>
  );
}
