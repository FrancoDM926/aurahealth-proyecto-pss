import {
  NotificationTemplateParamsMap,
  NotificationTemplateType,
  RenderTemplateOptions,
  RenderedEmail,
} from "../types";
import {
  renderAltaUsuarioInterno,
  renderBienvenidaRegistro,
} from "./bienvenida";
import {
  renderCancelacionTurnoMedico,
  renderCancelacionTurnoVacunatorio,
} from "./turno-cancelacion";
import {
  renderConfirmacionTurnoMedico,
  renderConfirmacionTurnoVacunatorio,
} from "./turno-confirmacion";
import { renderRecordatorioTurno } from "./turno-recordatorio";

type TemplateRenderer<T extends NotificationTemplateType> = (
  params: NotificationTemplateParamsMap[T],
  opciones?: RenderTemplateOptions
) => RenderedEmail;

/**
 * Catálogo centralizado de plantillas (Template Registry).
 * Desacoplado de la lógica de negocio: modificar un diseño o texto no afecta
 * las entidades de turnos, usuarios ni controladores.
 */
const templateRegistry: {
  [K in NotificationTemplateType]: TemplateRenderer<K>;
} = {
  CONFIRMACION_TURNO_MEDICO: renderConfirmacionTurnoMedico,
  CANCELACION_TURNO_MEDICO: renderCancelacionTurnoMedico,
  CONFIRMACION_TURNO_VACUNATORIO: renderConfirmacionTurnoVacunatorio,
  CANCELACION_TURNO_VACUNATORIO: renderCancelacionTurnoVacunatorio,
  RECORDATORIO_TURNO: renderRecordatorioTurno,
  BIENVENIDA_REGISTRO: renderBienvenidaRegistro,
  ALTA_USUARIO_INTERNO: renderAltaUsuarioInterno,
};

/**
 * Renderiza la plantilla indicada con sus parámetros fuertemente tipados.
 * `opciones.mensaje` es el cuerpo que cargó el administrador en la pantalla
 * «Emails» (US-21); sin él, rige el mensaje por defecto de la plantilla.
 */
export function renderNotificationTemplate<T extends NotificationTemplateType>(
  template: T,
  params: NotificationTemplateParamsMap[T],
  opciones?: RenderTemplateOptions
): RenderedEmail {
  const renderer = templateRegistry[template] as TemplateRenderer<T> | undefined;

  if (!renderer) {
    throw new Error(`[EmailService] Plantilla desconocida: ${String(template)}`);
  }

  return renderer(params, opciones);
}

export {
  renderAltaUsuarioInterno,
  renderBienvenidaRegistro,
  renderCancelacionTurnoMedico,
  renderCancelacionTurnoVacunatorio,
  renderConfirmacionTurnoMedico,
  renderConfirmacionTurnoVacunatorio,
  renderRecordatorioTurno,
};
