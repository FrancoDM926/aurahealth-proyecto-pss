import { DashboardShell } from "@/components/dashboard-shell";
import { ReservaTurnoView, type TurnoAReservar } from "@/components/reserva-turno-view";
import { requireRoles } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { ahoraEnArgentina, esTurnoFuturo } from "@/lib/busqueda-turnos";
import { getSalaDireccion } from "@/lib/configuracion";
import { SPECIALTY_LABELS } from "@/lib/roles";

type PageProps = {
  searchParams: Promise<{ turno?: string }>;
};

export const metadata = {
  title: "Confirmar reserva | AuraHealth",
  description: "Selección y confirmación de un turno disponible.",
};

export const dynamic = "force-dynamic";

/**
 * US-13: confirmación de la reserva del turno elegido en la búsqueda (US-10),
 * con la opción de reservarlo a nombre de otra persona (US-64).
 */
export default async function ReservarPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["USUARIO"]);
  const { turno: turnoId } = await searchParams;

  const [turno, personas, salaDireccion] = await Promise.all([
    turnoId
      ? db.turno.findUnique({ where: { id: turnoId }, include: { doctor: true } })
      : Promise.resolve(null),
    db.personaAtendida.findMany({
      where: { userId: profile.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        docNumber: true,
        healthInsuranceEntity: true,
        healthInsurancePlan: true,
      },
    }),
    getSalaDireccion(),
  ]);

  const fecha = turno ? turno.date.toISOString().slice(0, 10) : "";
  const disponible =
    turno !== null &&
    turno.status === "DISPONIBLE" &&
    turno.doctor.isActive &&
    esTurnoFuturo({ date: fecha, startTime: turno.startTime }, ahoraEnArgentina());

  const turnoAReservar: TurnoAReservar | null =
    turno && disponible
      ? {
          id: turno.id,
          doctorNombre: `Dr. ${turno.doctor.firstName} ${turno.doctor.lastName}`,
          especialidad: turno.doctor.specialty
            ? SPECIALTY_LABELS[turno.doctor.specialty]
            : "Consulta médica",
          fecha,
          startTime: turno.startTime,
          endTime: turno.endTime,
          sala: salaDireccion,
        }
      : null;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="turnos"
    >
      <ReservaTurnoView
        key={turnoId ?? "sin-turno"}
        turno={turnoAReservar}
        personas={personas.map((p) => ({
          id: p.id,
          nombre: `${p.firstName} ${p.lastName}`,
          documento: p.docNumber,
          obraSocial: `${p.healthInsuranceEntity} ${p.healthInsurancePlan}`,
        }))}
      />
    </DashboardShell>
  );
}
