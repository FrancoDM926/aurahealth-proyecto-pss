import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  renderNotificationTemplate,
  executeWithRetry,
  sendNotificationEmail,
  setTransporterForTesting,
  resetTransporter,
} from "../src/services/email";
import type { Transporter } from "nodemailer";

describe("US-21 — Servicio de envío de notificaciones por email", () => {
  describe("Criterio 2: Plantillas parametrizadas desacopladas de la lógica de negocio", () => {
    test("Renderiza confirmación de turno médico con datos correctos", () => {
      const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", {
        pacienteNombre: "Carlos Gómez",
        doctorNombre: "Dra. Laura Pérez",
        especialidad: "Clínica Médica",
        fecha: "20/10/2026",
        hora: "10:30",
        direccion: "Consultorio 4 - AuraHealth",
        costoConsulta: 15000,
      });

      // Asunto fijo por plantilla, según el wireframe wf_servicio_email.html.
      assert.equal(rendered.subject, "Tu turno fue confirmado");
      assert.match(rendered.html, /Carlos Gómez/);
      assert.match(rendered.html, /Dra\. Laura Pérez/);
      assert.match(rendered.html, /Clínica Médica/);
      assert.match(rendered.html, /\$15\.000/);
      assert.match(rendered.text, /Consultorio 4 - AuraHealth/);
    });

    test("Renderiza confirmación de turno de vacunatorio con datos correctos", () => {
      const rendered = renderNotificationTemplate("CONFIRMACION_TURNO_VACUNATORIO", {
        pacienteNombre: "Ana Torres",
        vacunaNombre: "Antigripal 2026",
        enfermeraNombre: "Enf. Marcela Ríos",
        fecha: "22/10/2026",
        hora: "14:00",
        indicaciones: "Traer carnet y documento.",
      });

      assert.match(rendered.subject, /Confirmación de Turno de Vacunación/);
      assert.match(rendered.html, /Ana Torres/);
      assert.match(rendered.html, /Antigripal 2026/);
      assert.match(rendered.html, /Enf\. Marcela Ríos/);
      assert.match(rendered.html, /Traer carnet y documento/);
      assert.match(rendered.text, /Vacunatorio Central/);
    });

    test("Renderiza aviso de cancelación de turno médico", () => {
      const rendered = renderNotificationTemplate("CANCELACION_TURNO_MEDICO", {
        pacienteNombre: "Martín Benítez",
        doctorNombre: "Dr. Roberto Rossi",
        especialidad: "Traumatología",
        fecha: "18/10/2026",
        hora: "16:00",
        motivo: "Imposibilidad médica imprevista.",
      });

      assert.match(rendered.subject, /Tu turno fue cancelado/);
      assert.match(rendered.html, /Martín Benítez/);
      assert.match(rendered.html, /Traumatología/);
      assert.match(rendered.html, /Imposibilidad médica imprevista/);
      assert.match(rendered.text, /Dr\. Roberto Rossi/);
    });

    test("Renderiza aviso de cancelación en vacunatorio", () => {
      const rendered = renderNotificationTemplate("CANCELACION_TURNO_VACUNATORIO", {
        pacienteNombre: "Julieta Romero",
        vacunaNombre: "Hepatitis B",
        fecha: "25/10/2026",
        hora: "11:30",
        motivo: "Reasignación de horarios.",
      });

      assert.match(rendered.subject, /Cancelación de Turno en Vacunatorio/);
      assert.match(rendered.html, /Julieta Romero/);
      assert.match(rendered.html, /Hepatitis B/);
      assert.match(rendered.text, /Reasignación de horarios/);
    });

    test("Renderiza recordatorio de turno", () => {
      const rendered = renderNotificationTemplate("RECORDATORIO_TURNO", {
        pacienteNombre: "Federico Luna",
        tipoTurno: "Consulta médica",
        profesionalOArea: "Dra. Laura Pérez (Clínica)",
        fecha: "16/10/2026",
        hora: "09:00",
      });

      assert.match(rendered.subject, /Recordatorio: tenés un turno próximamente/);
      assert.match(rendered.html, /Federico Luna/);
      assert.match(rendered.html, /Dra\. Laura Pérez/);
      assert.match(rendered.text, /09:00 hs/);
    });

    test("Renderiza bienvenida tras autorregistro y alta interna", () => {
      const bienvenida = renderNotificationTemplate("BIENVENIDA_REGISTRO", {
        nombre: "Valeria Díaz",
        email: "valeria@example.com",
        loginUrl: "https://aurahealth.com/sign-in",
      });

      assert.match(bienvenida.subject, /Bienvenido\/a a AuraHealth/);
      assert.match(bienvenida.html, /Valeria Díaz/);
      assert.match(bienvenida.html, /valeria@example.com/);
      assert.match(bienvenida.html, /https:\/\/aurahealth\.com\/sign-in/);

      const altaInterna = renderNotificationTemplate("ALTA_USUARIO_INTERNO", {
        nombre: "Lucas Sanabria",
        email: "lucas@aurahealth.com",
        rol: "ADMINISTRATIVO",
        loginUrl: "https://aurahealth.com/dashboard",
      });

      assert.match(altaInterna.subject, /Rol asignado: ADMINISTRATIVO/);
      assert.match(altaInterna.html, /Lucas Sanabria/);
      assert.match(altaInterna.html, /ADMINISTRATIVO/);
    });

    test("Lanza error ante tipo de plantilla no registrado", () => {
      assert.throws(
        () => {
          // @ts-expect-error probando valor inválido
          renderNotificationTemplate("PLANTILLA_INEXISTENTE", {});
        },
        {
          message: /Plantilla desconocida/,
        }
      );
    });
  });

  describe("Criterio 3: Reintentos acotados ante envíos fallidos", () => {
    test("Envío exitoso en el primer intento no reintenta", async () => {
      let callCount = 0;
      const { result, attempts } = await executeWithRetry(
        async () => {
          callCount++;
          return "OK";
        },
        { maxRetries: 3, initialDelayMs: 1, sleepFn: async () => {} }
      );

      assert.equal(result, "OK");
      assert.equal(attempts, 1);
      assert.equal(callCount, 1);
    });

    test("Reintenta tras fallos transitorios y tiene éxito antes del límite", async () => {
      let callCount = 0;
      const retryEvents: number[] = [];

      const { result, attempts } = await executeWithRetry(
        async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error(`Fallo temporal #${callCount}`);
          }
          return "SUCCESS_ON_THIRD";
        },
        {
          maxRetries: 3,
          initialDelayMs: 10,
          sleepFn: async () => {},
          onRetry: (attempt) => retryEvents.push(attempt),
        }
      );

      assert.equal(result, "SUCCESS_ON_THIRD");
      assert.equal(attempts, 3);
      assert.equal(callCount, 3);
      assert.deepEqual(retryEvents, [1, 2]);
    });

    test("Falla y agota exactamente la cantidad acotada de reintentos configurada", async () => {
      let callCount = 0;
      const maxRetries = 3;

      await assert.rejects(
        async () => {
          await executeWithRetry(
            async () => {
              callCount++;
              throw new Error("SMTP_CONNECTION_REFUSED");
            },
            {
              maxRetries,
              initialDelayMs: 1,
              sleepFn: async () => {},
            }
          );
        },
        (err: Error & { attempts?: number }) => {
          assert.equal(err.message, "SMTP_CONNECTION_REFUSED");
          assert.equal(err.attempts, 3);
          return true;
        }
      );

      assert.equal(callCount, 3);
    });
  });

  describe("Criterio 1: Componente único centralizado de envío (sendNotificationEmail)", () => {
    test("Rechaza inmediatamente si el email de destino no es válido", async () => {
      await assert.rejects(
        async () => {
          await sendNotificationEmail({
            to: "email-invalido",
            template: "BIENVENIDA_REGISTRO",
            params: { nombre: "Test", email: "email-invalido" },
          });
        },
        {
          message: /Dirección de destinatario inválida/,
        }
      );
    });

    test("Despacha correctamente con mock transporter y reporta intentos", async () => {
      let sentCount = 0;
      const mockTransporter = {
        sendMail: async (opts: unknown) => {
          sentCount++;
          return { messageId: "msg-12345", response: "250 OK", options: opts };
        },
      } as unknown as Transporter;

      setTransporterForTesting(mockTransporter);

      try {
        const result = await sendNotificationEmail({
          to: "paciente@example.com",
          template: "CONFIRMACION_TURNO_MEDICO",
          params: {
            pacienteNombre: "Juan Perez",
            doctorNombre: "Dr. Gómez",
            especialidad: "Pediatría",
            fecha: "18/10/2026",
            hora: "11:00",
          },
          initialDelayMs: 1,
        });

        assert.equal(result.success, true);
        assert.equal(result.attempts, 1);
        assert.equal(result.messageId, "msg-12345");
        assert.equal(sentCount, 1);
      } finally {
        resetTransporter();
      }
    });

    test("Marca como FAILED tras agotar los reintentos cuando el transporter falla", async () => {
      let failCount = 0;
      const failingTransporter = {
        sendMail: async () => {
          failCount++;
          throw new Error("SMTP 550 Mailbox unavailable");
        },
      } as unknown as Transporter;

      setTransporterForTesting(failingTransporter);

      try {
        const result = await sendNotificationEmail({
          to: "fallo@example.com",
          template: "RECORDATORIO_TURNO",
          params: {
            pacienteNombre: "Carlos",
            tipoTurno: "Consulta médica",
            profesionalOArea: "Traumatología",
            fecha: "19/10/2026",
            hora: "15:00",
          },
          maxRetries: 3,
          initialDelayMs: 1,
        });

        assert.equal(result.success, false);
        assert.equal(result.attempts, 3);
        assert.equal(failCount, 3);
        assert.match(result.error || "", /SMTP 550 Mailbox unavailable/);
      } finally {
        resetTransporter();
      }
    });
  });
});
