import { listarVacunasActivas } from "@/actions/vacunas";
import { buscarTurnosVacunacion } from "@/actions/turnos-vacunacion";
import { DashboardShell } from "@/components/dashboard-shell";
import { TurnosVacunacionView } from "@/components/turnos-vacunacion-view";
import { requireRoles } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { nombreVacuna } from "@/lib/turnos-vacunacion";

type PageProps = {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
};

export const metadata = {
  title: "Turnos de vacunación | AuraHealth",
  description: "Reserva de turnos de vacunación: vacuna, horario y rango de fechas.",
};

export const dynamic = "force-dynamic";

/** US-28: el usuario saca un turno de vacunación para sí o para otra persona (US-64). */
export default async function TurnosVacunacionPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["USUARIO"]);
  const params = await searchParams;

  const [vacunas, busqueda, personas] = await Promise.all([
    listarVacunasActivas(),
    buscarTurnosVacunacion({ desde: params.desde ?? null, hasta: params.hasta ?? null }),
    db.personaAtendida.findMany({
      where: { userId: profile.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="turnos-vacunacion"
    >
      <TurnosVacunacionView
        modo="paciente"
        basePath="/dashboard/turnos-vacunacion"
        vacunas={vacunas.map((v) => ({
          id: v.id,
          nombre: nombreVacuna(v),
          dosis: v.dosis.map((d) => ({ orden: d.orden, etiqueta: d.etiqueta })),
        }))}
        filtros={busqueda.filtros}
        rangoDefecto={busqueda.rangoDefecto}
        gruposPorDia={busqueda.gruposPorDia}
        mensajeVacio={busqueda.mensajeVacio}
        personasPropias={personas.map((p) => ({
          id: p.id,
          nombre: `${p.firstName} ${p.lastName}`,
          documento: p.docNumber,
          obraSocial: `${p.healthInsuranceEntity} ${p.healthInsurancePlan}`,
        }))}
      />
    </DashboardShell>
  );
}
