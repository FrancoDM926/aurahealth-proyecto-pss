/**
 * US-33 / US-34 / US-35 / US-36 — Costo de la consulta, cálculo del importe,
 * registro del pago y comprobante.
 *
 * Lógica pura (sin base de datos) para compartir las mismas reglas y mensajes
 * entre los formularios, las server actions y las pruebas. Todos los importes
 * viajan en centavos enteros para no arrastrar errores de coma flotante.
 */

import type { EstadoTurno, MedioPago, Role } from "@/generated/prisma/client";
import { formatearFechaAr } from "@/lib/busqueda-turnos";

// ─── Importes ────────────────────────────────────────────────────────────────

/** Tope del precio de una consulta, en pesos (mantiene el importe dentro de un Int de 32 bits). */
export const MAX_PRECIO_PESOS = 10_000_000;

/**
 * Formatea centavos como pesos argentinos, igual que los wireframes: «$ 18.000».
 * Los decimales solo aparecen si el importe no es entero («$ 12.600,50»).
 */
export function formatearPesos(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const pesos = Math.floor(abs / 100);
  const resto = abs % 100;
  const entero = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimales = resto === 0 ? "" : `,${String(resto).padStart(2, "0")}`;
  return `${negativo ? "− " : ""}$ ${entero}${decimales}`;
}

/**
 * Convierte lo que escribe el usuario («18000», «18.000», «18.000,50», «$ 18000,5»)
 * a centavos. Devuelve `null` si el texto no es un importe válido.
 */
export function pesosACentavos(texto: string): number | null {
  const limpio = texto.replace(/\$/g, "").replace(/\s/g, "");
  if (!limpio) return null;

  let normalizado: string;
  if (limpio.includes(",")) {
    // La coma es el separador decimal y el punto agrupa miles.
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(limpio)) return null;
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(limpio)) {
    normalizado = limpio; // «18000.50»
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normalizado = limpio.replace(/\./g, ""); // «18.000»
  } else if (/^\d+$/.test(limpio)) {
    normalizado = limpio;
  } else {
    return null;
  }

  const [pesos, decimales = ""] = normalizado.split(".");
  return Number(pesos) * 100 + Number(decimales.padEnd(2, "0"));
}

export type ImporteCalculado = {
  precioSinCoberturaCentavos: number;
  descuentoPorcentaje: number;
  descuentoCentavos: number;
  importeCentavos: number;
};

/**
 * US-34: importe a abonar = precio sin cobertura del médico menos el descuento
 * porcentual predefinido de la obra social. El descuento se redondea al centavo.
 */
export function calcularImporte(
  precioSinCoberturaCentavos: number,
  descuentoPorcentaje: number
): ImporteCalculado {
  const pct = Math.min(100, Math.max(0, descuentoPorcentaje));
  const descuentoCentavos = Math.round((precioSinCoberturaCentavos * pct) / 100);
  return {
    precioSinCoberturaCentavos,
    descuentoPorcentaje: pct,
    descuentoCentavos,
    importeCentavos: precioSinCoberturaCentavos - descuentoCentavos,
  };
}

// ─── Obras sociales y cobertura (US-34, RN-14) ───────────────────────────────

export type ObraSocialDescuento = { nombre: string; descuentoPorcentaje: number };

export function validarDescuentoPorcentaje(valor: number): string | null {
  if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
    return "Ingresá un número entero entre 0 y 100.";
  }
  return null;
}

export const MAX_NOMBRE_OBRA_SOCIAL = 50;

export function validarNombreObraSocial(nombre: string): string | null {
  const v = nombre.trim();
  if (!v) return "Ingresá el nombre de la obra social.";
  if (v.length > MAX_NOMBRE_OBRA_SOCIAL) {
    return `Máximo ${MAX_NOMBRE_OBRA_SOCIAL} caracteres.`;
  }
  return null;
}

