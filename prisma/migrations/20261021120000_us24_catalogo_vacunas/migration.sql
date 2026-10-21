-- US-24 (RF-VAC-01, RN-05): catálogo de vacunas.

CREATE TABLE IF NOT EXISTS "Vacuna" (
    "id" TEXT NOT NULL,
    "denominacion" TEXT NOT NULL,
    "laboratorio" TEXT NOT NULL,
    "esquemaDosis" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacuna_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Vacuna_isActive_denominacion_idx" ON "Vacuna"("isActive", "denominacion");

-- No puede haber dos vacunas activas con la misma denominación y laboratorio
-- (sin distinguir mayúsculas). Las desactivadas no cuentan: se pueden repetir.
CREATE UNIQUE INDEX IF NOT EXISTS "Vacuna_denominacion_laboratorio_activa_key"
    ON "Vacuna" (lower("denominacion"), lower("laboratorio"))
    WHERE "isActive";
