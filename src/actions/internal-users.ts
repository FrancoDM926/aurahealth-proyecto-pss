"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { MedicalSpecialty, Role } from "@/generated/prisma/client";
import { INTERNAL_ROLES } from "@/lib/roles";
import { parseMedicalSpecialty } from "@/lib/specialty";
import { randomBytes } from "crypto";
import type { User } from "@/generated/prisma/client";

export type InternalUserListItem = Pick<
  User,
  "id" | "firstName" | "lastName" | "role" | "isActive"
> & {
  specialty: User["specialty"];
  specialtyRaw: string | null;
};

export type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
};

const CREATABLE_ROLES: Role[] = ["MEDICO", "ENFERMERA", "ADMINISTRATIVO"];

async function assertAdministrator() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  const admin = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!admin || admin.role !== "ADMINISTRADOR" || !admin.isActive) {
    throw new Error("FORBIDDEN");
  }
  return admin;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "-" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export type CreateInternalUserInput = {
  fullName: string;
  email: string;
  role: Role;
  specialty?: MedicalSpecialty | null;
};

export async function listInternalUsers(): Promise<InternalUserListItem[]> {
  await assertAdministrator();

  try {
    const users = await db.user.findMany({
      where: {
        role: { in: INTERNAL_ROLES },
      },
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    });
    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      specialty: u.specialty,
      specialtyRaw: null,
    }));
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code: string }).code
        : null;
    if (code !== "P2023") throw error;

    // Datos legacy o editados en Studio con etiquetas en español en `specialty`
    const rows = await db.$queryRaw<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        role: Role;
        isActive: boolean;
        specialty: string | null;
      }>
    >`
      SELECT id, "firstName", "lastName", role::text as role, "isActive", specialty::text as specialty
      FROM "User"
      WHERE role::text IN ('MEDICO', 'ENFERMERA', 'ADMINISTRATIVO', 'ADMINISTRADOR')
      ORDER BY "isActive" DESC, "lastName" ASC, "firstName" ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      isActive: row.isActive,
      specialty: parseMedicalSpecialty(row.specialty),
      specialtyRaw: row.specialty,
    }));
  }
}

export async function createInternalUser(
  data: CreateInternalUserInput
): Promise<ActionResult> {
  try {
    await assertAdministrator();
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const errors: Record<string, string> = {};
  const email = data.email?.trim().toLowerCase();

  if (!data.fullName?.trim()) {
    errors.fullName = "El nombre y apellido son obligatorios.";
  }
  if (!email) {
    errors.email = "El correo es obligatorio.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Ingresá un correo válido.";
  }
  if (!data.role || !CREATABLE_ROLES.includes(data.role)) {
    errors.role = "Seleccioná un rol válido.";
  }
  if (data.role === "MEDICO" && !data.specialty) {
    errors.specialty = "La especialidad es obligatoria para el rol Médico.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      message: "Revisá los campos señalados.",
      errors,
    };
  }

  const existing = await db.user.findFirst({
    where: { email },
  });
  if (existing) {
    return {
      success: false,
      message: "Ya existe un usuario con este correo.",
      errors: { email: "Este correo ya está registrado." },
    };
  }

  const { firstName, lastName } = splitFullName(data.fullName);
  const docNumber = `INT-${randomBytes(4).toString("hex").toUpperCase()}`;

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.createUser({
      emailAddress: [email],
      firstName,
      lastName,
      skipPasswordChecks: true,
      publicMetadata: {
        role: data.role,
        internal: true,
      },
    });

    await db.user.create({
      data: {
        clerkUserId: clerkUser.id,
        email,
        firstName,
        lastName,
        docType: "DNI",
        docNumber,
        birthDate: new Date("1990-01-01T00:00:00.000Z"),
        phone: "Pendiente",
        coverageType: "PARTICULAR",
        role: data.role,
        specialty: data.role === "MEDICO" ? data.specialty! : null,
        isActive: true,
      },
    });

    revalidatePath("/dashboard/admin/usuarios");
    return {
      success: true,
      message:
        "Usuario interno creado. Deberá establecer su contraseña desde el correo de bienvenida de Clerk.",
    };
  } catch (error: unknown) {
    console.error("createInternalUser:", error);
    const clerkMsg =
      error &&
      typeof error === "object" &&
      "errors" in error &&
      Array.isArray((error as { errors: { message?: string }[] }).errors)
        ? (error as { errors: { message?: string }[] }).errors[0]?.message
        : null;
    return {
      success: false,
      message:
        clerkMsg ||
        "No se pudo crear el usuario. Verificá la configuración de Clerk y el correo ingresado.",
    };
  }
}

export async function deactivateInternalUser(userId: string): Promise<ActionResult> {
  try {
    await assertAdministrator();
  } catch {
    return { success: false, message: "No tenés permisos para esta acción." };
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || !INTERNAL_ROLES.includes(target.role)) {
    return { success: false, message: "Usuario no encontrado." };
  }
  if (!target.isActive) {
    return { success: false, message: "El usuario ya está dado de baja." };
  }
  if (target.role === "ADMINISTRADOR") {
    return {
      success: false,
      message: "No se puede dar de baja a un administrador desde esta pantalla.",
    };
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    const client = await clerkClient();
    try {
      await client.users.banUser(target.clerkUserId);
    } catch (banErr) {
      console.warn("No se pudo suspender en Clerk:", banErr);
    }

    revalidatePath("/dashboard/admin/usuarios");
    return {
      success: true,
      message: "Usuario dado de baja. Se conserva el registro para trazabilidad.",
    };
  } catch (error) {
    console.error("deactivateInternalUser:", error);
    return { success: false, message: "Error al dar de baja al usuario." };
  }
}
