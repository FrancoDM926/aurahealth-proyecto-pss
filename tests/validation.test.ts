import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseBirthDate,
  validateBirthDate,
  validateCompleteProfileData,
  validateDocNumber,
  validateDocType,
  validateEmailFormat,
  validateName,
  validateOptionalText,
  validatePhone,
  validateProfileUpdateData,
  MAX_LENGTHS,
} from "../src/lib/validation";

describe("validateName", () => {
  it("acepta nombres y apellidos con acentos, ñ, espacios, guiones y apóstrofes", () => {
    for (const name of ["María", "José", "Ana María", "D'Angelo", "D’Angelo", "Ana-María", "Ñandú", "Ángela"]) {
      assert.equal(validateName(name, "nombre"), null, `debía aceptar ${JSON.stringify(name)}`);
    }
  });

  it("rechaza vacío, demasiado cortos, demasiado largos y con números", () => {
    assert.equal(validateName("", "nombre"), "Ingresá tu nombre.");
    assert.equal(validateName("   ", "apellido"), "Ingresá tu apellido.");
    assert.equal(validateName("A", "nombre"), "Usá al menos 2 caracteres.");
    assert.equal(validateName("a".repeat(MAX_LENGTHS.firstName + 1), "nombre"), "Máximo 50 caracteres.");
    assert.equal(validateName("Juan123", "nombre"), "Solo letras, espacios, guiones y apóstrofes.");
  });
});

describe("validateEmailFormat", () => {
  it("acepta correos con formato válido", () => {
    for (const email of ["maria@correo.com", "a.b+c@d.com.ar", "user@sub.domain.org"]) {
      assert.equal(validateEmailFormat(email), null, `debía aceptar ${JSON.stringify(email)}`);
    }
  });

  it("rechaza vacío, formatos inválidos y longitudes excesivas", () => {
    assert.equal(validateEmailFormat(""), "Ingresá tu correo electrónico.");
    for (const email of ["foo@", "foo@bar", "foo bar@baz.com", "@sin-local.com", "a@b.c"]) {
      assert.equal(
        validateEmailFormat(email),
        "Ingresá un correo electrónico válido.",
        `debía rechazar ${JSON.stringify(email)}`
      );
    }
    assert.equal(
      validateEmailFormat(`${"a".repeat(MAX_LENGTHS.email)}@x.com`),
      `Máximo ${MAX_LENGTHS.email} caracteres.`
    );
  });
});

describe("validatePhone", () => {
  it("acepta teléfonos flexibles (dígito, espacio, guion, paréntesis, '+' inicial)", () => {
    for (const phone of ["1155555555", "+54 11 5555-5555", "(011) 5555-5555", "011 55555555"]) {
      assert.equal(validatePhone(phone), null, `debía aceptar ${JSON.stringify(phone)}`);
    }
  });

  it("rechaza vacío, letras y cantidades de dígitos fuera de rango", () => {
    assert.equal(validatePhone(""), "Ingresá tu teléfono.");
    assert.equal(validatePhone("calle falsa 123"), "Solo dígitos, espacios, guiones y paréntesis.");
    assert.equal(validatePhone("12345"), "Debe tener entre 6 y 15 dígitos.");
    assert.equal(validatePhone("1234567890123456"), "Debe tener entre 6 y 15 dígitos.");
    assert.equal(validatePhone("a".repeat(MAX_LENGTHS.phone + 1)), `Máximo ${MAX_LENGTHS.phone} caracteres.`);
  });
});

describe("parseBirthDate / validateBirthDate", () => {
  it("parsea YYYY-MM-DD como fecha UTC válida", () => {
    const date = parseBirthDate("1994-05-20");
    assert.ok(date);
    assert.equal(date.toISOString(), "1994-05-20T00:00:00.000Z");
    assert.equal(validateBirthDate("1994-05-20"), null);
  });

  it("acecha exactamente 120 años", () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const y = today.getUTCFullYear() - 120;
    const m = String(today.getUTCMonth() + 1).padStart(2, "0");
    const d = String(today.getUTCDate()).padStart(2, "0");
    assert.equal(validateBirthDate(`${y}-${m}-${d}`), null);
  });

  it("rechaza formatos inexistentes, fechas futuras y mayores de 120 años", () => {
    for (const value of ["", "20/05/1994", "1994/05/20", "2026-02-30", "2026-13-01", "abc"]) {
      assert.ok(
        validateBirthDate(value),
        `debía rechazar ${JSON.stringify(value)}`
      );
    }
    assert.equal(validateBirthDate("2999-01-01"), "La fecha no puede ser futura.");
    assert.equal(validateBirthDate("1900-01-01"), "La fecha no puede tener más de 120 años.");
    assert.equal(parseBirthDate("2026-02-30"), null);
    assert.equal(parseBirthDate("12-05-1994"), null);
  });
});

