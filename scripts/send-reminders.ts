/**
 * US-15 — Corrida del proceso de recordatorios de turno desde la línea de
 * comandos. Pensado para un cron del sistema operativo cuando la app no corre
 * en Vercel (ahí el scheduler es `vercel.json`).
 *
 * Uso:
 *   npx tsx scripts/send-reminders.ts
 *
 * Crontab de ejemplo (todas las horas, en punto):
 *   0 * * * * cd /ruta/al/proyecto && npx tsx scripts/send-reminders.ts >> /var/log/aurahealth-reminders.log 2>&1
 *
 * El envío usa Gmail como SMTP (SMTP_HOST=smtp.gmail.com + contraseña de
 * aplicación). La API de Gmail no tiene "envío programado": la programación la
 * aporta este cron.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // entorno ya cargado
}

async function main() {
  const { procesarRecordatoriosPendientes } = await import(
    "../src/services/notificaciones/turno-recordatorio"
  );

  console.log(`[US-15] Procesando recordatorios — ${new Date().toISOString()}`);
  const resumen = await procesarRecordatoriosPendientes();

  console.log(
    `[US-15] Antelación: ${resumen.antelacionHoras} h | ` +
      `candidatos: ${resumen.candidatos} | en ventana: ${resumen.enVentana} | ` +
      `enviados: ${resumen.enviados} | fallidos: ${resumen.fallidos}`
  );

  for (const r of resumen.resultados) {
    const estado = r.enviado ? "ENVIADO" : `OMITIDO (${r.motivo ?? "sin motivo"})`;
    console.log(`  - ${r.turnoId}: ${estado}${r.error ? ` — ${r.error}` : ""}`);
  }

  // El proceso nunca lanza por fallos de envío individuales; si algo revienta
  // antes (p. ej. sin conexión a la base) el cron debe enterarse.
  if (resumen.fallidos > 0 && resumen.enviados === 0) {
    process.exitCode = 1;
    console.warn("[US-15] No se pudo enviar ningún recordatorio en esta corrida.");
  }
}

main().catch((error) => {
  console.error("[US-15] Error fatal en el proceso de recordatorios:", error);
  process.exit(1);
});
