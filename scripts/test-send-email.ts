/**
 * Script de prueba para verificar el envío real de notificaciones por email a una casilla propia.
 *
 * Uso:
 *   npx tsx scripts/test-send-email.ts <tu-email> [tipo-plantilla]
 *
 * Ejemplo:
 *   npx tsx scripts/test-send-email.ts micorreo@gmail.com
 *   npx tsx scripts/test-send-email.ts micorreo@gmail.com RECORDATORIO_TURNO
 */

try {
  process.loadEnvFile(".env");
} catch {
  // entorno ya cargado
}

import { NotificationTemplateType } from "../src/services/email/types";

async function main() {
  const { sendNotificationEmail } = await import("../src/services/email");
  const args = process.argv.slice(2);
  const targetEmail = args[0];
  const templateType = (args[1] || "CONFIRMACION_TURNO_MEDICO") as NotificationTemplateType;

  if (!targetEmail || !targetEmail.includes("@")) {
    console.error("❌ Uso incorrecto. Debes indicar un email de destino válido:");
    console.error("   npx tsx scripts/test-send-email.ts <tu-email> [tipo-plantilla]\n");
    console.error("Plantillas disponibles:");
    console.error(" - CONFIRMACION_TURNO_MEDICO (default)");
    console.error(" - CONFIRMACION_TURNO_VACUNATORIO");
    console.error(" - CANCELACION_TURNO_MEDICO");
    console.error(" - RECORDATORIO_TURNO");
    console.error(" - BIENVENIDA_REGISTRO");
    process.exit(1);
  }

  console.log("------------------------------------------------------------------");
  console.log("📧 Probando Servicio de Envíos AuraHealth (US-21)");
  console.log("------------------------------------------------------------------");
  console.log(`Destinatario : ${targetEmail}`);
  console.log(`Plantilla    : ${templateType}`);
  console.log(`Servidor SMTP: ${process.env.SMTP_HOST || "(Modo mock / local sin host configurado)"}`);
  console.log(`Puerto SMTP  : ${process.env.SMTP_PORT || "587"}`);
  console.log(`Remitente    : ${process.env.SMTP_FROM || 'notificaciones@aurahealth.com'}`);
  console.log("------------------------------------------------------------------\n");

  if (!process.env.SMTP_HOST) {
    console.warn("⚠️ AVISO: No has configurado 'SMTP_HOST' en el archivo .env.");
    console.warn("   El sistema usará el modo simulado de prueba (no saldrá a internet).");
    console.warn("   Para recibir el correo real en tu casilla, completa SMTP_HOST, SMTP_USER y SMTP_PASS en .env.\n");
  }

  console.log("⏳ Enviando notificación con reintentos y auditoría...");

  let result;
  switch (templateType) {
    case "CONFIRMACION_TURNO_VACUNATORIO":
      result = await sendNotificationEmail({
        to: targetEmail,
        template: "CONFIRMACION_TURNO_VACUNATORIO",
        params: {
          pacienteNombre: "Paciente de Prueba",
          vacunaNombre: "Antigripal Cepa 2026",
          enfermeraNombre: "Enf. Marcela Ríos",
          fecha: "20/10/2026",
          hora: "10:30",
          indicaciones: "Asistir con documento y carnet de vacunas.",
        },
      });
      break;

    case "CANCELACION_TURNO_MEDICO":
      result = await sendNotificationEmail({
        to: targetEmail,
        template: "CANCELACION_TURNO_MEDICO",
        params: {
          pacienteNombre: "Paciente de Prueba",
          doctorNombre: "Dra. Laura Pérez",
          especialidad: "Clínica Médica",
          fecha: "20/10/2026",
          hora: "10:30",
          motivo: "Cancelación solicitada por el paciente.",
        },
      });
      break;

    case "RECORDATORIO_TURNO":
      result = await sendNotificationEmail({
        to: targetEmail,
        template: "RECORDATORIO_TURNO",
        params: {
          pacienteNombre: "Paciente de Prueba",
          tipoTurno: "Consulta médica",
          profesionalOArea: "Dra. Laura Pérez (Clínica Médica)",
          fecha: "Mañana a las 10:30",
          hora: "10:30",
        },
      });
      break;

    case "BIENVENIDA_REGISTRO":
      result = await sendNotificationEmail({
        to: targetEmail,
        template: "BIENVENIDA_REGISTRO",
        params: {
          nombre: "Paciente de Prueba",
          email: targetEmail,
          loginUrl: "http://localhost:3000/sign-in",
        },
      });
      break;

    case "CONFIRMACION_TURNO_MEDICO":
    default:
      result = await sendNotificationEmail({
        to: targetEmail,
        template: "CONFIRMACION_TURNO_MEDICO",
        params: {
          pacienteNombre: "Paciente de Prueba",
          doctorNombre: "Dra. Laura Pérez",
          especialidad: "Clínica Médica",
          fecha: "20/10/2026",
          hora: "10:30",
          direccion: "Consultorios AuraHealth - Piso 1, Consultorio 3",
          costoConsulta: 18000,
        },
      });
      break;
  }

  console.log("\n================ RESULTADO DEL ENVÍO ================");
  console.log("Éxito        :", result.success ? "✅ SÍ" : "❌ NO");
  console.log("Intentos     :", result.attempts);
  console.log("ID Auditoría :", result.logId || "(Sin DB)");
  if (result.messageId) {
    console.log("MessageId    :", result.messageId);
  }
  if (result.error) {
    console.log("Error        :", result.error);
  }
  console.log("=====================================================\n");
}

main().catch((err) => {
  console.error("💥 Error fatal al ejecutar script:", err);
  process.exit(1);
});
