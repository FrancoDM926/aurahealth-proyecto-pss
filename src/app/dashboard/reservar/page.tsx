import { DashboardShell } from "@/components/dashboard-shell";
import { ReservaMock, type TurnoReservable } from "@/components/reserva-mock";
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
 * ⚠️ MOCK TEMPORAL — US-13 (Reserva de turno).
 *
 * Esta ruta es un prototipo para probar el email de confirmación de US-14 y el
 * servicio de envío de US-21. No es la implementación definitiva de US-13: la
 * reemplazan la reserva real y la búsqueda de disponibilidad de US-12.
 *
 * Al completar US-13, reemplazar `ReservaMock` por la pantalla real y eliminar
 * el banner de mock (`MockUs13Banner`).
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Reservar turno</h1>
          <span className="rounded-full bg-warning px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">
            Mock · US-13
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          Versión de prueba de la reserva: sirve para validar el envío de la confirmación por
          email. No es la implementación definitiva de US-13.
        </p>

        <div className="mt-6">
          <ReservaMock turnos={reservables} />
        </div>
      </div>
    </DashboardShell>
  );
}
