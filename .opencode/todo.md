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

---

# Misión: US-40, US-41 y US-62 (historial clínico), a la espera de US-39

Objetivo: implementar las tres historias que dependen de la ficha de diagnóstico
(`US-40` consulta consolidada para el médico, `US-41` historial del paciente con PDF y
`US-62` adjuntos de estudios) sobre un contrato de datos compartido con `US-39`.
La `US-39` la está implementando otro integrante y todavía no está en la rama: al
integrarse, hay que reconciliar nombres/acciones del esquema y completar el enlace
desde «Estado de turnos».

Fuentes: `ctxt/03-user-stories.md` (US-40/41/62), `wireframes aurahealth/wf_ficha_consolidada.html`,
`wf_historial_paciente.html`, `wf_adjuntos_estudios.html`, `wf_ficha_diagnostico.html`,
`ctxt/04-reglas-de-negocio-y-glosario.md` (RN-07, RNF-03, RNF-04) y `ctxt/06-estructura-del-dominio.md` §2.6.

## M1: Contrato de datos y configuración — status: completed
- [x] S1.1.1: modelos `FichaDiagnostico`, `EntradaFicha`, `AdjuntoEstudio` y `AccesoHistorialLog` en `prisma/schema.prisma` — `prisma validate` y `prisma generate` OK
- [x] S1.1.2: `Configuracion.adjuntoMaxMB` (default 10) + `getAdjuntoMaxMB()` en `src/lib/configuracion.ts` + formulario del administrador
- [x] S1.1.3: migración SQL `20261108180000_us40_us41_us62_historial` escrita y `prisma generate` ejecutado. **No aplicada**: Neon inalcanzable desde este entorno (`ECONNREFUSED`); se aplica con `npx prisma migrate deploy` al desplegar.
- [x] S1.1.4: `experimental.serverActions.bodySizeLimit = "30mb"` en `next.config.ts`

## M2: Lógica pura y consultas — status: completed
- [x] S2.1.1: `src/lib/historial.ts` (filtros, agrupación inversa, validación de adjuntos, permisos, formateo)
- [x] S2.1.2: `src/services/historial/consultas.ts` y `auditoria.ts` (RNF-04, accesos exitosos y rechazados)
- [x] S2.1.3: `src/lib/historial-pdf.ts` (PDF de US-41 sin notas internas)

## M3: US-40 — consulta consolidada — status: completed
- [x] S3.1.1: `/dashboard/historial` con filtros por paciente (documento/apellido), profesional, especialidad y rango
- [x] S3.1.2: fichas agrupadas por médico con autor/especialidad y entradas en orden inverso; solo lectura
- [x] S3.1.3: enlace «Historial» en `DashboardShell` para MEDICO y registro de auditoría del acceso

## M4: US-41 — historial del paciente — status: completed
- [x] S4.1.1: `/dashboard/mi-historial` de solo lectura, sin notas internas, con todas las fichas propias
- [x] S4.1.2: `/api/historial/pdf` con descarga en PDF y auditoría; rechazo registrado de accesos ajenos (`?paciente=`)
- [x] S4.1.3: enlace «Mi historial» para USUARIO

## M5: US-62 — adjuntos — status: completed
- [x] S5.1.1: `/dashboard/historial/entradas/[id]` con entrada, alta de estudio y listado
- [x] S5.1.2: validación de tipo/tamaño configurable y carga solo por el médico autor de la ficha (`subirAdjuntoAction`)
- [x] S5.1.3: `/api/historial/adjuntos/[id]` con descarga para el médico o el paciente dueño y auditoría

## M6: Pruebas y verificación — status: completed
- [x] S6.1.1: `tests/us40-41-62-historial.test.ts` (19 pruebas nuevas: filtros, orden, permisos, adjuntos y PDF)
- [x] S6.1.2: `npm test` → 294/294 verdes · `npx tsc --noEmit` sin errores · `npm run lint` → solo los 8 problemas preexistentes (archivos no tocados) · `npx next build` exitoso con `/dashboard/historial`, `/dashboard/historial/entradas/[id]`, `/dashboard/mi-historial`, `/api/historial/pdf` y `/api/historial/adjuntos/[id]`
- [x] S6.1.3: nota de integración con US-39 registrada abajo

