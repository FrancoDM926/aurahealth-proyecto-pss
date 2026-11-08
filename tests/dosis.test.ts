import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluarAplicacion,
  evaluarEsquema,
  fechaMinimaDosis,
  validarMotivoAnulacion,
  type DosisEsquema,
} from "../src/lib/dosis";
import { anularAplicacion, registrarDosis, type DbCliente } from "../src/services/vacunacion/dosis";

const HEPATITIS_B: DosisEsquema[] = [
  { orden: 1, etiqueta: "1ª dosis", diasDesdeAnterior: null },
  { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: 30 },
  { orden: 3, etiqueta: "3ª dosis", diasDesdeAnterior: 150 },
];
const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-11-14T13:35:00Z");

describe("evaluarAplicacion (US-29)", () => {
  it("la primera dosis de una persona sin aplicaciones es válida y sin avisos", () => {
    const r = evaluarAplicacion({ esquema: HEPATITIS_B, dosisOrden: 1, aplicacionesActivas: [], ahora: AHORA });
    assert.deepEqual(r, { error: null, advertencias: [] });
  });

  it("rechaza una dosis fuera del esquema", () => {
    const r = evaluarAplicacion({ esquema: HEPATITIS_B, dosisOrden: 9, aplicacionesActivas: [], ahora: AHORA });
    assert.ok(r.error);
  });

  it("rechaza repetir una dosis ACTIVA; tras anularla (ya no está en la lista) se puede", () => {
    const activa = [{ dosisOrden: 1, aplicadaAt: new Date(AHORA.getTime() - 40 * DIA) }];
    assert.match(
      evaluarAplicacion({ esquema: HEPATITIS_B, dosisOrden: 1, aplicacionesActivas: activa, ahora: AHORA }).error ?? "",
      /ya está registrada/
    );
    assert.equal(
      evaluarAplicacion({ esquema: HEPATITIS_B, dosisOrden: 1, aplicacionesActivas: [], ahora: AHORA }).error,
      null
    );
  });

  it("advierte, sin bloquear, si se saltea una dosis o no se cumplió el intervalo", () => {
    const salteada = evaluarAplicacion({ esquema: HEPATITIS_B, dosisOrden: 3, aplicacionesActivas: [], ahora: AHORA });
    assert.equal(salteada.error, null);
    assert.match(salteada.advertencias.join(" "), /1ª dosis, 2ª dosis/);

    const temprano = evaluarAplicacion({
      esquema: HEPATITIS_B,
      dosisOrden: 2,
      aplicacionesActivas: [{ dosisOrden: 1, aplicadaAt: new Date(AHORA.getTime() - 10 * DIA) }],
      ahora: AHORA,
    });
    assert.equal(temprano.error, null);
    assert.match(temprano.advertencias.join(" "), /corresponde a partir del/);

    const enTermino = evaluarAplicacion({
      esquema: HEPATITIS_B,
      dosisOrden: 2,
      aplicacionesActivas: [{ dosisOrden: 1, aplicadaAt: new Date(AHORA.getTime() - 31 * DIA) }],
      ahora: AHORA,
    });
    assert.deepEqual(enTermino.advertencias, []);
  });
});

describe("validarMotivoAnulacion (US-29)", () => {
  it("el motivo es obligatorio y tiene tope", () => {
    assert.ok(validarMotivoAnulacion(""));
    assert.ok(validarMotivoAnulacion("   "));
    assert.ok(validarMotivoAnulacion(null));
    assert.ok(validarMotivoAnulacion("x".repeat(301)));
    assert.equal(validarMotivoAnulacion("Se registró en la persona equivocada"), null);
  });
});

