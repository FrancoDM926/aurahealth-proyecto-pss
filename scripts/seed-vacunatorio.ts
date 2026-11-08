/**
 * Datos de ejemplo del vacunatorio para desarrollo y demo (Grupo C, Sprint 3).
 *
 * - Carga franjas de atención (mañanas de lunes a viernes, próximos 14 días) y los
 *   turnos de 30 minutos de cada una, con las mismas funciones que usa US-63.
 * - Si el catálogo está vacío, agrega tres vacunas con su esquema de dosis (US-24).
 *
 * Es idempotente (no duplica franjas ni turnos). Por defecto solo simula.
 *
 * Uso:
 *   npx tsx scripts/seed-vacunatorio.ts            # simulación
 *   npx tsx scripts/seed-vacunatorio.ts --apply    # escribe en la base de DATABASE_URL
 *
 * Requiere al menos un usuario con rol ENFERMERA en la base (figura como creador de las franjas).
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
  const { calcularCambiosAgenda } = await import("../src/lib/agenda-vacunatorio");
  const { fechaUtcString, parseFechaUtc } = await import("../src/lib/fecha-utc");
  const { todayInArgentina } = await import("../src/lib/availability-rn02");

  const enfermera = await db.user.findFirst({ where: { role: "ENFERMERA", isActive: true } });
  if (!enfermera) {
    console.error("No hay ningún usuario ENFERMERA activo: creá uno desde Usuarios y volvé a correr el script.");
    process.exit(1);
  }

  // Franjas: lunes a viernes, 08:00–12:00, los próximos 14 días (hoy incluido si todavía no empezó).
  const hoy = todayInArgentina();
  const deseadas: { date: string; startTime: string; endTime: string }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = parseFechaUtc(hoy);
    d.setUTCDate(d.getUTCDate() + i);
    const dia = d.getUTCDay();
    if (dia === 0 || dia === 6) continue;
    deseadas.push({ date: fechaUtcString(d), startTime: "08:00", endTime: "12:00" });
  }

  const guardadasDb = await db.jornadaVacunatorio.findMany({
    where: { date: { gte: parseFechaUtc(hoy) } },
  });
  const guardadas = guardadasDb.map((j) => ({
    id: j.id,
    date: fechaUtcString(j.date),
    startTime: j.startTime,
    endTime: j.endTime,
  }));
  const turnosDb = await db.turnoVacunacion.findMany({ where: { date: { gte: parseFechaUtc(hoy) } } });
  const turnos = turnosDb.map((t) => ({
    id: t.id,
    date: fechaUtcString(t.date),
    startTime: t.startTime,
    endTime: t.endTime,
    status: t.status,
  }));

  // Solo se agregan franjas: no se quitan las que ya existían.
  const cambios = calcularCambiosAgenda([...guardadas, ...deseadas], guardadas, turnos);
  console.log(`Franjas a crear: ${cambios.franjasACrear.length} · turnos a crear: ${cambios.turnosACrear.length}`);

  const vacunas = await db.vacuna.count();
  console.log(vacunas === 0 ? "Catálogo vacío: se agregarán 3 vacunas de ejemplo." : `Catálogo con ${vacunas} vacunas: no se toca.`);

  if (!APPLY) {
    console.log("Simulación: no se escribió nada. Usá --apply para aplicar.");
    return;
  }

  const idPorClave = new Map<string, string>();
  for (const f of cambios.franjasACrear) {
    const creada = await db.jornadaVacunatorio.create({
      data: { date: parseFechaUtc(f.date), startTime: f.startTime, endTime: f.endTime, createdById: enfermera.id },
    });
    idPorClave.set(`${f.date}|${f.startTime}|${f.endTime}`, creada.id);
  }
  if (cambios.turnosACrear.length > 0) {
    await db.turnoVacunacion.createMany({
      data: cambios.turnosACrear.map((t) => ({
        jornadaId: idPorClave.get(t.franjaKey) ?? null,
        date: parseFechaUtc(t.date),
        startTime: t.startTime,
        endTime: t.endTime,
      })),
      skipDuplicates: true,
    });
  }

  if (vacunas === 0) {
    const ejemplos = [
      {
        denominacion: "Antigripal",
        laboratorio: "Laboratorio X",
        esquemaDosis: "Dosis única anual",
        dosis: [{ orden: 1, etiqueta: "Dosis única anual", diasDesdeAnterior: null }],
      },
      {
        denominacion: "Hepatitis B",
        laboratorio: "Laboratorio Y",
        esquemaDosis: "3 dosis — 0, 1 y 6 meses",
        dosis: [
          { orden: 1, etiqueta: "1ª dosis", diasDesdeAnterior: null },
          { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: 30 },
          { orden: 3, etiqueta: "3ª dosis", diasDesdeAnterior: 150 },
        ],
      },
      {
        denominacion: "Triple viral",
        laboratorio: "Laboratorio Z",
        esquemaDosis: "2 dosis + refuerzo",
        dosis: [
          { orden: 1, etiqueta: "1ª dosis", diasDesdeAnterior: null },
          { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: 180 },
          { orden: 3, etiqueta: "Refuerzo", diasDesdeAnterior: 365 },
        ],
      },
    ];
    for (const e of ejemplos) {
      await db.vacuna.create({
        data: {
          denominacion: e.denominacion,
          laboratorio: e.laboratorio,
          esquemaDosis: e.esquemaDosis,
          dosis: { create: e.dosis },
        },
      });
    }
  }
  console.log("Listo.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
