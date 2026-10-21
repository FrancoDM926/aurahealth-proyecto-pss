# US-15 — Recordatorio automático de turno

Objetivo: enviar por email un recordatorio antes de cada turno reservado, con la antelación que
configura el administrador (inicial 24 h), sin recordar turnos cancelados, sin duplicados ante
reintentos del proceso, de forma automática y con registro de cada envío.

Trazabilidad: RF-TUR-04, RF-NOT-01. Depende de US-13 (turno reservado) y US-21 (servicio de email).

Decisiones:
- Gmail no expone "envío programado" por API (solo la UI web). Se usa Gmail vía SMTP con
  contraseña de aplicación y el envío programado lo aporta nuestro scheduler (Vercel Cron o cron
  del sistema invocando el endpoint/script).
- Idempotencia durable en `Turno.recordatorioEstado`: el proceso "reclama" el turno con un UPDATE
  condicional (PENDIENTE → ENVIADO). Si el envío falla, vuelve a PENDIENTE para reintentar; una vez
  ENVIADO no se reenvía nunca más, aunque el proceso corra de nuevo.
- El registro de cada envío queda en `EmailAuditLog` (US-21) y se enlaza con
  `Turno.recordatorioEmailLogId`.

## M1: Esquema y migración — completed
- [x] `Configuracion.recordatorioAntelacionHoras` (default 24)
- [x] `Turno`: `recordatorioEstado`, `recordatorioEnviadoAt`, `recordatorioIntentos`, `recordatorioUltimoError`, `recordatorioEmailLogId`
- [x] Migración `20261015130000_us15_recordatorio_turno` + `prisma generate` + `migrate deploy`

## M2: Lógica pura — completed
- [x] `src/lib/recordatorios.ts`: ventana, selección, validación de antelación, mapper a params

## M3: Servicio de recordatorios — completed
- [x] `src/services/notificaciones/turno-recordatorio.ts`: claim idempotente, obtener, enviar, marcar estado
- [x] `procesarRecordatoriosPendientes`: corre el lote completo y resume

## M4: Config y disparo manual (admin) — completed
- [x] `getRecordatorioAntelacion()` / `saveRecordatorioAntelacion()` + action
- [x] Form de antelación + botón "Ejecutar ahora" en la página de configuración

## M5: Automatización + Gmail — completed
- [x] Endpoint `GET/POST /api/notifications/reminders` (cron secret / admin)
- [x] `scripts/send-reminders.ts` para cron del sistema
- [x] `vercel.json` con el cron + `.env.example` con Gmail + README

## M6: Pruebas y verificación — completed
- [x] `tests/us15-recordatorio-turno.test.ts`
- [x] `npm test` (93/93 verdes)
- [x] `npx tsc --noEmit` (sin errores)
- [x] `npm run lint` (sin problemas nuevos)
- [x] `npm run build` (exitoso)

## Resultado
- Todos los criterios de aceptación de US-15 cumplen. El proceso de recordatorios es automático (con scheduler configurable), idempotente, excluye turnos cancelados y deja registro de cada envío. Gmail se configura por SMTP; el "envío programado" lo aporta el cron externo/documentado (Vercel Cron o system cron).
