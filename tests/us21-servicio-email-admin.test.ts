import test, { describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";

import {
  PLANTILLAS_ADMINISTRABLES,
  getMensajePorDefecto,
  validarMensajePlantilla,
  variablesUsadas,
} from "../src/services/email/catalogo";
import {
  resetEnviosFallidosProvider,
  setEnviosFallidosProviderForTesting,
} from "../src/services/email/plantillas";
import {
  renderNotificationTemplate,
  resetTransporter,
  sendNotificationEmail,
  setTransporterForTesting,
} from "../src/services/email";
import {
  buildConfirmacionTurnoParams,
  type ConfirmacionTurnoData,
} from "../src/services/notificaciones/turno-confirmacion";

/**
 * US-21 — Pantalla «Emails» del wireframe `wf_servicio_email.html`:
 * listado de plantillas con asunto fijo, edición del mensaje con variables y
 * límite de envíos fallidos por destinatario. US-14 y US-15 consumen esas
 * mismas plantillas.
 */

const datosTurno: ConfirmacionTurnoData = {
  destinatarioNombre: "Ana Gómez",
  doctorNombre: "Dr. Roberto Rossi",
  especialidad: "Clínica médica",
  fecha: new Date(Date.UTC(2026, 9, 20)),
  startTime: "10:30",
  salaDireccion: "Av. Siempre Viva 742, Consultorio 3",
};

afterEach(() => {
  resetTransporter();
  resetEnviosFallidosProvider();
});

describe("US-21 · Catálogo de la pantalla Emails", () => {
  test("lista las tres plantillas del wireframe con su asunto fijo y su historia", () => {
    assert.equal(PLANTILLAS_ADMINISTRABLES.length, 3);

    const [confirmacion, recordatorio, cancelacion] = PLANTILLAS_ADMINISTRABLES;

    assert.equal(confirmacion.clave, "CONFIRMACION_TURNO_MEDICO");
    assert.equal(confirmacion.nombre, "Confirmación de turno");
    assert.equal(confirmacion.asunto, "Tu turno fue confirmado");
    assert.equal(confirmacion.usadaPor, "US-14");

    assert.equal(recordatorio.clave, "RECORDATORIO_TURNO");
    assert.equal(recordatorio.nombre, "Recordatorio de turno");
    assert.equal(recordatorio.asunto, "Recordatorio: tenés un turno próximamente");
    assert.equal(recordatorio.usadaPor, "US-15");

    assert.equal(cancelacion.clave, "CANCELACION_TURNO_MEDICO");
    assert.equal(cancelacion.nombre, "Cancelación de turno");
    assert.equal(cancelacion.asunto, "Tu turno fue cancelado");
    assert.equal(cancelacion.usadaPor, "US-16");
  });

  test("cada plantilla declara las variables del wireframe y las usa en su mensaje", () => {
    for (const plantilla of PLANTILLAS_ADMINISTRABLES) {
      assert.deepEqual([...plantilla.variables], ["paciente", "profesional", "fecha", "hora"]);

      const usadas = variablesUsadas(plantilla.mensajePorDefecto);
      assert.deepEqual(
        usadas.sort(),
        ["fecha", "hora", "paciente", "profesional"],
        `mensaje por defecto de ${plantilla.clave}`
      );
    }
  });

  test("el mensaje por defecto de la confirmación es el del wireframe", () => {
    assert.equal(
      getMensajePorDefecto("CONFIRMACION_TURNO_MEDICO"),
      "Hola {{paciente}}, tu turno con {{profesional}} quedó confirmado para el {{fecha}} a las {{hora}}. Si necesitás cancelarlo, hacelo desde tu cuenta."
    );
  });

  test("validación del mensaje editado por el administrador", () => {
    assert.equal(validarMensajePlantilla("CONFIRMACION_TURNO_MEDICO", "  Hola {{paciente}}  "), null);
    assert.match(
      validarMensajePlantilla("CONFIRMACION_TURNO_MEDICO", "   ") ?? "",
      /Ingresá el mensaje/
    );
    assert.match(
      validarMensajePlantilla("CONFIRMACION_TURNO_MEDICO", "Hola {{obra_social}}") ?? "",
      /Variable sin soporte: \{\{obra_social\}\}/
    );
    assert.match(
      validarMensajePlantilla("CONFIRMACION_TURNO_MEDICO", "Hola {{obra_social}}") ?? "",
      /Disponibles: \{\{paciente\}\}, \{\{profesional\}\}, \{\{fecha\}\}, \{\{hora\}\}/
    );
    assert.match(
      validarMensajePlantilla("CONFIRMACION_TURNO_MEDICO", "x".repeat(2001)) ?? "",
      /2000 caracteres/
    );
    assert.match(
      validarMensajePlantilla("PLANTILLA_FANTASMA", "Hola") ?? "",
      /Plantilla inexistente/
    );
  });
});

describe("US-21 · Render con el mensaje administrado", () => {
  const mensajeAdmin =
    "Hola {{paciente}}, te esperamos el {{fecha}} a las {{hora}} con {{profesional}}.";

  test("US-14 · la confirmación usa el mensaje editado y conserva los datos del turno", () => {
    const params = buildConfirmacionTurnoParams(datosTurno);
    const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", params, {
      mensaje: mensajeAdmin,
    });

    assert.equal(rendered.subject, "Tu turno fue confirmado");
    // Variables reemplazadas en HTML y en texto plano.
    assert.match(rendered.html, /Hola Ana Gómez, te esperamos el 20\/10\/2026 a las 10:30 con Dr\. Roberto Rossi\./);
    assert.match(rendered.text, /Hola Ana Gómez, te esperamos el 20\/10\/2026 a las 10:30 con Dr\. Roberto Rossi\./);
    assert.doesNotMatch(rendered.html, /\{\{paciente\}\}/);
    // La tarjeta y las instrucciones de cancelación de US-14 siguen presentes.
    assert.match(rendered.html, /Av\. Siempre Viva 742, Consultorio 3/);
    assert.match(rendered.html, /Mis turnos/);
    assert.match(rendered.html, /Clínica médica/);
  });

  test("US-14 · sin mensaje administrado rige el mensaje por defecto del catálogo", () => {
    const rendered = renderNotificationTemplate(
      "CONFIRMACION_TURNO_MEDICO",
      buildConfirmacionTurnoParams(datosTurno)
    );

    assert.match(rendered.html, /Hola Ana Gómez, tu turno con Dr\. Roberto Rossi quedó confirmado para el 20\/10\/2026 a las 10:30\./);
    assert.match(rendered.html, /Si necesitás cancelarlo, hacelo desde tu cuenta\./);
  });

  test("US-15 · el recordatorio usa el mensaje editado con sus variables", () => {
    const rendered = renderNotificationTemplate(
      "RECORDATORIO_TURNO",
      {
        pacienteNombre: "Federico Luna",
        tipoTurno: "Consulta médica",
        profesionalOArea: "Dra. Laura Pérez",
        fecha: "16/10/2026",
        hora: "09:00",
      },
      { mensaje: mensajeAdmin }
    );

    assert.equal(rendered.subject, "Recordatorio: tenés un turno próximamente");
    assert.match(rendered.html, /Hola Federico Luna, te esperamos el 16\/10\/2026 a las 09:00 con Dra\. Laura Pérez\./);
    assert.match(rendered.text, /Hola Federico Luna, te esperamos el 16\/10\/2026 a las 09:00 con Dra\. Laura Pérez\./);
    // Los datos del turno y el llamado a cancelar siguen en la plantilla.
    assert.match(rendered.html, /Consulta médica/);
    assert.match(rendered.text, /cancelalo/);
  });

  test("el mensaje editado se escapa antes de inyectarse en el HTML", () => {
    const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", {
      ...buildConfirmacionTurnoParams(datosTurno),
      pacienteNombre: "<script>alert(1)</script>",
    }, { mensaje: "Hola {{paciente}}" });

    assert.doesNotMatch(rendered.html, /<script>alert\(1\)<\/script>/);
    assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});

