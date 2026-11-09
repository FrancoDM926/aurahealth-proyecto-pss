import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { AdjuntoUploadForm } from "@/components/adjunto-upload-form";
import {
  Bloque,
  Callout,
  Hint,
  TBODY,
  TD,
  TH,
  THEAD_TR,
  Tabla,
} from "@/components/pagos-ui";
import { requireRoles } from "@/lib/auth-session";
import { getAdjuntoMaxMB } from "@/lib/configuracion";
import { puedeAccederFicha, puedeSubirAdjunto } from "@/lib/historial";
import { obtenerEntradaConAdjuntos } from "@/services/historial/consultas";
import { registrarAccesoHistorial } from "@/services/historial/auditoria";

export const metadata = {
  title: "Historial — Estudios adjuntos | AuraHealth",
  description: "Estudios e imágenes vinculados a una entrada de la ficha de diagnóstico.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

/**
 * US-62 (wf_adjuntos_estudios.html): el médico autor adjunta imágenes o PDF a
 * una entrada de su ficha. Cualquier médico de la sala puede consultar y
 * descargar los estudios; el paciente dueño también puede descargarlos.
 */
export default async function EstudiosEntradaPage({ params }: PageProps) {
  const { role, profile } = await requireRoles(["MEDICO"]);
  const { id } = await params;

  const entrada = await obtenerEntradaConAdjuntos(id);
  if (!entrada) notFound();

  const actor = {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    role,
  };

  const autorizado = puedeAccederFicha({
    role,
    actorId: profile.id,
    patientKey: entrada.pacienteKey,
  });

  if (!autorizado) {
    await registrarAccesoHistorial({
      actor,
      pacienteKey: entrada.pacienteKey,
      pacienteNombre: entrada.pacienteNombre,
      tipo: "ESTUDIOS",
      resultado: "RECHAZADO",
      detalle: "Intento de acceder a los estudios de una ficha ajena",
    });
    notFound();
  }

  await registrarAccesoHistorial({
    actor,
    pacienteKey: entrada.pacienteKey,
    pacienteNombre: entrada.pacienteNombre,
    tipo: "ESTUDIOS",
    resultado: "EXITOSO",
    detalle: "Consulta de los estudios de una entrada",
  });

  const esAutor = puedeSubirAdjunto({
    role,
    actorId: profile.id,
    fichaMedicoId: entrada.medicoId,
  });
  const maxMB = await getAdjuntoMaxMB();

  return (
    <DashboardShell
      userName={`${profile.firstName} ${profile.lastName}`}
      role={role}
      activeNav="historial"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Historial — Estudios adjuntos
          </h1>
          <Link
            href="/dashboard/historial"
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Volver al historial
          </Link>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          Archivos vinculados a una entrada de la ficha, con tamaño máximo configurable.
        </p>

        <Bloque num="1 · Entrada de la ficha" titulo="Entrada seleccionada">
          <Callout>
            <strong>
              {entrada.pacienteNombre} — {entrada.pacienteDocumento}
            </strong>
            <br />
            Entrada del {entrada.firmadoEnTexto} — {entrada.medicoNombre} (
            {entrada.especialidadLabel})
          </Callout>
          <dl className="grid gap-2 text-sm text-ink">
            <div>
              <dt className="inline font-semibold">Diagnóstico: </dt>
              <dd className="inline whitespace-pre-line">{entrada.diagnostico}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Tratamiento: </dt>
              <dd className="inline whitespace-pre-line">{entrada.tratamiento}</dd>
            </div>
            {entrada.observaciones && (
              <div>
                <dt className="inline font-semibold">Observaciones: </dt>
                <dd className="inline whitespace-pre-line">{entrada.observaciones}</dd>
              </div>
            )}
          </dl>
          <Hint>Última edición de la entrada: {entrada.editadaEnTexto}.</Hint>
        </Bloque>

        <Bloque num="2 · Adjuntar" titulo="Subir un estudio">
          {esAutor ? (
            <AdjuntoUploadForm entradaId={entrada.id} maxMB={maxMB} />
          ) : (
            <Callout>
              Solo el profesional autor de la ficha —{entrada.medicoNombre}— puede adjuntar
              estudios a esta entrada. La consulta y la descarga siguen disponibles.
            </Callout>
          )}
          <Hint>
            Se admiten imágenes (JPG, PNG, WEBP o GIF) y PDF. El acceso queda registrado en la
            auditoría.
          </Hint>
        </Bloque>

        <Bloque num="3 · Estudios adjuntos" titulo="Archivos de la entrada">
          {entrada.adjuntos.length === 0 ? (
            <Callout>Esta entrada todavía no tiene estudios adjuntos.</Callout>
          ) : (
            <Tabla>
              <thead>
                <tr className={THEAD_TR}>
                  <th className={TH}>Archivo</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Tamaño</th>
                  <th className={TH}>Subido</th>
                  <th className={TH}>Acciones</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {entrada.adjuntos.map((adjunto) => (
                  <tr key={adjunto.id}>
                    <td className={TD}>{adjunto.nombreArchivo}</td>
                    <td className={TD}>{adjunto.tipoLabel}</td>
                    <td className={TD}>{adjunto.tamanoTexto}</td>
                    <td className={`${TD} whitespace-nowrap`}>{adjunto.subidoEnTexto}</td>
                    <td className={TD}>
                      <a
                        href={`/api/historial/adjuntos/${adjunto.id}`}
                        className="rounded-lg border border-line bg-background px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-ink"
                      >
                        Descargar
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <Hint>
            El paciente puede descargar sus propios estudios. Cada acceso queda registrado en la
            auditoría (US-44).
          </Hint>
        </Bloque>
      </div>
    </DashboardShell>
  );
}
