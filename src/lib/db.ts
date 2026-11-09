import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const cachedPrisma = globalForPrisma.prisma;
const hasLatestModels =
  cachedPrisma !== undefined &&
  "turnoEstadoAuditLog" in cachedPrisma &&
  "vacuna" in cachedPrisma &&
  "plantillaEmail" in cachedPrisma &&
  "pago" in cachedPrisma &&
  "obraSocial" in cachedPrisma &&
  "precioConsulta" in cachedPrisma &&
  "fichaDiagnostico" in cachedPrisma &&
  "fichaDiagnosticoEntrada" in cachedPrisma &&
  "adjuntoEstudio" in cachedPrisma &&
  "accesoHistorialLog" in cachedPrisma &&
  "turnoVacunacion" in cachedPrisma &&
  "bloqueoAgenda" in cachedPrisma &&
  "bloqueoAviso" in cachedPrisma &&
  "mostradorOperacionLog" in cachedPrisma;

export const db = hasLatestModels
  ? cachedPrisma
  : new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