describe("US-21 · Límite de envíos fallidos por destinatario", () => {
  function transporterContador() {
    const estado = { enviados: 0 };
    const transporter = {
      sendMail: async () => {
        estado.enviados++;
        return { messageId: "msg-1" };
      },
    } as unknown as Transporter;
    return { estado, transporter };
  }

  test("al alcanzar el límite el servicio deja de reintentar y no intenta el envío", async () => {
    const { estado, transporter } = transporterContador();
    setTransporterForTesting(transporter);
    setEnviosFallidosProviderForTesting(async () => 3); // límite por defecto: 3

    const result = await sendNotificationEmail({
      to: "paciente@example.com",
      template: "CONFIRMACION_TURNO_MEDICO",
      params: buildConfirmacionTurnoParams(datosTurno),
    });

    assert.equal(result.success, false);
    assert.equal(result.limitado, true);
    assert.equal(result.attempts, 0);
    assert.match(result.error ?? "", /límite de 3 envíos fallidos/);
    assert.equal(estado.enviados, 0, "no se intenta ningún envío");
  });

  test("por debajo del límite el envío se intenta con normalidad", async () => {
    const { estado, transporter } = transporterContador();
    setTransporterForTesting(transporter);
    setEnviosFallidosProviderForTesting(async () => 2);

    const result = await sendNotificationEmail({
      to: "paciente@example.com",
      template: "RECORDATORIO_TURNO",
      params: {
        pacienteNombre: "Federico Luna",
        tipoTurno: "Consulta médica",
        profesionalOArea: "Dra. Laura Pérez",
        fecha: "16/10/2026",
        hora: "09:00",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.limitado, undefined);
    assert.equal(estado.enviados, 1);
  });
});