describe("evaluarEsquema / fechaMinimaDosis (US-57)", () => {
  it("completo cuando todas las dosis tienen una aplicación activa", () => {
    const r = evaluarEsquema(
      HEPATITIS_B,
      HEPATITIS_B.map((d) => ({ dosisOrden: d.orden, aplicadaAt: AHORA }))
    );
    assert.deepEqual(r, { estado: "COMPLETO" });
  });

  it("incompleto indica la próxima dosis y desde cuándo corresponde", () => {
    const primera = new Date("2026-11-14T13:00:00Z");
    const r = evaluarEsquema(HEPATITIS_B, [{ dosisOrden: 1, aplicadaAt: primera }]);
    assert.ok(r.estado === "INCOMPLETO");
    assert.equal(r.proxima.orden, 2);
    assert.deepEqual(r.faltantes.map((d) => d.orden), [2, 3]);
    assert.equal(r.proximaDesde?.toISOString().slice(0, 10), "2026-12-14");
  });

  it("sin intervalo definido o sin dosis previa no hay fecha mínima", () => {
    assert.equal(fechaMinimaDosis({ orden: 2, etiqueta: "2ª", diasDesdeAnterior: null }, AHORA), null);
    assert.equal(fechaMinimaDosis(HEPATITIS_B[1], undefined), null);
  });

  it("una vacuna de dosis única aplicada está completa; sin aplicaciones está incompleta", () => {
    const unica: DosisEsquema[] = [{ orden: 1, etiqueta: "Dosis única", diasDesdeAnterior: null }];
    assert.equal(evaluarEsquema(unica, [{ dosisOrden: 1, aplicadaAt: AHORA }]).estado, "COMPLETO");
    assert.equal(evaluarEsquema(unica, []).estado, "INCOMPLETO");
  });
});

