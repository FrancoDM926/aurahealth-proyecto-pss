import { listarVacunasActivas } from "@/actions/vacunas";
import { buscarTurnosVacunacion } from "@/actions/turnos-vacunacion";
import { DashboardShell } from "@/components/dashboard-shell";
import { TurnosVacunacionView } from "@/components/turnos-vacunacion-view";
import { requireRoles } from "@/lib/auth-session";
import { nombreVacuna } from "@/lib/turnos-vacunacion";

type PageProps = {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
};

export const metadata = {
  title: "Mostrador — Turno de vacunación | AuraHealth",
  description: "Turno de vacunación otorgado desde el mostrador en nombre del paciente.",
};

export const dynamic = "force-dynamic";

/**
 * US-28: la enfermera y el personal administrativo otorgan el turno de vacunación
 * desde el mostrador, en nombre de un paciente registrado. Esta pantalla la enlaza
 * el mostrador general (US-17) cuando el tipo de turno es «Vacunación».
 */
export default async function MostradorVacunacionPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ENFERMERA", "ADMINISTRATIVO"]);
  const params = await searchParams;

  const [vacunas, busqueda] = await Promise.all([
    listarVacunasActivas(),
    buscarTurnosVacunacion({ desde: params.desde ?? null, hasta: params.hasta ?? null }),
  ]);

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="mostrador-vacunacion"
    >
      <TurnosVacunacionView
        modo="mostrador"
        basePath="/dashboard/mostrador/vacunacion"
        vacunas={vacunas.map((v) => ({
          id: v.id,
          nombre: nombreVacuna(v),
          dosis: v.dosis.map((d) => ({ orden: d.orden, etiqueta: d.etiqueta })),
        }))}
        filtros={busqueda.filtros}
        rangoDefecto={busqueda.rangoDefecto}
        gruposPorDia={busqueda.gruposPorDia}
        mensajeVacio={busqueda.mensajeVacio}
        personasPropias={[]}
      />
    </DashboardShell>
  );
}
