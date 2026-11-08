import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  agruparTurnosVacunacionPorDia,
  filtrarTurnosVacunacion,
  motivoNoReservable,
  normalizarFiltrosVacunacion,
  validarDosisPrevista,
} from "../src/lib/turnos-vacunacion";
import {
  buildCancelacionVacunacionParams,
  buildConfirmacionVacunacionParams,
} from "../src/services/notificaciones/turno-vacunacion";
import {
  cancelarTurnoVacunacion,
  reservarTurnoVacunacion,
  type DbCliente,
} from "../src/services/vacunacion/turnos";
import { renderConfirmacionTurnoVacunatorio } from "../src/services/email/templates/turno-confirmacion";

const AHORA = { fecha: "2026-11-10", hora: "12:00" };
const t = (id: string, date: string, startTime: string, status = "DISPONIBLE") => ({
  id,
  date,
  startTime,
  endTime: startTime,
  status,
});

describe("búsqueda de turnos de vacunación (US-28)", () => {
  it("el rango por defecto son los próximos 30 días", () => {
    const f = normalizarFiltrosVacunacion({}, "2026-11-10");
    assert.equal(f.desde, "2026-11-10");
    assert.equal(f.hasta, "2026-12-10");
    assert.equal(f.esRangoPorDefecto, true);
    assert.equal(f.error, null);
  });

  it("valida el rango de fechas", () => {
    assert.ok(normalizarFiltrosVacunacion({ desde: "2026-12-01", hasta: "2026-11-01" }, "2026-11-10").error);
    assert.ok(normalizarFiltrosVacunacion({ desde: "xx" }, "2026-11-10").error);
  });

  it("solo ofrece turnos disponibles, futuros y dentro del rango, ordenados y agrupados por día", () => {
    const turnos = [
      t("a", "2026-11-12", "14:30"),
      t("b", "2026-11-12", "08:00"),
      t("c", "2026-11-10", "09:00"), // hoy, ya pasó
      t("d", "2026-11-10", "15:00"),
      t("e", "2026-11-13", "08:00", "RESERVADO"),
      t("f", "2027-01-01", "08:00"), // fuera de rango
    ];
    const disp = filtrarTurnosVacunacion(turnos, { desde: "2026-11-10", hasta: "2026-12-10" }, AHORA);
    assert.deepEqual(disp.map((x) => x.id), ["d", "b", "a"]);
    const grupos = agruparTurnosVacunacionPorDia(disp);
    assert.deepEqual(
      grupos.map((g) => [g.date, g.turnos.length]),
      [
        ["2026-11-10", 1],
        ["2026-11-12", 2],
      ]
    );
  });

  it("un rango invertido no devuelve turnos", () => {
    assert.deepEqual(
      filtrarTurnosVacunacion([t("a", "2026-11-12", "08:00")], { desde: "2026-12-01", hasta: "2026-11-01" }, AHORA),
      []
    );
  });
});

describe("reglas de reserva (US-28)", () => {
  it("una vacuna desactivada o un turno ya tomado no se pueden reservar", () => {
    const futuro = { status: "DISPONIBLE", date: "2026-11-20", startTime: "10:00" };
    assert.equal(motivoNoReservable(futuro, { isActive: true }, AHORA), null);
    assert.equal(motivoNoReservable(futuro, { isActive: false }, AHORA), "VACUNA_NO_ASIGNABLE");
    assert.equal(
      motivoNoReservable({ ...futuro, status: "RESERVADO" }, { isActive: true }, AHORA),
      "TURNO_NO_DISPONIBLE"
    );
    assert.equal(
      motivoNoReservable({ ...futuro, date: "2026-11-01" }, { isActive: true }, AHORA),
      "TURNO_NO_DISPONIBLE"
    );
    assert.equal(motivoNoReservable(null, { isActive: true }, AHORA), "TURNO_NO_DISPONIBLE");
  });

  it("la dosis prevista es opcional y debe pertenecer al esquema", () => {
    const dosis = [{ orden: 1 }, { orden: 2 }];
    assert.equal(validarDosisPrevista(dosis, null), null);
    assert.equal(validarDosisPrevista(dosis, 2), null);
    assert.ok(validarDosisPrevista(dosis, 3));
  });
});

