import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { armarCarnet, generarCarnetPdf, type AplicacionCarnet } from "../src/lib/carnet";
import type { DosisEsquema } from "../src/lib/dosis";
import { obtenerDatosCarnet, type DbCliente } from "../src/services/vacunacion/carnet";

const HEPATITIS_B: DosisEsquema[] = [
  { orden: 1, etiqueta: "1ª dosis", diasDesdeAnterior: null },
  { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: 30 },
];
const ANTIGRIPAL: DosisEsquema[] = [{ orden: 1, etiqueta: "Dosis única anual", diasDesdeAnterior: null }];
const esquemas = new Map([
  ["hb", HEPATITIS_B],
  ["ag", ANTIGRIPAL],
]);

const app = (vacunaId: string, vacunaNombre: string, dosisOrden: number, dosisEtiqueta: string, iso: string): AplicacionCarnet => ({
  vacunaId,
  vacunaNombre,
  dosisOrden,
  dosisEtiqueta,
  aplicadaAt: new Date(iso),
});

const AHORA = new Date("2026-11-20T15:00:00Z");

describe("armarCarnet (US-57)", () => {
  const aplicaciones = [
    app("hb", "Hepatitis B — Lab Y", 1, "1ª dosis", "2026-11-14T13:35:00Z"),
    app("ag", "Antigripal — Lab X", 1, "Dosis única anual", "2026-05-05T12:00:00Z"),
  ];

  it("lista vacuna, dosis y fecha, de la más reciente a la más antigua", () => {
    const c = armarCarnet(aplicaciones, esquemas, AHORA);
    assert.deepEqual(c.filas, [
      { vacuna: "Hepatitis B", dosis: "1ª dosis", fecha: "14/11/2026" },
      { vacuna: "Antigripal", dosis: "Dosis única anual", fecha: "05/05/2026" },
    ]);
  });

  it("indica el esquema incompleto con la fecha desde la que corresponde la próxima dosis", () => {
    const c = armarCarnet(aplicaciones, esquemas, AHORA);
    assert.equal(c.incompleto, true);
    const hb = c.esquemas.find((e) => e.vacunaId === "hb")!;
    assert.equal(hb.completo, false);
    assert.equal(hb.aviso, "Esquema incompleto: la 2ª dosis de Hepatitis B corresponde a partir del 14/12/2026.");
    assert.equal(c.esquemas.find((e) => e.vacunaId === "ag")!.completo, true);
  });

  it("pasada la fecha mínima o sin intervalo, avisa que falta la dosis", () => {
    const tarde = armarCarnet(aplicaciones, esquemas, new Date("2027-01-10T12:00:00Z"));
    assert.equal(tarde.esquemas.find((e) => e.vacunaId === "hb")!.aviso, "Esquema incompleto: falta la 2ª dosis de Hepatitis B.");

    const sinIntervalo = new Map([["hb", [HEPATITIS_B[0], { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: null }]]]);
    const c = armarCarnet([aplicaciones[0]], sinIntervalo, AHORA);
    assert.equal(c.esquemas[0].aviso, "Esquema incompleto: falta la 2ª dosis de Hepatitis B.");
  });

  it("esquema completo cuando están todas las dosis", () => {
    const c = armarCarnet(
      [...aplicaciones, app("hb", "Hepatitis B — Lab Y", 2, "2ª dosis", "2026-11-18T10:00:00Z")],
      esquemas,
      AHORA
    );
    assert.equal(c.incompleto, false);
  });

  it("sin aplicaciones el carnet está vacío y no es incompleto", () => {
    assert.deepEqual(armarCarnet([], esquemas, AHORA), { filas: [], esquemas: [], incompleto: false });
  });
});

describe("generarCarnetPdf (US-57)", () => {
  it("genera un PDF descargable con las vacunas y el aviso de esquema incompleto", () => {
    const carnet = armarCarnet(
      [app("hb", "Hepatitis B — Lab Y", 1, "1ª dosis", "2026-11-14T13:35:00Z")],
      esquemas,
      AHORA
    );
    const pdf = generarCarnetPdf({
      salaNombre: "Sala Médica AuraHealth",
      pacienteNombre: "María García",
      pacienteDocumento: "30.123.456",
      emitidoEn: "20/11/2026 12:00",
      carnet,
    });
    const texto = Buffer.from(pdf).toString("latin1");
    assert.ok(texto.startsWith("%PDF-"));
    assert.match(texto, /Carnet de vacunaci/);
    assert.match(texto, /Hepatitis B/);
    assert.match(texto, /Esquema incompleto/);
    assert.match(texto, /registradas en la sala/);
  });

  it("un carnet vacío también genera un PDF válido", () => {
    const pdf = generarCarnetPdf({
      salaNombre: "Sala",
      pacienteNombre: "Ana",
      pacienteDocumento: null,
      emitidoEn: "hoy",
      carnet: { filas: [], esquemas: [], incompleto: false },
    });
    assert.ok(Buffer.from(pdf).toString("latin1").startsWith("%PDF-"));
  });
});

describe("obtenerDatosCarnet (US-57)", () => {
  const usuario = { id: "u1", firstName: "María", lastName: "García", docNumber: "30123456" };
  const fila = {
    vacunaId: "hb",
    vacunaNombre: "Hepatitis B — Lab Y",
    dosisOrden: 1,
    dosisEtiqueta: "1ª dosis",
    aplicadaAt: new Date("2026-11-14T13:35:00Z"),
  };

  function fakeDb(personaDelUsuario: boolean) {
    const consultas: Record<string, unknown>[] = [];
    const db = {
      personaAtendida: {
        findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
          personaDelUsuario && where.userId === "u1"
            ? { id: where.id, firstName: "Joaquín", lastName: "García", docNumber: "55123456" }
            : null,
      },
      aplicacionDosis: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          consultas.push(where);
          return [fila];
        },
      },
      vacunaDosis: {
        findMany: async () => HEPATITIS_B.map((d) => ({ ...d, vacunaId: "hb" })),
      },
    };
    return { db: db as unknown as DbCliente, consultas };
  }

  it("el carnet propio consulta solo aplicaciones ACTIVAS del usuario", async () => {
    const { db, consultas } = fakeDb(true);
    const datos = await obtenerDatosCarnet(usuario, null, db);
    assert.equal(datos?.pacienteNombre, "María García");
    assert.deepEqual(consultas[0], { pacienteUserId: "u1", estado: "ACTIVA" });
    assert.equal(datos?.carnet.filas.length, 1);
  });

  it("el carnet de una persona atendida del usuario filtra por esa persona", async () => {
    const { db, consultas } = fakeDb(true);
    const datos = await obtenerDatosCarnet(usuario, "p1", db);
    assert.equal(datos?.pacienteNombre, "Joaquín García");
    assert.deepEqual(consultas[0], { personaAtendidaId: "p1", estado: "ACTIVA" });
  });

  it("una persona que no es del usuario devuelve null, sin consultar aplicaciones", async () => {
    const { db, consultas } = fakeDb(false);
    assert.equal(await obtenerDatosCarnet(usuario, "ajena", db), null);
    assert.equal(consultas.length, 0);
  });
});
