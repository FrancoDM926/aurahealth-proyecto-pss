-- US-21: administración del servicio de email (wireframe wf_servicio_email.html)
-- 1) Cuerpo editable de cada plantilla (el asunto sigue siendo fijo por plantilla).
-- 2) Límite de envíos fallidos por destinatario antes de dejar de reintentar.

CREATE TABLE "PlantillaEmail" (
    "clave" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantillaEmail_pkey" PRIMARY KEY ("clave")
);

ALTER TABLE "Configuracion" ADD COLUMN "maxEnviosFallidosPorUsuario" INTEGER NOT NULL DEFAULT 3;
