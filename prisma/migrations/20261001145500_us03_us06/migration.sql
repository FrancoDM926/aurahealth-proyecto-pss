-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MedicalSpecialty" AS ENUM ('CLINICA_MEDICA', 'PEDIATRIA', 'TRAUMATOLOGIA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "specialty" "MedicalSpecialty";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MonthlyAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyAvailability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AvailabilityJornada" (
    "id" TEXT NOT NULL,
    "monthlyAvailabilityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "AvailabilityJornada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyAvailability_userId_year_month_key" ON "MonthlyAvailability"("userId", "year", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilityJornada_monthlyAvailabilityId_date_key" ON "AvailabilityJornada"("monthlyAvailabilityId", "date");

DO $$ BEGIN
  ALTER TABLE "MonthlyAvailability" ADD CONSTRAINT "MonthlyAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AvailabilityJornada" ADD CONSTRAINT "AvailabilityJornada_monthlyAvailabilityId_fkey" FOREIGN KEY ("monthlyAvailabilityId") REFERENCES "MonthlyAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
