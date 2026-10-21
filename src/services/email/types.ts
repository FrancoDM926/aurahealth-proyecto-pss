/**
 * Tipos e interfaces del Servicio de Notificaciones por Email (US-21 / RF-NOT-01)
 */

export type NotificationTemplateType =
  | "CONFIRMACION_TURNO_MEDICO"
  | "CANCELACION_TURNO_MEDICO"
  | "CONFIRMACION_TURNO_VACUNATORIO"
  | "CANCELACION_TURNO_VACUNATORIO"
  | "RECORDATORIO_TURNO"
  | "BIENVENIDA_REGISTRO"
  | "ALTA_USUARIO_INTERNO";

export interface ConfirmacionTurnoMedicoParams {
  pacienteNombre: string;
  doctorNombre: string;
  especialidad: string;
  fecha: string; // ej. "15/10/2026"
  hora: string; // ej. "09:30"
  direccion?: string;
  costoConsulta?: number;
  /**
   * US-14: nombre de la persona atendida cuando el turno se reservó a nombre de
   * otra persona. Ausente cuando el turno es del propio destinatario.
   */
  aNombreDe?: string;
  /** US-14: enlace directo a "Mis turnos" para cancelar. Opcional. */
  cancelUrl?: string;
}

export interface CancelacionTurnoMedicoParams {
  pacienteNombre: string;
  doctorNombre: string;
  especialidad: string;
  fecha: string;
  hora: string;
  motivo?: string;
}

export interface ConfirmacionTurnoVacunatorioParams {
  pacienteNombre: string;
  vacunaNombre?: string;
  enfermeraNombre?: string;
  fecha: string;
  hora: string;
  indicaciones?: string;
}

export interface CancelacionTurnoVacunatorioParams {
  pacienteNombre: string;
  vacunaNombre?: string;
  fecha: string;
  hora: string;
  motivo?: string;
}

export interface RecordatorioTurnoParams {
  pacienteNombre: string;
  tipoTurno: "Consulta médica" | "Vacunación";
  profesionalOArea: string;
  fecha: string;
  hora: string;
  horasRestantes?: number;
}

export interface BienvenidaRegistroParams {
  nombre: string;
  email: string;
  loginUrl?: string;
}

export interface AltaUsuarioInternoParams {
  nombre: string;
  email: string;
  rol: string;
  loginUrl?: string;
}

export interface NotificationTemplateParamsMap {
  CONFIRMACION_TURNO_MEDICO: ConfirmacionTurnoMedicoParams;
  CANCELACION_TURNO_MEDICO: CancelacionTurnoMedicoParams;
  CONFIRMACION_TURNO_VACUNATORIO: ConfirmacionTurnoVacunatorioParams;
  CANCELACION_TURNO_VACUNATORIO: CancelacionTurnoVacunatorioParams;
  RECORDATORIO_TURNO: RecordatorioTurnoParams;
  BIENVENIDA_REGISTRO: BienvenidaRegistroParams;
  ALTA_USUARIO_INTERNO: AltaUsuarioInternoParams;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Opciones de render (US-21). `mensaje` es el cuerpo que cargó el administrador
 * en la pantalla «Emails»; cuando no llega, cada plantilla usa su mensaje por
 * defecto del catálogo.
 */
export interface RenderTemplateOptions {
  mensaje?: string;
}

export interface SendNotificationOptions<T extends NotificationTemplateType = NotificationTemplateType> {
  to: string;
  template: T;
  params: NotificationTemplateParamsMap[T];
  maxRetries?: number;
  initialDelayMs?: number;
}

export interface SendNotificationResult {
  success: boolean;
  logId?: string;
  attempts: number;
  messageId?: string;
  error?: string;
  /**
   * US-21: `true` cuando el envío ni se intentó porque el destinatario ya
   * acumuló la cantidad máxima de envíos fallidos configurable en la pantalla
   * «Emails».
   */
  limitado?: boolean;
}
