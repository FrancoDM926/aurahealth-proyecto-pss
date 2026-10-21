"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import {
  MENSAJE_VACUNA_DUPLICADA,
  buscarDuplicadaActiva,
  validarVacuna,
  type VacunaErrores,
  type VacunaInput,
} from "@/lib/vacunas";

export type VacunaItem = {
  id: string;
  denominacion: string;
  laboratorio: string;
  esquemaDosis: string;
  isActive: boolean;
};

export type VacunaActionResult = {
  success: boolean;
  message?: string;
  errors?: VacunaErrores;
};

const SOLO_ENFERMERIA = "Solo el personal de enfermería administra el catálogo de vacunas.";

const SELECT_VACUNA = {
  id: true,
  denominacion: true,
  laboratorio: true,
  esquemaDosis: true,
  isActive: true,
} as const;

function revalidarCatalogo() {
  revalidatePath("/dashboard/catalogo-vacunas");
}

/** Violación del índice único parcial: otra operación creó la misma vacuna activa. */
function esViolacionDeUnicidad(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

async function catalogoActivoPara(denominacion: string, laboratorio: string) {
  // El filtro de la base es solo una poda; la comparación real (sin mayúsculas ni
  // acentos) se hace en `buscarDuplicadaActiva`.
  const activas = await db.vacuna.findMany({
    where: { isActive: true },
    select: { id: true, denominacion: true, laboratorio: true, isActive: true },
  });
  return buscarDuplicadaActiva(activas, denominacion, laboratorio);
}

/** Listado completo del catálogo (activas e inactivas) para quien lo administra. */
export async function listarCatalogoVacunas(): Promise<VacunaItem[]> {
  await assertRoles(["ENFERMERA"]);
  return db.vacuna.findMany({
    orderBy: [{ isActive: "desc" }, { denominacion: "asc" }, { laboratorio: "asc" }],
    select: SELECT_VACUNA,
  });
}

/**
 * Única fuente de vacunas asignables al resto del módulo (búsqueda y alta de
 * turnos de vacunación): devuelve solo las activas. Una desactivada no aparece
 * como opción para turnos nuevos (US-24).
 */
export async function listarVacunasActivas(): Promise<VacunaItem[]> {
  await assertRoles(["ENFERMERA", "ADMINISTRATIVO", "USUARIO"]);
  return db.vacuna.findMany({
    where: { isActive: true },
    orderBy: [{ denominacion: "asc" }, { laboratorio: "asc" }],
    select: SELECT_VACUNA,
  });
}

export async function crearVacuna(input: VacunaInput): Promise<VacunaActionResult> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }

  const parsed = validarVacuna(input);
  if (!parsed.ok) {
    return { success: false, message: "Revisá los campos señalados.", errors: parsed.errors };
  }
  const { denominacion, laboratorio, esquemaDosis } = parsed.data;

  try {
    if (await catalogoActivoPara(denominacion, laboratorio)) {
      return {
        success: false,
        message: MENSAJE_VACUNA_DUPLICADA,
        errors: { denominacion: MENSAJE_VACUNA_DUPLICADA },
      };
    }
    await db.vacuna.create({ data: { denominacion, laboratorio, esquemaDosis } });
    revalidarCatalogo();
    return { success: true, message: "Vacuna agregada al catálogo." };
  } catch (error) {
    if (esViolacionDeUnicidad(error)) {
      return {
        success: false,
        message: MENSAJE_VACUNA_DUPLICADA,
        errors: { denominacion: MENSAJE_VACUNA_DUPLICADA },
      };
    }
    console.error("crearVacuna:", error);
    return { success: false, message: "No se pudo agregar la vacuna." };
  }
}

export async function modificarVacuna(
  id: string,
  input: VacunaInput
): Promise<VacunaActionResult> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }

  const parsed = validarVacuna(input);
  if (!parsed.ok) {
    return { success: false, message: "Revisá los campos señalados.", errors: parsed.errors };
  }
  const { denominacion, laboratorio, esquemaDosis } = parsed.data;

  try {
    const actual = await db.vacuna.findUnique({ where: { id }, select: SELECT_VACUNA });
    if (!actual) return { success: false, message: "La vacuna no existe." };

    // Solo una vacuna activa compite por la unicidad: una desactivada puede
    // editarse aunque coincida con otra, y se revisa al reactivarla.
    if (actual.isActive) {
      const duplicada = await catalogoActivoPara(denominacion, laboratorio);
      if (duplicada && duplicada.id !== id) {
        return {
          success: false,
          message: MENSAJE_VACUNA_DUPLICADA,
          errors: { denominacion: MENSAJE_VACUNA_DUPLICADA },
        };
      }
    }

    await db.vacuna.update({ where: { id }, data: { denominacion, laboratorio, esquemaDosis } });
    revalidarCatalogo();
    return { success: true, message: "Vacuna actualizada." };
  } catch (error) {
    if (esViolacionDeUnicidad(error)) {
      return {
        success: false,
        message: MENSAJE_VACUNA_DUPLICADA,
        errors: { denominacion: MENSAJE_VACUNA_DUPLICADA },
      };
    }
    console.error("modificarVacuna:", error);
    return { success: false, message: "No se pudo actualizar la vacuna." };
  }
}

export async function desactivarVacuna(id: string): Promise<VacunaActionResult> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }

  try {
    const actual = await db.vacuna.findUnique({ where: { id }, select: SELECT_VACUNA });
    if (!actual) return { success: false, message: "La vacuna no existe." };
    if (!actual.isActive) return { success: false, message: "La vacuna ya está desactivada." };

    await db.vacuna.update({ where: { id }, data: { isActive: false } });
    revalidarCatalogo();
    return {
      success: true,
      message: "Vacuna desactivada. Ya no se puede asignar a turnos nuevos.",
    };
  } catch (error) {
    console.error("desactivarVacuna:", error);
    return { success: false, message: "No se pudo desactivar la vacuna." };
  }
}

export async function reactivarVacuna(id: string): Promise<VacunaActionResult> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return { success: false, message: SOLO_ENFERMERIA };
  }

  try {
    const actual = await db.vacuna.findUnique({ where: { id }, select: SELECT_VACUNA });
    if (!actual) return { success: false, message: "La vacuna no existe." };
    if (actual.isActive) return { success: false, message: "La vacuna ya está activa." };

    // Mientras estuvo desactivada pudo crearse otra igual: no se admiten dos activas.
    if (await catalogoActivoPara(actual.denominacion, actual.laboratorio)) {
      return { success: false, message: MENSAJE_VACUNA_DUPLICADA };
    }

    await db.vacuna.update({ where: { id }, data: { isActive: true } });
    revalidarCatalogo();
    return { success: true, message: "Vacuna reactivada." };
  } catch (error) {
    if (esViolacionDeUnicidad(error)) {
      return { success: false, message: MENSAJE_VACUNA_DUPLICADA };
    }
    console.error("reactivarVacuna:", error);
    return { success: false, message: "No se pudo reactivar la vacuna." };
  }
}
