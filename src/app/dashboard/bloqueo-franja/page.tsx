import { DashboardShell } from "@/components/dashboard-shell";
import { BloqueoFranjaView } from "@/components/bloqueo-franja-view";
import { requireRoles } from "@/lib/auth-session";
import {
  obtenerContextoBloqueoFranja,
  previsualizarBloqueoFranjaAction,
} from "@/actions/bloqueos";

export const metadata = {
  title: "Bloqueo de franja",
  description: "Bloqueo de turnos disponibles de una franja publicada (US-30).",
};

export const dynamic = "force-dynamic";

export default async function BloqueoFranjaPage({
  searchParams,
}: {
  searchParams: Promise<{
    doctorId?: string;
    dia?: string;
    desde?: string;
    hasta?: string;
  }>;
}) {
  const { role, profile } = await requireRoles(["MEDICO", "ADMINISTRATIVO"]);
  const params = await searchParams;

  const contexto = await obtenerContextoBloqueoFranja({
    doctorId: params.doctorId,
  });

  const initialDia =
    params.dia && params.dia >= contexto.hoy ? params.dia : contexto.hoy;
  const initialDesde = params.desde || "08:00";
  const initialHasta = params.hasta || "12:00";

  let initialPreview = null;
  if (contexto.selectedDoctorId) {
    const res = await previsualizarBloqueoFranjaAction({
      doctorId: contexto.selectedDoctorId,
      dia: initialDia,
      diaHasta: initialDia,
      desde: initialDesde,
      hasta: initialHasta,
    });
    if (res.success && res.preview) {
      initialPreview = res.preview;
    }
  }

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="bloqueos"
    >
      <BloqueoFranjaView
        actorRole={role}
        initialDoctorId={contexto.selectedDoctorId}
        doctores={contexto.doctores}
        hoy={contexto.hoy}
        initialDia={initialDia}
        initialDesde={initialDesde}
        initialHasta={initialHasta}
        initialPreview={initialPreview}
        bloqueosRegistrados={contexto.bloqueosRegistrados}
      />
    </DashboardShell>
  );
}
