import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmailFallidosForm } from "@/components/email-fallidos-form";
import { EmailMensajeForm } from "@/components/email-mensaje-form";
import { requireRoles } from "@/lib/auth-session";
import {
  PLANTILLAS_ADMINISTRABLES,
  getPlantillaAdministrable,
} from "@/services/email/catalogo";
import { getEnviosFallidosMax, getMensajeGuardado } from "@/services/email/plantillas";

export const metadata = {
  title: "Administración — Servicio de email",
  description: "Plantillas de email y límite de envíos fallidos por usuario (US-21).",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ plantilla?: string }>;
};

/**
 * US-21 — Pantalla «Emails» (wireframe `wf_servicio_email.html`): listado de
 * plantillas, edición del mensaje y límite de envíos fallidos por usuario.
 * US-14 (confirmación) y US-15 (recordatorio) no tienen pantalla propia: usan
 * estas plantillas y su disparo sigue siendo infraestructura.
 */
export default async function ServicioEmailPage({ searchParams }: PageProps) {
  const { role, profile } = await requireRoles(["ADMINISTRADOR"]);
  const { plantilla: plantillaParam } = await searchParams;

  const seleccionada =
    getPlantillaAdministrable(plantillaParam ?? "") ?? PLANTILLAS_ADMINISTRABLES[0];

  const [mensajeGuardado, maxFallidos] = await Promise.all([
    getMensajeGuardado(seleccionada.clave),
    getEnviosFallidosMax(),
  ]);

  const mensajeVigente = mensajeGuardado ?? seleccionada.mensajePorDefecto;

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="emails"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Administración — Servicio de email
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Edición del mensaje de las plantillas y límite de envíos fallidos por usuario.
        </p>

        <div className="mt-8 space-y-6">
          {/* 1 · Listado */}
          <section className="rounded-xl border-2 border-line bg-surface p-6">
            <h2 className="text-lg font-bold text-ink">Plantillas de email</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-secondary">
                    <th className="py-2 pr-4 font-semibold">Plantilla</th>
                    <th className="py-2 pr-4 font-semibold">Asunto</th>
                    <th className="py-2 pr-4 font-semibold">Usada por</th>
                    <th className="py-2 font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANTILLAS_ADMINISTRABLES.map((plantilla) => {
                    const activa = plantilla.clave === seleccionada.clave;
                    return (
                      <tr key={plantilla.clave} className="border-b border-line/70">
                        <td className="py-3 pr-4 font-medium text-ink">
                          {plantilla.nombre}
                        </td>
                        <td className="py-3 pr-4 text-ink-secondary">
                          {plantilla.asunto}
                        </td>
                        <td className="py-3 pr-4 text-ink-secondary">
                          {plantilla.usadaPor}
                        </td>
                        <td className="py-3">
                          <Link
                            href={`/dashboard/admin/emails?plantilla=${plantilla.clave}`}
                            aria-current={activa ? "true" : undefined}
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                              activa
                                ? "border-primary bg-primary-light text-primary"
                                : "border-line text-ink hover:bg-background"
                            }`}
                          >
                            {activa ? "En edición" : "Editar mensaje"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm text-ink-secondary">
              El asunto, el remitente y los destinatarios no se editan desde esta pantalla:
              son fijos por plantilla. Solo el cuerpo del mensaje es editable.
            </p>
          </section>

          {/* 2 · Edición. La `key` por plantilla fuerza el remontaje al navegar
              con otro `?plantilla=`, así el formulario arranca con el mensaje
              guardado en la base de esa plantilla y no con el anterior. */}
          <EmailMensajeForm
            key={seleccionada.clave}
            clave={seleccionada.clave}
            nombre={seleccionada.nombre}
            asunto={seleccionada.asunto}
            mensajeInicial={mensajeVigente}
            variables={seleccionada.variables}
          />

          {/* 3 · Configuración */}
          <EmailFallidosForm initial={maxFallidos} />

          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-light/50 p-4 text-sm text-ink">
            Esta pantalla amplía US-21: originalmente era infraestructura sin pantalla propia.
            Ahora el administrador edita el cuerpo de las plantillas y el límite de envíos
            fallidos por usuario desde acá.
          </div>

          <p className="text-xs text-ink-muted">
            US cubierta: US-21 · servicio de envío de email: edición del mensaje de las
            plantillas y configuración del límite de envíos fallidos por usuario. US-14 y
            US-15 usan estas plantillas; su disparo sigue siendo infraestructura.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
