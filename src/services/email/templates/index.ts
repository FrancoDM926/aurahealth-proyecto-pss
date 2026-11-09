import {
  NotificationTemplateType,
  RenderTemplateOptions,
  RenderedEmail,
  TemplatePayloadMap,
} from "../types";
import {
  renderConfirmacionTurnoMedico,
  renderConfirmacionTurnoVacunatorio,
} from "./turno-confirmacion";
import {
  renderCancelacionTurnoMedico,
  renderCancelacionTurnoVacunatorio,
} from "./turno-cancelacion";
import { renderRecordatorioTurno } from "./turno-recordatorio";
import { renderBienvenidaRegistro, renderAltaUsuarioInterno } from "./bienvenida";
import { renderAvisoBloqueoAgenda } from "./aviso-bloqueo";

type TemplateRenderer<K extends NotificationTemplateType> = (
  params: TemplatePayloadMap[K],
  opciones?: RenderTemplateOptions
) => RenderedEmail;

const templateRegistry: {
  [K in NotificationTemplateType]: TemplateRenderer<K>;
} = {
  CONFIRMACION_TURNO_MEDICO: renderConfirmacionTurnoMedico,
  CONFIRMACION_TURNO_VACUNATORIO: renderConfirmacionTurnoVacunatorio,
  CANCELACION_TURNO_MEDICO: renderCancelacionTurnoMedico,
  CANCELACION_TURNO_VACUNATORIO: renderCancelacionTurnoVacunatorio,
  RECORDATORIO_TURNO: renderRecordatorioTurno,
  BIENVENIDA_REGISTRO: (p) => renderBienvenidaRegistro(p),
  ALTA_USUARIO_INTERNO: (p) => renderAltaUsuarioInterno(p),
  AVISO_BLOQUEO_AGENDA: (p) => renderAvisoBloqueoAgenda(p),
};

/**
 * Renderiza una plantilla parametrizada desacoplada de la lógica de negocio (Criterio 2).
 */
export function renderNotificationTemplate<T extends NotificationTemplateType>(
  template: T,
  params: TemplatePayloadMap[T],
  opciones?: RenderTemplateOptions
): RenderedEmail {
  const renderer = templateRegistry[template];
  if (!renderer) {
    throw new Error(`Plantilla desconocida: ${String(template)}`);
  }
  return renderer(params, opciones);
}
