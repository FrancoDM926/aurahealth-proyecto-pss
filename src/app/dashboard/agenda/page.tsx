import { AgendaProfesionalView } from "@/components/agenda-profesional-view";
import { DashboardShell } from "@/components/dashboard-shell";
import { requireRoles } from "@/lib/auth-session";
import { todayInArgentina } from "@/lib/availability-rn02";
import { db } from "@/lib/db";
import {
  esFechaValida,
  rangoDeVista,
  toFecha,
  VISTAS,
  type TurnoAgenda,
  type VistaAgenda,
} from "@/lib/agenda-profesional";

type PageProps = {
  searchParams: Promise<{ vista?: string; fecha?: string }>;
};

export const metadata = {
  title: "US-11 — Mi agenda | AuraHealth",
  description: "Agenda del profesional en vista diaria, semanal y mensual.",
};

export const dynamic = "force-dynamic";

export default async function AgendaProfesionalPage({ searchParams }: PageProps) {
  // El médico sale de la sesión: nadie puede ver la agenda de otro (RNF-03).
  const { role, profile } = await requireRoles(["MEDICO"]);
  const params = await searchParams;

  const hoy = todayInArgentina();
  // El wireframe abre en la vista semanal.
  const vista: VistaAgenda = (VISTAS as string[]).includes(params.vista ?? "")
    ? (params.vista as VistaAgenda)
    : "semana";
  const fecha = params.fecha && esFechaValida(params.fecha) ? params.fecha : hoy;
  const rango = rangoDeVista(vista, fecha);

  const rows = await db.turno.findMany({
    where: {
      doctorId: profile.id,
      date: {
        gte: new Date(`${rango.desde}T00:00:00.000Z`),
        lte: new Date(`${rango.hasta}T00:00:00.000Z`),
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, date: true, startTime: true, endTime: true, status: true },
  });

  const turnos: TurnoAgenda[] = rows.map((t) => ({
    id: t.id,
    date: toFecha(t.date),
    startTime: t.startTime,
    endTime: t.endTime,
    status: t.status,
  }));

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda"
    >
      <AgendaProfesionalView
        doctorName={`Dr. ${profile.firstName} ${profile.lastName}`}
        vista={vista}
        fecha={fecha}
        hoy={hoy}
        turnos={turnos}
      />
    </DashboardShell>
  );
}
