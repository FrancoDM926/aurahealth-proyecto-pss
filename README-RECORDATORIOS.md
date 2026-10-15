## US-15 — Recordatorios automáticos de turno

El sistema envía un recordatorio por email con antelación configurable respecto del horario del turno (valor inicial **24 horas**).

### Funcionamiento

- **Lógica**: `src/lib/recordatorios.ts` y `src/services/notificaciones/turno-recordatorio.ts`
- **Plantilla**: `RECORDATORIO_TURNO` (`src/services/email/templates/turno-recordatorio.ts`)
- **Configuración (admin)**: `/dashboard/admin/configuracion` permite definir la antelación (horas, entero 1..168) y ejecutar el proceso manualmente.
- **Idempotencia**: cada turno es reclamado atómicamente (`Turno.recordatorioEstado` PENDIENTE → ENVIADO). Un turno ya ENVIADO no se reenvía jamás, aun cuando el proceso se ejecute de nuevo. Si el envío falla, el estado vuelve a PENDIENTE para reintentar en la próxima corrida.
- **Registro**: queda registrado en `EmailAuditLog` (US-21). `Turno.recordatorioEmailLogId` enlaza el envío al turno.
- **Filtro de turnos**: solo turnos `RESERVADO` con `reservedById` no nulo, dentro de la ventana `[ahora, ahora + antelaciónHoras]` y aún pendientes de recordatorio. **No** se envía a turnos cancelados.

### Programación automática (scheduler)

La API de Gmail **no expone "envío programado"** por API (solo lo tiene la UI web). Para tener el proceso automático se utiliza:

1. **Gmail vía SMTP** (`smtp.gmail.com:465`) con contraseña de aplicación. Configurar en `.env`:
   ```env
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="465"
   SMTP_SECURE="true"
   SMTP_USER="tu-correo@gmail.com"
   SMTP_PASS="contraseña-de-aplicación"
   SMTP_FROM='"AuraHealth" <tu-correo@gmail.com>'
   NOTIFICATIONS_CRON_SECRET="secreto-seguro"
   CRON_SECRET="secreto-seguro"  # opcional para Vercel Cron
   ```
2. **Scheduler que ejecute el proceso**. Dos opciones disponibles:
   - **Vercel Cron**: `vercel.json` define `/api/notifications/reminders` cada hora (`"0 * * * *"`). Acepta `Authorization: Bearer <CRON_SECRET>` automáticamente.
   - **Cron del sistema**: `scripts/send-reminders.ts`. Ejemplo de `crontab`:
     ```cron
     0 * * * * cd /ruta/aurahealth-proyecto-pss && npx tsx scripts/send-reminders.ts >> /var/log/aurahealth-reminders.log 2>&1
     ```

#### Endpoint HTTP

`GET/POST /api/notifications/reminders`
- Autoriza con Bearer (`NOTIFICATIONS_CRON_SECRET` o `CRON_SECRET`) **o** con sesión activa con rol `ADMINISTRADOR`.
- Responde con el resumen (`enviados`, `fallidos`, `candidatos`, `antelacionHoras`, etc.).

### Recomendación para producción

- Usar **cron del sistema** o un servicio externo (cron-job.org, EasyCron, etc.) si el plan de hosting no permite cron cada hora (Vercel Hobby permite 1 cron diario). Con antelación por defecto 24 h es suficiente ejecutarlo 1-2 veces al día; con antelaciones menores conviene cada hora.
- Asegurar la unicidad del recordatorio: la idempotencia por estado `ENVIADO` cumple el criterio **"un único recordatorio por turno, sin duplicados ante reintentos del proceso"**.
- Los fallos de envío individuales **no bloquean** el lote: quedan registrados en `EmailAuditLog` y en `Turno.recordatorioUltimoError`, y el turno vuelve a PENDIENTE para reintento en la próxima corrida.

### Verificación rápida

1. Crear un turno reservado para hoy/mañana con un email de prueba.
2. Ajustar antelación a 1-2 h para que entre en ventana (o simular fecha).
3. Ejecutar manualmente desde `/dashboard/admin/configuracion → Ejecutar recordatorios ahora`.
4. Verificar que llega el email y que un segundo intento no lo duplica.
5. Comprobar que un turno `CANCELADO` no recibe recordatorio.