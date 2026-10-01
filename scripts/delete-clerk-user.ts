/**
 * Elimina un usuario de Clerk por id. Útil para limpiar los usuarios de prueba
 * creados con `create-test-clerk-user.ts`.
 *
 * Uso: npx tsx scripts/delete-clerk-user.ts <userId>
 */
import { createClerkClient } from "@clerk/nextjs/server";

try {
  process.loadEnvFile(".env");
} catch {
  /* entorno ya poblado */
}

const userId = process.argv[2];
if (!userId) {
  console.error("Uso: npx tsx scripts/delete-clerk-user.ts <userId>");
  process.exit(1);
}

const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

async function main() {
  await client.users.deleteUser(userId);
  console.log(`Usuario eliminado de Clerk: ${userId}`);
}

main().catch((error) => {
  console.error("No se pudo eliminar el usuario:", error);
  process.exit(1);
});
