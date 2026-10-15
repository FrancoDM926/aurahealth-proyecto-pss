# US-14 — Confirmación de reserva por email

Objetivo: enviar email dentro del minuto de confirmar el turno, con profesional, especialidad,
fecha, hora y dirección de la sala; indicar de quién es el turno si es a nombre de otra persona;
incluir instrucciones de cancelación; y que un fallo de envío no invalide la reserva (queda
registrado por el servicio de US-21).

Decisiones: consumir el servicio único de US-21; extender su plantilla (aNombreDe + instrucciones);
migración propia a mano solo de `Turno` + `Configuracion`. La migración de `EmailAuditLog` queda
diferida (la tabla ya existe en la base, creada por fuera).

## M1: Prerrequisitos y esquema — completed
- [x] `npm install` (nodemailer + @types)
- [x] `schema.prisma`: Configuracion.salaDireccion + Turno (reservedById, patientFirstName, patientLastName, motivoConsulta, reservedAt)
- [x] Migración `20261015120000_us14_reserva_y_sala` + `prisma generate` + `migrate deploy`
- [x] `npx tsc --noEmit` en verde

## M2: Plantilla y orquestación de email — completed
- [x] `email/types.ts`: `aNombreDe?`, `cancelUrl?`
- [x] `templates/turno-confirmacion.ts`: fila "A nombre de" + instrucciones de cancelación
- [x] `lib/configuracion.ts`: `getSalaDireccion()`
- [x] `services/notificaciones/turno-confirmacion.ts`: mapper + envío

## M3: Reserva mínima (enganche US-13) — completed
- [x] `actions/reservas.ts`: reserva atómica + `after()` del email
- [x] Pantalla demo + nav

## M4: Config admin (dirección de sala) — completed
- [x] `saveSalaDireccion` + campo en la página de configuración

## M5: Pruebas y verificación — completed
- [x] `tests/us14-confirmacion-reserva.test.ts` (6 tests)
- [x] `node --test --import tsx tests/*.test.ts` → 83/83
- [x] `npx tsc --noEmit` sin errores
- [x] `npm run lint` sin problemas nuevos (los 5 errores + 2 warnings son preexistentes: mis-datos-form, internal-users-panel, availability-rn02)

## M6: Fix "The destination stream closed early" al confirmar reserva — in_progress
- [x] Causa raíz identificada: `window.location.reload()` en `reserva-demo.tsx` aborta el stream del POST de la server action (que incluye el árbol re-renderizado por `revalidatePath`); react-dom lo reporta vía `createCancelHandler` en `destination.on("close")`
- [x] Reemplazo por `router.refresh()` (mismo patrón que `internal-users-panel.tsx`, `mis-datos-form.tsx`, `complete-profile-form.tsx`)
- [x] `npx tsc --noEmit` en verde + 83/83 tests + sin lint nuevo
- [ ] Verificación en runtime (dev, sesión USUARIO): confirmar reserva y comprobar que no aparece el error y que el listado/mensaje se actualizan
