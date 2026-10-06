import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  agruparPorDia,
  esFechaValida,
  etiquetaPeriodo,
  filasHorario,
  huecosLibres,
  inicioDeSemana,
  moverPeriodo,
  pasaFiltro,
  rangoDeVista,
  resumenDelDia,
  type TurnoAgenda,
} from "../src/lib/agenda-profesional";

const t = (
  startTime: string,
  endTime: string,
  status: TurnoAgenda["status"],
  date = "2026-10-05"
): TurnoAgenda => ({ id: `${date}-${startTime}`, date, startTime, endTime, status });

describe("US-11 — períodos de las tres vistas", () => {
  it("la semana va de lunes a domingo (05 al 11 de octubre de 2026, como el wireframe)", () => {
    assert.deepEqual(rangoDeVista("semana", "2026-10-08"), {
      desde: "2026-10-05",
      hasta: "2026-10-11",
    });
    assert.equal(inicioDeSemana("2026-10-11"), "2026-10-05");
    assert.equal(etiquetaPeriodo("semana", "2026-10-08"), "05 al 11 de octubre de 2026");
  });

  it("la semana que cruza de mes nombra los dos meses", () => {
    assert.equal(etiquetaPeriodo("semana", "2026-10-30"), "26 de octubre al 01 de noviembre de 2026");
  });

  it("el mes va del 1 al último día, incluido febrero bisiesto", () => {
    assert.deepEqual(rangoDeVista("mes", "2026-10-15"), { desde: "2026-10-01", hasta: "2026-10-31" });
    assert.deepEqual(rangoDeVista("mes", "2028-02-10"), { desde: "2028-02-01", hasta: "2028-02-29" });
    assert.equal(etiquetaPeriodo("mes", "2026-10-15"), "octubre 2026");
  });

  it("los textos del período coinciden con el selector «Vista» del wireframe", () => {
    assert.equal(etiquetaPeriodo("dia", "2026-10-05"), "05 de octubre de 2026");
    assert.equal(etiquetaPeriodo("mes", "2026-10-05"), "octubre 2026");
  });

  it("navega entre períodos sin saltear ninguno", () => {
    assert.equal(moverPeriodo("dia", "2026-10-31", 1), "2026-11-01");
    assert.equal(moverPeriodo("semana", "2026-10-05", -1), "2026-09-28");
    assert.equal(moverPeriodo("mes", "2026-01-31", 1), "2026-02-01");
    assert.equal(moverPeriodo("mes", "2026-01-15", -1), "2025-12-01");
  });

  it("rechaza fechas inexistentes o mal escritas", () => {
    assert.equal(esFechaValida("2026-02-31"), false);
    assert.equal(esFechaValida("05/10/2026"), false);
    assert.equal(esFechaValida("2026-10-05"), true);
  });
});

describe("US-11 — vista diaria", () => {
  it("ordena los turnos cronológicamente y los agrupa por día", () => {
    const g = agruparPorDia([
      t("09:00", "09:30", "DISPONIBLE"),
      t("08:00", "08:30", "RESERVADO"),
      t("08:00", "08:30", "DISPONIBLE", "2026-10-06"),
    ]);
    assert.deepEqual([...g.keys()], ["2026-10-05", "2026-10-06"]);
    assert.deepEqual(g.get("2026-10-05")!.map((x) => x.startTime), ["08:00", "09:00"]);
  });

  it("identifica los huecos libres: turnos libres consecutivos", () => {
    assert.deepEqual(
      huecosLibres([
        t("08:00", "08:30", "DISPONIBLE"),
        t("08:30", "09:00", "DISPONIBLE"),
        t("09:00", "09:30", "RESERVADO"),
        t("09:30", "10:00", "DISPONIBLE"),
      ]),
      [
        { startTime: "08:00", endTime: "09:00", turnos: 2 },
        { startTime: "09:30", endTime: "10:00", turnos: 1 },
      ]
    );
  });

  it("un salto de horario corta el hueco", () => {
    assert.equal(
      huecosLibres([t("08:00", "08:30", "DISPONIBLE"), t("14:00", "14:30", "DISPONIBLE")]).length,
      2
    );
  });

  it("resume los estados del día", () => {
    const r = resumenDelDia([
      t("08:00", "08:30", "DISPONIBLE"),
      t("08:30", "09:00", "RESERVADO"),
      t("09:00", "09:30", "CANCELADO"),
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.DISPONIBLE, 1);
    assert.equal(r.RESERVADO, 1);
    assert.equal(r.CANCELADO, 1);
  });
});

describe("US-11 — grilla semanal", () => {
  it("las filas van de 30 en 30 sin saltear horarios, para que se vean los huecos", () => {
    assert.deepEqual(
      filasHorario([t("08:00", "08:30", "DISPONIBLE"), t("09:30", "10:00", "RESERVADO", "2026-10-06")]),
      ["08:00", "08:30", "09:00", "09:30"]
    );
    assert.deepEqual(filasHorario([]), []);
  });
});

describe("US-11 — filtro «Mostrar»", () => {
  it("filtra libres y reservados", () => {
    assert.equal(pasaFiltro(t("08:00", "08:30", "DISPONIBLE"), "libres"), true);
    assert.equal(pasaFiltro(t("08:00", "08:30", "RESERVADO"), "libres"), false);
    assert.equal(pasaFiltro(t("08:00", "08:30", "RESERVADO"), "reservados"), true);
    assert.equal(pasaFiltro(t("08:00", "08:30", "CUMPLIDO"), "todos"), true);
  });
});
