import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agruparEntradasPorFicha,
  contentDispositionAttachment,
  formatearFechaHoraEntrada,
  formatearTamanoArchivo,
  normalizarFiltrosHistorial,
  ordenarEntradasDesc,
  puedeAccederFicha,
  puedeDescargarAdjunto,
  puedeSubirAdjunto,
  rangoInstantesArgentina,
  sanitizarNombreArchivo,
  validarAdjunto,
  validarMaxAdjuntoMB,
} from "@/lib/historial";
import { generarHistorialPdf } from "@/lib/historial-pdf";
import type { EntradaHistorial } from "@/services/historial/consultas";

const HOY = "2026-11-08";

describe("US-40 — filtros de la ficha consolidada", () => {
  it("normaliza espacios y acepta una especialidad válida", () => {
    const filtros = normalizarFiltrosHistorial(
      {
        paciente: "  García  ",
        patientKey: " USER:p1 ",
        profesionalId: " doc-1 ",
        especialidad: "TRAUMATOLOGIA",
        desde: "2026-10-01",
        hasta: "2026-11-08",
      },
      HOY
    );
    assert.equal(filtros.paciente, "García");
    assert.equal(filtros.patientKey, "USER:p1");
    assert.equal(filtros.profesionalId, "doc-1");
    assert.equal(filtros.especialidad, "TRAUMATOLOGIA");
    assert.equal(filtros.error, null);
  });

  it("descarta una especialidad desconocida sin romper la búsqueda", () => {
    const filtros = normalizarFiltrosHistorial({ especialidad: "CARDIOLOGIA" }, HOY);
    assert.equal(filtros.especialidad, "");
    assert.equal(filtros.error, null);
  });

  it("rechaza fechas inválidas, invertidas o futuras", () => {
    assert.equal(
      normalizarFiltrosHistorial({ desde: "2026-02-30" }, HOY).error,
      "Ingresá una fecha «desde» válida."
    );
    assert.equal(
      normalizarFiltrosHistorial({ desde: "2026-11-10", hasta: "2026-11-01" }, HOY).error,
      "La fecha «desde» no puede ser posterior a «hasta»."
    );
    assert.equal(
      normalizarFiltrosHistorial({ desde: "2026-11-09" }, HOY).error,
      "La fecha «desde» no puede ser futura."
    );
  });

  it("convierte el rango de días de la sala al huso UTC−3", () => {
    const rango = rangoInstantesArgentina("2026-11-01", "2026-11-08");
    assert.ok(rango);
    assert.equal(rango.gte.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(rango.lte.toISOString(), "2026-11-09T02:59:59.999Z");
    assert.equal(rangoInstantesArgentina("", ""), null);
  });
});

describe("US-40 / US-41 — orden cronológico inverso", () => {
  const entradas = [
    { id: "a", fichaId: "f1", firmadoEn: new Date("2026-10-12T13:00:00Z") },
    { id: "b", fichaId: "f1", firmadoEn: new Date("2026-11-14T13:35:00Z") },
    { id: "c", fichaId: "f2", firmadoEn: new Date("2026-11-02T12:00:00Z") },
  ];

  it("agrupa por ficha y ordena cada ficha y los grupos por entrada más reciente", () => {
    const grupos = agruparEntradasPorFicha(entradas);
    assert.deepEqual(
      grupos.map((g) => g.fichaId),
      ["f1", "f2"]
    );
    assert.deepEqual(
      grupos[0].entradas.map((e) => e.id),
      ["b", "a"]
    );
  });

  it("ordena todas las entradas en un único orden inverso para US-41", () => {
    assert.deepEqual(
      ordenarEntradasDesc(entradas).map((e) => e.id),
      ["b", "c", "a"]
    );
    assert.deepEqual(
      entradas.map((e) => e.id),
      ["a", "b", "c"],
      "no muta el arreglo original"
    );
  });

  it("formatea fecha y hora en la hora de la sala", () => {
    assert.equal(
      formatearFechaHoraEntrada(new Date("2026-11-14T13:35:00Z")),
      "14/11/2026 10:35"
    );
  });
});

describe("US-62 — validación de adjuntos", () => {
  it("acepta un PDF dentro del máximo", () => {
    const resultado = validarAdjunto({
      nombreArchivo: "informe guardia.pdf",
      tipoMime: "application/pdf",
      tamanoBytes: 600 * 1024,
      maxMB: 10,
    });
    assert.ok(resultado.ok);
    assert.equal(resultado.ok && resultado.tipo, "PDF");
  });

  it("acepta imágenes y detecta el tipo por MIME, no por extensión", () => {
    const resultado = validarAdjunto({
      nombreArchivo: "foto.jpg",
      tipoMime: "image/jpeg",
      tamanoBytes: 1800 * 1024,
      maxMB: 10,
    });
    assert.ok(resultado.ok);
    assert.equal(resultado.ok && resultado.tipo, "Imagen");
  });

  it("rechaza archivos vacíos, sin nombre o de tipo no admitido", () => {
    assert.equal(
      validarAdjunto({ nombreArchivo: "", tipoMime: "application/pdf", tamanoBytes: 10, maxMB: 10 }).ok,
      false
    );
    assert.equal(
      validarAdjunto({ nombreArchivo: "a.pdf", tipoMime: "application/pdf", tamanoBytes: 0, maxMB: 10 }).ok,
      false
    );
    assert.equal(
      validarAdjunto({ nombreArchivo: "a.exe", tipoMime: "application/x-msdownload", tamanoBytes: 10, maxMB: 10 }).ok,
      false
    );
  });

  it("aplica el máximo configurado y devuelve el mensaje del wireframe", () => {
    const resultado = validarAdjunto({
      nombreArchivo: "grande.pdf",
      tipoMime: "application/pdf",
      tamanoBytes: 11 * 1024 * 1024,
      maxMB: 10,
    });
    assert.deepEqual(resultado, {
      ok: false,
      error: "El archivo supera el tamaño máximo permitido (10 MB).",
    });
  });

  it("valida el rango del tamaño máximo configurable", () => {
    assert.equal(validarMaxAdjuntoMB(10), null);
    assert.ok(validarMaxAdjuntoMB(0));
    assert.ok(validarMaxAdjuntoMB(26));
    assert.ok(validarMaxAdjuntoMB(2.5));
  });

  it("formatea tamaños con coma decimal", () => {
    assert.equal(formatearTamanoArchivo(512), "512 B");
    assert.equal(formatearTamanoArchivo(655 * 1024), "655,0 KB");
    assert.equal(formatearTamanoArchivo(Math.round(1.8 * 1024 * 1024)), "1,8 MB");
  });

  it("prepara un nombre de descarga seguro y con UTF-8", () => {
    assert.equal(sanitizarNombreArchivo("../../etc/passwd"), "..-..-etc-passwd");
    const cabecera = contentDispositionAttachment("informe ñandú.pdf");
    assert.match(cabecera, /filename="informe nandu.pdf"/);
    assert.match(cabecera, /filename\*=UTF-8''informe%20%C3%B1and%C3%BA.pdf/);
  });
});

describe("RNF-03 — permisos del historial", () => {
  it("un médico ve cualquier ficha; el paciente solo la propia", () => {
    assert.equal(puedeAccederFicha({ role: "MEDICO", actorId: "m1", patientKey: "USER:p1" }), true);
    assert.equal(puedeAccederFicha({ role: "USUARIO", actorId: "p1", patientKey: "USER:p1" }), true);
    assert.equal(puedeAccederFicha({ role: "USUARIO", actorId: "p2", patientKey: "USER:p1" }), false);
    assert.equal(puedeAccederFicha({ role: "ADMINISTRATIVO", actorId: "a1", patientKey: "USER:p1" }), false);
    assert.equal(puedeAccederFicha({ role: "USUARIO", actorId: "p1", patientKey: "PERSONA:p1" }), false);
  });

  it("solo el médico autor de la ficha sube estudios", () => {
    assert.equal(puedeSubirAdjunto({ role: "MEDICO", actorId: "m1", fichaMedicoId: "m1" }), true);
    assert.equal(puedeSubirAdjunto({ role: "MEDICO", actorId: "m2", fichaMedicoId: "m1" }), false);
    assert.equal(puedeSubirAdjunto({ role: "USUARIO", actorId: "m1", fichaMedicoId: "m1" }), false);
  });

  it("la descarga sigue la misma regla que la consulta de la ficha", () => {
    assert.equal(puedeDescargarAdjunto({ role: "MEDICO", actorId: "m2", patientKey: "USER:p1" }), true);
    assert.equal(puedeDescargarAdjunto({ role: "USUARIO", actorId: "p1", patientKey: "USER:p1" }), true);
    assert.equal(puedeDescargarAdjunto({ role: "USUARIO", actorId: "p2", patientKey: "USER:p1" }), false);
  });
});

describe("US-41 — PDF del historial", () => {
  const entrada: EntradaHistorial = {
    id: "e1",
    fichaId: "f1",
    medicoId: "m1",
    medicoNombre: "Dr. Carlos Méndez",
    especialidadLabel: "Traumatología",
    diagnostico: "Esguince de tobillo",
    tratamiento: "Inmovilización 10 días",
    observaciones: "Control en una semana",
    firmadoEn: new Date("2026-11-14T13:35:00Z"),
    firmadoEnTexto: "14/11/2026 10:35",
    editadaEn: new Date("2026-11-14T13:40:00Z"),
    editadaEnTexto: "14/11/2026 10:40",
    firmadoPorNombre: "Dr. Carlos Méndez",
    adjuntos: [],
  };

  const visible = (pdf: Uint8Array) =>
    Buffer.from(pdf)
      .toString("latin1")
      .replace(/\\([()\\])/g, "$1");

  it("incluye paciente, autor, diagnóstico y tratamiento", () => {
    const pdf = generarHistorialPdf({
      pacienteNombre: "María García",
      pacienteDocumento: "30.123.456",
      emitidoEn: "08/11/2026 18:00",
      entradas: [entrada],
    });
    const texto = visible(pdf);
    assert.ok(texto.startsWith("%PDF-1.4"));
    assert.ok(texto.includes("María García"));
    assert.ok(texto.includes("Dr. Carlos Méndez"));
    assert.ok(texto.includes("Esguince de tobillo"));
    assert.ok(texto.includes("Inmovilización 10 días"));
    assert.ok(texto.includes("Última edición"));
  });

  it("informa cuando no hay entradas", () => {
    const pdf = generarHistorialPdf({
      pacienteNombre: "María García",
      pacienteDocumento: "30.123.456",
      emitidoEn: "08/11/2026 18:00",
      entradas: [],
    });
    assert.ok(visible(pdf).includes("Todavía no hay entradas clínicas registradas."));
  });
});
