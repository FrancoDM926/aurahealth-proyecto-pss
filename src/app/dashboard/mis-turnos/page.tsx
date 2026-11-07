import { DashboardShell } from "@/components/dashboard-shell";
import { MisTurnosView } from "@/components/mis-turnos-view";
import { requireRoles } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getCancelacionAntelacion } from "@/lib/configuracion";
import { estaEnPlazoDeCancelacion, ordenarMisTurnos, type MiTurno } from "@/lib/reservas";

export const metadata = {
  title: "Mis turnos | AuraHealth",
  description: "Turnos reservados y cancelación por el paciente.",
};

export const dynamic = "force-dynamic";

/**
 * US-16: listado de los turnos que reservó el usuario (propios o a nombre de
 * otra persona) con la cancelación, y los cancelados que quedan en el historial.
 */
export default async function MisTurnosPage() {
  const { role, profile } = await requireRoles(["USUARIO"]);

  const [turnos, cancelaciones, antelacion] = await Promise.all([
    db.turno.findMany({
      where: {
        reservedById: profile.id,
        status: { in: ["RESERVADO", "CUMPLIDO", "AUSENTE", "CANCELADO"] },
      },
      include: { doctor: { select: { firstName: true, lastName: true } } },
    }),
    db.turnoCancelacion.findMany({ where: { reservedById: profile.id } }),
    getCancelacionAntelacion(),
  ]);

  const titular = `${profile.firstName} ${profile.lastName}`;
  const aNombreDe = (first: string | null, last: string | null) =>
    `${first ?? ""} ${last ?? ""}`.trim() || titular;
  const ahora = new Date();

  const filas: MiTurno[] = [
    ...turnos.map((t): MiTurno => {
      const reservado = t.status === "RESERVADO";
      return {
        id: t.id,
        fecha: t.date.toISOString().slice(0, 10),
        startTime: t.startTime,
        doctorNombre: `Dr. ${t.doctor.firstName} ${t.doctor.lastName}`,
        aNombreDe: aNombreDe(t.patientFirstName, t.patientLastName),
        estado: t.status as MiTurno["estado"],
        cancelable: reservado,
        fueraDePlazo: reservado && !estaEnPlazoDeCancelacion(t, ahora, antelacion),
      };
    }),
    ...cancelaciones.map(
      (c): MiTurno => ({
        id: c.id,
        fecha: c.date.toISOString().slice(0, 10),
        startTime: c.startTime,
        doctorNombre: c.doctorNombre,
        aNombreDe: aNombreDe(c.patientFirstName, c.patientLastName),
        estado: "CANCELADO",
        cancelable: false,
        fueraDePlazo: false,
      })
    ),
  ];

  return (
    <DashboardShell userName={titular} role={role} activeNav="mis-turnos">
      <MisTurnosView turnos={ordenarMisTurnos(filas)} antelacionHoras={antelacion} />
    </DashboardShell>
  );
}
