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
}
