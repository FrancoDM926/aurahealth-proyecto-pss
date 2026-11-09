-- US-30 (RF-AGE-06, RF-AGE-09, RN-10): Bloqueo de turnos disponibles de una franja publicada.
-- US-22 (RF-NOT-02, RF-AGE-09): Aviso por modificación de agenda y listado de pacientes a contactar.

ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "bloqueoId" TEXT;

CREATE INDEX IF NOT EXISTS "Turno_bloqueoId_idx" ON "Turno"("bloqueoId");

CREATE TABLE IF NOT EXISTS "BloqueoAgenda" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dateHasta" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdByRole" "Role" NOT NULL,
    "revertedAt" TIMESTAMP(3),
    "revertedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloqueoAgenda_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BloqueoAgenda_doctorId_date_idx" ON "BloqueoAgenda"("doctorId", "date");
CREATE INDEX IF NOT EXISTS "BloqueoAgenda_revertedAt_idx" ON "BloqueoAgenda"("revertedAt");
CREATE INDEX IF NOT EXISTS "BloqueoAgenda_createdAt_idx" ON "BloqueoAgenda"("createdAt");

CREATE TABLE IF NOT EXISTS "BloqueoAviso" (
    "id" TEXT NOT NULL,
    "bloqueoId" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "pacienteNombre" TEXT NOT NULL,
    "pacienteEmail" TEXT NOT NULL,
    "pacienteTelefono" TEXT,
    "fechaTurno" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloqueoAviso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BloqueoAviso_bloqueoId_turnoId_key" ON "BloqueoAviso"("bloqueoId", "turnoId");
CREATE INDEX IF NOT EXISTS "BloqueoAviso_bloqueoId_idx" ON "BloqueoAviso"("bloqueoId");
CREATE INDEX IF NOT EXISTS "BloqueoAviso_turnoId_idx" ON "BloqueoAviso"("turnoId");

DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_bloqueoId_fkey"
    FOREIGN KEY ("bloqueoId") REFERENCES "BloqueoAgenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BloqueoAgenda" ADD CONSTRAINT "BloqueoAgenda_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BloqueoAgenda" ADD CONSTRAINT "BloqueoAgenda_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BloqueoAviso" ADD CONSTRAINT "BloqueoAviso_bloqueoId_fkey"
    FOREIGN KEY ("bloqueoId") REFERENCES "BloqueoAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BloqueoAviso" ADD CONSTRAINT "BloqueoAviso_turnoId_fkey"
    FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
