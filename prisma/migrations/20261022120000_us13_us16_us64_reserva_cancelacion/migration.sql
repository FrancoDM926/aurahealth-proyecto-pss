-- US-13 / US-64 / US-16 — Reserva de turno, reserva a nombre de otra persona y cancelación.
--
-- 1) US-64: personas atendidas que el usuario cargó, con su obra social.
-- 2) US-64: el turno apunta a la persona atendida.
-- 3) US-16: historial de turnos cancelados por el paciente.
-- 4) US-16: antelación mínima configurable para cancelar (inicial 24 h).

CREATE TABLE IF NOT EXISTS "PersonaAtendida" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "healthInsuranceEntity" TEXT NOT NULL,
    "healthInsurancePlan" TEXT NOT NULL,
    "healthInsuranceNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaAtendida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PersonaAtendida_userId_docNumber_key"
    ON "PersonaAtendida"("userId", "docNumber");

DO $$ BEGIN
  ALTER TABLE "PersonaAtendida" ADD CONSTRAINT "PersonaAtendida_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Turno"
  ADD COLUMN IF NOT EXISTS "personaAtendidaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_personaAtendidaId_fkey"
    FOREIGN KEY ("personaAtendidaId") REFERENCES "PersonaAtendida"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TurnoCancelacion" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT,
    "reservedById" TEXT NOT NULL,
    "doctorNombre" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "patientFirstName" TEXT,
    "patientLastName" TEXT,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnoCancelacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TurnoCancelacion_reservedById_idx" ON "TurnoCancelacion"("reservedById");

DO $$ BEGIN
  ALTER TABLE "TurnoCancelacion" ADD CONSTRAINT "TurnoCancelacion_turnoId_fkey"
    FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TurnoCancelacion" ADD CONSTRAINT "TurnoCancelacion_reservedById_fkey"
    FOREIGN KEY ("reservedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Configuracion"
  ADD COLUMN IF NOT EXISTS "cancelacionAntelacionHoras" INTEGER NOT NULL DEFAULT 24;
