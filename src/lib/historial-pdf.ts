/**
 * US-41 — Historial clínico en PDF.
 *
 * Genera el documento descargable con las entradas de todas las fichas del
 * paciente, en el mismo orden que la pantalla y sin notas internas.
 */

import { crearPdf, type PdfBloque } from "@/lib/pdf";
import type { EntradaHistorial } from "@/services/historial/consultas";

export type DatosPdfHistorial = {
  pacienteNombre: string;
  pacienteDocumento: string;
  emitidoEn: string;
  entradas: EntradaHistorial[];
};

export const HISTORIAL_SIN_ENTRADAS = "Todavía no hay entradas clínicas registradas.";

export function generarHistorialPdf(datos: DatosPdfHistorial): Uint8Array {
  const bloques: PdfBloque[] = [
    { tipo: "texto", texto: "AuraHealth", size: 20, bold: true },
    { tipo: "texto", texto: "Historial clínico", size: 16, bold: true },
    {
      tipo: "texto",
      texto: `${datos.pacienteNombre} — ${datos.pacienteDocumento}`,
      size: 11,
    },
    { tipo: "texto", texto: `Emitido el ${datos.emitidoEn}`, size: 10 },
    { tipo: "espacio", alto: 10 },
    { tipo: "linea" },
  ];

  if (datos.entradas.length === 0) {
    bloques.push({ tipo: "texto", texto: HISTORIAL_SIN_ENTRADAS, size: 11 });
  }

  for (const entrada of datos.entradas) {
    bloques.push(
      {
        tipo: "texto",
        texto: `${entrada.firmadoEnTexto} — ${entrada.medicoNombre} (${entrada.especialidadLabel})`,
        size: 11,
        bold: true,
      },
      { tipo: "texto", texto: `Diagnóstico: ${entrada.diagnostico}`, size: 11 },
      { tipo: "texto", texto: `Tratamiento: ${entrada.tratamiento}`, size: 11 }
    );
    if (entrada.observaciones) {
      bloques.push({ tipo: "texto", texto: `Observaciones: ${entrada.observaciones}`, size: 11 });
    }
    bloques.push(
      { tipo: "texto", texto: `Última edición: ${entrada.editadaEnTexto}`, size: 9 },
      { tipo: "espacio", alto: 4 },
      { tipo: "linea" }
    );
  }

  bloques.push(
    { tipo: "espacio", alto: 8 },
    {
      tipo: "texto",
      texto: "Documento informativo. Solo lectura: no modifica el historial clínico.",
      size: 9,
    }
  );

  return crearPdf(bloques);
}
