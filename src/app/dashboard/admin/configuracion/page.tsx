import { DashboardShell } from "@/components/dashboard-shell";
import { LimitesJornadasForm } from "@/components/limites-jornadas-form";
import { SalaDireccionForm } from "@/components/sala-direccion-form";
import { RecordatorioAntelacionForm } from "@/components/recordatorio-antelacion-form";
import { CancelacionAntelacionForm } from "@/components/cancelacion-antelacion-form";
import { ObrasSocialesForm } from "@/components/obras-sociales-form";
import { AdjuntoMaxForm } from "@/components/adjunto-max-form";
import { requireRoles } from "@/lib/auth-session";
import {
  getAdjuntoMaxMB,
  getCancelacionAntelacion,
  getLimitesJornadas,
  getObrasSociales,
  getRecordatorioAntelacion,
  getSalaDireccion,
} from "@/lib/configuracion";

export const metadata = {
  title: "Administración — Configuración",
  description: "Parámetros del sistema que ajusta el administrador.",
};

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const limites = await getLimitesJornadas();
  const salaDireccion = await getSalaDireccion();
  const antelacionRecordatorio = await getRecordatorioAntelacion();
  const antelacionCancelacion = await getCancelacionAntelacion();
  const obrasSociales = await getObrasSociales();
  const adjuntoMaxMB = await getAdjuntoMaxMB();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="configuracion"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Administración — Configuración
        </h1>

        <div className="mt-8 space-y-6">
          <LimitesJornadasForm initial={limites} />
          <SalaDireccionForm initial={salaDireccion} />
          <RecordatorioAntelacionForm initial={antelacionRecordatorio} />
          <CancelacionAntelacionForm initial={antelacionCancelacion} />
          <ObrasSocialesForm initial={obrasSociales} />
          <AdjuntoMaxForm initial={adjuntoMaxMB} />
        </div>
      </div>
    </DashboardShell>
  );
}
