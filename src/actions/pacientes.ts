"use server";

import { db } from "@/lib/db";
import { assertRoles } from "@/lib/auth-session";
import {
  MAX_RESULTADOS_BUSQUEDA,
  normalizarBusquedaPaciente,
  normalizarDocumentoBusqueda,
  resumenCobertura,
  type PacienteResultado,
} from "@/lib/pacientes";

/**
 * Búsqueda de pacientes para el personal. Compartida por el turno de vacunación
 * desde mostrador (US-28), el registro de dosis (US-29) y el mostrador (US-17).
 */

export type TitularBuscado = {
  id: string;
  nombre: string;
  documento: string | null;
  email: string;
  cobertura: string;
};

export type PersonaDelTitular = {
  id: string;
  nombre: string;
  documento: string;
  obraSocial: string;
};

export type BusquedaTitularesResult =
  | { ok: true; titulares: TitularBuscado[] }
  | { ok: false; message: string };

const ROLES_PERSONAL = ["ENFERMERA", "ADMINISTRATIVO"] as const;

function condicionesDeBusqueda(q: string) {
  const doc = normalizarDocumentoBusqueda(q);
  return [
    ...(doc.length >= 3 ? [{ docNumber: { contains: doc } }] : []),
    { lastName: { contains: q, mode: "insensitive" as const } },
    { email: { contains: q, mode: "insensitive" as const } },
  ];
}

/** Usuarios registrados (rol Usuario) por documento, apellido o email. */
export async function buscarTitularesAction(q: string): Promise<BusquedaTitularesResult> {
  try {
    await assertRoles([...ROLES_PERSONAL]);
  } catch {
    return { ok: false, message: "No tenés permisos para buscar pacientes." };
  }
  const texto = normalizarBusquedaPaciente(q);
  if (!texto) return { ok: false, message: "Ingresá al menos 3 caracteres del documento, apellido o email." };

  const usuarios = await db.user.findMany({
    where: { role: "USUARIO", isActive: true, OR: condicionesDeBusqueda(texto) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: MAX_RESULTADOS_BUSQUEDA,
  });
  return {
    ok: true,
    titulares: usuarios.map((u) => ({
      id: u.id,
      nombre: `${u.firstName} ${u.lastName}`,
      documento: u.docNumber,
      email: u.email,
      cobertura: resumenCobertura(u),
    })),
  };
}

/** Personas atendidas que cargó un titular (US-64). */
export async function listarPersonasDelTitularAction(titularId: string): Promise<PersonaDelTitular[]> {
  try {
    await assertRoles([...ROLES_PERSONAL]);
  } catch {
    return [];
  }
  const personas = await db.personaAtendida.findMany({
    where: { userId: titularId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return personas.map((p) => ({
    id: p.id,
    nombre: `${p.firstName} ${p.lastName}`,
    documento: p.docNumber,
    obraSocial: `${p.healthInsuranceEntity} ${p.healthInsurancePlan}`,
  }));
}

/** Usuarios y personas atendidas (con su titular) para elegir al paciente de una dosis (US-29). */
export async function buscarPacientesAction(
  q: string
): Promise<{ ok: true; pacientes: PacienteResultado[] } | { ok: false; message: string }> {
  try {
    await assertRoles(["ENFERMERA"]);
  } catch {
    return { ok: false, message: "Solo el personal de enfermería registra dosis." };
  }
  const texto = normalizarBusquedaPaciente(q);
  if (!texto) return { ok: false, message: "Ingresá al menos 3 caracteres del documento, apellido o email." };

  const doc = normalizarDocumentoBusqueda(texto);
  const [usuarios, personas] = await Promise.all([
    db.user.findMany({
      where: { role: "USUARIO", isActive: true, OR: condicionesDeBusqueda(texto) },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_RESULTADOS_BUSQUEDA,
    }),
    db.personaAtendida.findMany({
      where: {
        OR: [
          ...(doc.length >= 3 ? [{ docNumber: { contains: doc } }] : []),
          { lastName: { contains: texto, mode: "insensitive" as const } },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: MAX_RESULTADOS_BUSQUEDA,
    }),
  ]);

  return {
    ok: true,
    pacientes: [
      ...usuarios.map(
        (u): PacienteResultado => ({
          ref: { tipo: "USER", id: u.id },
          nombre: `${u.firstName} ${u.lastName}`,
          documento: u.docNumber,
          detalle: `${u.email} · ${resumenCobertura(u)}`,
        })
      ),
      ...personas.map(
        (p): PacienteResultado => ({
          ref: { tipo: "PERSONA", id: p.id },
          nombre: `${p.firstName} ${p.lastName}`,
          documento: p.docNumber,
          detalle: `A cargo de ${p.user.firstName} ${p.user.lastName} · ${p.healthInsuranceEntity}`,
        })
      ),
    ],
  };
}
