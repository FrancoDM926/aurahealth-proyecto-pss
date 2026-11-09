-- US-17 (RF-TUR-06, RF-AGE-09, RN-10): Gestión de turnos desde mostrador.
-- Tabla auditable MostradorOperacionLog con el usuario administrativo que realizó cada operación.

CREATE TABLE IF NOT EXISTS "MostradorOperacionLog" (
    "id" TEXT NOT NULL,
    "tipoOperacion" TEXT NOT NULL,
    "tipoTurno" TEXT,
    "pacienteId" TEXT NOT NULL,
    "pacienteNombre" TEXT NOT NULL,
    "turnoId" TEXT,
    "turnoOriginalId" TEXT,
    "detalle" TEXT NOT NULL,
    "realizadoPorId" TEXT NOT NULL,
    "realizadoPorNombre" TEXT NOT NULL,
    "realizadoPorRole" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MostradorOperacionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MostradorOperacionLog_pacienteId_idx" ON "MostradorOperacionLog"("pacienteId");
CREATE INDEX IF NOT EXISTS "MostradorOperacionLog_realizadoPorId_idx" ON "MostradorOperacionLog"("realizadoPorId");
CREATE INDEX IF NOT EXISTS "MostradorOperacionLog_createdAt_idx" ON "MostradorOperacionLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "MostradorOperacionLog" ADD CONSTRAINT "MostradorOperacionLog_pacienteId_fkey"
    FOREIGN KEY ("pacienteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MostradorOperacionLog" ADD CONSTRAINT "MostradorOperacionLog_realizadoPorId_fkey"
    FOREIGN KEY ("realizadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
