"use server";

import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { parseClerkRole } from "@/lib/roles";
import {
  parseBirthDate,
  validateCompleteProfileData,
  validateEmailFormat,
  validateProfileUpdateData,
} from "@/lib/validation";
import type { Role } from "@/generated/prisma/client";

/**
 * Persiste el rol autoritativo en la metadata pública de Clerk.
 *
 * `updateUserMetadata` hace merge profundo, así que otras claves de
 * `publicMetadata` (por ejemplo `internal`) se conservan. Un rol preexistente se
 * preserva: solo las escrituras desde el Backend API pueden haberlo fijado, y
 * degradar a un administrador a `USUARIO` lo dejaría sin acceso.
 */
async function ensureClerkRole(
  clerkUserId: string,
  existingRole: Role | null
): Promise<Role> {
  const role: Role = existingRole ?? "USUARIO";
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { role },
  });
  return role;
}

export type CompleteProfileInput = {
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  birthDate: string; // YYYY-MM-DD
  phone: string;
  address?: string;
  alternativeContact?: string;
  coverageType: "OBRA_SOCIAL" | "PARTICULAR";
  healthInsuranceEntity?: string;
  healthInsurancePlan?: string;
  healthInsuranceNumber?: string;
};

export type ActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
};

export async function completeUserProfile(
  data: CompleteProfileInput
): Promise<ActionResult> {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    return {
      success: false,
      message: "No tenés una sesión activa. Iniciá sesión nuevamente.",
    };
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) {
    return {
      success: false,
      message: "Tu cuenta de autenticación no tiene un correo electrónico asociado.",
    };
  }

  // Mismas reglas y mensajes que en el cliente (src/lib/validation.ts).
  const errors = validateCompleteProfileData(data);

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      message: "Por favor revisá los campos señalados.",
      errors,
    };
  }

  // RN / US-01: El sistema rechaza el registro si el documento o el email ya están asociados a otra cuenta
  const existingUser = await db.user.findFirst({
    where: {
      OR: [
        { docNumber: data.docNumber.trim() },
        { email: email.toLowerCase() },
      ],
    },
  });

  if (existingUser) {
    if (existingUser.clerkUserId === userId) {
      // La fila ya existe. El rol autoritativo vive en Clerk, así que hay que
      // garantizar que la metadata exista: si falló una escritura previa, esta
      // ruta es la que desbloquea la cuenta en lugar de dejarla en deny-by-default.
      try {
        await ensureClerkRole(userId, parseClerkRole(user.publicMetadata?.role));
      } catch (error) {
        console.error("No se pudo sincronizar el rol en Clerk:", error);
        return {
          success: false,
          message:
            "No pudimos verificar tu rol en el sistema. Intentá nuevamente en unos minutos.",
        };
      }

      return {
        success: true,
        message: "Tu perfil ya se encontraba registrado.",
      };
    }

    if (existingUser.docNumber === data.docNumber.trim()) {
      return {
        success: false,
        message: "Ya existe una cuenta registrada con este número de documento.",
        errors: {
          docNumber: "Este documento ya se encuentra registrado en el sistema.",
        },
      };
    }

    return {
      success: false,
      message: "Ya existe una cuenta con este correo electrónico.",
      errors: {
        email: "Este correo electrónico ya está asociado a otra cuenta.",
      },
    };
  }

  try {
    // Validada por validateCompleteProfileData; parse como UTC seguro.
    const parsedDate = parseBirthDate(data.birthDate);
    if (!parsedDate) {
      return {
        success: false,
        message: "Por favor revisá los campos señalados.",
        errors: { birthDate: "Ingresá una fecha de nacimiento válida." },
      };
    }

    // El rol es autoritativo en Clerk. Se escribe ANTES que la fila en Postgres:
    // si Clerk falla, no queda un perfil sin rol y el reintento es limpio. Si
    // falla Postgres, el guard `NO_PROFILE` devuelve al usuario a esta pantalla.
    //
    // RN-11: una cuenta creada por autorregistro nunca trae rol previo, así que
    // recibe `USUARIO`. Un rol preexistente solo puede provenir del Backend API
    // (p. ej. un administrador dado de alta en el Dashboard de Clerk) y se
    // preserva en lugar de degradarlo.
    const role = await ensureClerkRole(userId, parseClerkRole(user.publicMetadata?.role));

    // Espejo en Postgres: solo display y reconciliación, no autoriza.
    await db.user.create({
      data: {
        clerkUserId: userId,
        email: email.toLowerCase(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        docType: data.docType || "DNI",
        docNumber: data.docNumber.trim(),
        birthDate: parsedDate,
        phone: data.phone.trim(),
        address: data.address?.trim() || null,
        alternativeContact: data.alternativeContact?.trim() || null,
        coverageType: data.coverageType,
        healthInsuranceEntity:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsuranceEntity?.trim() : null,
        healthInsurancePlan:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsurancePlan?.trim() : null,
        healthInsuranceNumber:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsuranceNumber?.trim() : null,
        role,
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error al completar perfil:", error);
    return {
      success: false,
      message: "Ocurrió un error inesperado al guardar los datos. Intentá nuevamente.",
    };
  }
}

export type UpdateProfileInput = {
  /**
   * Documento y nacimiento solo se aceptan si todavía están vacíos (usuarios
   * internos creados por el administrador). Una vez cargados no se editan (US-01).
   */
  docType?: string;
  docNumber?: string;
  birthDate?: string; // YYYY-MM-DD
  phone: string;
  email: string;
  address?: string;
  alternativeContact?: string;
  coverageType: "OBRA_SOCIAL" | "PARTICULAR";
  healthInsuranceEntity?: string;
  healthInsurancePlan?: string;
  healthInsuranceNumber?: string;
};

export async function updateUserProfile(
  data: UpdateProfileInput
): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      success: false,
      message: "No tenés una sesión activa. Iniciá sesión nuevamente.",
    };
  }

  // Mismas reglas y mensajes que en el cliente (src/lib/validation.ts).
  const errors = validateProfileUpdateData(data);

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      message: "Por favor revisá los campos señalados.",
      errors,
    };
  }

  const current = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!current) {
    return { success: false, message: "No encontramos tu perfil." };
  }

  // Completar documento y nacimiento por única vez, si estaban vacíos.
  const completion: { docType?: string; docNumber?: string; birthDate?: Date } = {};
  const newDocNumber = data.docNumber?.trim();
  if (!current.docNumber && newDocNumber) {
    const docInUse = await db.user.findFirst({
      where: { docNumber: newDocNumber, NOT: { id: current.id } },
    });
    if (docInUse) {
      return {
        success: false,
        message: "Ya existe una cuenta registrada con este número de documento.",
        errors: { docNumber: "Este documento ya se encuentra registrado en el sistema." },
      };
    }
    completion.docType = data.docType?.trim() || "DNI";
    completion.docNumber = newDocNumber;
  }
  if (!current.birthDate && data.birthDate) {
    // Validada por validateProfileUpdateData; parse como UTC seguro.
    const birthDate = parseBirthDate(data.birthDate);
    if (!birthDate) {
      return {
        success: false,
        message: "Por favor revisá los campos señalados.",
        errors: { birthDate: "Ingresá una fecha de nacimiento válida." },
      };
    }
    completion.birthDate = birthDate;
  }

  // Comprobar si el email está siendo tomado por otro usuario
  const emailInUse = await db.user.findFirst({
    where: {
      email: data.email.toLowerCase().trim(),
      NOT: { clerkUserId: userId },
    },
  });

  if (emailInUse) {
    return {
      success: false,
      message: "El correo electrónico ingresado ya está asociado a otra cuenta.",
      errors: { email: "Este correo ya está en uso." },
    };
  }

  try {
    // Actualizar en base de datos.
    // RN / US-01: Documento y fecha de nacimiento NO son editables por el usuario.
    await db.user.update({
      where: { clerkUserId: userId },
      data: {
        ...completion,
        phone: data.phone.trim(),
        email: data.email.toLowerCase().trim(),
        address: data.address?.trim() || null,
        alternativeContact: data.alternativeContact?.trim() || null,
        coverageType: data.coverageType,
        healthInsuranceEntity:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsuranceEntity?.trim() : null,
        healthInsurancePlan:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsurancePlan?.trim() : null,
        healthInsuranceNumber:
          data.coverageType === "OBRA_SOCIAL" ? data.healthInsuranceNumber?.trim() : null,
      },
    });

    revalidatePath("/dashboard/mis-datos");
    return {
      success: true,
      message: "Tus datos se actualizaron correctamente.",
    };
  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    return {
      success: false,
      message: "Ocurrió un error al actualizar los datos.",
    };
  }
}