## Contrato a reconciliar cuando llegue US-39
- Tablas: `FichaDiagnostico` (única por `pacienteId`+`medicoId`), `EntradaFicha` (firmada por el médico del turno, `editadaEn` para la última edición, `turnoId` único) y `AdjuntoEstudio` (vinculada a `entradaId`).
- La US-39 debe crear la ficha y sus entradas con esos nombres o adaptar **solo** `src/services/historial/consultas.ts` y `src/actions/historial.ts`.
- Falta el enlace desde «Estado de turnos» (entrada de US-39) hacia `/dashboard/historial?paciente=<id>` («Ver fichas de este paciente»).
- `EntradaFicha.notasInternas` es opcional y nunca se selecciona en US-41; si US-39 no la usa, se puede quitar sin impacto.

Estado: **historias 40, 41 y 62 implementadas y verificadas estáticamente; integración final pendiente de la US-39 y de aplicar la migración contra la base real.**

---

# Integración con US-39 (pull `405981e`) — completada

US-39 quedó como contrato canónico: `FichaDiagnostico` (`doctorId`, `patientKey`,
`patientName`) y `FichaDiagnosticoEntrada` (`diagnosis`, `treatment`, `observations`,
`consultationDate`, `consultationTime`, `authorId`, `authorName`, `updatedAt`,
`replacesEntryId`).

## Qué se reconcilió
- `prisma/schema.prisma`: se eliminaron `FichaDiagnostico` y `EntradaFicha`
  provisorios; `AdjuntoEstudio` apunta a `FichaDiagnosticoEntrada`; `AccesoHistorialLog`
  usa `pacienteKey String?` sin FK (las personas atendidas no tienen fila en `User`).
- Migración `20261109000000_us40_us41_us62_historial` (renombrada para correr
  **después** de US-39): solo agrega `Configuracion.adjuntoMaxMB`, `AdjuntoEstudio`,
  `AccesoHistorialLog` y sus enums/índices/FKs.
- `src/services/historial/consultas.ts`: consulta el modelo de US-39, arma el instante
  de la consulta (`@db.Date` + hora de la sala), resuelve `patientKey` y documentos
  buscando en `User` y `PersonaAtendida`, y mapea `authorName`/`updatedAt`.
- `src/lib/historial.ts`: filtros con `patientKey` exacto y permisos por `patientKey`
  (`USER:<id>` / `PERSONA:<id>`).
- `src/services/historial/auditoria.ts` y rutas: auditan `pacienteKey`.
- `src/actions/historial.ts`: valida titularidad con `ficha.doctorId` y guarda el
  adjunto sobre `FichaDiagnosticoEntrada`.
- `/dashboard/ficha-consolidada` (US-39) redirige a
  `/dashboard/historial?patientKey=...`; `/dashboard/historial` acepta ese parámetro
  y conserva el enlace «Abrir ficha» hacia `/dashboard/ficha-diagnostico?fichaId=...`.

## Verificación posterior a la integración
- `npx prisma format`, `npx prisma validate`, `npx prisma generate`: OK.
- `npx tsc --noEmit`: sin errores.
- `npm test`: **302/302 verdes** (incluye las pruebas de US-39).
- `npm run lint`: solo los 8 problemas preexistentes, ninguno en archivos nuevos.
- `npx next build`: exitoso; se publican las rutas de historial y las de US-39.

## Pendiente
- Aplicar `20261108230000_us39_ficha_diagnostico` y luego
  `20261109000000_us40_us41_us62_historial` contra la base real cuando Neon esté
  accesible (`npx prisma migrate deploy`).
- Probar el flujo completo con datos reales (cargar entrada desde «Estado de turnos»,
  verla en `/dashboard/historial` y `/dashboard/mi-historial`, adjuntar y descargar).
- Si se despliega en Vercel, revisar el límite de 4.5 MB del body de las funciones
  serverless frente al máximo configurable de 10 MB.
