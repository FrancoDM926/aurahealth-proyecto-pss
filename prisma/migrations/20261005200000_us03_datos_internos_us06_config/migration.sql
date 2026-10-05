-- US-03: los usuarios internos se crean sin documento, nacimiento ni teléfono
-- y los completan desde "Mi cuenta".
ALTER TABLE "User" ALTER COLUMN "docNumber" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "birthDate" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- Vaciar los valores de relleno que se cargaban antes al crear internos.
UPDATE "User" SET "docNumber" = NULL, "birthDate" = NULL WHERE "docNumber" LIKE 'INT-%';
UPDATE "User" SET "phone" = NULL WHERE "phone" = 'Pendiente';

-- US-06: límites de jornadas semanales configurables por el administrador (RN-02).
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minJornadasSemana" INTEGER NOT NULL DEFAULT 2,
    "maxJornadasSemana" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);
