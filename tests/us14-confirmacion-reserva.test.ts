import test from "node:test";
import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";
import {
  resetTransporter,
  sendNotificationEmail,
  setTransporterForTesting,
} from "../src/services/email";
import { renderNotificationTemplate } from "../src/services/email/templates";
import {
  buildConfirmacionTurnoParams,
  formatFechaTurno,
  type ConfirmacionTurnoData,
} from "../src/services/notificaciones/turno-confirmacion";

/**
 * US-14 — Confirmación de reserva por email (RF-TUR-03, RF-NOT-01).
 */

const datosBase: ConfirmacionTurnoData = {
  destinatarioNombre: "Ana Gómez",
  doctorNombre: "Dr. Roberto Rossi",
  especialidad: "Clínica médica",
  fecha: new Date(Date.UTC(2026, 9, 20)),
  startTime: "10:30",
  salaDireccion: "Av. Siempre Viva 742, Consultorio 3",
};

test("US-14 · usa la fecha UTC del turno en formato dd/mm/aaaa", () => {
  assert.equal(formatFechaTurno(new Date(Date.UTC(2026, 0, 5))), "05/01/2026");
  assert.equal(formatFechaTurno(new Date(Date.UTC(2026, 11, 31))), "31/12/2026");
});

test("US-14 · el email incluye profesional, especialidad, fecha, hora y dirección", () => {
  const params = buildConfirmacionTurnoParams(datosBase);
  assert.equal(params.fecha, "20/10/2026");
  assert.equal(params.hora, "10:30");

  const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", params);

  assert.match(rendered.html, /Dr\. Roberto Rossi/);
  assert.match(rendered.html, /Clínica médica/);
  assert.match(rendered.html, /20\/10\/2026/);
  assert.match(rendered.html, /10:30/);
  assert.match(rendered.html, /Av\. Siempre Viva 742, Consultorio 3/);
  // Turno propio: no aparece la línea de titular.
  assert.doesNotMatch(rendered.html, /A nombre de:/);
});

test("US-14 · si el turno es a nombre de otra persona, el email indica de quién es", () => {
  const params = buildConfirmacionTurnoParams({ ...datosBase, aNombreDe: "Juan Pérez" });
  assert.equal(params.aNombreDe, "Juan Pérez");

  const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", params);

  assert.match(rendered.html, /A nombre de:/);
  assert.match(rendered.html, /Juan Pérez/);
  assert.match(rendered.text, /A nombre de: Juan Pérez/);
});

test("US-14 · el email incluye instrucciones para cancelar el turno", () => {
  const rendered = renderNotificationTemplate(
    "CONFIRMACION_TURNO_MEDICO",
    buildConfirmacionTurnoParams(datosBase)
  );

  assert.match(rendered.html, /cancelar el turno/i);
  assert.match(rendered.html, /Mis turnos/);
  assert.match(rendered.text, /Mis turnos/);
});

test("US-14 · el enlace de cancelación es opcional y se incluye si está configurado", () => {
  const conEnlace = buildConfirmacionTurnoParams({
    ...datosBase,
    cancelUrl: "https://aurahealth.example/dashboard/reservar",
  });
  const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", conEnlace);
  assert.match(rendered.html, /https:\/\/aurahealth\.example\/dashboard\/reservar/);
});

test("US-14 · un envío fallido no se propaga: la reserva sigue válida", async () => {
  const transporterQueFalla = {
    sendMail: async () => {
      throw new Error("SMTP 550 Mailbox unavailable");
    },
  } as unknown as Transporter;

  setTransporterForTesting(transporterQueFalla);

  try {
    const result = await sendNotificationEmail({
      to: "paciente@example.com",
      template: "CONFIRMACION_TURNO_MEDICO",
      params: buildConfirmacionTurnoParams(datosBase),
      maxRetries: 2,
      initialDelayMs: 1,
    });

    assert.equal(result.success, false);
    assert.ok(result.error, "el fallo queda registrado para reintento");
    assert.ok(result.attempts >= 2);
  } finally {
    resetTransporter();
  }
});
