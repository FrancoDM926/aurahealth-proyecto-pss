import type { NotificationTemplateType } from "./types";
import { escapeHtml } from "./templates/base-layout";

/**
 * Catálogo de las plantillas que administra la pantalla «Emails» (US-21 /
 * wireframe `wf_servicio_email.html`).
 *
 * Reglas del wireframe:
 * - El asunto, el remitente y los destinatarios no se editan: son fijos por
 *   plantilla. Solo el cuerpo del mensaje es editable.
 * - Cada plantilla declara las variables disponibles, que se reemplazan al
 *   momento del envío.
 * - El listado indica qué historia usa cada plantilla (US-14, US-15, US-16).
 */

export type PlantillaAdministrable = {
  clave: NotificationTemplateType;
  /** Nombre que aparece en el listado de la pantalla "Emails". */
  nombre: string;
  /** Asunto fijo por plantilla (no editable desde la pantalla). */
  asunto: string;
  /** Historia que dispara la plantilla. */
  usadaPor: string;
  /** Variables disponibles en el mensaje. */
  variables: readonly string[];
  /** Mensaje vigente mientras el administrador no cargue uno propio. */
  mensajePorDefecto: string;
};

export const MAX_MENSAJE_PLANTILLA = 2000;

/** Envíos fallidos por destinatario: valor inicial y rango admitido (US-21). */
export const ENVIOS_FALLIDOS_DEFAULT = 3;
export const ENVIOS_FALLIDOS_MIN = 1;
export const ENVIOS_FALLIDOS_MAX = 20;

export const PLANTILLAS_ADMINISTRABLES: PlantillaAdministrable[] = [
  {
    clave: "CONFIRMACION_TURNO_MEDICO",
    nombre: "Confirmación de turno",
    asunto: "Tu turno fue confirmado",
    usadaPor: "US-14",
    variables: ["paciente", "profesional", "fecha", "hora"],
    mensajePorDefecto:
      "Hola {{paciente}}, tu turno con {{profesional}} quedó confirmado para el {{fecha}} a las {{hora}}. Si necesitás cancelarlo, hacelo desde tu cuenta.",
  },
  {
    clave: "RECORDATORIO_TURNO",
    nombre: "Recordatorio de turno",
    asunto: "Recordatorio: tenés un turno próximamente",
    usadaPor: "US-15",
    variables: ["paciente", "profesional", "fecha", "hora"],
    mensajePorDefecto:
      "Hola {{paciente}}, te recordamos que tu turno con {{profesional}} es el {{fecha}} a las {{hora}}. Si no podés asistir, cancelalo a tiempo desde tu cuenta.",
  },
  {
    clave: "CANCELACION_TURNO_MEDICO",
    nombre: "Cancelación de turno",
    asunto: "Tu turno fue cancelado",
    usadaPor: "US-16",
    variables: ["paciente", "profesional", "fecha", "hora"],
    mensajePorDefecto:
      "Hola {{paciente}}, te informamos que tu turno con {{profesional}} del {{fecha}} a las {{hora}} fue cancelado. Podés reservar otro horario desde tu cuenta.",
  },
];

export function getPlantillaAdministrable(
  clave: string
): PlantillaAdministrable | undefined {
  return PLANTILLAS_ADMINISTRABLES.find((p) => p.clave === clave);
}

export function esPlantillaAdministrable(
  clave: string
): clave is NotificationTemplateType {
  return getPlantillaAdministrable(clave) !== undefined;
}

/** Asunto fijo de una plantilla administrable, o `undefined` si no lo es. */
export function getAsuntoPlantilla(clave: string): string | undefined {
  return getPlantillaAdministrable(clave)?.asunto;
}

/** Mensaje por defecto de una plantilla administrable, o `undefined`. */
export function getMensajePorDefecto(clave: string): string | undefined {
  return getPlantillaAdministrable(clave)?.mensajePorDefecto;
}

/** Variables escritas en un mensaje, en orden de aparición y sin repetir. */
export function variablesUsadas(mensaje: string): string[] {
  const encontradas: string[] = [];
  for (const coincidencia of mensaje.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    const nombre = coincidencia[1];
    if (!encontradas.includes(nombre)) encontradas.push(nombre);
  }
  return encontradas;
}

/**
 * Valida el mensaje editado por el administrador. Devuelve el error o `null`
 * cuando el mensaje es válido.
 */
export function validarMensajePlantilla(clave: string, mensaje: string): string | null {
  const plantilla = getPlantillaAdministrable(clave);
  if (!plantilla) {
    return "Plantilla inexistente.";
  }

  const limpio = mensaje.trim();
  if (limpio.length === 0) {
    return "Ingresá el mensaje de la plantilla.";
  }
  if (limpio.length > MAX_MENSAJE_PLANTILLA) {
    return `El mensaje no puede superar los ${MAX_MENSAJE_PLANTILLA} caracteres.`;
  }

  const desconocidas = variablesUsadas(limpio).filter(
    (v) => !plantilla.variables.includes(v)
  );
  if (desconocidas.length > 0) {
    return `Variable sin soporte: ${desconocidas
      .map((v) => `{{${v}}}`)
      .join(", ")}. Disponibles: ${plantilla.variables
      .map((v) => `{{${v}}}`)
      .join(", ")}.`;
  }

  return null;
}

/** Reemplaza `{{variable}}` por su valor; las desconocidas quedan intactas. */
export function reemplazarVariables(
  mensaje: string,
  valores: Record<string, string | undefined>
): string {
  return mensaje.replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (coincidencia, nombre: string) => {
      const valor = valores[nombre];
      return valor === undefined || valor === null ? coincidencia : valor;
    }
  );
}

/**
 * Mensaje listo para el HTML: se escapan el texto cargado por el administrador
 * y los valores de las variables antes de reemplazarlas.
 */
export function renderMensajeHtml(
  mensaje: string,
  valores: Record<string, string | undefined>
): string {
  const escapados: Record<string, string | undefined> = {};
  for (const [nombre, valor] of Object.entries(valores)) {
    escapados[nombre] = valor === undefined || valor === null ? undefined : escapeHtml(valor);
  }
  return reemplazarVariables(escapeHtml(mensaje), escapados);
}

/** Mensaje en texto plano (versión `text/plain` del correo). */
export function renderMensajeTexto(
  mensaje: string,
  valores: Record<string, string | undefined>
): string {
  return reemplazarVariables(mensaje, valores);
}