/** Cobertura de la persona atendida, tal como la declaró (dato declarativo, sin padrón). */
export type CoberturaPersona = {
  /** Entidad de la obra social; `null` = particular. */
  entidad: string | null;
  plan: string | null;
};

/**
 * US-64 / RN-12: se aplica la cobertura de la persona atendida, no la de quien
 * reservó. Si el turno es para otra persona rige la que se cargó al reservar; si
 * no, la del titular de la cuenta.
 */
export function resolverCobertura(input: {
  personaAtendida: { healthInsuranceEntity: string; healthInsurancePlan: string } | null;
  titular: {
    coverageType: string;
    healthInsuranceEntity: string | null;
    healthInsurancePlan: string | null;
  };
}): CoberturaPersona {
  const { personaAtendida, titular } = input;
  if (personaAtendida) {
    const entidad = personaAtendida.healthInsuranceEntity.trim();
    return {
      entidad: entidad || null,
      plan: personaAtendida.healthInsurancePlan.trim() || null,
    };
  }
  if (titular.coverageType === "OBRA_SOCIAL" && titular.healthInsuranceEntity?.trim()) {
    return {
      entidad: titular.healthInsuranceEntity.trim(),
      plan: titular.healthInsurancePlan?.trim() || null,
    };
  }
  return { entidad: null, plan: null };
}

/**
 * Descuento aplicable a una cobertura. Los particulares no reciben descuento; una
 * entidad que no figura en el listado del administrador tampoco (`configurada: false`).
 */
export function descuentoParaCobertura(
  cobertura: CoberturaPersona,
  obrasSociales: ObraSocialDescuento[]
): { descuentoPorcentaje: number; configurada: boolean } {
  if (!cobertura.entidad) return { descuentoPorcentaje: 0, configurada: true };
  const buscada = cobertura.entidad.toLowerCase();
  const obra = obrasSociales.find((o) => o.nombre.trim().toLowerCase() === buscada);
  if (!obra) return { descuentoPorcentaje: 0, configurada: false };
  return { descuentoPorcentaje: obra.descuentoPorcentaje, configurada: true };
}

// ─── Precio de la consulta con historial de vigencias (US-33) ────────────────

export type VigenciaPrecio = {
  /** "YYYY-MM-DD" */
  vigenteDesde: string;
  montoCentavos: number;
};

export type EstadoVigencia = "VIGENTE" | "CERRADO" | "PROGRAMADO";

export type FilaVigencia = {
  desde: string;
  /** Último día de vigencia; `null` mientras no la reemplace otro precio. */
  hasta: string | null;
  montoCentavos: number;
  estado: EstadoVigencia;
};

/** Suma días a una fecha "YYYY-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dias));
  return date.toISOString().slice(0, 10);
}

/** Precio vigente a una fecha: la vigencia más reciente que ya rige en ella. */
export function precioVigenteEn(
  vigencias: VigenciaPrecio[],
  fecha: string
): VigenciaPrecio | null {
  let vigente: VigenciaPrecio | null = null;
  for (const v of vigencias) {
    if (v.vigenteDesde <= fecha && (!vigente || v.vigenteDesde > vigente.vigenteDesde)) {
      vigente = v;
    }
  }
  return vigente;
}

/**
 * Ordena las vigencias de la más reciente a la más antigua y calcula, para cada
 * una, hasta cuándo rigió (el día anterior al comienzo de la siguiente) y su estado.
 */
export function armarHistorialVigencias(
  vigencias: VigenciaPrecio[],
  hoy: string
): { vigente: FilaVigencia | null; historial: FilaVigencia[] } {
  const ascendentes = [...vigencias].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const vigenteDesde = precioVigenteEn(vigencias, hoy)?.vigenteDesde ?? null;

  const filas = ascendentes.map((v, i): FilaVigencia => {
    const siguiente = ascendentes[i + 1];
    const estado: EstadoVigencia =
      v.vigenteDesde > hoy ? "PROGRAMADO" : v.vigenteDesde === vigenteDesde ? "VIGENTE" : "CERRADO";
    return {
      desde: v.vigenteDesde,
      hasta: siguiente ? sumarDias(siguiente.vigenteDesde, -1) : null,
      montoCentavos: v.montoCentavos,
      estado,
    };
  });

  const vigente = filas.find((f) => f.estado === "VIGENTE") ?? null;
  const historial = filas.filter((f) => f.estado !== "VIGENTE").reverse();
  return { vigente, historial };
}

