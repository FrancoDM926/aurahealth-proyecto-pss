/**
 * US-36: arma el PDF del comprobante interno de pago a partir de los datos que
 * se guardaron al registrar el cobro. Es siempre el mismo documento, por lo que
 * puede descargarse las veces que haga falta.
 */

import { formatearFechaAr } from "@/lib/busqueda-turnos";
import {
  AVISO_COMPROBANTE_INTERNO,
  MEDIO_PAGO_LABELS,
  formatearNumeroComprobante,
  formatearPesos,
  type DatosComprobante,
} from "@/lib/pagos";
import { crearPdf, type PdfBloque } from "@/lib/pdf";

/** Filas «dato / detalle» del comprobante, en el orden del wireframe. */
export function filasComprobante(d: DatosComprobante): { dato: string; detalle: string }[] {
  const filas: { dato: string; detalle: string }[] = [
    { dato: "Sala", detalle: d.salaNombre },
    { dato: "Dirección", detalle: d.salaDireccion },
    {
      dato: "Paciente",
      detalle: d.pacienteDocumento ? `${d.pacienteNombre} — ${d.pacienteDocumento}` : d.pacienteNombre,
    },
    { dato: "Prestación", detalle: `${d.prestacion} — ${d.profesionalNombre}` },
    { dato: "Fecha", detalle: `${formatearFechaAr(d.fechaTurno)} ${d.horaTurno}` },
    {
      dato: "Precio sin cobertura",
      detalle: formatearPesos(d.precioSinCoberturaCentavos),
    },
  ];
  if (d.descuentoCentavos > 0) {
    filas.push({
      dato: `Descuento${d.coberturaEntidad ? ` — ${d.coberturaEntidad}` : ""} (${d.descuentoPorcentaje}%)`,
      detalle: `− ${formatearPesos(d.descuentoCentavos)}`,
    });
  }
  filas.push(
    { dato: "Importe", detalle: formatearPesos(d.importeCentavos) },
    {
      dato: "Medio de pago",
      detalle: d.referencia
        ? `${MEDIO_PAGO_LABELS[d.medio]} (ref. ${d.referencia})`
        : MEDIO_PAGO_LABELS[d.medio],
    },
    { dato: "Registrado", detalle: `${d.registradoEn} por ${d.registradoPorNombre}` }
  );
  return filas;
}

export function generarComprobantePdf(d: DatosComprobante): Uint8Array {
  const bloques: PdfBloque[] = [
    { tipo: "texto", texto: "AuraHealth", size: 20, bold: true },
    { tipo: "texto", texto: d.salaNombre, size: 11 },
    { tipo: "espacio", alto: 14 },
    {
      tipo: "texto",
      texto: `Comprobante N.º ${formatearNumeroComprobante(d.numero)}`,
      size: 16,
      bold: true,
    },
    { tipo: "espacio", alto: 6 },
    { tipo: "linea" },
    { tipo: "fila", size: 10, bold: true, columnas: [{ texto: "DATO", x: 0 }, { texto: "DETALLE", x: 150 }] },
    { tipo: "linea" },
  ];

  for (const fila of filasComprobante(d)) {
    bloques.push({
      tipo: "fila",
      size: 11,
      columnas: [
        { texto: fila.dato, x: 0, ancho: 145 },
        { texto: fila.detalle, x: 150, ancho: 345 },
      ],
    });
    bloques.push({ tipo: "espacio", alto: 3 });
  }

  bloques.push(
    { tipo: "linea" },
    { tipo: "espacio", alto: 10 },
    { tipo: "texto", texto: AVISO_COMPROBANTE_INTERNO, size: 9 }
  );

  return crearPdf(bloques);
}
