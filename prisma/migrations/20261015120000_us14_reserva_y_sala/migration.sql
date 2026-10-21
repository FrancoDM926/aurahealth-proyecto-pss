-- US-13 (mínimo, consumido por US-14) — datos de la reserva sobre el turno.
-- Todas las columnas son opcionales: mientras el turno está DISPONIBLE quedan en NULL.
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "reservedById" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "patientFirstName" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "patientLastName" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "motivoConsulta" TEXT;
ALTER TABLE "Turno" ADD COLUMN IF NOT EXISTS "reservedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Turno_reservedById_idx" ON "Turno"("reservedById");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- US-14: dirección de la sala que se informa en el email de confirmación de turno.
ALTER TABLE "Configuracion" ADD COLUMN IF NOT EXISTS "salaDireccion" TEXT;
