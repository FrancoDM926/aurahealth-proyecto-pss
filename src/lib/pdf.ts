/**
 * Generador mínimo de PDF (A4, texto con Helvetica) para el comprobante de pago
 * (US-36) y la exportación de reportes (RF-REP-06). Evita sumar una dependencia
 * para documentos que son solo texto y tablas.
 *
 * Las fuentes Helvetica / Helvetica-Bold son estándar del formato PDF y se
 * declaran con codificación WinAnsi, por lo que tildes y «ñ» se ven bien sin
 * incrustar ninguna fuente.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const LINE_FACTOR = 1.35;

export type PdfBloque =
  | { tipo: "texto"; texto: string; size?: number; bold?: boolean }
  | { tipo: "fila"; columnas: PdfColumna[]; size?: number; bold?: boolean }
  | { tipo: "linea" }
  | { tipo: "espacio"; alto: number };

export type PdfColumna = {
  texto: string;
  /** Posición horizontal de la columna, en puntos desde el margen izquierdo. */
  x: number;
  /** Ancho máximo: el texto que no entra se corta con «…». */
  ancho?: number;
  /** Alinea el texto contra el borde derecho de [x, x + ancho]. */
  derecha?: boolean;
};

/** Caracteres fuera de Latin-1 que WinAnsi sí representa. */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "−": 0x2d,
};

/** Convierte un texto a la cadena «binaria» WinAnsi y escapa los delimitadores PDF. */
function codificar(texto: string): string {
  let salida = "";
  for (const ch of texto) {
    const code = ch.codePointAt(0) ?? 63;
    const byte = WIN_ANSI_EXTRA[ch] ?? (code >= 32 && code <= 255 ? code : 63);
    const c = String.fromCharCode(byte);
    salida += c === "(" || c === ")" || c === "\\" ? `\\${c}` : c;
  }
  return salida;
}

/** Ancho aproximado de un texto en Helvetica (0,5 em por carácter). */
function anchoAprox(texto: string, size: number, bold: boolean): number {
  return texto.length * size * (bold ? 0.54 : 0.5);
}

function recortar(texto: string, ancho: number, size: number, bold: boolean): string {
  if (anchoAprox(texto, size, bold) <= ancho) return texto;
  const maxChars = Math.max(1, Math.floor(ancho / (size * (bold ? 0.54 : 0.5))) - 1);
  return `${texto.slice(0, maxChars)}…`;
}

/** Parte un texto largo en líneas que entran en el ancho útil de la página. */
function envolver(texto: string, size: number, bold: boolean): string[] {
  const maxAncho = PAGE_WIDTH - MARGIN * 2;
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoAprox(candidata, size, bold) > maxAncho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length > 0 ? lineas : [""];
}

/** Arma el PDF con los bloques dados, fluyendo de arriba hacia abajo y paginando solo. */
export function crearPdf(bloques: PdfBloque[]): Uint8Array {
  const paginas: string[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;

  const nuevaPaginaSiHaceFalta = (alto: number) => {
    if (y - alto < MARGIN) {
      paginas.push([]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };
  const emitir = (op: string) => paginas[paginas.length - 1].push(op);
  const texto = (t: string, x: number, size: number, bold: boolean) =>
    emitir(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${codificar(t)}) Tj ET`
    );

  for (const bloque of bloques) {
    if (bloque.tipo === "espacio") {
      y -= bloque.alto;
    } else if (bloque.tipo === "linea") {
      nuevaPaginaSiHaceFalta(8);
      y -= 4;
      emitir(
        `0.78 0.8 0.83 RG 0.8 w ${MARGIN} ${y.toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`
      );
      y -= 4;
    } else if (bloque.tipo === "texto") {
      const size = bloque.size ?? 11;
      const bold = bloque.bold ?? false;
      for (const linea of envolver(bloque.texto, size, bold)) {
        nuevaPaginaSiHaceFalta(size * LINE_FACTOR);
        y -= size * LINE_FACTOR;
        texto(linea, MARGIN, size, bold);
      }
    } else {
      const size = bloque.size ?? 10;
      const bold = bloque.bold ?? false;
      nuevaPaginaSiHaceFalta(size * LINE_FACTOR);
      y -= size * LINE_FACTOR;
      for (const col of bloque.columnas) {
        const contenido = col.ancho ? recortar(col.texto, col.ancho, size, bold) : col.texto;
        const x =
          col.derecha && col.ancho
            ? MARGIN + col.x + col.ancho - anchoAprox(contenido, size, bold)
            : MARGIN + col.x;
        texto(contenido, x, size, bold);
      }
    }
  }

  // Objetos: 1 catálogo, 2 páginas, 3 y 4 fuentes, luego (página, contenido) por página.
  const objetos: string[] = [];
  const idsPagina: number[] = [];
  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  paginas.forEach((ops, i) => {
    const idPagina = 5 + i * 2;
    const idContenido = idPagina + 1;
    idsPagina.push(idPagina);
    const flujo = ops.join("\n");
    objetos[idPagina] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`;
    objetos[idContenido] = `<< /Length ${Buffer.byteLength(flujo, "latin1")} >>\nstream\n${flujo}\nendstream`;
  });
  objetos[2] = `<< /Type /Pages /Kids [${idsPagina.map((id) => `${id} 0 R`).join(" ")}] /Count ${idsPagina.length} >>`;

  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objetos.length; id++) {
    offsets[id] = Buffer.byteLength(cuerpo, "latin1");
    cuerpo += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(cuerpo, "latin1");
  cuerpo += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id++) {
    cuerpo += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  cuerpo += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(cuerpo, "latin1"));
}
