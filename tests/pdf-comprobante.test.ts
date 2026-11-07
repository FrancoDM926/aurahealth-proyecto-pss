import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crearPdf, type PdfBloque } from "@/lib/pdf";
import { filasComprobante, generarComprobantePdf } from "@/lib/comprobante-pdf";
import type { DatosComprobante } from "@/lib/pagos";

const COMPROBANTE: DatosComprobante = {
  numero: 123,
  salaNombre: "Sala Médica Privada",
  salaDireccion: "Consultorios Centrales AuraHealth",
  pacienteNombre: "María García",
  pacienteDocumento: "30.123.456",
  prestacion: "Consulta de Traumatología",
  profesionalNombre: "Dr. Carlos Méndez",
  fechaTurno: "2026-11-14",
  horaTurno: "10:30",
  importeCentavos: 1_260_000,
  precioSinCoberturaCentavos: 1_800_000,
  descuentoPorcentaje: 30,
  descuentoCentavos: 540_000,
  coberturaEntidad: "IOMA",
  medio: "TRANSFERENCIA",
  referencia: "OP-884213",
  registradoEn: "14/11/2026 10:50",
  registradoPorNombre: "Diego Pereyra",
};

const latin1 = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");
/** Contenido visible del PDF: sin el escape de paréntesis y barras del flujo. */
const visible = (pdf: Uint8Array) => latin1(pdf).replace(/\\([()\\])/g, "$1");

describe("Generador de PDF", () => {
  it("produce un PDF con cabecera, xref y fin de archivo", () => {
    const texto = latin1(crearPdf([{ tipo: "texto", texto: "Hola" }]));
    assert.ok(texto.startsWith("%PDF-1.4"));
    assert.ok(texto.trimEnd().endsWith("%%EOF"));
    assert.match(texto, /\/Type \/Catalog/);
    assert.match(texto, /\/BaseFont \/Helvetica-Bold/);
  });

  it("el xref apunta a los offsets reales de cada objeto", () => {
    const pdf = latin1(crearPdf([{ tipo: "texto", texto: "Hola" }, { tipo: "linea" }]));
    const inicioXref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    assert.equal(pdf.slice(inicioXref, inicioXref + 4), "xref");

    const entradas = [...pdf.slice(inicioXref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    assert.ok(entradas.length >= 6);
    entradas.forEach((offset, i) => {
      assert.ok(
        pdf.slice(offset).startsWith(`${i + 1} 0 obj`),
        `el offset del objeto ${i + 1} no apunta a «${i + 1} 0 obj»`
      );
    });
  });

  it("el largo declarado de cada contenido coincide con sus bytes", () => {
    const pdf = latin1(crearPdf([{ tipo: "texto", texto: "Número ñandú — (prueba)" }]));
    const m = /\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf);
    assert.ok(m);
    assert.equal(Number(m[1]), Buffer.byteLength(m[2], "latin1"));
  });

  it("codifica tildes, ñ y guiones largos en WinAnsi y escapa los paréntesis", () => {
    const pdf = crearPdf([{ tipo: "texto", texto: "Número ñ — (ok)" }]);
    const bytes = Buffer.from(pdf);
    assert.ok(bytes.includes(Buffer.from([0xfa])), "falta «ú» (0xFA)");
    assert.ok(bytes.includes(Buffer.from([0xf1])), "falta «ñ» (0xF1)");
    assert.ok(bytes.includes(Buffer.from([0x97])), "falta el guion largo (0x97)");
    assert.match(latin1(pdf), /\\\(ok\\\)/);
  });

  it("pagina sola cuando el contenido no entra en una hoja", () => {
    const bloques: PdfBloque[] = Array.from({ length: 120 }, (_, i) => ({
      tipo: "texto" as const,
      texto: `Línea ${i}`,
    }));
    const pdf = latin1(crearPdf(bloques));
    const paginas = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
    assert.ok(paginas >= 2, `se esperaban varias páginas y hay ${paginas}`);
    assert.equal([...pdf.matchAll(/\/Type \/Page /g)].length, paginas);
  });
});

describe("US-36 — PDF del comprobante", () => {
  it("incluye numeración, datos de la sala, paciente, prestación, profesional, importe y medio de pago", () => {
    const pdf = visible(generarComprobantePdf(COMPROBANTE));
    for (const esperado of [
      "Comprobante N.º 000123",
      "Sala Médica Privada",
      "Consultorios Centrales AuraHealth",
      "María García — 30.123.456".replace("—", "\x97"),
      "Consulta de Traumatología",
      "Dr. Carlos Méndez",
      "$ 12.600",
      "Transferencia (ref. OP-884213)",
    ]) {
      assert.ok(pdf.includes(esperado), `el comprobante no contiene «${esperado}»`);
    }
  });

  it("aclara que es un comprobante interno, sin valor fiscal", () => {
    const pdf = latin1(generarComprobantePdf(COMPROBANTE));
    assert.ok(pdf.includes("Documento interno de la sala: no reemplaza a una factura fiscal."));
  });

  it("muestra el desglose del descuento solo cuando hubo descuento", () => {
    const con = filasComprobante(COMPROBANTE).map((f) => f.dato);
    assert.ok(con.some((d) => d.startsWith("Descuento") && d.includes("IOMA") && d.includes("30%")));

    const sin = filasComprobante({
      ...COMPROBANTE,
      coberturaEntidad: null,
      descuentoPorcentaje: 0,
      descuentoCentavos: 0,
      importeCentavos: 1_800_000,
      medio: "EFECTIVO",
      referencia: null,
    });
    assert.ok(!sin.some((f) => f.dato.startsWith("Descuento")));
    assert.equal(sin.find((f) => f.dato === "Medio de pago")?.detalle, "Efectivo");
  });

  it("es determinístico: descargarlo de nuevo da el mismo documento", () => {
    assert.deepEqual(generarComprobantePdf(COMPROBANTE), generarComprobantePdf(COMPROBANTE));
  });
});