// Base de datos simulada con las restricciones que garantiza la migración.
function fakeDb(opts: { turno?: Record<string, unknown>; aplicaciones?: Record<string, unknown>[] } = {}) {
  const turno = opts.turno ? { ...opts.turno } : null;
  const aplicaciones: Record<string, unknown>[] = [...(opts.aplicaciones ?? [])];
  const db = {
    user: { findUnique: async () => ({ id: "u1", isActive: true, firstName: "María", lastName: "García", docNumber: "30123456" }) },
    personaAtendida: { findUnique: async () => ({ id: "p1", firstName: "Joaquín", lastName: "García", docNumber: "55123456" }) },
    vacuna: {
      findUnique: async () => ({
        id: "v1",
        isActive: true,
        denominacion: "Hepatitis B",
        laboratorio: "Lab Y",
        dosis: HEPATITIS_B,
      }),
    },
    turnoVacunacion: {
      findUnique: async () => (turno ? { ...turno } : null),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (turno && turno.id === where.id && turno.status === where.status) {
          Object.assign(turno, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    aplicacionDosis: {
      findMany: async () => aplicaciones.filter((a) => a.estado === "ACTIVA"),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const fila = { id: `a${aplicaciones.length + 1}`, estado: "ACTIVA", ...data };
        aplicaciones.push(fila);
        return { id: fila.id };
      },
      updateMany: async ({ where, data }: { where: { id: string; estado: string }; data: Record<string, unknown> }) => {
        const fila = aplicaciones.find((a) => a.id === where.id && a.estado === where.estado);
        if (!fila) return { count: 0 };
        Object.assign(fila, data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as DbCliente, turno, aplicaciones };
}

const ENFERMERA = { id: "enf1", nombre: "Rosa Díaz" };

describe("registrarDosis (US-29)", () => {
  it("guarda paciente, vacuna, dosis y la enfermera de la sesión; sin lote ni stock", async () => {
    const { db, aplicaciones } = fakeDb();
    const r = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1 },
      db
    );
    assert.ok(r.success);
    const a = aplicaciones[0];
    assert.equal(a.pacienteUserId, "u1");
    assert.equal(a.personaAtendidaId, null);
    assert.equal(a.pacienteNombre, "María García");
    assert.equal(a.vacunaNombre, "Hepatitis B — Lab Y");
    assert.equal(a.dosisOrden, 1);
    assert.equal(a.dosisEtiqueta, "1ª dosis");
    assert.equal(a.enfermeraId, "enf1");
    assert.equal(a.enfermeraNombre, "Rosa Díaz");
    assert.equal("lote" in a, false);
  });

  it("vinculada a un turno: lo marca CUMPLIDO", async () => {
    const { db, turno, aplicaciones } = fakeDb({
      turno: { id: "t1", status: "RESERVADO", reservedById: "u1", personaAtendidaId: null, vacunaId: "v1" },
    });
    const r = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1, turnoId: "t1" },
      db
    );
    assert.ok(r.success);
    assert.equal(aplicaciones[0].turnoVacunacionId, "t1");
    assert.equal(turno?.status, "CUMPLIDO");
  });

  it("rechaza un turno de otra persona o de otra vacuna", async () => {
    const ajeno = fakeDb({ turno: { id: "t1", status: "RESERVADO", reservedById: "otro", personaAtendidaId: null, vacunaId: "v1" } });
    const r1 = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1, turnoId: "t1" },
      ajeno.db
    );
    assert.ok(!r1.success);
    assert.equal(ajeno.aplicaciones.length, 0);

    const otraVacuna = fakeDb({ turno: { id: "t1", status: "RESERVADO", reservedById: "u1", personaAtendidaId: null, vacunaId: "otra" } });
    const r2 = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1, turnoId: "t1" },
      otraVacuna.db
    );
    assert.ok(!r2.success && /otra vacuna/.test(r2.message));
  });

  it("una persona atendida queda vinculada por personaAtendidaId", async () => {
    const { db, aplicaciones } = fakeDb();
    const r = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "PERSONA", id: "p1" }, vacunaId: "v1", dosisOrden: 1 },
      db
    );
    assert.ok(r.success);
    assert.equal(aplicaciones[0].pacienteUserId, null);
    assert.equal(aplicaciones[0].personaAtendidaId, "p1");
  });

  it("no permite repetir la misma dosis activa y devuelve las advertencias clínicas", async () => {
    const previa = { id: "a0", estado: "ACTIVA", dosisOrden: 1, aplicadaAt: new Date() };
    const { db } = fakeDb({ aplicaciones: [previa] });
    const repetida = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1 },
      db
    );
    assert.ok(!repetida.success);

    const temprano = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 2 },
      db
    );
    assert.ok(temprano.success && temprano.advertencias.length > 0);
  });
});

describe("anularAplicacion (US-29)", () => {
  it("anula con motivo, deja quién y cuándo, no elimina y permite registrar de nuevo", async () => {
    const { db, aplicaciones } = fakeDb();
    const alta = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1 },
      db
    );
    assert.ok(alta.success);
    const id = alta.success ? alta.aplicacionId : "";

    const sinMotivo = await anularAplicacion({ id, motivo: " ", anuladaPor: ENFERMERA }, db);
    assert.ok(!sinMotivo.success);

    const ok = await anularAplicacion({ id, motivo: "Persona equivocada", anuladaPor: ENFERMERA }, db);
    assert.ok(ok.success);
    assert.equal(aplicaciones.length, 1, "el registro no se elimina");
    assert.equal(aplicaciones[0].estado, "ANULADA");
    assert.equal(aplicaciones[0].anuladaMotivo, "Persona equivocada");
    assert.equal(aplicaciones[0].anuladaPorNombre, "Rosa Díaz");
    assert.ok(aplicaciones[0].anuladaAt instanceof Date);

    const doble = await anularAplicacion({ id, motivo: "otra vez", anuladaPor: ENFERMERA }, db);
    assert.ok(!doble.success);

    const reRegistro = await registrarDosis(
      { enfermera: ENFERMERA, paciente: { tipo: "USER", id: "u1" }, vacunaId: "v1", dosisOrden: 1 },
      db
    );
    assert.ok(reRegistro.success);
  });
});
