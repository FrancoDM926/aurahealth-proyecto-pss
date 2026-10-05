import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isPastDate,
  LIMITES_JORNADAS_DEFAULT,
  minutosSobrantes,
  opcionesHoraFin,
  opcionesHoraInicio,
  todayInArgentina,
  validarLimitesJornadas,
  validateMonthlyJornadasRN02,
} from "../src/lib/availability-rn02";

const fechas = (...dias: number[]) =>
  dias.map((d) => ({ date: `2026-10-${String(d).padStart(2, "0")}` }));

describe("US-06 — fechas pasadas", () => {
  it("una fecha anterior a hoy es pasada; hoy y después, no", () => {
    assert.equal(isPastDate("2026-10-04", "2026-10-05"), true);
    assert.equal(isPastDate("2026-10-05", "2026-10-05"), false);
    assert.equal(isPastDate("2026-10-06", "2026-10-05"), false);
  });

  it("'hoy' se calcula en la hora de Argentina, no la del servidor", () => {
    // 6/10 01:00 UTC todavía es 5/10 a las 22:00 en Argentina.
    assert.equal(todayInArgentina(new Date("2026-10-06T01:00:00Z")), "2026-10-05");
    assert.equal(todayInArgentina(new Date("2026-10-06T03:00:00Z")), "2026-10-06");
  });
});

describe("US-06 — horarios de la franja", () => {
  it("el fin solo ofrece horarios posteriores al inicio: no hay franjas al revés", () => {
    const fines = opcionesHoraFin("14:00");
    assert.equal(fines[0], "14:30", "el primer fin posible deja un turno completo");
    assert.ok(fines.every((h) => h > "14:00"));
    assert.ok(!fines.includes("13:00"));
  });

  it("todo inicio ofrecido tiene al menos un fin posible", () => {
    for (const inicio of opcionesHoraInicio()) {
      assert.ok(opcionesHoraFin(inicio).length > 0, `sin fin posible para ${inicio}`);
    }
  });

  it("los minutos que no llegan a un turno se informan como sobrante (US-08)", () => {
    assert.equal(minutosSobrantes("08:00", "12:45"), 15);
    assert.equal(minutosSobrantes("08:00", "13:00"), 0);
  });
});

describe("US-06 — límites de jornadas configurables (RN-02)", () => {
  it("los valores iniciales son 2 y 7", () => {
    assert.deepEqual(LIMITES_JORNADAS_DEFAULT, { min: 2, max: 7 });
  });

  it("valida los límites que carga el administrador", () => {
    assert.equal(validarLimitesJornadas({ min: 2, max: 7 }), null);
    assert.equal(validarLimitesJornadas({ min: 3, max: 3 }), null);
    assert.ok(validarLimitesJornadas({ min: 5, max: 3 }));
    assert.ok(validarLimitesJornadas({ min: 0, max: 7 }));
    assert.ok(validarLimitesJornadas({ min: 2, max: 8 }));
    assert.ok(validarLimitesJornadas({ min: 2.5, max: 7 }));
  });

  it("aplica el mínimo configurado en lugar de 2", () => {
    // Octubre 2026: la semana del 5 al 11 tiene 5 días hábiles.
    const dos = fechas(5, 6);
    assert.equal(
      validateMonthlyJornadasRN02(dos, 2026, 10, { min: 2, max: 7 }).weeks.find(
        (w) => w.weekKey === "2026-10-05"
      )?.valid,
      true
    );
    const conTres = validateMonthlyJornadasRN02(dos, 2026, 10, { min: 3, max: 7 });
    const semana = conTres.weeks.find((w) => w.weekKey === "2026-10-05");
    assert.equal(semana?.valid, false);
    assert.equal(semana?.errorType, "too_few");
    assert.ok(conTres.blockingMessages.some((m) => m.includes("al menos 3")));
  });

  it("aplica el máximo configurado en lugar de 7", () => {
    const cuatro = fechas(5, 6, 7, 8);
    const res = validateMonthlyJornadasRN02(cuatro, 2026, 10, { min: 2, max: 3 });
    const semana = res.weeks.find((w) => w.weekKey === "2026-10-05");
    assert.equal(semana?.errorType, "too_many");
    assert.ok(res.blockingMessages.some((m) => m.includes("máximo permitido es 3")));
  });

  it("informa todas las semanas que incumplen, no solo la primera", () => {
    // Solo la semana del 5/10 tiene jornadas: las del 12, 19 y 26 quedan cortas.
    const res = validateMonthlyJornadasRN02(fechas(5, 6), 2026, 10);
    assert.equal(res.isValid, false);
    assert.ok(res.blockingMessages.length >= 3);
  });
});
