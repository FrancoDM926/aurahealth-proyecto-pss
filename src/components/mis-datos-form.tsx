"use client";

import { useState } from "react";
import { updateUserProfile, UpdateProfileInput } from "@/actions/user";

type UserData = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  birthDate: Date | string;
  phone: string;
  address: string | null;
  alternativeContact: string | null;
  coverageType: string;
  healthInsuranceEntity: string | null;
  healthInsurancePlan: string | null;
  healthInsuranceNumber: string | null;
  role: string;
};

export function MisDatosForm({ user }: { user: UserData }) {
  const [formData, setFormData] = useState({
    phone: user.phone || "",
    email: user.email || "",
    address: user.address || "",
    alternativeContact: user.alternativeContact || "",
    coverageType: (user.coverageType === "OBRA_SOCIAL" ? "OBRA_SOCIAL" : "PARTICULAR") as
      | "OBRA_SOCIAL"
      | "PARTICULAR",
    healthInsuranceEntity: user.healthInsuranceEntity || "",
    healthInsurancePlan: user.healthInsurancePlan || "",
    healthInsuranceNumber: user.healthInsuranceNumber || "",
  });

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const formattedBirthDate = new Date(user.birthDate).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleCoverageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as "OBRA_SOCIAL" | "PARTICULAR";
    setFormData((prev) => ({
      ...prev,
      coverageType: value,
      ...(value === "PARTICULAR"
        ? {
            healthInsuranceEntity: "",
            healthInsurancePlan: "",
            healthInsuranceNumber: "",
          }
        : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!formData.phone.trim()) errors.phone = "El teléfono no puede estar vacío.";
    if (!formData.email.trim()) errors.email = "El correo no puede estar vacío.";

    if (formData.coverageType === "OBRA_SOCIAL") {
      if (!formData.healthInsuranceEntity.trim()) {
        errors.healthInsuranceEntity = "Indicá la entidad de tu cobertura.";
      }
      if (!formData.healthInsurancePlan.trim()) {
        errors.healthInsurancePlan = "Indicá el plan de tu cobertura.";
      }
      if (!formData.healthInsuranceNumber.trim()) {
        errors.healthInsuranceNumber = "Indicá tu número de afiliado.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMessage("Por favor completá los campos obligatorios.");
      return;
    }

    setLoading(true);

    try {
      const result = await updateUserProfile(formData as UpdateProfileInput);
      if (!result.success) {
        setErrorMessage(result.message || "Error al actualizar los datos.");
        if (result.errors) {
          setFieldErrors(result.errors);
        }
      } else {
        setSuccessMessage(result.message || "Tus datos se actualizaron correctamente.");
      }
    } catch {
      setErrorMessage("Ocurrió un error inesperado al intentar guardar.");
    } finally {
      setLoading(false);
    }
  };

  const isParticular = formData.coverageType === "PARTICULAR";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {successMessage && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          ✅ {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
        >
          {errorMessage}
        </div>
      )}

      {/* Bloque 1: Datos Editables */}
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
        <div className="mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            1 · Datos editables
          </span>
          <h2 className="text-lg font-bold text-ink">Información personal</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre (Display) */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary">
              Nombre
            </label>
            <input
              type="text"
              disabled
              value={user.firstName}
              className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm text-ink-secondary cursor-not-allowed"
            />
          </div>

          {/* Apellido (Display) */}
          <div>
            <label className="block text-sm font-medium text-ink-secondary">
              Apellido
            </label>
            <input
              type="text"
              disabled
              value={user.lastName}
              className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm text-ink-secondary cursor-not-allowed"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-ink">
              Teléfono <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                fieldErrors.phone
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {fieldErrors.phone && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>
            )}
          </div>

          {/* Correo Electrónico */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Correo electrónico <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                fieldErrors.email
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          {/* Domicilio */}
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-ink">
              Domicilio
            </label>
            <input
              id="address"
              name="address"
              type="text"
              placeholder="Calle, número, localidad"
              value={formData.address}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Contacto Alternativo */}
          <div>
            <label
              htmlFor="alternativeContact"
              className="block text-sm font-medium text-ink"
            >
              Contacto alternativo
            </label>
            <input
              id="alternativeContact"
              name="alternativeContact"
              type="text"
              placeholder="Nombre y teléfono"
              value={formData.alternativeContact}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-secondary">
          💡 Al cambiar el correo electrónico, las notificaciones posteriores se enviarán a la nueva dirección.
        </p>
      </section>

      {/* Bloque 2: Cobertura */}
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
        <div className="mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            2 · Cobertura
          </span>
          <h2 className="text-lg font-bold text-ink">Obra social</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Tipo de Cobertura */}
          <div className="sm:col-span-2">
            <label
              htmlFor="coverageType"
              className="block text-sm font-medium text-ink"
            >
              Tipo de cobertura
            </label>
            <select
              id="coverageType"
              name="coverageType"
              value={formData.coverageType}
              onChange={handleCoverageChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="OBRA_SOCIAL">Obra social o prepaga</option>
              <option value="PARTICULAR">Sin cobertura / particular</option>
            </select>
          </div>

          {/* Entidad */}
          <div>
            <label
              htmlFor="healthInsuranceEntity"
              className={`block text-sm font-medium ${
                isParticular ? "text-ink-muted" : "text-ink"
              }`}
            >
              Entidad {!isParticular && <span className="text-red-500">*</span>}
            </label>
            <select
              id="healthInsuranceEntity"
              name="healthInsuranceEntity"
              disabled={isParticular}
              value={formData.healthInsuranceEntity}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isParticular
                  ? "border-line bg-gray-100 text-ink-muted cursor-not-allowed"
                  : fieldErrors.healthInsuranceEntity
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            >
              <option value="">Seleccionar entidad</option>
              <option value="OSDE">OSDE</option>
              <option value="Swiss Medical">Swiss Medical</option>
              <option value="IOMA">IOMA</option>
              <option value="PAMI">PAMI</option>
            </select>
            {fieldErrors.healthInsuranceEntity && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.healthInsuranceEntity}
              </p>
            )}
          </div>

          {/* Plan */}
          <div>
            <label
              htmlFor="healthInsurancePlan"
              className={`block text-sm font-medium ${
                isParticular ? "text-ink-muted" : "text-ink"
              }`}
            >
              Plan {!isParticular && <span className="text-red-500">*</span>}
            </label>
            <input
              id="healthInsurancePlan"
              name="healthInsurancePlan"
              type="text"
              disabled={isParticular}
              value={formData.healthInsurancePlan}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isParticular
                  ? "border-line bg-gray-100 text-ink-muted cursor-not-allowed"
                  : fieldErrors.healthInsurancePlan
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            />
            {fieldErrors.healthInsurancePlan && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.healthInsurancePlan}
              </p>
            )}
          </div>

          {/* Número de afiliado */}
          <div className="sm:col-span-2">
            <label
              htmlFor="healthInsuranceNumber"
              className={`block text-sm font-medium ${
                isParticular ? "text-ink-muted" : "text-ink"
              }`}
            >
              Número de afiliado {!isParticular && <span className="text-red-500">*</span>}
            </label>
            <input
              id="healthInsuranceNumber"
              name="healthInsuranceNumber"
              type="text"
              disabled={isParticular}
              value={formData.healthInsuranceNumber}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isParticular
                  ? "border-line bg-gray-100 text-ink-muted cursor-not-allowed"
                  : fieldErrors.healthInsuranceNumber
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            />
            {fieldErrors.healthInsuranceNumber && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.healthInsuranceNumber}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Bloque 3: Solo Lectura (RN: Documento y Fecha de Nacimiento no son editables) */}
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
        <div className="mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            3 · Solo lectura
          </span>
          <h2 className="text-lg font-bold text-ink">Datos no editables</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink-secondary">
              Documento
            </label>
            <div className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm font-semibold text-ink">
              {user.docType} {user.docNumber}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-secondary">
              Fecha de nacimiento
            </label>
            <div className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm font-semibold text-ink">
              {formattedBirthDate}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-secondary">
          🔒 Documento y fecha de nacimiento no son editables por el usuario: requieren intervención administrativa. Se muestran como texto, sin control de edición.
        </p>
      </section>

      {/* Acciones */}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
