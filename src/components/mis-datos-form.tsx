"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  updateUserProfile,
  syncUserEmailInDb,
  UpdateProfileInput,
} from "@/actions/user";


type UserData = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  docType: string;
  // Vacíos en usuarios internos recién creados: se completan acá una sola vez.
  docNumber: string | null;
  birthDate: Date | string | null;
  phone: string | null;
  address: string | null;
  alternativeContact: string | null;
  coverageType: string;
  healthInsuranceEntity: string | null;
  healthInsurancePlan: string | null;
  healthInsuranceNumber: string | null;
  role: string;
};

export function MisDatosForm({ user }: { user: UserData }) {
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const missingDoc = !user.docNumber;
  const missingBirthDate = !user.birthDate;

  const [formData, setFormData] = useState({
    docType: user.docType || "DNI",
    docNumber: "",
    birthDate: "",
    phone: user.phone || "",
    email: user.email || "",
    address: user.address || "",
    alternativeContact: user.alternativeContact || "",
    coverageType: (user.coverageType === "OBRA_SOCIAL"
      ? "OBRA_SOCIAL"
      : "PARTICULAR") as "OBRA_SOCIAL" | "PARTICULAR",
    healthInsuranceEntity: user.healthInsuranceEntity || "",
    healthInsurancePlan: user.healthInsurancePlan || "",
    healthInsuranceNumber: user.healthInsuranceNumber || "",
  });

  const [currentEmail, setCurrentEmail] = useState(user.email);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Estados para verificación OTP de Email
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingEmailResource, setPendingEmailResource] = useState<any>(null);
  const [otpCode, setOtpCode] = useState("");

  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const formattedBirthDate = user.birthDate
    ? new Date(user.birthDate).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

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

    const isEmailChanged =
      formData.email.trim().toLowerCase() !== currentEmail.trim().toLowerCase();

    try {
      // 1. Guardar primero la información de contacto y cobertura manteniendo el email actual en DB
      const result = await updateUserProfile({
        ...formData,
        email: currentEmail, // no cambia en DB hasta ser verificado
      } as UpdateProfileInput);

      if (!result.success) {
        setErrorMessage(result.message || "Error al actualizar los datos.");
        if (result.errors) {
          setFieldErrors(result.errors);
        }
        setLoading(false);
        return;
      }

      // Si se completó el documento o el nacimiento, se recarga para mostrarlos bloqueados.
      if ((missingDoc && formData.docNumber.trim()) || (missingBirthDate && formData.birthDate)) {
        router.refresh();
      }

      // 2. Si el email cambió, iniciar flujo OTP en Clerk
      if (isEmailChanged && clerkUser) {
        const newEmailClean = formData.email.trim().toLowerCase();

        try {
          // Verificar si el correo ya fue agregado previamente a la cuenta en Clerk
          let emailResource = clerkUser.emailAddresses.find(
            (e) => e.emailAddress.toLowerCase() === newEmailClean
          );

          if (!emailResource) {
            emailResource = await clerkUser.createEmailAddress({
              email: newEmailClean,
            });
          }

          // Si ya estaba verificado de un intento anterior, promovemos y borramos el viejo directamente
          if (emailResource.verification?.status === "verified") {
            const syncResult = await syncUserEmailInDb(
              newEmailClean,
              emailResource.id
            );
            if (syncResult.success) {
              await clerkUser.reload();
              setCurrentEmail(newEmailClean);
              setSuccessMessage(
                "Tu correo electrónico ha sido verificado y actualizado correctamente. Las notificaciones posteriores se enviarán a esta dirección."
              );
            } else {
              setErrorMessage(
                syncResult.message || "Error al finalizar el cambio de correo."
              );
            }
          } else {
            // Enviar el código OTP al nuevo correo
            await emailResource.prepareVerification({ strategy: "email_code" });

            setPendingEmailResource(emailResource);
            setShowOtpModal(true);
            setSuccessMessage(
              "Tus datos personales fueron guardados. Te enviamos un código de verificación a tu nuevo correo electrónico para confirmar el cambio de dirección."
            );
          }
        } catch (clerkErr: any) {
          console.error("Error al crear correo en Clerk:", clerkErr);
          const message =
            clerkErr?.errors?.[0]?.longMessage ||
            clerkErr?.errors?.[0]?.message ||
            "No se pudo iniciar el proceso de verificación para el nuevo correo.";
          setErrorMessage(message);
          setFieldErrors({ email: message });
        }
      } else {
        setSuccessMessage("Tus datos se actualizaron correctamente.");
      }
    } catch {
      setErrorMessage("Ocurrió un error inesperado al intentar guardar.");
    } finally {
      setLoading(false);
    }
  };

  // Confirmar el código OTP ingresado por el usuario
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmailResource || !clerkUser) return;

    if (!otpCode.trim()) {
      setOtpError("Por favor ingresá el código de verificación.");
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      // 1. Verificar el código OTP en Clerk
      const verificationResult = await pendingEmailResource.attemptVerification({
        code: otpCode.trim(),
      });

      const isVerified =
        verificationResult?.verification?.status === "verified" ||
        verificationResult?.status === "verified";

      if (isVerified) {
        const newEmailAddressId = pendingEmailResource.id;
        const newEmailString = pendingEmailResource.emailAddress;

        // 2. En el servidor (Backend SDK de Clerk + Postgres):
        //    - Establece el nuevo correo como principal
        //    - Desvincula cuentas externas asociadas al correo viejo (si aplica) y elimina el correo anterior en Clerk
        //    - Actualiza el correo en Postgres
        const syncResult = await syncUserEmailInDb(
          newEmailString,
          newEmailAddressId
        );

        if (syncResult.success) {
          await clerkUser.reload();
          setCurrentEmail(newEmailString);
          setShowOtpModal(false);
          setPendingEmailResource(null);
          setOtpCode("");
          setSuccessMessage(
            "Tu correo electrónico ha sido verificado y actualizado correctamente. Las notificaciones posteriores se enviarán a esta dirección."
          );
        } else {
          setOtpError(
            syncResult.message ||
              "El correo fue verificado pero ocurrió un error al actualizar la cuenta."
          );
        }
      } else {
        setOtpError("El código ingresado es incorrecto o ha expirado.");
      }
    } catch (err: any) {
      console.error("Error al verificar código OTP:", err);
      const message =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        "El código ingresado es inválido o ha expirado. Intentá nuevamente.";
      setOtpError(message);
    } finally {
      setOtpLoading(false);
    }
  };


  const handleCancelOtp = async () => {
    if (pendingEmailResource) {
      try {
        await pendingEmailResource.destroy();
      } catch (err) {
        console.warn("No se pudo limpiar el recurso de email no verificado:", err);
      }
    }
    setShowOtpModal(false);
    setPendingEmailResource(null);
    setOtpCode("");
    setOtpError(null);
    setFormData((prev) => ({ ...prev, email: currentEmail }));
  };

  const isParticular = formData.coverageType === "PARTICULAR";

  return (
    <>
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
            💡 Al cambiar el correo electrónico, las notificaciones posteriores se enviarán a la nueva dirección tras confirmar el código de verificación (OTP).
          </p>
        </section>

        {/* Bloque 2: Cobertura */}
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
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

        {/* Bloque 3: Solo Lectura */}
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-ink">Datos no editables</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {missingDoc ? (
              <div>
                <label htmlFor="docNumber" className="block text-sm font-medium text-ink">
                  Documento
                </label>
                <div className="mt-1 flex gap-2">
                  <select
                    name="docType"
                    aria-label="Tipo de documento"
                    value={formData.docType}
                    onChange={handleChange}
                    className="rounded-lg border border-line bg-background px-2 py-2 text-sm text-ink"
                  >
                    <option value="DNI">DNI</option>
                    <option value="LC">LC</option>
                    <option value="LE">LE</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </select>
                  <input
                    id="docNumber"
                    name="docNumber"
                    type="text"
                    placeholder="Número"
                    value={formData.docNumber}
                    onChange={handleChange}
                    className={`block w-full rounded-lg border bg-background px-3 py-2 text-sm text-ink ${
                      fieldErrors.docNumber ? "border-red-500" : "border-line"
                    }`}
                  />
                </div>
                {fieldErrors.docNumber && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.docNumber}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-ink-secondary">
                  Documento
                </label>
                <div className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm font-semibold text-ink">
                  {user.docType} {user.docNumber}
                </div>
              </div>
            )}

            {missingBirthDate ? (
              <div>
                <label htmlFor="birthDate" className="block text-sm font-medium text-ink">
                  Fecha de nacimiento
                </label>
                <input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm text-ink ${
                    fieldErrors.birthDate ? "border-red-500" : "border-line"
                  }`}
                />
                {fieldErrors.birthDate && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.birthDate}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-ink-secondary">
                  Fecha de nacimiento
                </label>
                <div className="mt-1 block w-full rounded-lg border border-line bg-gray-100 px-3 py-2 text-sm font-semibold text-ink">
                  {formattedBirthDate}
                </div>
              </div>
            )}
          </div>

          {(missingDoc || missingBirthDate) && (
            <p className="mt-4 text-xs font-medium text-ink">
              Completá los datos que faltan. Una vez guardados, el documento y la fecha de
              nacimiento ya no se pueden modificar.
            </p>
          )}

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

      {/* Modal / Diálogo de Verificación OTP de Email */}
      {showOtpModal && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl transition-all">
            <div className="mb-4 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary-light text-primary">
                ✉️
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink">
                Verificar correo electrónico
              </h3>
              <p className="mt-2 text-sm text-ink-secondary">
                Enviamos un código de verificación de 6 dígitos a:
                <br />
                <strong className="text-ink">{formData.email}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {otpError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800"
                >
                  {otpError}
                </div>
              )}

              <div>
                <label
                  htmlFor="otpCode"
                  className="block text-center text-xs font-semibold uppercase tracking-wider text-ink"
                >
                  Código de Verificación (OTP)
                </label>
                <input
                  id="otpCode"
                  type="text"
                  maxLength={6}
                  placeholder="Ej. 123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-line bg-background py-3 text-center text-2xl font-bold tracking-widest text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark focus:outline-none disabled:opacity-50"
                >
                  {otpLoading ? "Verificando..." : "Verificar y guardar email"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelOtp}
                  disabled={otpLoading}
                  className="w-full rounded-lg border border-line bg-transparent py-2 text-sm font-semibold text-ink-secondary transition hover:bg-gray-100"
                >
                  Cancelar cambio de email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
