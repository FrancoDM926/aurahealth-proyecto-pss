"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInternalUser,
  deactivateInternalUser,
} from "@/actions/internal-users";
import type { MedicalSpecialty, Role } from "@/generated/prisma/client";
import type { InternalUserListItem } from "@/actions/internal-users";
import { formatUserRole, ROLE_LABELS, SPECIALTY_LABELS } from "@/lib/roles";

const CREATABLE_ROLES: Role[] = ["MEDICO", "ENFERMERA", "ADMINISTRATIVO"];

type Props = {
  users: InternalUserListItem[];
};

export function InternalUsersPanel({ users }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [specialty, setSpecialty] = useState<MedicalSpecialty | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrors({});
    setLoading(true);

    const result = await createInternalUser({
      fullName,
      email,
      role: role as Role,
      specialty: role === "MEDICO" ? (specialty as MedicalSpecialty) : null,
    });

    setLoading(false);

    if (!result.success) {
      setMessage(result.message ?? null);
      setErrors(result.errors ?? {});
      return;
    }

    setMessage(result.message ?? "Usuario creado.");
    setFullName("");
    setEmail("");
    setRole("");
    setSpecialty("");
    router.refresh();
  };

  const handleDeactivate = async (user: InternalUserListItem) => {
    const name = `${user.firstName} ${user.lastName}`;
    const confirmed = window.confirm(
      `¿Dar de baja a ${name}? El registro se conservará para trazabilidad.`
    );
    if (!confirmed) return;

    setDeactivatingId(user.id);
    const result = await deactivateInternalUser(user.id);
    setDeactivatingId(null);
    setMessage(result.message ?? null);
    if (result.success) router.refresh();
  };

  return (
    <div className="space-y-10">
      {message && (
        <div
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink"
          role="status"
        >
          {message}
        </div>
      )}

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          1 · Alta
        </span>
        <h2 className="mt-2 text-lg font-bold text-ink">Nuevo usuario interno</h2>

        <form onSubmit={handleCreate} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="fullName">
                Nombre y apellido
              </label>
              <input
                id="fullName"
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                placeholder="Nombre completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-error">{errors.fullName}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="mail">
                Correo
              </label>
              <input
                id="mail"
                type="email"
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                placeholder="usuario@sala.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="mt-1 text-xs text-error">{errors.email}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="rol">
                Rol
              </label>
              <select
                id="rol"
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as Role | "");
                  if (e.target.value !== "MEDICO") setSpecialty("");
                }}
              >
                <option value="">Seleccionar rol</option>
                {CREATABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {errors.role && <p className="mt-1 text-xs text-error">{errors.role}</p>}
            </div>
          </div>

          {role === "MEDICO" && (
            <div className="max-w-sm">
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="specialty">
                Especialidad
              </label>
              <select
                id="specialty"
                className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value as MedicalSpecialty)}
              >
                <option value="">Seleccionar especialidad</option>
                {(Object.keys(SPECIALTY_LABELS) as MedicalSpecialty[]).map((s) => (
                  <option key={s} value={s}>
                    {SPECIALTY_LABELS[s]}
                  </option>
                ))}
              </select>
              {errors.specialty && (
                <p className="mt-1 text-xs text-error">{errors.specialty}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {loading ? "Creando…" : "Crear usuario"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border-2 border-line bg-surface p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          2 · Listado
        </span>
        <h2 className="mt-2 text-lg font-bold text-ink">Usuarios activos e histórico</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-secondary">
                <th className="py-2 pr-4 font-semibold">Nombre</th>
                <th className="py-2 pr-4 font-semibold">Rol</th>
                <th className="py-2 pr-4 font-semibold">Estado</th>
                <th className="py-2 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-line/80">
                  <td className="py-3 pr-4">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="py-3 pr-4">
                    {formatUserRole(user.role, user.specialty, user.specialtyRaw)}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        user.isActive
                          ? "inline-flex rounded-full bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary"
                          : "inline-flex rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-secondary"
                      }
                    >
                      {user.isActive ? "Activo" : "Baja"}
                    </span>
                  </td>
                  <td className="py-3">
                    {user.isActive && user.role !== "ADMINISTRADOR" ? (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(user)}
                        disabled={deactivatingId === user.id}
                        className="rounded-lg border border-error/40 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/5 disabled:opacity-60"
                      >
                        Dar de baja
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-ink-secondary">
          La baja solicita confirmación y conserva trazabilidad según la regla de negocio.
        </p>
      </section>
    </div>
  );
}
