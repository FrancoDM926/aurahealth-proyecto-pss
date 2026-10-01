import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseClerkRole, formatUserRole, ALL_ROLES, INTERNAL_ROLES } from "../src/lib/roles";
import { parseMedicalSpecialty } from "../src/lib/specialty";

/**
 * `parseClerkRole` es la puerta de seguridad de la autorización: si devuelve
 * `null`, el acceso se deniega. Estos casos cubren el deny-by-default.
 */
describe("parseClerkRole (deny-by-default)", () => {
  it("acepta cada rol válido del enum", () => {
    for (const role of ALL_ROLES) {
      assert.equal(parseClerkRole(role), role);
    }
  });

  it("rechaza metadata ausente", () => {
    assert.equal(parseClerkRole(undefined), null);
    assert.equal(parseClerkRole(null), null);
  });

  it("rechaza valores ajenos al enum, incluso privilege-escalation typos", () => {
    for (const bogus of [
      "SUPERADMIN",
      "ADMIN",
      "admin",
      "Administrador",
      "ADMINISTRADOR ",
      " ADMINISTRADOR",
      "USUARIOS",
      "ROOT",
      "OWNER",
    ]) {
      assert.equal(parseClerkRole(bogus), null, `debía rechazar ${JSON.stringify(bogus)}`);
    }
  });

  it("rechaza tipos no string", () => {
    for (const value of [1, true, false, [], {}, ["ADMINISTRADOR"], { role: "ADMINISTRADOR" }]) {
      assert.equal(parseClerkRole(value), null);
    }
  });

  it("es case-sensitive: no acepta el rol en minúsculas", () => {
    assert.equal(parseClerkRole("medico"), null);
    assert.equal(parseClerkRole("Medico"), null);
  });
});

describe("conjuntos de roles", () => {
  it("USUARIO nunca es un rol interno", () => {
    assert.equal(INTERNAL_ROLES.includes("USUARIO" as never), false);
  });

  it("ADMINISTRADOR sí es un rol interno", () => {
    assert.equal(INTERNAL_ROLES.includes("ADMINISTRADOR"), true);
  });
});

describe("formatUserRole", () => {
  it("etiqueta los roles sin especialidad", () => {
    assert.equal(formatUserRole("USUARIO"), "Usuario");
    assert.equal(formatUserRole("ADMINISTRADOR"), "Administrador");
    assert.equal(formatUserRole("ENFERMERA"), "Enfermería");
  });

  it("agrega la especialidad del médico", () => {
    assert.equal(formatUserRole("MEDICO", "PEDIATRIA"), "Médico · Pediatría");
  });

  it("cae al specialty crudo si el enum no reconoce el valor", () => {
    assert.equal(formatUserRole("MEDICO", null, "Clínica médica"), "Médico · Clínica médica");
  });
});

describe("parseMedicalSpecialty", () => {
  it("normaliza la etiqueta legacy en español", () => {
    assert.equal(parseMedicalSpecialty("Clínica médica"), "CLINICA_MEDICA");
    assert.equal(parseMedicalSpecialty("Pediatría"), "PEDIATRIA");
    assert.equal(parseMedicalSpecialty("Traumatología"), "TRAUMATOLOGIA");
  });

  it("deja pasar los valores del enum", () => {
    assert.equal(parseMedicalSpecialty("PEDIATRIA"), "PEDIATRIA");
  });

  it("devuelve null para valores irreconocibles", () => {
    assert.equal(parseMedicalSpecialty("Dermatología"), null);
    assert.equal(parseMedicalSpecialty(""), null);
  });
});
