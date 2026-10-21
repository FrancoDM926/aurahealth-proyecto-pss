import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buscarDuplicadaActiva,
  claveVacuna,
  esVacunaAsignable,
  normalizarTexto,
  validarVacuna,
} from "../src/lib/vacunas";
import { horaActualArgentina, isPastTime } from "../src/lib/availability-rn02";

describe("validarVacuna (US-24)", () => {
  it("acepta denominación, laboratorio y esquema y los normaliza", () => {
    const r = validarVacuna({
      denominacion: "  Anti   gripal ",
      laboratorio: " Laboratorio X",
      esquemaDosis: "Dosis única",
    });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.data, {
        denominacion: "Anti gripal",
        laboratorio: "Laboratorio X",
        esquemaDosis: "Dosis única",
      });
    }
  });

  it("exige los tres datos", () => {
    const r = validarVacuna({ denominacion: " ", laboratorio: "", esquemaDosis: undefined });
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.deepEqual(Object.keys(r.errors).sort(), [
        "denominacion",
        "esquemaDosis",
        "laboratorio",
      ]);
    }
  });

  it("rechaza textos demasiado largos", () => {
    const r = validarVacuna({
      denominacion: "a".repeat(81),
      laboratorio: "b",
      esquemaDosis: "c".repeat(201),
    });
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.ok(r.errors.denominacion);
      assert.ok(r.errors.esquemaDosis);
      assert.equal(r.errors.laboratorio, undefined);
    }
  });

  it("normalizarTexto ignora valores que no son texto", () => {
    assert.equal(normalizarTexto(undefined), "");
    assert.equal(normalizarTexto(42), "");
  });
});

describe("duplicados de vacunas activas (US-24)", () => {
  const catalogo = [
    { id: "1", denominacion: "Antigripal", laboratorio: "Laboratorio X", isActive: true },
    { id: "2", denominacion: "Hepatitis B", laboratorio: "Laboratorio Y", isActive: true },
    { id: "3", denominacion: "Fiebre amarilla", laboratorio: "Laboratorio Z", isActive: false },
  ];

  it("la clave no distingue mayúsculas, acentos ni espacios repetidos", () => {
    assert.equal(
      claveVacuna(" ANTIGRIPAL ", "laboratorio  x"),
      claveVacuna("Antigripal", "Laboratorio X")
    );
    assert.equal(claveVacuna("Fiebre amarílla", "Z"), claveVacuna("fiebre amarilla", "z"));
  });

  it("detecta la misma denominación y laboratorio entre las activas", () => {
    assert.equal(buscarDuplicadaActiva(catalogo, "antigripal", "LABORATORIO X")?.id, "1");
  });

  it("distingue el mismo nombre de otro laboratorio", () => {
    assert.equal(buscarDuplicadaActiva(catalogo, "Antigripal", "Laboratorio Y"), undefined);
  });

  it("una vacuna inactiva no cuenta como duplicada", () => {
    assert.equal(buscarDuplicadaActiva(catalogo, "Fiebre amarilla", "Laboratorio Z"), undefined);
  });

  it("al editar se ignora la propia vacuna", () => {
    assert.equal(buscarDuplicadaActiva(catalogo, "Antigripal", "Laboratorio X", "1"), undefined);
  });
});

describe("esVacunaAsignable (US-24)", () => {
  it("solo las activas se asignan a turnos nuevos", () => {
    assert.equal(esVacunaAsignable({ isActive: true }), true);
    assert.equal(esVacunaAsignable({ isActive: false }), false);
    assert.equal(esVacunaAsignable(null), false);
    assert.equal(esVacunaAsignable(undefined), false);
  });
});

describe("isPastTime (turnos del día de hoy)", () => {
  // 15:30 UTC = 12:30 en Argentina (UTC-3).
  const ahora = new Date("2026-10-21T15:30:00.000Z");

  it("calcula la hora de Argentina", () => {
    assert.equal(horaActualArgentina(ahora), "12:30");
  });

  it("un día anterior ya pasó y uno posterior no", () => {
    assert.equal(isPastTime("2026-10-20", "23:30", ahora), true);
    assert.equal(isPastTime("2026-10-22", "00:00", ahora), false);
  });

  it("hoy, los horarios hasta la hora actual ya pasaron", () => {
    assert.equal(isPastTime("2026-10-21", "08:00", ahora), true);
    assert.equal(isPastTime("2026-10-21", "12:30", ahora), true);
    assert.equal(isPastTime("2026-10-21", "13:00", ahora), false);
  });
});
