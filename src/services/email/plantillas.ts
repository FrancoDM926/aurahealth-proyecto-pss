import { db } from "@/lib/db";
import {
  ENVIOS_FALLIDOS_DEFAULT,
  ENVIOS_FALLIDOS_MIN,
  esPlantillaAdministrable,
  getMensajePorDefecto,
} from "./catalogo";

/**
 * Persistencia de lo que administra la pantalla «Emails» (US-21):
 * - el mensaje editable de cada plantilla (`PlantillaEmail`), y
 * - el límite de envíos fallidos por destinatario (`Configuracion`).
 *
 * Todas las lecturas degradan al valor por defecto si la base no está
 * disponible: una intermitencia de BD nunca debe frenar un envío.
 */

/** Mensaje guardado por el administrador, o `undefined` si no hay fila. */
export async function getMensajeGuardado(clave: string): Promise<string | undefined> {
  if (!esPlantillaAdministrable(clave)) return undefined;
  try {
    const fila = await db.plantillaEmail.findUnique({ where: { clave } });
    const mensaje = fila?.mensaje?.trim();
    return mensaje && mensaje.length > 0 ? mensaje : undefined;
  } catch (err) {
    console.warn("[EmailService] No se pudo leer el mensaje de la plantilla:", err);
    return undefined;
  }
}

/**
 * Mensaje vigente de una plantilla administrable: el que cargó el
 * administrador o, si no cargó ninguno, el mensaje por defecto del catálogo.
 * Devuelve `undefined` para las plantillas no administradas desde la pantalla.
 */
export async function getMensajePlantilla(clave: string): Promise<string | undefined> {
  const guardado = await getMensajeGuardado(clave);
  return guardado ?? getMensajePorDefecto(clave);
}

/** Cantidad máxima de envíos fallidos que acumula un destinatario (inicial 3). */
export async function getEnviosFallidosMax(): Promise<number> {
  try {
    const config = await db.configuracion.findUnique({
      where: { id: 1 },
      select: { maxEnviosFallidosPorUsuario: true },
    });
    const valor = config?.maxEnviosFallidosPorUsuario;
    return typeof valor === "number" && Number.isInteger(valor) && valor >= ENVIOS_FALLIDOS_MIN
      ? valor
      : ENVIOS_FALLIDOS_DEFAULT;
  } catch (err) {
    console.warn("[EmailService] No se pudo leer el límite de envíos fallidos:", err);
    return ENVIOS_FALLIDOS_DEFAULT;
  }
}

/**
 * Puerto de consulta del contador de fallidos por destinatario, con
 * inyección para las pruebas (mismo criterio que `setTransporterForTesting`).
 */
export type EnviosFallidosProvider = (recipient: string) => Promise<number>;

let enviosFallidosProvider: EnviosFallidosProvider | null = null;

export function setEnviosFallidosProviderForTesting(provider: EnviosFallidosProvider | null) {
  enviosFallidosProvider = provider;
}

export function resetEnviosFallidosProvider() {
  enviosFallidosProvider = null;
}

/**
 * Envíos con estado FAILED que acumula un destinatario. Sin base de datos
 * disponibles se cuenta 0, de modo que el envío se intente normalmente.
 */
export async function enviosFallidosDe(recipient: string): Promise<number> {
  if (enviosFallidosProvider) {
    return enviosFallidosProvider(recipient);
  }
  try {
    return await db.emailAuditLog.count({
      where: { recipient, status: "FAILED" },
    });
  } catch (err) {
    console.warn("[EmailService] No se pudieron contar los envíos fallidos:", err);
    return 0;
  }
}