export async function syncUserEmailInDb(
  newEmail: string,
  newEmailAddressId: string
): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      success: false,
      message: "No tenés una sesión activa. Iniciá sesión nuevamente.",
    };
  }

  const cleanEmail = newEmail.toLowerCase().trim();

  // Defensa en profundidad: la server action es invocable desde el cliente,
  // no se confía en que el email llegue ya validado por Clerk.
  const emailError = validateEmailFormat(cleanEmail);
  if (emailError) {
    return {
      success: false,
      message: "El correo electrónico ingresado no es válido.",
      errors: { email: emailError },
    };
  }

  // Comprobar disponibilidad en DB
  const emailInUse = await db.user.findFirst({
    where: {
      email: cleanEmail,
      NOT: { clerkUserId: userId },
    },
  });

  if (emailInUse) {
    return {
      success: false,
      message:
        "El correo electrónico ingresado ya está asociado a otra cuenta en la base de datos.",
      errors: { email: "Este correo ya está en uso." },
    };
  }

  try {
    const client = await clerkClient();

    // 1. Marcar el nuevo correo como primario y verificado desde el Backend SDK de Clerk
    await client.emailAddresses.updateEmailAddress(newEmailAddressId, {
      primary: true,
      verified: true,
    });

    await client.users.updateUser(userId, {
      primaryEmailAddressID: newEmailAddressId,
    });

    // 2. Obtener usuario actualizado de Clerk y eliminar correos anteriores
    const clerkUser = await client.users.getUser(userId);

    for (const emailObj of clerkUser.emailAddresses) {
      if (emailObj.id !== newEmailAddressId) {
        // Si el correo anterior estaba vinculado a una cuenta externa (ej. Google OAuth),
        // desvinculamos primero la cuenta externa para que Clerk permita borrar el email
        if (emailObj.linkedTo && emailObj.linkedTo.length > 0) {
          for (const link of emailObj.linkedTo) {
            try {
              await client.users.deleteUserExternalAccount({
                userId,
                externalAccountId: link.id,
              });
            } catch (unlinkErr) {
              console.warn(
                "No se pudo desvincular cuenta externa asociada al email antiguo:",
                unlinkErr
              );
            }
          }
        }

        // Eliminar el correo antiguo en Clerk
        await client.emailAddresses.deleteEmailAddress(emailObj.id);
      }
    }

    // 3. Actualizar en la base de datos Postgres
    await db.user.update({
      where: { clerkUserId: userId },
      data: {
        email: cleanEmail,
      },
    });

    revalidatePath("/dashboard/mis-datos");
    return {
      success: true,
      message:
        "Tu correo electrónico ha sido verificado y actualizado correctamente. Las notificaciones posteriores se enviarán a esta dirección.",
    };
  } catch (error: any) {
    console.error("Error al finalizar el cambio de email:", error);
    const detail =
      error?.errors?.[0]?.longMessage ||
      error?.errors?.[0]?.message ||
      error?.message ||
      "Error al actualizar y eliminar el correo anterior.";
    return {
      success: false,
      message: detail,
    };
  }
}


export async function getCurrentUserProfile() {
  const { userId } = await auth();
  if (!userId) return null;

  return db.user.findUnique({
    where: { clerkUserId: userId },
  });
}

