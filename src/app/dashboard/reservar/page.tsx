import { DashboardShell } from "@/components/dashboard-shell";
import { ReservaDemo, type TurnoReservable } from "@/components/reserva-demo";
import { requireRoles } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { todayInArgentina } from "@/lib/availability-rn02";
import { SPECIALTY_LABELS } from "@/lib/roles";

export const metadata = {
  title: "Reservar turno",
  description: "Turnos disponibles para reservar en AuraHealth.",
};

export const dynamic = "force-dynamic";

/**
 * US-13 (mínimo) + US-14: el paciente elige un turno disponible, lo reserva y
 * recibe la confirmación por email. Pantalla provisional: la reemplaza la
 * búsqueda de disponibilidad de US-12.
 */
export default async function ReservarPage() {
  const { role, profile } = await requireRoles(["USUARIO"]);

  const hoy = todayInArgentina();
  const turnos = await db.turno.findMany({
    where: {
      status: "DISPONIBLE",
      date: { gte: new Date(`${hoy}T00:00:00.000Z`) },
    },
    include: { doctor: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 300,
  });

  const reservables: TurnoReservable[] = turnos.map((turno) => ({
    id: turno.id,
    doctorNombre: `Dr. ${turno.doctor.firstName} ${turno.doctor.lastName}`,
    especialidad: turno.doctor.specialty
      ? SPECIALTY_LABELS[turno.doctor.specialty]
      : "Consulta médica",
    fecha: turno.date.toISOString().slice(0, 10),
    startTime: turno.startTime,
    endTime: turno.endTime,
  }));

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="reservar"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Reservar turno</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Elegí un horario disponible y confirmá la reserva. Te enviamos la confirmación por email.
        </p>

        <div className="mt-8">
          <ReservaDemo turnos={reservables} />
        </div>
      </div>
    </DashboardShell>
  );
}
