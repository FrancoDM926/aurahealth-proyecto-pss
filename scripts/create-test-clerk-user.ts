/**
 * Crea un usuario de prueba en Clerk con un rol en `publicMetadata`, tal como
 * se haría desde el Dashboard. Sirve para verificar el flujo de alta de
 * administradores: la metadata debe preservarse al completar el perfil.
 *
 * Uso: npx tsx scripts/create-test-clerk-user.ts <email> <role> <password>
 */
import { createClerkClient } from "@clerk/nextjs/server";
import { parseClerkRole, ALL_ROLES } from "../src/lib/roles";

try {
  process.loadEnvFile(".env");
} catch {
  /* entorno ya poblado */
}

const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

async function main() {
  const [email, rawRole, password] = process.argv.slice(2);
  const role = parseClerkRole(rawRole);

  if (!email || !role || !password) {
    console.error("Uso: npx tsx scripts/create-test-clerk-user.ts <email> <role> <password>");
    console.error(`Roles válidos: ${ALL_ROLES.join(", ")}`);
    process.exit(1);
  }

  const user = await client.users.createUser({
    emailAddress: [email],
    firstName: "Admin",
    lastName: "DePrueba",
    password,
    skipPasswordChecks: true,
    publicMetadata: { role, internal: true },
  });

  console.log(JSON.stringify({ id: user.id, email, role }, null, 2));
}

main().catch((error) => {
  console.error("No se pudo crear el usuario:", error);
  process.exit(1);
});
