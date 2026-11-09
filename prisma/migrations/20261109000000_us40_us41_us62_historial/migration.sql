-- US-40, US-41 y US-62: complementos del historial clínico sobre el esquema de
-- US-39 (`FichaDiagnostico` / `FichaDiagnosticoEntrada`). Correr después de
-- `20261108230000_us39_ficha_diagnostico`.

-- US-62: tamaño máximo configurable de cada estudio adjunto (MB).
ALTER TABLE "Configuracion" ADD COLUMN "adjuntoMaxMB" INTEGER NOT NULL DEFAULT 10;

-- CreateEnum
CREATE TYPE "TipoAccesoHistorial" AS ENUM ('FICHA_CONSOLIDADA', 'HISTORIAL_PACIENTE', 'ESTUDIOS');

-- CreateEnum
CREATE TYPE "ResultadoAccesoHistorial" AS ENUM ('EXITOSO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "AdjuntoEstudio" (
    "id" TEXT NOT NULL,
    "entradaId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "subidoPorId" TEXT NOT NULL,
    "subidoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjuntoEstudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoHistorialLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "usuarioRole" "Role" NOT NULL,
    "pacienteKey" TEXT,
    "pacienteNombre" TEXT NOT NULL,
    "tipo" "TipoAccesoHistorial" NOT NULL,
    "resultado" "ResultadoAccesoHistorial" NOT NULL,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoHistorialLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdjuntoEstudio_entradaId_idx" ON "AdjuntoEstudio"("entradaId");

-- CreateIndex
CREATE INDEX "AccesoHistorialLog_createdAt_idx" ON "AccesoHistorialLog"("createdAt");

-- CreateIndex
CREATE INDEX "AccesoHistorialLog_pacienteKey_idx" ON "AccesoHistorialLog"("pacienteKey");

-- CreateIndex
CREATE INDEX "AccesoHistorialLog_usuarioId_idx" ON "AccesoHistorialLog"("usuarioId");

-- AddForeignKey
ALTER TABLE "AdjuntoEstudio" ADD CONSTRAINT "AdjuntoEstudio_entradaId_fkey" FOREIGN KEY ("entradaId") REFERENCES "FichaDiagnosticoEntrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjuntoEstudio" ADD CONSTRAINT "AdjuntoEstudio_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoHistorialLog" ADD CONSTRAINT "AccesoHistorialLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
