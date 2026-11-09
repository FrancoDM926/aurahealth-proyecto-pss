-- US-39: ficha única por paciente y médico, con entradas clínicas auditables.
CREATE TABLE "FichaDiagnostico" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientKey" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FichaDiagnostico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FichaDiagnosticoEntrada" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "observations" TEXT NOT NULL,
    "consultationDate" DATE NOT NULL,
    "consultationTime" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "replacesEntryId" TEXT,
    CONSTRAINT "FichaDiagnosticoEntrada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FichaDiagnostico_doctorId_patientKey_key"
  ON "FichaDiagnostico"("doctorId", "patientKey");
CREATE INDEX "FichaDiagnostico_patientKey_idx" ON "FichaDiagnostico"("patientKey");
CREATE UNIQUE INDEX "FichaDiagnosticoEntrada_turnoId_replacesEntryId_key"
  ON "FichaDiagnosticoEntrada"("turnoId", "replacesEntryId");
CREATE UNIQUE INDEX "FichaDiagnosticoEntrada_turnoId_original_key"
  ON "FichaDiagnosticoEntrada"("turnoId") WHERE "replacesEntryId" IS NULL;
CREATE INDEX "FichaDiagnosticoEntrada_fichaId_consultationDate_idx"
  ON "FichaDiagnosticoEntrada"("fichaId", "consultationDate");
CREATE INDEX "FichaDiagnosticoEntrada_authorId_idx"
  ON "FichaDiagnosticoEntrada"("authorId");

ALTER TABLE "FichaDiagnostico"
  ADD CONSTRAINT "FichaDiagnostico_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FichaDiagnosticoEntrada"
  ADD CONSTRAINT "FichaDiagnosticoEntrada_fichaId_fkey"
  FOREIGN KEY ("fichaId") REFERENCES "FichaDiagnostico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FichaDiagnosticoEntrada"
  ADD CONSTRAINT "FichaDiagnosticoEntrada_turnoId_fkey"
  FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FichaDiagnosticoEntrada"
  ADD CONSTRAINT "FichaDiagnosticoEntrada_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
