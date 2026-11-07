import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  armarReportePagos,
  fechaEnArgentina,
  formatearPeriodo,
  inicioDiaArgentina,
  normalizarFiltrosReportePagos,
  rangoReporteDefecto,
  reportePagosACsv,
  reportePagosAPdf,
  type PagoReporte,
} from "@/lib/reporte-pagos";

const pago = (p: Partial<PagoReporte>): PagoReporte => ({
  fecha: "2026-11-05",
  medio: "EFECTIVO",
  coberturaEntidad: null,
  importeCentavos: 1_000_000,
  estado: "ACTIVO",
  profesionalId: "d1",
  profesionalNombre: "Dr. Carlos Méndez",
  especialidadLabel: "Traumatología",
  ...p,
});

const RANGO = { desde: "2026-11-01", hasta: "2026-11-14" };

// Los cuatro renglones del wireframe wf_reporte_pagos.html.
const PAGOS_WIREFRAME: PagoReporte[] = [
  pago({ medio: "EFECTIVO", coberturaEntidad: null, importeCentavos: 9_600_000 }),
  pago({
    medio: "TRANSFERENCIA",
    coberturaEntidad: "IOMA",
    importeCentavos: 8_400_000,
    profesionalId: "d2",
    profesionalNombre: "Dra. Laura Fernández",
    especialidadLabel: "Clínica médica",
  }),
  pago({ medio: "EFECTIVO", coberturaEntidad: "OSDE", importeCentavos: 6_000_000 }),
  pago({ medio: "TRANSFERENCIA", coberturaEntidad: null, importeCentavos: 3_600_000, estado: "ANULADO" }),
];

describe("US-47 — Reporte de pagos", () => {
  it("totaliza por período, medio y obra social, y el total no incluye los anulados", () => {
    const r = armarReportePagos(PAGOS_WIREFRAME, RANGO);
    assert.equal(r.detalle.length, 4);
    assert.equal(r.totalCentavos, 24_000_000); // $ 240.000
    assert.equal(r.cantidadVigentes, 3);
    assert.equal(r.cantidadAnulados, 1);
  });

  it("muestra los pagos anulados identificados, sin sumarlos", () => {
    const r = armarReportePagos(PAGOS_WIREFRAME, RANGO);
    const anulado = r.detalle.find((f) => f.estado === "ANULADO");
    assert.ok(anulado);
    assert.equal(anulado.importeCentavos, 3_600_000);
    assert.equal(anulado.obraSocial, "Particular");
    const sumaVigentes = r.detalle.filter((f) => f.estado === "ACTIVO").reduce((a, f) => a + f.importeCentavos, 0);
    assert.equal(sumaVigentes, r.totalCentavos);
  });

  it("distingue consultas particulares de consultas con cobertura", () => {
    const r = armarReportePagos(PAGOS_WIREFRAME, RANGO);
    assert.equal(r.totalParticularesCentavos, 9_600_000);
    assert.equal(r.totalConCoberturaCentavos, 14_400_000);
    assert.equal(r.totalParticularesCentavos + r.totalConCoberturaCentavos, r.totalCentavos);
    const obras = r.detalle.map((f) => f.obraSocial).sort();
    assert.deepEqual(obras, ["IOMA", "OSDE", "Particular", "Particular"]);
  });

  it("totaliza por medio de pago (efectivo y transferencia)", () => {
    const r = armarReportePagos(PAGOS_WIREFRAME, RANGO);
    assert.deepEqual(r.porMedio, [
      { medio: "EFECTIVO", importeCentavos: 15_600_000 },
      { medio: "TRANSFERENCIA", importeCentavos: 8_400_000 },
    ]);
  });

  it("agrupa en una misma fila los pagos de igual período, medio, obra social y estado", () => {
    const r = armarReportePagos(
      [pago({ importeCentavos: 100_000 }), pago({ importeCentavos: 250_000, fecha: "2026-11-09" })],
      RANGO
    );
    assert.equal(r.detalle.length, 1);
    assert.equal(r.detalle[0].importeCentavos, 350_000);
    assert.equal(r.detalle[0].cantidad, 2);
  });

  it("el período de cada fila es el tramo del mes que cae dentro del rango pedido", () => {
    const r = armarReportePagos(
      [pago({ fecha: "2026-10-20" }), pago({ fecha: "2026-11-05" })],
      { desde: "2026-10-15", hasta: "2026-11-14" }
    );
    assert.deepEqual(
      r.detalle.map((f) => formatearPeriodo(f.periodoDesde, f.periodoHasta)),
      ["15/10/2026 – 31/10/2026", "01/11/2026 – 14/11/2026"]
    );
  });

  it("desglosa por profesional y especialidad, del que más recaudó al que menos (sin anulados)", () => {
    const r = armarReportePagos(PAGOS_WIREFRAME, RANGO);
    assert.deepEqual(r.porProfesional, [
      { profesionalNombre: "Dr. Carlos Méndez", especialidadLabel: "Traumatología", importeCentavos: 15_600_000 },
      { profesionalNombre: "Dra. Laura Fernández", especialidadLabel: "Clínica médica", importeCentavos: 8_400_000 },
    ]);
  });

  it("sin pagos el reporte queda en cero", () => {
    const r = armarReportePagos([], RANGO);
    assert.equal(r.totalCentavos, 0);
    assert.deepEqual(r.detalle, []);
    assert.deepEqual(r.porProfesional, []);
  });
});

