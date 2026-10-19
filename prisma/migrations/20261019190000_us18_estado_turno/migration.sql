-- US-18 (RF-TUR-07): Registro del estado del turno y auditoría de cambios.
-- Incluye de forma idempotente las columnas de reserva sobre Turno si aún no existen.

ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "reservedById" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "patientFirstName" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "patientLastName" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "motivoConsulta" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Turno_reservedById_idx" ON "Turno"("reservedById");

DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_reservedById_fkey"
    FOREIGN KEY ("reservedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TurnoEstadoAuditLog" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "previousStatus" "EstadoTurno" NOT NULL,
    "newStatus" "EstadoTurno" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByRole" "Role" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnoEstadoAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TurnoEstadoAuditLog_turnoId_idx" ON "TurnoEstadoAuditLog"("turnoId");
CREATE INDEX IF NOT EXISTS "TurnoEstadoAuditLog_changedAt_idx" ON "TurnoEstadoAuditLog"("changedAt");

DO $$ BEGIN
  ALTER TABLE "TurnoEstadoAuditLog" ADD CONSTRAINT "TurnoEstadoAuditLog_turnoId_fkey"
    FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TurnoEstadoAuditLog" ADD CONSTRAINT "TurnoEstadoAuditLog_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
