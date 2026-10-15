-- US-15 — Recordatorio automático de turno (RF-TUR-04, RF-NOT-01)
--
-- 1) Antelación configurable del recordatorio (inicial 24 h).
-- 2) Estado del recordatorio en cada turno, usado como candado de idempotencia.

-- Enum de estado del recordatorio (PostgreSQL no soporta CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE "EstadoRecordatorio" AS ENUM ('PENDIENTE', 'ENVIADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Configuracion"
  ADD COLUMN IF NOT EXISTS "recordatorioAntelacionHoras" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "Turno"
  ADD COLUMN IF NOT EXISTS "recordatorioEstado" "EstadoRecordatorio" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS "recordatorioEnviadoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recordatorioIntentos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recordatorioUltimoError" TEXT,
  ADD COLUMN IF NOT EXISTS "recordatorioEmailLogId" TEXT;

CREATE INDEX IF NOT EXISTS "Turno_recordatorioEstado_date_idx"
  ON "Turno"("recordatorioEstado", "date");
