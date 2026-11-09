import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  esHorarioDeGrilla,
  isPastDate,
  LIMITES_JORNADAS_DEFAULT,
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

  it("los horarios van de 30 en 30: no existen 15 ni 45", () => {
    const todos = [...opcionesHoraInicio(), ...opcionesHoraFin("08:00")];
    assert.ok(todos.every((h) => h.endsWith(":00") || h.endsWith(":30")));
    assert.ok(!todos.includes("08:15"));
    assert.ok(!todos.includes("12:45"));
  });

  it("el servidor reconoce los horarios fuera de la grilla", () => {
    assert.equal(esHorarioDeGrilla("08:00"), true);
    assert.equal(esHorarioDeGrilla("08:30"), true);
    assert.equal(esHorarioDeGrilla("08:15"), false);
    assert.equal(esHorarioDeGrilla("12:45"), false);
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

  it("no tiene en cuenta las semanas que ya pasaron ni aquellas en las que quedan 2 días o menos", () => {
    // En noviembre de 2026:
    // - Semana del 02/11 al 08/11: si hoy es viernes 06/11, sábado 07/11 o lunes 16/11,
    //   esa primera semana ya pasó o le quedan 2 días o menos (sábado y domingo).
    // - Si el médico carga al menos 2 jornadas en las semanas restantes (09/11, 16/11, 23/11),
    //   la disponibilidad es válida sin exigir jornadas en la semana del 02/11.
    const jornadasNov = [
      { date: "2026-11-10" },
      { date: "2026-11-12" },
      { date: "2026-11-17" },
      { date: "2026-11-19" },
      { date: "2026-11-24" },
      { date: "2026-11-26" },
    ];

    // Caso 1: hoy es sábado 07/11 (quedan solo sábado y domingo en la primera semana)
    const enSabado = validateMonthlyJornadasRN02(
      jornadasNov,
      2026,
      11,
      LIMITES_JORNADAS_DEFAULT,
      "2026-11-07"
    );
    const primeraSemanaSab = enSabado.weeks.find((w) => w.weekKey === "2026-11-02");
    assert.equal(primeraSemanaSab?.applies, false);
    assert.equal(primeraSemanaSab?.valid, true);
    assert.equal(enSabado.isValid, true);

    // Caso 2: hoy es viernes 06/11 (solo queda 1 día hábil y sábado/domingo)
    const enViernes = validateMonthlyJornadasRN02(
      jornadasNov,
      2026,
      11,
      LIMITES_JORNADAS_DEFAULT,
      "2026-11-06"
    );
    assert.equal(enViernes.weeks.find((w) => w.weekKey === "2026-11-02")?.applies, false);
    assert.equal(enViernes.isValid, true);

    // Caso 3: hoy es lunes 16/11 (las semanas del 02/11 y del 09/11 ya pasaron)
    const enTerceraSemana = validateMonthlyJornadasRN02(
      [
        { date: "2026-11-17" },
        { date: "2026-11-19" },
        { date: "2026-11-24" },
        { date: "2026-11-26" },
      ],
      2026,
      11,
      LIMITES_JORNADAS_DEFAULT,
      "2026-11-16"
    );
    assert.equal(enTerceraSemana.weeks.find((w) => w.weekKey === "2026-11-02")?.applies, false);
    assert.equal(enTerceraSemana.weeks.find((w) => w.weekKey === "2026-11-09")?.applies, false);
    assert.equal(enTerceraSemana.isValid, true);
  });
});
