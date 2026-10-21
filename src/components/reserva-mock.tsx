"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { reservarTurnoAction } from "@/actions/reservas";

export type TurnoReservable = {
  id: string;
  doctorNombre: string;
  especialidad: string;
  /** Fecha en formato "YYYY-MM-DD". */
  fecha: string;
  startTime: string;
  endTime: string;
};

/**
 * ⚠️ MOCK TEMPORAL — US-13 (Reserva de turno).
 *
 * Esta pantalla NO es la implementación definitiva de US-13. Es un prototipo
 * que existe únicamente para poder probar el email de confirmación de US-14 y
 * el servicio de envío de US-21.
 *
 * Cuando el equipo complete US-13 (junto con la búsqueda de disponibilidad de
 * US-12), reemplazar este componente por la pantalla real y eliminar el banner
 * `MockUs13Banner`. No tomar este flujo como base para reglas de negocio
 * definitivas.
 */

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const texto = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Aviso visible de que US-13 todavía es un mock.
 * Se elimina junto con este componente cuando se implemente la reserva real.
 */
export function MockUs13Banner() {
  return (
    <section
      role="note"
      aria-label="Aviso: implementación simulada de US-13"
      data-mock="us-13"
      className="mb-6 rounded-xl border-2 border-dashed border-warning/60 bg-warning/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-full bg-warning px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">
          Mock · US-13
        </span>
        <h2 className="text-base font-bold text-ink">Reserva de turno simulada</h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink-secondary">
        Esta pantalla es una implementación provisional de US-13. Existe solo para
        probar el email de confirmación de US-14 y el servicio de envío de US-21. La
        reserva real y la búsqueda de disponibilidad de US-12 todavía no están
        implementadas.
      </p>
      <p className="mt-1.5 text-xs font-semibold text-ink">
        No es funcionalidad definitiva: se reemplaza cuando el equipo complete US-13.
      </p>
    </section>
  );
}

export function ReservaMock({ turnos }: { turnos: TurnoReservable[] }) {
  const router = useRouter();
  const [seleccionado, setSeleccionado] = useState<TurnoReservable | null>(null);
  const [paraOtraPersona, setParaOtraPersona] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const porFecha = useMemo(() => {
    const grupos = new Map<string, TurnoReservable[]>();
    for (const turno of turnos) {
      const lista = grupos.get(turno.fecha) ?? [];
      lista.push(turno);
      grupos.set(turno.fecha, lista);
    }
    return [...grupos.entries()];
  }, [turnos]);

  const abrir = (turno: TurnoReservable) => {
    setSeleccionado(turno);
    setParaOtraPersona(false);
    setNombre("");
    setApellido("");
    setMotivo("");
    setMessage(null);
  };

  const confirmar = async () => {
    if (!seleccionado) return;
    setLoading(true);
    // MOCK US-13: esta acción también es provisional. Escribe el turno en la
    // base para poder disparar el email de US-14; no es la reserva definitiva.
    const result = await reservarTurnoAction({
      turnoId: seleccionado.id,
      paraOtraPersona,
      patientFirstName: nombre,
      patientLastName: apellido,
      motivoConsulta: motivo,
    });
    setLoading(false);
    setMessage({ ok: result.success, text: result.message });
    if (result.success) {
      setSeleccionado(null);
      // Re-renderiza los Server Components de la ruta con los datos frescos.
      // No usar `window.location.reload()`: un reload completo aborta el stream
      // de respuesta de la server action (que aún trae el árbol re-renderizado
      // por `revalidatePath`), y el servidor registra
      // "The destination stream closed early".
      router.refresh();
    }
  };

  if (turnos.length === 0) {
    return (
      <div>
        <MockUs13Banner />
        <section className="rounded-xl border-2 border-line bg-surface p-6">
          <h2 className="text-lg font-bold text-ink">No hay turnos disponibles</h2>
          <p className="mt-2 text-sm text-ink-secondary">
            Cuando un profesional publique su disponibilidad, sus turnos van a aparecer acá.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <MockUs13Banner />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-6">
          {porFecha.map(([fecha, lista]) => (
            <div key={fecha} className="rounded-xl border-2 border-line bg-surface p-5">
              <h2 className="text-base font-bold text-ink">{formatFechaLarga(fecha)}</h2>
              <p className="mt-0.5 text-xs text-ink-secondary">{formatFecha(fecha)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {lista.map((turno) => (
                  <button
                    key={turno.id}
                    type="button"
                    onClick={() => abrir(turno)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      seleccionado?.id === turno.id
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-background text-ink hover:border-primary"
                    }`}
                  >
                    {turno.startTime}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border-2 border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">Confirmar turno</h2>
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                Mock
              </span>
            </div>

            {message && (
              <p
                role="status"
                className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                  message.ok
                    ? "border-success/40 bg-success/5 text-ink"
                    : "border-error/40 bg-error/5 text-error"
                }`}
              >
                {message.text}
              </p>
            )}

            {!seleccionado ? (
              <p className="mt-2 text-sm text-ink-secondary">
                Elegí un horario para ver el detalle y confirmar la reserva.
              </p>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-line bg-background p-4 text-sm">
                  <dl className="space-y-1.5">
                    <Fila label="Especialidad" value={seleccionado.especialidad} />
                    <Fila label="Profesional" value={seleccionado.doctorNombre} />
                    <Fila label="Fecha" value={formatFecha(seleccionado.fecha)} />
                    <Fila label="Hora" value={`${seleccionado.startTime} hs`} />
                  </dl>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={paraOtraPersona}
                      onChange={(e) => setParaOtraPersona(e.target.checked)}
                    />
                    Reservar a nombre de otra persona
                  </label>

                  {paraOtraPersona && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink-secondary" htmlFor="nombre">
                          Nombre
                        </label>
                        <input
                          id="nombre"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-ink-secondary" htmlFor="apellido">
                          Apellido
                        </label>
                        <input
                          id="apellido"
                          value={apellido}
                          onChange={(e) => setApellido(e.target.value)}
                          className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-secondary" htmlFor="motivo">
                      Motivo de consulta (opcional)
                    </label>
                    <textarea
                      id="motivo"
                      value={motivo}
                      rows={2}
                      onChange={(e) => setMotivo(e.target.value)}
                      className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {message && !message.ok && (
                  <p className="mt-3 rounded-lg border border-error/40 bg-error/5 px-4 py-3 text-sm text-error">
                    {message.text}
                  </p>
                )}

                <button
                  type="button"
                  onClick={confirmar}
                  disabled={loading}
                  className="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {loading ? "Reservando…" : "Confirmar reserva (mock)"}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-secondary">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}
