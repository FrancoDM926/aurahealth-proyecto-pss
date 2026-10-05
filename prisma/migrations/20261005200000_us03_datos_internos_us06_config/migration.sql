-- US-03: los usuarios internos se crean sin documento, nacimiento ni teléfono
-- y los completan desde "Mi cuenta".
-- Los valores de relleno que ya existen ("INT-…", 01/01/1990, "Pendiente") se
-- vacían recién después del merge con scripts/limpiar-datos-internos.sql, para
-- no romper el código anterior mientras conviven las dos versiones.
ALTER TABLE "User" ALTER COLUMN "docNumber" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "birthDate" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- US-06: límites de jornadas semanales configurables por el administrador (RN-02).
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "minJornadasSemana" INTEGER NOT NULL DEFAULT 2,
    "maxJornadasSemana" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);
