# Misión: adaptar US-21, US-14 y US-15 a los wireframes nuevos — COMPLETADA

Objetivo: alinear la implementación con `wireframes aurahealth/wf_servicio_email.html`
(US-21, Versión 5/6 del diseño): pantalla propia de administración del servicio de
email con (1) listado de plantillas, (2) edición del mensaje con variables y asunto
fijo no editable, y (3) límite de envíos fallidos por destinatario. US-14 (confirmación)
y US-15 (recordatorio) siguen sin pantalla propia: usan las plantillas que administra
US-21, tal como dice `DESIGN.md`.

Fuente de verdad: `wireframes aurahealth/wf_servicio_email.html` + `DESIGN.md`.
La misión anterior (US-15 recordatorio) está registrada en `.opencode/mission-ledger.jsonl`.

## M1: Esquema y persistencia — status: completed
- [x] S1.1.1: `PlantillaEmail` (clave + mensaje editable) y `Configuracion.maxEnviosFallidosPorUsuario` (default 3) en `prisma/schema.prisma` — verificado con `npx prisma generate`
- [x] S1.1.2: Migración `prisma/migrations/20261021190000_us21_servicio_email_admin`
- [x] S1.1.3: `npx prisma migrate deploy` — «All migrations have been successfully applied»

## M2: Servicio de email (US-21) — status: completed
- [x] S2.1.1: `src/services/email/catalogo.ts` (3 plantillas del wireframe, variables, mensajes por defecto, validación y sustitución de `{{variables}}`)
- [x] S2.1.2: Asuntos fijos del wireframe: «Tu turno fue confirmado» (US-14), «Recordatorio: tenés un turno próximamente» (US-15), «Tu turno fue cancelado» (US-16)
- [x] S2.2.1: renderers de confirmación/recordatorio/cancelación aceptan el mensaje administrado y conservan la tarjeta de datos + instrucciones de cancelación de US-14
- [x] S2.2.2: `sendNotificationEmail` inyecta el mensaje guardado (`getMensajePlantilla`)
- [x] S2.3.1: `getEnviosFallidosMax()` + `enviosFallidosDe()` con fallback si no hay DB (`src/services/email/plantillas.ts`)
- [x] S2.3.2: gate en `sendNotificationEmail` → `limitado: true`, sin intento SMTP
- [x] S2.3.3: `saveEnviosFallidosAction` y `saveMensajePlantillaAction` con `assertRoles(["ADMINISTRADOR"])`

## M3: Pantalla "Emails" — status: completed
- [x] S3.1.1: `/dashboard/admin/emails` con los 3 bloques del wireframe (listado, edición, envíos fallidos) + callout y pie
- [x] S3.1.2: nav «Emails» en `DashboardShell` (solo ADMINISTRADOR)
- [x] S3.1.3: `email-mensaje-form.tsx`, `email-fallidos-form.tsx` y `src/actions/email-admin.ts`

## M4: Pruebas y verificación — status: completed
- [x] S4.1: `tests/us21-servicio-email-admin.test.ts` (10 tests nuevos: catálogo, validación, render con mensaje, escape HTML, límite de fallidos)
- [x] S4.2: aserciones de asunto actualizadas en `tests/email.test.ts` y `tests/us15-recordatorio-turno.test.ts`
- [x] S4.3: `npm test` → 127/127 verdes · `npx tsc --noEmit` sin errores · `npm run lint` → solo 8 problemas preexistentes en archivos no tocados (`mis-datos-form`, `internal-users-panel`, `user.ts`, `estado-turnos.ts`, `availability-rn02.ts`) · `npm run build` exitoso, ruta `/dashboard/admin/emails` publicada
- [x] S4.4: verificación end-to-end contra la base real (script temporal, ya borrado): mensaje por defecto desde BD, mensaje editable persistido, variables sustituidas, asunto fijo, límite = 3 leído desde `Configuracion`, envío bloqueado sin tocar SMTP y envío normal por debajo del límite. Filas temporales eliminadas (0 restantes) y config restaurada (maxEnviosFallidos = 3, antelación de recordatorio = 22 intacta).

## M5: Reporte — status: completed
- [x] S5.1: vistas cambiadas informadas en el reporte final de la sesión.

Estado: **completada**. Cambios sin commitear (quedan para revisión del equipo en la
rama `TotaroRuedaMammoni`).