describe("validateOptionalText / validateDocNumber / validateDocType", () => {
  it("texto opcional: vacío sin error, longitud máxima respetada", () => {
    assert.equal(validateOptionalText(undefined, 120), null);
    assert.equal(validateOptionalText("", 120), null);
    assert.equal(validateOptionalText("   ", 120), null);
    assert.equal(validateOptionalText("a".repeat(121), 120), "Máximo 120 caracteres.");
  });

  it("número de documento: vacío según requerido, longitud máxima", () => {
    assert.equal(validateDocNumber("", { required: true }), "Ingresá tu número de documento.");
    assert.equal(validateDocNumber(""), null);
    assert.equal(validateDocNumber("38442901"), null);
    assert.equal(validateDocNumber("a".repeat(21)), `Máximo ${MAX_LENGTHS.docNumber} caracteres.`);
  });

  it("tipo de documento: enum exacto, vacío cae al default DNI", () => {
    for (const docType of ["DNI", "LC", "LE", "PASAPORTE"]) {
      assert.equal(validateDocType(docType), null);
    }
    assert.equal(validateDocType(""), null);
    assert.equal(validateDocType("DNI2"), "Seleccioná un tipo de documento válido.");
  });
});

const validCompleteProfile = {
  firstName: "María",
  lastName: "García",
  docType: "DNI",
  docNumber: "38442901",
  birthDate: "1994-05-20",
  phone: "11 5555-5555",
  address: "Av. San Martín 1234",
  alternativeContact: "Juan García 1154443333",
  coverageType: "OBRA_SOCIAL",
  healthInsuranceEntity: "OSDE",
  healthInsurancePlan: "210",
  healthInsuranceNumber: "1234567",
};

describe("validateCompleteProfileData", () => {
  it("acepta un perfil completo válido", () => {
    assert.deepEqual(validateCompleteProfileData(validCompleteProfile), {});
  });

  it("marca todos los campos obligatorios cuando llegan vacíos", () => {
    const errors = validateCompleteProfileData({
      firstName: "",
      lastName: "",
      docType: "DNI",
      docNumber: "",
      birthDate: "",
      phone: "",
      coverageType: "PARTICULAR",
    });
    assert.deepEqual(Object.keys(errors).sort(), [
      "birthDate",
      "docNumber",
      "firstName",
      "lastName",
      "phone",
    ]);
  });

  it("OBRA_SOCIAL exige entidad, plan y número de afiliado", () => {
    const errors = validateCompleteProfileData({
      ...validCompleteProfile,
      healthInsuranceEntity: "",
      healthInsurancePlan: "",
      healthInsuranceNumber: "",
    });
    assert.deepEqual(Object.keys(errors).sort(), [
      "healthInsuranceEntity",
      "healthInsuranceNumber",
      "healthInsurancePlan",
    ]);
  });

  it("PARTICULAR ignora los campos de cobertura", () => {
    const errors = validateCompleteProfileData({
      ...validCompleteProfile,
      coverageType: "PARTICULAR",
      healthInsuranceEntity: "",
      healthInsurancePlan: "",
      healthInsuranceNumber: "",
    });
    assert.deepEqual(errors, {});
  });

  it("rechaza tipos de cobertura desconocidos", () => {
    const errors = validateCompleteProfileData({ ...validCompleteProfile, coverageType: "otra" });
    assert.equal(errors.coverageType, "Seleccioná un tipo de cobertura válido.");
  });
});

const validUpdateProfile = {
  phone: "11 5555-5555",
  email: "maria@correo.com",
  address: "Av. San Martín 1234",
  alternativeContact: "",
  coverageType: "PARTICULAR",
};

describe("validateProfileUpdateData", () => {
  it("acepta una actualización válida sin campos one-shot", () => {
    assert.deepEqual(validateProfileUpdateData(validUpdateProfile), {});
  });

  it("detecta formato inválido de email y teléfono", () => {
    const errors = validateProfileUpdateData({
      ...validUpdateProfile,
      email: "no-es-un-email",
      phone: "12ab",
    });
    assert.equal(errors.email, "Ingresá un correo electrónico válido.");
    assert.equal(errors.phone, "Solo dígitos, espacios, guiones y paréntesis.");
  });

  it("one-shot: valida documento y fecha solo si vienen provistos", () => {
    assert.deepEqual(
      validateProfileUpdateData({ ...validUpdateProfile, docNumber: "", birthDate: "" }),
      {}
    );
    const errors = validateProfileUpdateData({
      ...validUpdateProfile,
      docType: "PASAPORTE",
      docNumber: "a".repeat(21),
      birthDate: "2026-02-30",
    });
    assert.equal(errors.docNumber, `Máximo ${MAX_LENGTHS.docNumber} caracteres.`);
    assert.equal(errors.birthDate, "Ingresá una fecha de nacimiento válida.");
  });

  it("OBRA_SOCIAL exige los campos de cobertura", () => {
    const errors = validateProfileUpdateData({
      ...validUpdateProfile,
      coverageType: "OBRA_SOCIAL",
      healthInsuranceEntity: "",
      healthInsurancePlan: "",
      healthInsuranceNumber: "",
    });
    assert.deepEqual(Object.keys(errors).sort(), [
      "healthInsuranceEntity",
      "healthInsuranceNumber",
      "healthInsurancePlan",
    ]);
  });
});
