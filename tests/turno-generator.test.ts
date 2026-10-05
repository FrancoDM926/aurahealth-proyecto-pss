import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  splitFranjaIntoSlots,
  generateTurnosForFranja,
  generateTurnosFromFranjasList,
  filterTurnosForIdempotency,
  DURACION_TURNO_MINUTOS,
  calculateSobranteMinutos,
} from "../src/lib/turno-generator";

describe("US-08 — Generación automática de turnos de 30 minutos", () => {
  // CRITERIO 1: Al confirmarse la disponibilidad, el sistema genera un turno por cada intervalo consecutivo de 30 minutos dentro de la franja.
  test("Criterio 1: Divide una franja horaria en turnos consecutivos de 30 minutos", () => {
    // Franja de 08:00 a 13:00 (5 horas = 300 minutos = 10 turnos de 30 min)
    const slots = splitFranjaIntoSlots("08:00", "13:00");

    assert.equal(slots.length, 10, "Debe generar exactamente 10 intervalos");
    assert.deepEqual(slots[0], { startTime: "08:00", endTime: "08:30" });
    assert.deepEqual(slots[1], { startTime: "08:30", endTime: "09:00" });
    assert.deepEqual(slots[2], { startTime: "09:00", endTime: "09:30" });
    assert.deepEqual(slots[9], { startTime: "12:30", endTime: "13:00" });
  });

  // CRITERIO 2: La duración es fija para todas las consultas y todas las especialidades: no es configurable.
  test("Criterio 2: La duración es estrictamente fija en 30 minutos (RN-09)", () => {
    assert.equal(DURACION_TURNO_MINUTOS, 30);

    const turnos = generateTurnosForFranja({
      doctorId: "medico-123",
      date: "2026-09-02",
      startTime: "14:00",
      endTime: "16:00",
    });

    assert.equal(turnos.length, 4);
    for (const turno of turnos) {
      assert.equal(
        turno.duration,
        30,
        "Cada turno debe tener una duración fija de 30 minutos"
      );
    }
  });

  // CRITERIO 3: Un intervalo sobrante menor a 30 minutos no genera turno.
  test("Criterio 3: Un remanente menor a 30 minutos se descarta y no genera turno", () => {
    // 08:00 a 09:15 = 75 minutos
    // 08:00–08:30 (30 min) -> Turno 1
    // 08:30–09:00 (30 min) -> Turno 2
    // 09:00–09:15 (15 min < 30 min) -> NO genera turno
    const slots = splitFranjaIntoSlots("08:00", "09:15");
    assert.equal(slots.length, 2);
    assert.deepEqual(slots[0], { startTime: "08:00", endTime: "08:30" });
    assert.deepEqual(slots[1], { startTime: "08:30", endTime: "09:00" });

    const sobrante = calculateSobranteMinutos("08:00", "09:15");
    assert.equal(sobrante, 15, "El intervalo sobrante debe ser de 15 minutos");

    // Franja con duración total menor a 30 minutos (ej. 20 min) no genera ningún turno
    const slotsCortos = splitFranjaIntoSlots("08:00", "08:20");
    assert.equal(slotsCortos.length, 0, "No debe generar turno si la franja es menor a 30 minutos");
  });

  // CRITERIO 4: Cada turno generado queda en estado disponible, asociado al médico, la fecha y la hora.
  test("Criterio 4: Los turnos quedan en estado DISPONIBLE asociados al médico, fecha y hora", () => {
    const doctorId = "dr-carlos-mendez";
    const dateStr = "2026-09-02";

    const turnos = generateTurnosForFranja({
      doctorId,
      date: dateStr,
      startTime: "08:00",
      endTime: "09:00",
    });

    assert.equal(turnos.length, 2);

    assert.equal(turnos[0].status, "DISPONIBLE");
    assert.equal(turnos[0].doctorId, doctorId);
    assert.equal(turnos[0].startTime, "08:00");
    assert.equal(turnos[0].endTime, "08:30");
    assert.equal(turnos[0].date.toISOString().split("T")[0], "2026-09-02");

    assert.equal(turnos[1].status, "DISPONIBLE");
    assert.equal(turnos[1].doctorId, doctorId);
    assert.equal(turnos[1].startTime, "08:30");
    assert.equal(turnos[1].endTime, "09:00");
  });

  // CRITERIO 5: La generación es idempotente: reconfirmar la misma disponibilidad no duplica turnos.
  test("Criterio 5: Idempotencia: re-ejecutar la generación no duplica turnos existentes", () => {
    const franjas = [
      {
        doctorId: "dr-carlos-mendez",
        date: "2026-09-02",
        startTime: "08:00",
        endTime: "09:00",
      },
    ];

    // Primera ejecución
    const { turnos } = generateTurnosFromFranjasList(franjas);
    assert.equal(turnos.length, 2);

    const existingKeys = new Set<string>();
    const primeraVez = filterTurnosForIdempotency(turnos, existingKeys);
    assert.equal(primeraVez.toCreate.length, 2, "La primera vez se crean 2 turnos");
    assert.equal(primeraVez.existingCount, 0);

    // Segunda ejecución (reconfirmación de la misma disponibilidad)
    const reconfirmacion = filterTurnosForIdempotency(turnos, existingKeys);
    assert.equal(
      reconfirmacion.toCreate.length,
      0,
      "En la reconfirmación no se debe crear ningún turno duplicado"
    );
    assert.equal(
      reconfirmacion.existingCount,
      2,
      "Se detectan y preservan los 2 turnos ya existentes"
    );
  });

  // ESCENARIO DEL WIREFRAME: wf_agenda_generada.html (8 jornadas, 96 turnos a generar)
  test("Escenario Wireframe: 8 jornadas configuradas generan exactamente 96 turnos", () => {
    // 8 jornadas de 6 horas cada una (ej. 08:00 a 14:00 = 6h * 2 turnos/h = 12 turnos * 8 jornadas = 96 turnos)
    const jornadasWireframe = [
      { doctorId: "doc-1", date: "2026-09-02", startTime: "08:00", endTime: "14:00" },
      { doctorId: "doc-1", date: "2026-09-04", startTime: "08:00", endTime: "14:00" },
      { doctorId: "doc-1", date: "2026-09-09", startTime: "14:00", endTime: "20:00" },
      { doctorId: "doc-1", date: "2026-09-11", startTime: "08:00", endTime: "14:00" },
      { doctorId: "doc-1", date: "2026-09-16", startTime: "08:00", endTime: "14:00" },
      { doctorId: "doc-1", date: "2026-09-18", startTime: "14:00", endTime: "20:00" },
      { doctorId: "doc-1", date: "2026-09-23", startTime: "08:00", endTime: "14:00" },
      { doctorId: "doc-1", date: "2026-09-25", startTime: "08:00", endTime: "14:00" },
    ];

    const result = generateTurnosFromFranjasList(jornadasWireframe);

    assert.equal(result.summary.totalJornadas, 8, "Debe tener 8 jornadas configuradas");
    assert.equal(result.summary.totalTurnos, 96, "Debe generar exactamente 96 turnos");
  });

  test("Validación de errores: hora fin menor o igual a hora inicio", () => {
    assert.throws(
      () => splitFranjaIntoSlots("10:00", "09:00"),
      /debe ser posterior a la hora de inicio/
    );
    assert.throws(
      () => splitFranjaIntoSlots("10:00", "10:00"),
      /debe ser posterior a la hora de inicio/
    );
  });
});
