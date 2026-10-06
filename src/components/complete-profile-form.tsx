"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeUserProfile } from "@/actions/user";
import {
  validateCompleteProfileData,
  DOC_TYPES,
  DOC_TYPE_LABELS,
  ENTITY_OPTIONS,
  MAX_LENGTHS,
} from "@/lib/validation";

export function CompleteProfileForm() {
  const router = useRouter();

  // Estados del formulario
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    docType: "DNI",
    docNumber: "",
    birthDate: "",
    phone: "",
    address: "",
    alternativeContact: "",
    coverageType: "OBRA_SOCIAL" as "OBRA_SOCIAL" | "PARTICULAR",
    healthInsuranceEntity: "",
    healthInsurancePlan: "",
    healthInsuranceNumber: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Limpiar error del campo al escribir
    if (errors[name]) {
      setErrors((prev) => {
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
    setGeneralError(null);
    setErrors({});

    // Mismas reglas y mensajes que en el servidor (src/lib/validation.ts).
    const clientErrors = validateCompleteProfileData(formData);

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setGeneralError("Completá o corregí los campos señalados antes de continuar.");
      return;
    }

    setLoading(true);

    try {
      const result = await completeUserProfile(formData);

      if (!result.success) {
        setGeneralError(result.message || "Error al completar el perfil.");
        if (result.errors) {
          setErrors(result.errors);
        }
      } else {
        // Redirigir al dashboard al registrar exitosamente
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setGeneralError("Ocurrió un problema de conexión. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const isParticular = formData.coverageType === "PARTICULAR";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Banner de error general si falla */}
      {generalError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
        >
          {generalError}
        </div>
      )}

      {/* Bloque 1: Datos Personales */}
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">Datos personales</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div>
            <label
              htmlFor="firstName"
              className="block text-sm font-medium text-ink"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              maxLength={MAX_LENGTHS.firstName}
              placeholder="Ej. María"
              value={formData.firstName}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.firstName
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>
            )}
          </div>

          {/* Apellido */}
          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-ink"
            >
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              maxLength={MAX_LENGTHS.lastName}
              placeholder="Ej. García"
              value={formData.lastName}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.lastName
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>
            )}
          </div>

          {/* Tipo de Documento */}
          <div>
            <label
              htmlFor="docType"
              className="block text-sm font-medium text-ink"
            >
              Tipo de Documento
            </label>
            <select
              id="docType"
              name="docType"
              value={formData.docType}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DOC_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {/* Número de Documento */}
          <div>
            <label
              htmlFor="docNumber"
              className="block text-sm font-medium text-ink"
            >
              Número de documento <span className="text-red-500">*</span>
            </label>
            <input
              id="docNumber"
              name="docNumber"
              type="text"
              maxLength={MAX_LENGTHS.docNumber}
              placeholder="Sin puntos ni espacios (Ej. 38442901)"
              value={formData.docNumber}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.docNumber
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {errors.docNumber && (
              <p className="mt-1 text-xs text-red-600">{errors.docNumber}</p>
            )}
          </div>

          {/* Fecha de Nacimiento */}
          <div>
            <label
              htmlFor="birthDate"
              className="block text-sm font-medium text-ink"
            >
              Fecha de nacimiento <span className="text-red-500">*</span>
            </label>
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              value={formData.birthDate}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.birthDate
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {errors.birthDate && (
              <p className="mt-1 text-xs text-red-600">{errors.birthDate}</p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-ink"
            >
              Teléfono de contacto <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={MAX_LENGTHS.phone}
              placeholder="Código de área y número"
              value={formData.phone}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink outline-none transition focus:border-primary focus:ring-1 focus:ring-primary ${
                errors.phone
                  ? "border-red-500 bg-red-50/50"
                  : "border-line bg-background"
              }`}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
            )}
          </div>

          {/* Domicilio */}
          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-ink"
            >
              Domicilio
            </label>
            <input
              id="address"
              name="address"
              type="text"
              maxLength={MAX_LENGTHS.address}
              placeholder="Calle, número, localidad"
              value={formData.address}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.address && (
              <p className="mt-1 text-xs text-red-600">{errors.address}</p>
            )}
          </div>

          {/* Contacto alternativo */}
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
              maxLength={MAX_LENGTHS.alternativeContact}
              placeholder="Nombre y teléfono de un familiar / contacto"
              value={formData.alternativeContact}
              onChange={handleChange}
              className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {errors.alternativeContact && (
              <p className="mt-1 text-xs text-red-600">{errors.alternativeContact}</p>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-secondary">
          💡 <strong>Aviso:</strong> El documento y la fecha de nacimiento no son editables tras completar el registro; solo se modifican por vía administrativa.
        </p>
      </section>

      {/* Bloque 2: Obra Social */}
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-ink">Cobertura médica</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Tipo de cobertura */}
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
                  : errors.healthInsuranceEntity
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            >
              <option value="">Seleccionar entidad</option>
              {ENTITY_OPTIONS.map((entity) => (
                <option key={entity.value} value={entity.value}>
                  {entity.label}
                </option>
              ))}
            </select>
            {errors.healthInsuranceEntity && (
              <p className="mt-1 text-xs text-red-600">
                {errors.healthInsuranceEntity}
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
              maxLength={MAX_LENGTHS.healthInsurancePlan}
              placeholder={isParticular ? "Deshabilitado" : "Ej. 210, Plata, Básico"}
              disabled={isParticular}
              value={formData.healthInsurancePlan}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isParticular
                  ? "border-line bg-gray-100 text-ink-muted cursor-not-allowed"
                  : errors.healthInsurancePlan
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            />
            {errors.healthInsurancePlan && (
              <p className="mt-1 text-xs text-red-600">
                {errors.healthInsurancePlan}
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
              maxLength={MAX_LENGTHS.healthInsuranceNumber}
              placeholder={isParticular ? "Deshabilitado" : "Según credencial"}
              disabled={isParticular}
              value={formData.healthInsuranceNumber}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
                isParticular
                  ? "border-line bg-gray-100 text-ink-muted cursor-not-allowed"
                  : errors.healthInsuranceNumber
                  ? "border-red-500 bg-red-50/50 text-ink"
                  : "border-line bg-background text-ink focus:border-primary focus:ring-1 focus:ring-primary"
              }`}
            />
            {errors.healthInsuranceNumber && (
              <p className="mt-1 text-xs text-red-600">
                {errors.healthInsuranceNumber}
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-secondary">
          💡 El dato de cobertura es declarativo (no se valida contra el padrón de la entidad). Al elegir «Sin cobertura / particular» se abona el costo completo de la consulta médica.
        </p>
      </section>

      {/* Acciones */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus:outline-none"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? "Verificando..." : "Continuar"}
        </button>
      </div>
    </form>
  );
}