// Base de datos simulada: el UPDATE condicional del turno es atómico, como en SQL.
function fakeDb(turnoInicial: Record<string, unknown>) {
  const turno = { ...turnoInicial } as Record<string, unknown>;
  const cancelaciones: unknown[] = [];
  const db = {
    user: { findUnique: async () => ({ id: "titular", isActive: true }) },
    vacuna: {
      findUnique: async () => ({
        id: "v1",
        isActive: true,
        denominacion: "Triple viral",
        laboratorio: "Lab X",
        dosis: [{ orden: 1 }, { orden: 2 }],
      }),
    },
    personaAtendida: {
      findFirst: async () => null,
      create: async () => ({ id: "p1", firstName: "Joaquín", lastName: "García" }),
    },
    turnoVacunacion: {
      findUnique: async () => ({ ...turno }),
      findFirst: async ({ where }: { where: { id: string; status: string; reservedById?: string } }) =>
        turno.id === where.id &&
        turno.status === where.status &&
        (where.reservedById === undefined || turno.reservedById === where.reservedById)
          ? {
              ...turno,
              reservedBy: { id: "titular", firstName: "María", lastName: "García", email: "m@x.com" },
              vacuna: { denominacion: "Triple viral", laboratorio: "Lab X" },
            }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (turno.id === where.id && turno.status === where.status) {
          Object.assign(turno, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    turnoVacunacionCancelacion: {
      create: async ({ data }: { data: unknown }) => cancelaciones.push(data),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as DbCliente, turno, cancelaciones };
}

const TURNO = {
  id: "t1",
  status: "DISPONIBLE",
  date: new Date("2099-01-05T00:00:00Z"),
  startTime: "10:00",
  endTime: "10:30",
  patientFirstName: null,
  patientLastName: null,
};

const PERSONA_VACIA = {
  firstName: "",
  lastName: "",
  docNumber: "",
  birthDate: "",
  healthInsuranceEntity: "",
  healthInsurancePlan: "",
  healthInsuranceNumber: "",
};

describe("reservarTurnoVacunacion (US-28, concurrencia RF-TUR-09)", () => {
  it("dos reservas simultáneas del mismo turno: solo una prospera", async () => {
    const { db, turno } = fakeDb(TURNO);
    const intento = () => reservarTurnoVacunacion({ turnoId: "t1", vacunaId: "v1", titularId: "titular" }, db);
    const [a, b] = await Promise.all([intento(), intento()]);
    assert.equal([a, b].filter((r) => r.success).length, 1);
    const fallo = [a, b].find((r) => !r.success);
    assert.ok(fallo && !fallo.success && fallo.code === "NO_DISPONIBLE");
    assert.equal(turno.status, "RESERVADO");
  });

  it("guarda vacuna, titular, quien lo otorgó (mostrador) y la persona atendida", async () => {
    const { db, turno } = fakeDb(TURNO);
    const r = await reservarTurnoVacunacion(
      {
        turnoId: "t1",
        vacunaId: "v1",
        dosisPrevistaOrden: 2,
        titularId: "titular",
        otorgadoPorId: "enfermera",
        paraOtraPersona: {
          nueva: {
            firstName: "Joaquín",
            lastName: "García",
            docNumber: "55.123.456",
            birthDate: "2015-03-02",
            healthInsuranceEntity: "OSDE",
            healthInsurancePlan: "310",
            healthInsuranceNumber: "123",
          },
        },
      },
      db
    );
    assert.ok(r.success);
    assert.equal(turno.vacunaId, "v1");
    assert.equal(turno.reservedById, "titular");
    assert.equal(turno.otorgadoPorId, "enfermera");
    assert.equal(turno.dosisPrevistaOrden, 2);
    assert.equal(turno.patientFirstName, "Joaquín");
  });

  it("no hay rechazo por stock ni por turnos médicos superpuestos", async () => {
    const { db } = fakeDb(TURNO);
    const r = await reservarTurnoVacunacion({ turnoId: "t1", vacunaId: "v1", titularId: "titular" }, db);
    assert.ok(r.success);
  });

  it("rechaza datos inválidos de la persona atendida sin tocar el turno", async () => {
    const { db, turno } = fakeDb(TURNO);
    const r = await reservarTurnoVacunacion(
      { turnoId: "t1", vacunaId: "v1", titularId: "titular", paraOtraPersona: { nueva: PERSONA_VACIA } },
      db
    );
    assert.ok(!r.success && r.code === "INVALIDO" && r.personaErrors?.firstName);
    assert.equal(turno.status, "DISPONIBLE");
  });

  it("rechaza una dosis que no está en el esquema", async () => {
    const { db } = fakeDb(TURNO);
    const r = await reservarTurnoVacunacion(
      { turnoId: "t1", vacunaId: "v1", titularId: "titular", dosisPrevistaOrden: 9 },
      db
    );
    assert.ok(!r.success && r.code === "INVALIDO");
  });
});

describe("cancelarTurnoVacunacion (US-16 para vacunación)", () => {
  it("libera el horario, deja constancia y devuelve el aviso para el titular", async () => {
    const { db, turno, cancelaciones } = fakeDb({
      ...TURNO,
      status: "RESERVADO",
      reservedById: "titular",
      vacunaId: "v1",
    });
    const r = await cancelarTurnoVacunacion(
      {
        turnoId: "t1",
        canceladoPorId: "titular",
        soloDelTitularId: "titular",
        validarPlazo: true,
        antelacionHoras: 24,
      },
      db
    );
    assert.ok(r.success);
    assert.equal(turno.status, "DISPONIBLE");
    assert.equal(turno.reservedById, null);
    assert.equal(cancelaciones.length, 1);
    assert.equal(r.success && r.aviso.reservador.email, "m@x.com");
  });

  it("fuera del plazo mínimo no se cancela", async () => {
    const ahora = new Date();
    const hoy = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
    const { db, turno } = fakeDb({
      ...TURNO,
      status: "RESERVADO",
      reservedById: "titular",
      date: hoy,
      startTime: "23:30",
    });
    const r = await cancelarTurnoVacunacion(
      { turnoId: "t1", canceladoPorId: "titular", validarPlazo: true, antelacionHoras: 24 * 365 },
      db
    );
    assert.ok(!r.success && r.code === "FUERA_DE_PLAZO");
    assert.equal(turno.status, "RESERVADO");
  });

  it("el mostrador puede cancelar sin plazo; un turno ajeno no se cancela como titular", async () => {
    const reservado = { ...TURNO, status: "RESERVADO", reservedById: "titular" };
    const a = fakeDb(reservado);
    assert.ok(
      (await cancelarTurnoVacunacion({ turnoId: "t1", canceladoPorId: "emp", validarPlazo: false }, a.db)).success
    );
    const b = fakeDb(reservado);
    const r = await cancelarTurnoVacunacion(
      { turnoId: "t1", canceladoPorId: "otro", soloDelTitularId: "otro", validarPlazo: false },
      b.db
    );
    assert.ok(!r.success && r.code === "NO_CANCELABLE");
    assert.equal(b.turno.status, "RESERVADO");
  });
});

describe("email del turno de vacunación (US-28 / US-64)", () => {
  it("indica de quién es el turno cuando es a nombre de otra persona y va al titular", () => {
    const params = buildConfirmacionVacunacionParams({
      destinatarioNombre: "María García",
      vacunaNombre: "Triple viral — Lab X",
      fecha: new Date("2026-11-24T00:00:00Z"),
      startTime: "14:00",
      salaDireccion: "Av. Siempreviva 742",
      aNombreDe: "Joaquín García",
    });
    assert.equal(params.pacienteNombre, "María García");
    assert.equal(params.fecha, "24/11/2026");
    assert.equal(params.aNombreDe, "Joaquín García");
    const mail = renderConfirmacionTurnoVacunatorio(params);
    assert.match(mail.html, /Joaquín García/);
    assert.match(mail.html, /Av\. Siempreviva 742/);
    assert.match(mail.text, /Mis turnos/);
  });

  it("sin persona atendida no agrega la fila «A nombre de»", () => {
    const params = buildConfirmacionVacunacionParams({
      destinatarioNombre: "María",
      fecha: new Date("2026-11-24T00:00:00Z"),
      startTime: "14:00",
      salaDireccion: "Sala",
    });
    assert.equal(params.aNombreDe, undefined);
    assert.doesNotMatch(renderConfirmacionTurnoVacunatorio(params).html, /A nombre de/);
  });

  it("arma los parámetros del aviso de cancelación", () => {
    const p = buildCancelacionVacunacionParams({
      reservador: { nombre: "María", email: "m@x.com" },
      vacunaNombre: "Triple viral",
      fecha: new Date("2026-11-24T00:00:00Z"),
      startTime: "14:00",
    });
    assert.deepEqual([p.pacienteNombre, p.fecha, p.hora], ["María", "24/11/2026", "14:00"]);
  });
});