describe("US-47 — Filtros del reporte", () => {
  it("por defecto cubre lo que va del mes en curso", () => {
    assert.deepEqual(rangoReporteDefecto("2026-11-07"), { desde: "2026-11-01", hasta: "2026-11-07" });
    const f = normalizarFiltrosReportePagos({}, "2026-11-07");
    assert.equal(f.desde, "2026-11-01");
    assert.equal(f.hasta, "2026-11-07");
    assert.equal(f.error, null);
  });

  it("informa un rango invertido o con fechas inválidas", () => {
    assert.ok(normalizarFiltrosReportePagos({ desde: "2026-11-10", hasta: "2026-11-01" }, "2026-11-07").error);
    assert.ok(normalizarFiltrosReportePagos({ desde: "2026-13-01", hasta: "2026-11-01" }, "2026-11-07").error);
  });

  it("ignora un medio de pago que no existe y conserva los demás filtros", () => {
    const f = normalizarFiltrosReportePagos(
      { medio: "TARJETA", obraSocial: " IOMA ", profesionalId: "d1" },
      "2026-11-07"
    );
    assert.equal(f.medio, "");
    assert.equal(f.obraSocial, "IOMA");
    assert.equal(f.profesionalId, "d1");
    assert.equal(normalizarFiltrosReportePagos({ medio: "TRANSFERENCIA" }, "2026-11-07").medio, "TRANSFERENCIA");
  });

  it("interpreta el período en hora de Argentina (UTC−3)", () => {
    assert.equal(inicioDiaArgentina("2026-11-07").toISOString(), "2026-11-07T03:00:00.000Z");
    // 01:30 UTC del 8/11 todavía es el 7/11 en Argentina.
    assert.equal(fechaEnArgentina(new Date("2026-11-08T01:30:00Z")), "2026-11-07");
    assert.equal(fechaEnArgentina(new Date("2026-11-08T03:00:00Z")), "2026-11-08");
  });
});

describe("US-47 — Exportación (RF-REP-06)", () => {
  const reporte = armarReportePagos(PAGOS_WIREFRAME, RANGO);

  it("el CSV lleva BOM, el detalle, el total sin anulados y el desglose", () => {
    const csv = reportePagosACsv(reporte, RANGO);
    assert.ok(csv.startsWith("﻿"));
    assert.match(csv, /Período;Medio de pago;Obra social;Cantidad;Importe;Estado/);
    assert.match(csv, /Total del período \(sin anulados\);;;;240000,00;/);
    assert.match(csv, /01\/11\/2026 – 14\/11\/2026;Transferencia;Particular;1;36000,00;Anulado/);
    assert.match(csv, /Dr\. Carlos Méndez;Traumatología;156000,00/);
  });

  it("el CSV entrecomilla las celdas con separadores", () => {
    const csv = reportePagosACsv(
      armarReportePagos([pago({ coberturaEntidad: 'Obra "Sur"; Plus' })], RANGO),
      RANGO
    );
    assert.ok(csv.includes('"Obra ""Sur""; Plus"'));
  });

  it("el PDF se genera con el total del período", () => {
    const pdf = Buffer.from(reportePagosAPdf(reporte, RANGO)).toString("latin1");
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.ok(pdf.includes("Total del período: $ 240.000"));
    assert.ok(pdf.includes("Anulado"));
  });
});
