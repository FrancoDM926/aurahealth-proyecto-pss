-- Grupo C · Sprint 3 — Vacunatorio: US-63 (agenda), US-28 (turno), US-29 (dosis), US-57 (carnet)
-- y esquema estructurado de dosis (ampliación de US-24).


-- CreateEnum
CREATE TYPE "EstadoAplicacion" AS ENUM ('ACTIVA', 'ANULADA');

-- CreateTable
CREATE TABLE "VacunaDosis" (
    "id" TEXT NOT NULL,
    "vacunaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "diasDesdeAnterior" INTEGER,

    CONSTRAINT "VacunaDosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JornadaVacunatorio" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JornadaVacunatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoVacunacion" (
    "id" TEXT NOT NULL,
    "jornadaId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" "EstadoTurno" NOT NULL DEFAULT 'DISPONIBLE',
    "vacunaId" TEXT,
    "dosisPrevistaOrden" INTEGER,
    "reservedById" TEXT,
    "otorgadoPorId" TEXT,
    "personaAtendidaId" TEXT,
    "patientFirstName" TEXT,
    "patientLastName" TEXT,
    "reservedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnoVacunacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoVacunacionCancelacion" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT,
    "reservedById" TEXT NOT NULL,
    "vacunaNombre" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "patientFirstName" TEXT,
    "patientLastName" TEXT,
    "canceladoPorId" TEXT,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnoVacunacionCancelacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionDosis" (
    "id" TEXT NOT NULL,
    "pacienteUserId" TEXT,
    "personaAtendidaId" TEXT,
    "pacienteNombre" TEXT NOT NULL,
    "pacienteDocumento" TEXT,
    "vacunaId" TEXT NOT NULL,
    "vacunaNombre" TEXT NOT NULL,
    "dosisOrden" INTEGER NOT NULL,
    "dosisEtiqueta" TEXT NOT NULL,
    "aplicadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enfermeraId" TEXT NOT NULL,
    "enfermeraNombre" TEXT NOT NULL,
    "turnoVacunacionId" TEXT,
    "estado" "EstadoAplicacion" NOT NULL DEFAULT 'ACTIVA',
    "anuladaAt" TIMESTAMP(3),
    "anuladaMotivo" TEXT,
    "anuladaPorId" TEXT,
    "anuladaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AplicacionDosis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VacunaDosis_vacunaId_orden_key" ON "VacunaDosis"("vacunaId", "orden");

-- CreateIndex
CREATE INDEX "JornadaVacunatorio_date_idx" ON "JornadaVacunatorio"("date");

-- CreateIndex
CREATE INDEX "TurnoVacunacion_status_date_idx" ON "TurnoVacunacion"("status", "date");

-- CreateIndex
CREATE INDEX "TurnoVacunacion_reservedById_idx" ON "TurnoVacunacion"("reservedById");

-- CreateIndex
CREATE UNIQUE INDEX "TurnoVacunacion_date_startTime_key" ON "TurnoVacunacion"("date", "startTime");

-- CreateIndex
CREATE INDEX "TurnoVacunacionCancelacion_reservedById_idx" ON "TurnoVacunacionCancelacion"("reservedById");

-- CreateIndex
CREATE INDEX "AplicacionDosis_pacienteUserId_vacunaId_idx" ON "AplicacionDosis"("pacienteUserId", "vacunaId");

-- CreateIndex
CREATE INDEX "AplicacionDosis_personaAtendidaId_vacunaId_idx" ON "AplicacionDosis"("personaAtendidaId", "vacunaId");

-- CreateIndex
CREATE INDEX "AplicacionDosis_aplicadaAt_idx" ON "AplicacionDosis"("aplicadaAt");

-- AddForeignKey
ALTER TABLE "VacunaDosis" ADD CONSTRAINT "VacunaDosis_vacunaId_fkey" FOREIGN KEY ("vacunaId") REFERENCES "Vacuna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JornadaVacunatorio" ADD CONSTRAINT "JornadaVacunatorio_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacion" ADD CONSTRAINT "TurnoVacunacion_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "JornadaVacunatorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacion" ADD CONSTRAINT "TurnoVacunacion_vacunaId_fkey" FOREIGN KEY ("vacunaId") REFERENCES "Vacuna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacion" ADD CONSTRAINT "TurnoVacunacion_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacion" ADD CONSTRAINT "TurnoVacunacion_otorgadoPorId_fkey" FOREIGN KEY ("otorgadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacion" ADD CONSTRAINT "TurnoVacunacion_personaAtendidaId_fkey" FOREIGN KEY ("personaAtendidaId") REFERENCES "PersonaAtendida"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacionCancelacion" ADD CONSTRAINT "TurnoVacunacionCancelacion_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoVacunacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoVacunacionCancelacion" ADD CONSTRAINT "TurnoVacunacionCancelacion_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_pacienteUserId_fkey" FOREIGN KEY ("pacienteUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_personaAtendidaId_fkey" FOREIGN KEY ("personaAtendidaId") REFERENCES "PersonaAtendida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_vacunaId_fkey" FOREIGN KEY ("vacunaId") REFERENCES "Vacuna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_enfermeraId_fkey" FOREIGN KEY ("enfermeraId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_turnoVacunacionId_fkey" FOREIGN KEY ("turnoVacunacionId") REFERENCES "TurnoVacunacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- US-24 (ampliación): cada vacuna existente queda con una dosis única; enfermería
-- ajusta desde el catálogo las que tengan más dosis.
INSERT INTO "VacunaDosis" ("id", "vacunaId", "orden", "etiqueta", "diasDesdeAnterior")
SELECT 'vd_' || "id", "id", 1, 'Dosis única', NULL FROM "Vacuna";

-- US-29: una aplicación pertenece a exactamente una persona (usuario o persona atendida).
ALTER TABLE "AplicacionDosis" ADD CONSTRAINT "AplicacionDosis_un_paciente_chk"
  CHECK (("pacienteUserId" IS NOT NULL) <> ("personaAtendidaId" IS NOT NULL));

-- US-29: no hay dos aplicaciones ACTIVAS de la misma dosis para la misma persona, ni
-- dos activas para el mismo turno. Anular libera la dosis para registrarla de nuevo.
-- Prisma no puede declarar índices únicos parciales en el schema.
CREATE UNIQUE INDEX "AplicacionDosis_user_dosis_activa_key"
  ON "AplicacionDosis"("pacienteUserId", "vacunaId", "dosisOrden")
  WHERE "estado" = 'ACTIVA' AND "pacienteUserId" IS NOT NULL;
CREATE UNIQUE INDEX "AplicacionDosis_persona_dosis_activa_key"
  ON "AplicacionDosis"("personaAtendidaId", "vacunaId", "dosisOrden")
  WHERE "estado" = 'ACTIVA' AND "personaAtendidaId" IS NOT NULL;
CREATE UNIQUE INDEX "AplicacionDosis_turno_activa_key"
  ON "AplicacionDosis"("turnoVacunacionId")
  WHERE "estado" = 'ACTIVA' AND "turnoVacunacionId" IS NOT NULL;
