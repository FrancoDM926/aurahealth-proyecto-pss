import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITE_ACCESOS_AUDITORIA,
  RESULTADO_ACCESO_LABELS,
  RESULTADOS_ACCESO_HISTORIAL,
  TIPO_ACCESO_HISTORIAL_LABELS,
  TIPOS_ACCESO_HISTORIAL,
  normalizarFiltrosAuditoriaHistorial,
  rangoInstantesAuditoria,
  tonoResultadoAcceso,
} from "@/lib/auditoria-historial";

describe("US-44 — filtros de auditoría", () => {
  it("normaliza espacios y acepta los filtros del wireframe", () => {
    const filtros = normalizarFiltrosAuditoriaHistorial({
      usuarioId: " user-1 ",
      paciente: "  García  ",
      desde: "2026-11-01",
      hasta: "2026-11-14",
      tipo: "HISTORIAL_PACIENTE",
      resultado: "RECHAZADO",
    });

    assert.deepEqual(filtros, {
      usuarioId: "user-1",
      paciente: "García",
      desde: "2026-11-01",
      hasta: "2026-11-14",
      tipo: "HISTORIAL_PACIENTE",
      resultado: "RECHAZADO",
      error: null,
    });
  });

  it("sin filtros devuelve el log completo y no arma rango de fechas", () => {
    const filtros = normalizarFiltrosAuditoriaHistorial({});

    assert.equal(filtros.usuarioId, "");
    assert.equal(filtros.paciente, "");
    assert.equal(filtros.tipo, "");
    assert.equal(filtros.resultado, "");
    assert.equal(filtros.error, null);
    assert.equal(rangoInstantesAuditoria(filtros.desde, filtros.hasta), null);
  });

  it("descarta tipo y resultado desconocidos sin romper la búsqueda", () => {
    const filtros = normalizarFiltrosAuditoriaHistorial({
      tipo: "OTRO",
      resultado: "TAL_VEZ",
    });

    assert.equal(filtros.tipo, "");
    assert.equal(filtros.resultado, "");
    assert.equal(filtros.error, null);
  });

  it("rechaza fechas inválidas o invertidas", () => {
    assert.equal(
      normalizarFiltrosAuditoriaHistorial({ desde: "2026-02-30" }).error,
      "Ingresá una fecha «desde» válida."
    );
    assert.equal(
      normalizarFiltrosAuditoriaHistorial({ hasta: "14/11/2026" }).error,
      "Ingresá una fecha «hasta» válida."
    );
    assert.equal(
      normalizarFiltrosAuditoriaHistorial({ desde: "2026-11-14", hasta: "2026-11-01" }).error,
      "La fecha «desde» no puede ser posterior a «hasta»."
    );
  });

  it("acepta un rango abierto (solo desde o solo hasta)", () => {
    assert.equal(normalizarFiltrosAuditoriaHistorial({ desde: "2026-11-01" }).error, null);
    assert.equal(normalizarFiltrosAuditoriaHistorial({ hasta: "2026-11-14" }).error, null);
  });
});

describe("US-44 — rango de fechas en hora de Argentina", () => {
  it("incluye el día completo de «hasta»", () => {
    const rango = rangoInstantesAuditoria("2026-11-01", "2026-11-14");

    assert.ok(rango);
    assert.equal(rango.gte?.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(rango.lt?.toISOString(), "2026-11-15T03:00:00.000Z");
  });

  it("acepta rangos abiertos y no filtra si ambos están vacíos", () => {
    const soloDesde = rangoInstantesAuditoria("2026-11-01", "");
    assert.equal(soloDesde?.gte?.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(soloDesde?.lt, undefined);

    const soloHasta = rangoInstantesAuditoria("", "2026-11-14");
    assert.equal(soloHasta?.gte, undefined);
    assert.equal(soloHasta?.lt?.toISOString(), "2026-11-15T03:00:00.000Z");

    assert.equal(rangoInstantesAuditoria("", ""), null);
  });
});

describe("US-44 — etiquetas y resultado", () => {
  it("traduce todos los tipos y resultados del log", () => {
    for (const tipo of TIPOS_ACCESO_HISTORIAL) {
      assert.ok(TIPO_ACCESO_HISTORIAL_LABELS[tipo], `falta la etiqueta de ${tipo}`);
    }
    for (const resultado of RESULTADOS_ACCESO_HISTORIAL) {
      assert.ok(RESULTADO_ACCESO_LABELS[resultado], `falta la etiqueta de ${resultado}`);
    }
    assert.deepEqual(RESULTADOS_ACCESO_HISTORIAL, ["EXITOSO", "RECHAZADO"]);
  });

  it("marca los rechazados en rojo y los exitosos en verde", () => {
    assert.equal(tonoResultadoAcceso("EXITOSO"), "ok");
    assert.equal(tonoResultadoAcceso("RECHAZADO"), "error");
  });

  it("limita el listado a 500 accesos", () => {
    assert.equal(LIMITE_ACCESOS_AUDITORIA, 500);
  });
});
