import test from "node:test";
import assert from "node:assert/strict";

import {
  ANTELACION_RECORDATORIO_DEFAULT_HORAS,
  ANTELACION_RECORDATORIO_MAX_HORAS,
  ANTELACION_RECORDATORIO_MIN_HORAS,
  ARGENTINA_UTC_OFFSET_HORAS,
  buildRecordatorioTurnoParams,
  debeRecordarse,
  estaEnVentanaRecordatorio,
  formatFechaTurno,
  horasHastaTurno,
  inicioTurnoUTC,
  seleccionarTurnosARecordar,
  validarAntelacionRecordatorio,
  type TurnoRecordatoriable,
} from "../src/lib/recordatorios";

/**
 * US-15 — Recordatorio automático de turno (RF-TUR-04, RF-NOT-01).
 *
 * Estos tests se enfocan en la lógica pura. La idempotencia del proceso (reclamo
 * atómico) se valida indirectamente: `seleccionarTurnosARecordar` nunca devuelve
 * un turno con `recordatorioEstado === "ENVIADO"`.
 */

function fechaUTC(dia: number, mes: number, anio: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function turno(
  overrides: Partial<TurnoRecordatoriable> = {}
): TurnoRecordatoriable {
  return {
    id: "t1",
    status: "RESERVADO",
    date: fechaUTC(20, 10, 2026),
    startTime: "10:30",
    reservedById: "u1",
    recordatorioEstado: "PENDIENTE",
    ...overrides,
  };
}

test("US-15 · antelación por defecto y límites", () => {
  assert.equal(ANTELACION_RECORDATORIO_DEFAULT_HORAS, 24);
  assert.equal(ANTELACION_RECORDATORIO_MIN_HORAS, 1);
  assert.equal(ANTELACION_RECORDATORIO_MAX_HORAS, 168);
  assert.equal(validarAntelacionRecordatorio(24), null);
  assert.equal(validarAntelacionRecordatorio(1), null);
  assert.equal(validarAntelacionRecordatorio(168), null);
  assert.ok(validarAntelacionRecordatorio(0));
  assert.ok(validarAntelacionRecordatorio(-1));
  assert.ok(validarAntelacionRecordatorio(169));
  assert.ok(validarAntelacionRecordatorio(24.5));
});

test("US-15 · inicioTurnoUTC suma el offset de Argentina (UTC-3)", () => {
  const inicio = inicioTurnoUTC({ date: fechaUTC(20, 10, 2026), startTime: "10:30" });
  assert.ok(inicio instanceof Date);
  // 10:30 sala + 3h = 13:30 UTC
  assert.equal(inicio?.getUTCHours(), 10 + ARGENTINA_UTC_OFFSET_HORAS);
  assert.equal(inicio?.getUTCMinutes(), 30);
  assert.equal(inicio?.getUTCDate(), 20);
  assert.equal(inicio?.getUTCMonth(), 9); // octubre
});

test("US-15 · horasHastaTurno calcula la diferencia hacia el futuro", () => {
  const t = turno();
  // Ahora = inicio - 23:30 h
  const inicio = inicioTurnoUTC(t);
  assert.ok(inicio);
  const ahora = new Date(inicio.getTime() - (23 * 60 + 30) * 60 * 1000);
  const faltan = horasHastaTurno(t, ahora);
  assert.ok(faltan !== null);
  assert.equal(Math.round(faltan * 100) / 100, 23.5);
});

test("US-15 · ventana de recordatorio: solo entre >0 y <= antelación", () => {
  const t = turno();
  const inicio = inicioTurnoUTC(t);
  assert.ok(inicio);
  // Faltan 23 h: entra en ventana 24 h
  const dentro = new Date(inicio.getTime() - 23 * 60 * 60 * 1000);
  assert.ok(estaEnVentanaRecordatorio(t, dentro, 24));
  // Faltan 25 h: fuera
  const fueraLejos = new Date(inicio.getTime() - 25 * 60 * 60 * 1000);
  assert.ok(!estaEnVentanaRecordatorio(t, fueraLejos, 24));
  // Ya empezó: faltan -1 h → fuera
  const yaEmpezo = new Date(inicio.getTime() + 60 * 60 * 1000);
  assert.ok(!estaEnVentanaRecordatorio(t, yaEmpezo, 24));
});

test("US-15 · debeRecordarse excluye estados incorrectos y duplicados", () => {
  const ahoraDentro = new Date((inicioTurnoUTC(turno())?.getTime() ?? Date.now()) - 12 * 60 * 60 * 1000);

  // Base válido
  assert.ok(debeRecordarse(turno(), ahoraDentro, 24));

  // Cancelado → no
  assert.ok(!debeRecordarse(turno({ status: "CANCELADO" }), ahoraDentro, 24));
  // Disponible → no
  assert.ok(!debeRecordarse(turno({ status: "DISPONIBLE" }), ahoraDentro, 24));
  // Cumplido → no
  assert.ok(!debeRecordarse(turno({ status: "CUMPLIDO" }), ahoraDentro, 24));
  // Ausente → no
  assert.ok(!debeRecordarse(turno({ status: "AUSENTE" }), ahoraDentro, 24));

  // Sin reservador → no
  assert.ok(!debeRecordarse(turno({ reservedById: null }), ahoraDentro, 24));

  // Ya enviado → idempotencia: no se vuelve a recordar
  assert.ok(!debeRecordarse(turno({ recordatorioEstado: "ENVIADO" }), ahoraDentro, 24));
});

test("US-15 · seleccionarTurnosARecordar ordena por hora de inicio", () => {
  const baseAhora = new Date((inicioTurnoUTC(turno())?.getTime() ?? Date.now()) - 12 * 60 * 60 * 1000);
  const t1 = turno({ id: "t1", startTime: "10:30" });
  const t2 = turno({ id: "t2", startTime: "09:00" });
  const t3 = turno({ id: "t3", startTime: "14:00" });

  const seleccion = seleccionarTurnosARecordar([t1, t2, t3], baseAhora, 24);
  assert.equal(seleccion.length, 3);
  assert.equal(seleccion[0].id, "t2"); // 09:00
  assert.equal(seleccion[1].id, "t1"); // 10:30
  assert.equal(seleccion[2].id, "t3"); // 14:00
});

test("US-15 · seleccionarTurnosARecordar respeta antelación configurable", () => {
  const t = turno();
  const inicio = inicioTurnoUTC(t);
  assert.ok(inicio);
  // Faltan 5 h: entra con 6 h, no con 2 h
  const ahora5h = new Date(inicio.getTime() - 5 * 60 * 60 * 1000);
  assert.equal(seleccionarTurnosARecordar([t], ahora5h, 6).length, 1);
  assert.equal(seleccionarTurnosARecordar([t], ahora5h, 2).length, 0);
});

test("US-15 · mapper de parámetros y plantilla del recordatorio", async () => {
  const params = buildRecordatorioTurnoParams({
    destinatarioNombre: "Ana Gómez",
    doctorNombre: "Dr. Roberto Rossi",
    especialidad: "Clínica médica",
    fecha: fechaUTC(20, 10, 2026),
    startTime: "10:30",
    horasRestantes: 23.7,
  });

  assert.equal(params.pacienteNombre, "Ana Gómez");
  assert.equal(params.tipoTurno, "Consulta médica");
  assert.equal(params.profesionalOArea, "Dr. Roberto Rossi");
  assert.equal(params.fecha, "20/10/2026");
  assert.equal(params.hora, "10:30");
  assert.equal(params.horasRestantes, 24); // redondeado

  // Renderizado de la plantilla RECORDATORIO_TURNO
  const { renderNotificationTemplate } = await import("../src/services/email/templates");
  const rendered = renderNotificationTemplate("RECORDATORIO_TURNO", params);
  assert.match(rendered.subject, /Recordatorio: Tenés un turno programado/);
  assert.match(rendered.subject, /20\/10\/2026/);
  assert.match(rendered.subject, /10:30/);
  assert.match(rendered.html, /Ana Gómez/);
  assert.match(rendered.html, /Dr\. Roberto Rossi/);
  assert.match(rendered.html, /Consulta médica/);
  assert.match(rendered.html, /20\/10\/2026/);
  assert.match(rendered.html, /10:30/);
  assert.match(rendered.text, /cancelalo/);
});

test("US-15 · formatFechaTurno respeta UTC", () => {
  assert.equal(formatFechaTurno(fechaUTC(5, 1, 2026)), "05/01/2026");
  assert.equal(formatFechaTurno(fechaUTC(31, 12, 2026)), "31/12/2026");
});

test("US-15 · seleccionarTurnosARecordar excluye ya enviados y cancelados", () => {
  const baseAhora = new Date((inicioTurnoUTC(turno())?.getTime() ?? Date.now()) - 12 * 60 * 60 * 1000);
  const enviados = turno({ id: "env", recordatorioEstado: "ENVIADO" });
  const cancelado = turno({ id: "can", status: "CANCELADO" });
  const ok = turno({ id: "ok" });

  const seleccion = seleccionarTurnosARecordar([enviados, cancelado, ok], baseAhora, 24);
  assert.equal(seleccion.length, 1);
  assert.equal(seleccion[0].id, "ok");
});
