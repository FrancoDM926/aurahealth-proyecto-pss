-- Correr UNA VEZ, después de mergear fix/us-06-us-08 a main.
-- Vacía los datos de relleno que se cargaban al crear usuarios internos, para
-- que cada uno complete su documento, nacimiento y teléfono desde "Mi cuenta".
-- Antes del merge rompería el código anterior, que no admite estos campos vacíos.
UPDATE "User" SET "docNumber" = NULL, "birthDate" = NULL WHERE "docNumber" LIKE 'INT-%';
UPDATE "User" SET "phone" = NULL WHERE "phone" = 'Pendiente';
