import { db as dbPorDefecto } from "@/lib/db";
import { armarCarnet, type Carnet } from "@/lib/carnet";

export type DbCliente = typeof dbPorDefecto;

export type DatosCarnet = {
  pacienteNombre: string;
  pacienteDocumento: string | null;
  carnet: Carnet;
};

/**
 * Carnet del propio usuario (`personaId` ausente) o de una persona atendida que él
 * cargó (US-64). Devuelve `null` si la persona no existe o no es suya: el llamador
 * responde como si no existiera.
 */
export async function obtenerDatosCarnet(
  usuario: { id: string; firstName: string; lastName: string; docNumber: string | null },
  personaId: string | null,
  db: DbCliente = dbPorDefecto
): Promise<DatosCarnet | null> {
  let pacienteNombre = `${usuario.firstName} ${usuario.lastName}`;
  let pacienteDocumento = usuario.docNumber;
  let filtro: { pacienteUserId: string } | { personaAtendidaId: string } = { pacienteUserId: usuario.id };

  if (personaId) {
    const persona = await db.personaAtendida.findFirst({ where: { id: personaId, userId: usuario.id } });
    if (!persona) return null;
    pacienteNombre = `${persona.firstName} ${persona.lastName}`;
    pacienteDocumento = persona.docNumber;
    filtro = { personaAtendidaId: persona.id };
  }

  const aplicaciones = await db.aplicacionDosis.findMany({
    where: { ...filtro, estado: "ACTIVA" },
    orderBy: { aplicadaAt: "desc" },
  });

  // Las dosis se evalúan contra el esquema vigente del catálogo (incluye vacunas desactivadas).
  const vacunaIds = [...new Set(aplicaciones.map((a) => a.vacunaId))];
  const dosis = vacunaIds.length
    ? await db.vacunaDosis.findMany({ where: { vacunaId: { in: vacunaIds } }, orderBy: { orden: "asc" } })
    : [];
  const esquemas = new Map<string, { orden: number; etiqueta: string; diasDesdeAnterior: number | null }[]>();
  for (const d of dosis) {
    esquemas.set(d.vacunaId, [
      ...(esquemas.get(d.vacunaId) ?? []),
      { orden: d.orden, etiqueta: d.etiqueta, diasDesdeAnterior: d.diasDesdeAnterior },
    ]);
  }

  return {
    pacienteNombre,
    pacienteDocumento,
    carnet: armarCarnet(
      aplicaciones.map((a) => ({
        vacunaId: a.vacunaId,
        vacunaNombre: a.vacunaNombre,
        dosisOrden: a.dosisOrden,
        dosisEtiqueta: a.dosisEtiqueta,
        aplicadaAt: a.aplicadaAt,
      })),
      esquemas
    ),
  };
}
