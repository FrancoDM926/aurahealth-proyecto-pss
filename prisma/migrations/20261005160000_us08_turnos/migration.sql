-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EstadoTurno" AS ENUM ('DISPONIBLE', 'RESERVADO', 'CUMPLIDO', 'AUSENTE', 'CANCELADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable MonthlyAvailability
ALTER TABLE "MonthlyAvailability" ADD COLUMN IF NOT EXISTS "isConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MonthlyAvailability" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

-- CreateTable Turno
CREATE TABLE IF NOT EXISTS "Turno" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "jornadaId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" "EstadoTurno" NOT NULL DEFAULT 'DISPONIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Turno_doctorId_date_idx" ON "Turno"("doctorId", "date");
CREATE INDEX IF NOT EXISTS "Turno_status_date_idx" ON "Turno"("status", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "Turno_doctorId_date_startTime_key" ON "Turno"("doctorId", "date", "startTime");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "AvailabilityJornada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
