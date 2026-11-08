import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { describirEsquema, dosisPorDefecto, validarEsquemaDosis } from "../src/lib/vacunas";

describe("validarEsquemaDosis (US-24 ampliada)", () => {
  it("normaliza el orden y deja la primera dosis sin intervalo", () => {
    const r = validarEsquemaDosis([
      { etiqueta: " 1ª  dosis ", diasDesdeAnterior: 99 },
      { etiqueta: "2ª dosis", diasDesdeAnterior: 30 },
      { etiqueta: "Refuerzo", diasDesdeAnterior: null },
    ]);
    assert.ok(r.ok);
    assert.deepEqual(r.dosis, [
      { orden: 1, etiqueta: "1ª dosis", diasDesdeAnterior: null },
      { orden: 2, etiqueta: "2ª dosis", diasDesdeAnterior: 30 },
      { orden: 3, etiqueta: "Refuerzo", diasDesdeAnterior: null },
    ]);
  });

  it("rechaza lista vacía, más de 10 dosis, etiquetas vacías o repetidas e intervalos inválidos", () => {
    assert.equal(validarEsquemaDosis([]).ok, false);
    assert.equal(validarEsquemaDosis(undefined).ok, false);
    const once = Array.from({ length: 11 }, (_, i) => ({ etiqueta: `D${i}` }));
    assert.equal(validarEsquemaDosis(once).ok, false);

    const vacia = validarEsquemaDosis([{ etiqueta: "  " }]);
    assert.ok(!vacia.ok && vacia.errors.filas[0]);

    const repetida = validarEsquemaDosis([{ etiqueta: "Dosis" }, { etiqueta: "dosis" }]);
    assert.ok(!repetida.ok && repetida.errors.filas[1]);

    for (const dias of [0, -1, 1.5, 4000]) {
      const r = validarEsquemaDosis([{ etiqueta: "A" }, { etiqueta: "B", diasDesdeAnterior: dias }]);
      assert.ok(!r.ok && r.errors.filas[1], `días ${dias}`);
    }
  });

  it("el esquema por defecto es una dosis única válida", () => {
    assert.ok(validarEsquemaDosis(dosisPorDefecto()).ok);
  });

  it("describe el esquema en meses o, si no se puede, con los nombres", () => {
    assert.equal(
      describirEsquema([
        { etiqueta: "1ª" },
        { etiqueta: "2ª", diasDesdeAnterior: 30 },
        { etiqueta: "3ª", diasDesdeAnterior: 150 },
      ]),
      "3 dosis — 0, 1 y 6 meses"
    );
    assert.equal(
      describirEsquema([{ etiqueta: "1ª" }, { etiqueta: "Refuerzo", diasDesdeAnterior: 21 }]),
      "2 dosis: 1ª, Refuerzo"
    );
    assert.equal(describirEsquema([{ etiqueta: "Dosis única" }]), "Dosis única");
  });
});
