import { obtenerFichaDiagnostico } from "@/actions/ficha-diagnostico";
import { DashboardShell } from "@/components/dashboard-shell";
import { FichaDiagnosticoView } from "@/components/ficha-diagnostico-view";
import { requireRolesAuditado } from "@/services/historial/acceso-auditado";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

type PageProps = {
  searchParams: Promise<{ turnoId?: string; fichaId?: string }>;
};

export const metadata = {
  title: "Ficha de diagnóstico | AuraHealth",
  description: "Registro de diagnóstico, tratamiento y evolución clínica.",
};

export const dynamic = "force-dynamic";

/**
 * US-39: ficha de diagnóstico del médico. Como muestra datos clínicos del
 * paciente, cada apertura queda registrada en la auditoría de US-44, y el
 * intento de un rol no autorizado se registra como RECHAZADO.
 */
export default async function FichaDiagnosticoPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRolesAuditado(["MEDICO"], {
    tipo: "FICHA_CONSOLIDADA",
    detalle: "Intento de abrir una ficha de diagnóstico sin ser médico",
  });
  const params = await searchParams;
  const result = await obtenerFichaDiagnostico({
    turnoId: params.turnoId,
    fichaId: params.fichaId,
  });

  if (result.success) {
    await registrarAccesoHistorial({
      actor: {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role,
      },
      pacienteKey: result.data.patientKey,
      pacienteNombre: result.data.patientName,
      tipo: "FICHA_CONSOLIDADA",
      resultado: "EXITOSO",
      detalle: "Apertura de la ficha de diagnóstico",
    });
  }

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="agenda"
    >
      <FichaDiagnosticoView result={result} />
    </DashboardShell>
  );
}
