/**
 * Backfill de `publicMetadata.role` en Clerk.
 *
 * Desde la migración, Clerk es la fuente autoritativa del rol y todos los guards
 * aplican deny-by-default. Este script alinea la metadata de las cuentas que ya
 * existían, cuando la fila en Postgres era la única fuente de verdad.
 *
 * Política de resolución:
 *   - Fila en Postgres, metadata ausente  → se escribe el rol del espejo.
 *   - Fila en Postgres, metadata distinta → gana Postgres (era la fuente de
 *     verdad hasta esta migración) y se registra el diff para revisión.
 *   - Identidad en Clerk sin fila en Postgres → solo se reporta. No se crea la
 *     fila: la completa el usuario y `completeUserProfile` preserva su rol.
 *
 * Uso:
 *   npx tsx scripts/backfill-clerk-roles.ts            # simulación
 *   npx tsx scripts/backfill-clerk-roles.ts --apply    # escribe en Clerk
 */

import type { Role } from "../src/generated/prisma/client";
import { createClerkClient } from "@clerk/nextjs/server";

const APPLY = process.argv.includes("--apply");

// El script corre fuera de Next, que es quien carga `.env` normalmente. Se carga
// acá con la API de Node para no depender de `dotenv` ni del orden de hoisting
// de imports: `src/lib/db` lee `DATABASE_URL` al momento de ser importado.
try {
  process.loadEnvFile(".env");
} catch {
  // Sin `.env`: se espera que el entorno ya venir poblado.
}

type Report = {
  written: Array<{ email: string; clerkUserId: string; role: Role; reason: string }>;
  unchanged: number;
  noDbRow: Array<{ email: string; clerkUserId: string; clerkRole: Role | null }>;
  failed: Array<{ email: string; clerkUserId: string; error: string }>;
};

type DbUserRow = {
  id: string;
  clerkUserId: string;
  email: string;
  role: Role;
};

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("Falta CLERK_SECRET_KEY en el entorno.");
    process.exit(1);
  }

  const { db } = await import("../src/lib/db");
  const { parseClerkRole, ALL_ROLES, ROLE_LABELS } = await import("../src/lib/roles");

  const client = createClerkClient({ secretKey });
  const report: Report = {
    written: [],
    unchanged: 0,
    noDbRow: [],
    failed: [],
  };

  // Consulta en SQL crudo a propósito: la columna `specialty` de la base tiene
  // etiquetas en español en lugar de valores del enum `MedicalSpecialty`, y eso
  // hace fallar cualquier `findMany` con P2023. El backfill no necesita
  // `specialty`, así que leer solo las columnas del rol evita el problema.
  const users = await db.$queryRaw<DbUserRow[]>`
    SELECT id, "clerkUserId", email, role::text as role
    FROM "User"
    ORDER BY "createdAt" ASC
  `;
  console.log(`Filas en Postgres: ${users.length}`);
  console.log(APPLY ? "Modo: ESCRITURA\n" : "Modo: SIMULACIÓN (usa --apply para escribir)\n");

  const seenClerkIds = new Set<string>();

  for (const row of users) {
    seenClerkIds.add(row.clerkUserId);

    let clerkEmail: string;
    let clerkRole: Role | null;
    try {
      const clerkUser = await client.users.getUser(row.clerkUserId);
      clerkEmail =
        clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
          ?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        row.email;
      clerkRole = parseClerkRole(clerkUser.publicMetadata?.role);
    } catch (error) {
      report.failed.push({
        email: row.email,
        clerkUserId: row.clerkUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (clerkRole === row.role) {
      report.unchanged += 1;
      continue;
    }

    const reason =
      clerkRole === null
        ? "metadata ausente"
        : `divergencia: Clerk=${clerkRole} vs Postgres=${row.role}`;

    report.written.push({
      email: clerkEmail,
      clerkUserId: row.clerkUserId,
      role: row.role,
      reason,
    });

    if (APPLY) {
      try {
        await client.users.updateUserMetadata(row.clerkUserId, {
          publicMetadata: { role: row.role },
        });
      } catch (error) {
        report.failed.push({
          email: clerkEmail,
          clerkUserId: row.clerkUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Identidades de Clerk sin perfil en Postgres. `getUserList` pagina por
  // offset y devuelve `{ data, totalCount }` (no es iterable).
  const PAGE = 100;
  let offset = 0;
  for (;;) {
    const page = await client.users.getUserList({
      limit: PAGE,
      offset,
      orderBy: "-created_at",
    });

    for (const clerkUser of page.data) {
      if (seenClerkIds.has(clerkUser.id)) continue;
      report.noDbRow.push({
        email: clerkUser.emailAddresses[0]?.emailAddress ?? "(sin correo primario)",
        clerkUserId: clerkUser.id,
        clerkRole: parseClerkRole(clerkUser.publicMetadata?.role),
      });
    }

    offset += PAGE;
    if (offset >= page.totalCount || page.data.length === 0) break;
  }

  console.log("── Resumen ──");
  console.log(`Sin cambios:        ${report.unchanged}`);
  console.log(`A escribir/escritos:${report.written.length}`);
  console.log(`Fallidos:           ${report.failed.length}`);
  console.log(`Sin fila en Postgres:${report.noDbRow.length}\n`);

  if (report.written.length > 0) {
    console.log("── Metadata a sincronizar ──");
    for (const w of report.written) {
      console.log(`  ${w.email}`);
      console.log(`    ${w.clerkUserId}  → ${ROLE_LABELS[w.role]} (${w.role})`);
      console.log(`    motivo: ${w.reason}`);
    }
    console.log("");
  }

  if (report.noDbRow.length > 0) {
    console.log("── Identidades en Clerk sin perfil en Postgres ──");
    console.log("   No se crea la fila: el usuario debe completar /completar-perfil,");
    console.log("   que preserva el rol ya presente en la metadata.\n");
    for (const n of report.noDbRow) {
      const label = n.clerkRole ? ROLE_LABELS[n.clerkRole] : "SIN ROL (quedará bloqueado)";
      console.log(`  ${n.email}`);
      console.log(`    ${n.clerkUserId}  → ${label}`);
    }
    console.log("");
  }

  if (report.failed.length > 0) {
    console.log("── Fallidos (requieren atención manual) ──");
    for (const f of report.failed) {
      console.log(`  ${f.email} (${f.clerkUserId}): ${f.error}`);
    }
    console.log("");
  }

  console.log(
    `Roles válidos esperados: ${ALL_ROLES.map((r) => ROLE_LABELS[r]).join(", ")}.`
  );
  console.log(
    APPLY
      ? "Backfill aplicado."
      : "Simulación terminada. Revisá el diff y repetí con --apply."
  );

  await db.$disconnect();
  process.exit(report.failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Backfill fallido:", error);
  process.exit(1);
});