export type PrecioConsultaInput = {
  /** Lo que escribió el médico: «18000», «18.000,50», … */
  monto: string;
  /** "YYYY-MM-DD" */
  vigenteDesde: string;
};

export type PrecioConsultaErrors = Partial<Record<keyof PrecioConsultaInput, string>>;

/**
 * US-33: valida el precio nuevo. El monto debe ser positivo; la fecha de vigencia
 * no puede ser anterior al inicio de la vigencia actual (así el historial de
 * vigencias nunca se reescribe hacia atrás) ni coincidir con otra ya cargada
 * (el historial se conserva, no se pisa).
 */
export function validarPrecioConsulta(
  data: PrecioConsultaInput,
  contexto: { hoy: string; vigencias: VigenciaPrecio[] }
): PrecioConsultaErrors {
  const errors: PrecioConsultaErrors = {};

  const centavos = pesosACentavos(data.monto ?? "");
  if (!data.monto?.trim()) {
    errors.monto = "Ingresá el precio de la consulta.";
  } else if (centavos === null) {
    errors.monto = "Ingresá un importe válido, por ejemplo 18000 o 18.000,50.";
  } else if (centavos <= 0) {
    errors.monto = "El precio debe ser mayor a cero.";
  } else if (centavos > MAX_PRECIO_PESOS * 100) {
    errors.monto = `El precio no puede superar $ ${MAX_PRECIO_PESOS.toLocaleString("es-AR")}.`;
  }

  const desde = data.vigenteDesde?.trim() ?? "";
  if (!desde) {
    errors.vigenteDesde = "Indicá desde cuándo rige el precio.";
  } else if (!esFechaIso(desde)) {
    errors.vigenteDesde = "Ingresá una fecha válida.";
  } else {
    const actual = precioVigenteEn(contexto.vigencias, contexto.hoy);
    if (contexto.vigencias.some((v) => v.vigenteDesde === desde)) {
      errors.vigenteDesde =
        "Ya existe un precio con esa fecha de vigencia. Elegí otra: el historial no se pisa.";
    } else if (actual && desde < actual.vigenteDesde) {
      errors.vigenteDesde = `La fecha de vigencia no puede ser anterior al inicio de la vigencia actual (${formatearFechaAr(actual.vigenteDesde)}).`;
    }
  }

  return errors;
}

/** "YYYY-MM-DD" que existe en el calendario. */
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// ─── Registro del pago (US-35) ───────────────────────────────────────────────

/** Medios admitidos: solo estos dos, ambos presenciales; no son configurables. */
export const MEDIOS_PAGO: readonly MedioPago[] = ["EFECTIVO", "TRANSFERENCIA"];

export const MEDIO_PAGO_LABELS: Record<MedioPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
};

export function esMedioPagoValido(valor: unknown): valor is MedioPago {
  return typeof valor === "string" && (MEDIOS_PAGO as readonly string[]).includes(valor);
}

/** Roles que cobran en el mostrador. */
export const ROLES_REGISTRAN_PAGO: Role[] = ["ADMINISTRATIVO"];

export const MAX_REFERENCIA_PAGO = 100;

export type RegistroPagoInput = {
  rol: Role;
  turnoStatus: EstadoTurno;
  medio: unknown;
  referencia: string | null | undefined;
  /** El turno ya tiene un pago ACTIVO. */
  tienePagoActivo: boolean;
  /** El médico tiene precio de consulta vigente a la fecha del turno. */
  tienePrecio: boolean;
};

