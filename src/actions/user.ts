"use server";

import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
      message: "No tienes una sesión activa. Por favor iniciá sesión.",
    };
  }

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) {
    return {
      success: false,
      message: "Tu cuenta de autenticación no tiene un correo electrónico asociado.",
    };
  }

  // Validaciones del servidor
  const errors: Record<string, string> = {};

  if (!data.firstName?.trim()) errors.firstName = "El nombre es obligatorio.";
  if (!data.lastName?.trim()) errors.lastName = "El apellido es obligatorio.";
  if (!data.docNumber?.trim()) errors.docNumber = "El número de documento es obligatorio.";
  if (!data.birthDate) errors.birthDate = "La fecha de nacimiento es obligatoria.";
  if (!data.phone?.trim()) errors.phone = "El teléfono es obligatorio.";

  if (data.coverageType === "OBRA_SOCIAL") {
    if (!data.healthInsuranceEntity?.trim()) {
      errors.healthInsuranceEntity = "Debe seleccionar o indicar la entidad de obra social.";
    }
    if (!data.healthInsurancePlan?.trim()) {
      errors.healthInsurancePlan = "El plan es obligatorio.";
    }
    if (!data.healthInsuranceNumber?.trim()) {
      errors.healthInsuranceNumber = "El número de afiliado es obligatorio.";
    }
  }

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
    const parsedDate = new Date(data.birthDate);

    // Crear el usuario en Postgres con rol USUARIO (RN: toda cuenta creada por autorregistro recibe rol Usuario)
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
        role: "USUARIO",
      },
    });

    // Guardar el rol en la metadata pública de Clerk
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: "USUARIO",
      },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error al completar perfil:", error);
    return {
      success: false,
      message: "Ocurrió un error inesperado al guardar los datos. Intente nuevamente.",
    };
  }
}

export type UpdateProfileInput = {
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
      message: "No tienes una sesión activa.",
    };
  }

  const errors: Record<string, string> = {};
  if (!data.phone?.trim()) errors.phone = "El teléfono es obligatorio.";
  if (!data.email?.trim()) errors.email = "El correo electrónico es obligatorio.";

  if (data.coverageType === "OBRA_SOCIAL") {
    if (!data.healthInsuranceEntity?.trim()) {
      errors.healthInsuranceEntity = "Debe indicar la entidad de obra social.";
    }
    if (!data.healthInsurancePlan?.trim()) {
      errors.healthInsurancePlan = "El plan es obligatorio.";
    }
    if (!data.healthInsuranceNumber?.trim()) {
      errors.healthInsuranceNumber = "El número de afiliado es obligatorio.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      message: "Por favor revisá los campos señalados.",
      errors,
    };
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
      message: "No tienes una sesión activa.",
    };
  }

  const cleanEmail = newEmail.toLowerCase().trim();

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

