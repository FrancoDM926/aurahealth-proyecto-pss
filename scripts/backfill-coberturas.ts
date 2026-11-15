/**
 * Backfill de la entidad de cobertura (US-32 / US-34).
 *
 * Alinea `User.healthInsuranceEntity` y `PersonaAtendida.healthInsuranceEntity`
 * con el nombre canónico de `ObraSocial.nombre`, de modo que el texto guardado
 * coincida con el listado del administrador y el descuento se encuentre al
 * cobrar (US-34). Solo cambia las filas cuya entidad cambia: los `Pago` ya
 * registrados conservan su importe (US-35 / US-36).
 *
 * Es idempotente y por defecto solo simula.
 *
 * Uso:
 *   npx tsx scripts/backfill-coberturas.ts           # simulación
 *   npx tsx scripts/backfill-coberturas.ts --apply   # escribe en la base
 */

export {};

const APPLY = process.argv.includes("--apply");

try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usa el entorno del proceso.
}

async function main() {
  // `src/lib/db` lee DATABASE_URL al importarse, por eso el import dinámico.
  const { db } = await import("../src/lib/db");
  const { canonizarEntidad, normalizarEntidad } = await import("../src/lib/pagos");

  const obras = await db.obraSocial.findMany({
    orderBy: { nombre: "asc" },
    select: { nombre: true },
  });
  const entidades = obras.map((o) => o.nombre);
  if (entidades.length === 0) {
    console.log("No hay obras sociales cargadas: nada que alinear.");
    return;
  }
  console.log(`Listado del administrador (${entidades.length}): ${entidades.join(", ")}`);

  const usuarios = await db.user.findMany({
    where: { coverageType: "OBRA_SOCIAL", healthInsuranceEntity: { not: null } },
    select: { id: true, email: true, healthInsuranceEntity: true },
  });
  const personas = await db.personaAtendida.findMany({
    select: { id: true, firstName: true, lastName: true, healthInsuranceEntity: true },
  });

  const cambios: Array<{
    tabla: "User" | "PersonaAtendida";
    id: string;
    etiqueta: string;
    antes: string;
    despues: string;
  }> = [];
  const sinCoincidencia: Array<{ etiqueta: string; entidad: string }> = [];

  const planificar = (
    tabla: "User" | "PersonaAtendida",
    id: string,
    etiqueta: string,
    guardado: string
  ) => {
    const despues = canonizarEntidad(guardado, entidades);
    if (despues !== guardado) {
      cambios.push({ tabla, id, etiqueta, antes: guardado, despues });
    }
    if (!entidades.some((e) => normalizarEntidad(e) === normalizarEntidad(guardado))) {
      sinCoincidencia.push({ etiqueta, entidad: guardado });
    }
  };

  for (const u of usuarios) {
    if (u.healthInsuranceEntity) planificar("User", u.id, u.email, u.healthInsuranceEntity);
  }
  for (const p of personas) {
    if (p.healthInsuranceEntity) {
      planificar(
        "PersonaAtendida",
        p.id,
        `${p.firstName} ${p.lastName}`.trim(),
        p.healthInsuranceEntity
      );
    }
  }

  console.log(
    `\nCoberturas revisadas: ${usuarios.length} usuario(s) y ${personas.length} persona(s) atendida(s).`
  );

  if (sinCoincidencia.length > 0) {
    console.log(`\nEntidades que no figuran en el listado (se facturan como particular):`);
    for (const s of sinCoincidencia) {
      console.log(`  - ${s.etiqueta}: «${s.entidad}»`);
    }
  }

  if (cambios.length === 0) {
    console.log("\nNada para alinear: todas las entidades ya guardan el nombre canónico.");
    return;
  }

  console.log(`\nCambios previstos (${cambios.length}):`);
  for (const c of cambios) {
    console.log(`  - ${c.tabla} ${c.etiqueta}: «${c.antes}» → «${c.despues}»`);
  }

  if (!APPLY) {
    console.log("\nSimulación: ningún dato fue modificado. Corré con --apply para escribir.");
    return;
  }

  for (const c of cambios) {
    if (c.tabla === "User") {
      await db.user.update({
        where: { id: c.id },
        data: { healthInsuranceEntity: c.despues },
      });
    } else {
      await db.personaAtendida.update({
        where: { id: c.id },
        data: { healthInsuranceEntity: c.despues },
      });
    }
  }

  console.log(`\nAplicados ${cambios.length} cambio(s).`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error("Backfill de coberturas falló:", error);
  process.exit(1);
});