export type RegistroPagoResult =
  | { valid: true; medio: MedioPago; referencia: string | null }
  | { valid: false; error: string };

/**
 * US-35: reglas previas al registro de un pago.
 * - Solo el personal administrativo cobra (el efectivo, en particular, solo él).
 * - El pago se asocia a un turno en estado cumplido.
 * - Medios admitidos: efectivo o transferencia.
 * - La transferencia exige la referencia de la operación.
 * - Un turno no puede tener dos pagos activos.
 * - Sin precio de consulta configurado no se puede cerrar el cobro (US-34).
 */
export function validarRegistroPago(input: RegistroPagoInput): RegistroPagoResult {
  if (!ROLES_REGISTRAN_PAGO.includes(input.rol)) {
    return { valid: false, error: "Solo el personal administrativo puede registrar pagos." };
  }
  if (!esMedioPagoValido(input.medio)) {
    return { valid: false, error: "Elegí el medio de pago: efectivo o transferencia." };
  }
  if (input.medio === "EFECTIVO" && input.rol !== "ADMINISTRATIVO") {
    return { valid: false, error: "El pago en efectivo solo puede registrarlo personal administrativo." };
  }
  if (input.turnoStatus !== "CUMPLIDO") {
    return { valid: false, error: "Solo se puede registrar el pago de un turno cumplido." };
  }
  if (input.tienePagoActivo) {
    return { valid: false, error: "Ya existe un pago activo para este turno." };
  }
  if (!input.tienePrecio) {
    return {
      valid: false,
      error: "El médico no tiene configurado el precio de su consulta: no se puede cerrar el cobro.",
    };
  }

  let referencia: string | null = null;
  if (input.medio === "TRANSFERENCIA") {
    const ref = (input.referencia ?? "").trim();
    if (!ref) {
      return { valid: false, error: "Ingresá la referencia de la transferencia (N.º de operación)." };
    }
    if (ref.length > MAX_REFERENCIA_PAGO) {
      return {
        valid: false,
        error: `La referencia no puede superar los ${MAX_REFERENCIA_PAGO} caracteres.`,
      };
    }
    referencia = ref;
  }

  return { valid: true, medio: input.medio, referencia };
}

// ─── Comprobante (US-36) ─────────────────────────────────────────────────────

/** Número de comprobante con ceros a la izquierda, como en el wireframe: «000123». */
export function formatearNumeroComprobante(numero: number): string {
  return String(numero).padStart(6, "0");
}

/**
 * US-36: la descarga solo está disponible para el paciente titular (quien reservó
 * el turno a su nombre o a nombre de otra persona) y para el personal administrativo.
 */
export function puedeDescargarComprobante(input: {
  rol: Role;
  usuarioId: string;
  turnoReservadoPorId: string | null;
}): boolean {
  if (input.rol === "ADMINISTRATIVO") return true;
  return input.turnoReservadoPorId !== null && input.turnoReservadoPorId === input.usuarioId;
}

export type DatosComprobante = {
  numero: number;
  salaNombre: string;
  salaDireccion: string;
  pacienteNombre: string;
  pacienteDocumento: string | null;
  prestacion: string;
  profesionalNombre: string;
  /** "YYYY-MM-DD" */
  fechaTurno: string;
  horaTurno: string;
  importeCentavos: number;
  precioSinCoberturaCentavos: number;
  descuentoPorcentaje: number;
  descuentoCentavos: number;
  coberturaEntidad: string | null;
  medio: MedioPago;
  referencia: string | null;
  /** Fecha y hora del cobro, ya formateadas. */
  registradoEn: string;
  registradoPorNombre: string;
};

/** Nombre de la sala en el comprobante (wireframe wf_comprobante.html). */
export const SALA_NOMBRE = "Sala Médica Privada";

/** Texto fijo: es un comprobante interno, sin homologación fiscal. */
export const AVISO_COMPROBANTE_INTERNO =
  "Documento interno de la sala: no reemplaza a una factura fiscal.";
