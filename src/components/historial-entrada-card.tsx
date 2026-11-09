import Link from "next/link";
import type { EntradaHistorial } from "@/services/historial/consultas";

type HistorialEntradaCardProps = {
  entrada: EntradaHistorial;
  /** US-40 muestra el autor de cada entrada; US-41 lo hace junto a la especialidad. */
  mostrarMedico?: boolean;
  /** Enlace al detalle de la entrada para adjuntar/descargar estudios (US-62). */
  hrefEstudios?: string | null;
};

/**
 * Entrada clínica de solo lectura, compartida por US-40, US-41 y US-62.
 * Nunca expone acciones de edición: la carga y la edición viven en US-39.
 */
export function HistorialEntradaCard({
  entrada,
  mostrarMedico = true,
  hrefEstudios = null,
}: HistorialEntradaCardProps) {
  return (
    <article className="rounded-lg border border-line bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {entrada.firmadoEnTexto}
          {mostrarMedico && (
            <span className="font-normal text-ink-secondary">
              {" · "}
              {entrada.medicoNombre} ({entrada.especialidadLabel})
            </span>
          )}
          {!mostrarMedico && (
            <span className="font-normal text-ink-secondary"> · {entrada.especialidadLabel}</span>
          )}
        </p>
        <span className="text-xs text-ink-secondary">
          Última edición: {entrada.editadaEnTexto}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-sm text-ink">
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

      {entrada.adjuntos.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            Estudios adjuntos
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {entrada.adjuntos.map((adjunto) => (
              <li key={adjunto.id} className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{adjunto.nombreArchivo}</span>
                <span className="text-xs text-ink-secondary">
                  {adjunto.tipoLabel} · {adjunto.tamanoTexto}
                </span>
                <a
                  href={`/api/historial/adjuntos/${adjunto.id}`}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  Descargar
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hrefEstudios && (
        <div className="mt-3">
          <Link
            href={hrefEstudios}
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Ver estudios de esta entrada
          </Link>
        </div>
      )}
    </article>
  );
}
