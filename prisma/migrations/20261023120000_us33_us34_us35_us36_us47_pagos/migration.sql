-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('ACTIVO', 'ANULADO');

-- CreateTable
CREATE TABLE "ObraSocial" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descuentoPorcentaje" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObraSocial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioConsulta" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioConsulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "turnoId" TEXT NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'ACTIVO',
    "medio" "MedioPago" NOT NULL,
    "referencia" TEXT,
    "precioSinCoberturaCentavos" INTEGER NOT NULL,
    "precioVigenteDesde" DATE NOT NULL,
    "coberturaEntidad" TEXT,
    "descuentoPorcentaje" INTEGER NOT NULL,
    "descuentoCentavos" INTEGER NOT NULL,
    "importeCentavos" INTEGER NOT NULL,
    "comprobanteNumero" INTEGER NOT NULL,
    "pacienteNombre" TEXT NOT NULL,
    "pacienteDocumento" TEXT,
    "prestacion" TEXT NOT NULL,
    "profesionalNombre" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoAt" TIMESTAMP(3),
    "anuladoMotivo" TEXT,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteContador" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComprobanteContador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObraSocial_nombre_key" ON "ObraSocial"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioConsulta_doctorId_vigenteDesde_key" ON "PrecioConsulta"("doctorId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_comprobanteNumero_key" ON "Pago"("comprobanteNumero");

-- CreateIndex
CREATE INDEX "Pago_createdAt_idx" ON "Pago"("createdAt");

-- CreateIndex
CREATE INDEX "Pago_turnoId_idx" ON "Pago"("turnoId");

-- AddForeignKey
ALTER TABLE "PrecioConsulta" ADD CONSTRAINT "PrecioConsulta_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- US-35: un turno no puede tener dos pagos ACTIVOS simultáneos. Un pago anulado
-- (US-61) libera el turno para registrar uno nuevo. Prisma no puede declarar
-- índices únicos parciales en el schema.
CREATE UNIQUE INDEX "Pago_turnoId_activo_key" ON "Pago"("turnoId") WHERE "estado" = 'ACTIVO';

-- US-36: contador de la numeración correlativa de comprobantes.
INSERT INTO "ComprobanteContador" ("id", "ultimo") VALUES (1, 0);

-- US-34: obras sociales iniciales (las mismas entidades que ofrece el registro).
-- El descuento arranca en 0 %: lo define el administrador desde Configuración.
INSERT INTO "ObraSocial" ("id", "nombre", "descuentoPorcentaje", "updatedAt") VALUES
  ('os_osde', 'OSDE', 0, CURRENT_TIMESTAMP),
  ('os_swiss_medical', 'Swiss Medical', 0, CURRENT_TIMESTAMP),
  ('os_ioma', 'IOMA', 0, CURRENT_TIMESTAMP),
  ('os_pami', 'PAMI', 0, CURRENT_TIMESTAMP);
