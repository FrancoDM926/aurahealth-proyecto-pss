import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANTELACION_CANCELACION_DEFAULT_HORAS,
  estaEnPlazoDeCancelacion,
  normalizarDocumento,
  ordenarMisTurnos,
  validarAntelacionCancelacion,
  validarMotivoConsulta,
  validarPersonaAtendida,
  type MiTurno,
  type PersonaAtendidaInput,
} from "@/lib/reservas";
import {
  buildCancelacionTurnoParams,
  emailDeLaSala,
} from "@/services/notificaciones/turno-cancelacion";

/** Turno del 20/10/2026 a las 10:30 hora de la sala (13:30 UTC). */
const TURNO = { date: new Date(Date.UTC(2026, 9, 20)), startTime: "10:30" };

describe("US-16 · plazo mínimo de cancelación", () => {
  it("el valor inicial son 24 horas", () => {
    assert.equal(ANTELACION_CANCELACION_DEFAULT_HORAS, 24);
  });

  it("permite cancelar con 24 horas o más de anticipación", () => {
    assert.ok(estaEnPlazoDeCancelacion(TURNO, new Date("2026-10-19T13:30:00Z"), 24));
    assert.ok(estaEnPlazoDeCancelacion(TURNO, new Date("2026-10-18T10:00:00Z"), 24));
  });

  it("rechaza la cancelación con menos de 24 horas", () => {
    assert.ok(!estaEnPlazoDeCancelacion(TURNO, new Date("2026-10-19T13:31:00Z"), 24));
    assert.ok(!estaEnPlazoDeCancelacion(TURNO, new Date("2026-10-20T12:00:00Z"), 24));
  });

  it("respeta la antelación configurada", () => {
    const ahora = new Date("2026-10-20T08:00:00Z"); // faltan 5,5 h
    assert.ok(estaEnPlazoDeCancelacion(TURNO, ahora, 2));
    assert.ok(!estaEnPlazoDeCancelacion(TURNO, ahora, 6));
  });

  it("valida la antelación configurable", () => {
    assert.equal(validarAntelacionCancelacion(24), null);
    assert.equal(validarAntelacionCancelacion(1), null);
    assert.equal(validarAntelacionCancelacion(168), null);
    assert.ok(validarAntelacionCancelacion(0));
    assert.ok(validarAntelacionCancelacion(169));
    assert.ok(validarAntelacionCancelacion(2.5));
  });
});

describe("US-13 · motivo de la consulta", () => {
  it("es opcional y tiene un largo máximo", () => {
    assert.equal(validarMotivoConsulta(""), null);
    assert.equal(validarMotivoConsulta("control"), null);
    assert.ok(validarMotivoConsulta("x".repeat(301)));
  });
});

describe("US-64 · datos de la persona atendida", () => {
  const HOY = new Date(Date.UTC(2026, 9, 21));
  const valida: PersonaAtendidaInput = {
    firstName: "Joaquín",
    lastName: "García",
    docNumber: "55.123.456",
    birthDate: "2015-03-14",
    healthInsuranceEntity: "OSDE",
    healthInsurancePlan: "310",
    healthInsuranceNumber: "12345678",
  };

  it("acepta una persona con todos los datos", () => {
    assert.deepEqual(validarPersonaAtendida(valida, HOY), {});
  });

  it("exige todos los campos del formulario", () => {
    const errors = validarPersonaAtendida(
      {
        firstName: "",
        lastName: "",
        docNumber: "",
        birthDate: "",
        healthInsuranceEntity: "",
        healthInsurancePlan: "",
        healthInsuranceNumber: "",
      },
      HOY
    );
    assert.deepEqual(Object.keys(errors).sort(), [
      "birthDate",
      "docNumber",
      "firstName",
      "healthInsuranceEntity",
      "healthInsuranceNumber",
      "healthInsurancePlan",
      "lastName",
    ]);
  });

  it("rechaza una fecha de nacimiento futura y una entidad fuera del listado", () => {
    const errors = validarPersonaAtendida(
      { ...valida, birthDate: "2027-01-01", healthInsuranceEntity: "Otra" },
      HOY
    );
    assert.ok(errors.birthDate);
    assert.ok(errors.healthInsuranceEntity);
  });

  it("normaliza el documento para no duplicar personas", () => {
    assert.equal(normalizarDocumento("55.123.456"), "55123456");
    assert.equal(normalizarDocumento(" 55 123-456 "), "55123456");
  });
});

describe("US-16 · listado «Mis turnos»", () => {
  const fila = (id: string, fecha: string, estado: MiTurno["estado"]): MiTurno => ({
    id,
    fecha,
    startTime: "08:00",
    doctorNombre: "Dr. Carlos Méndez",
    aNombreDe: "María García",
    estado,
    cancelable: estado === "RESERVADO",
    fueraDePlazo: false,
  });

  it("muestra primero los reservados (más próximos) y después el historial", () => {
    const orden = ordenarMisTurnos([
      fila("c1", "2026-09-28", "CANCELADO"),
      fila("r2", "2026-10-02", "RESERVADO"),
      fila("c2", "2026-09-30", "CANCELADO"),
      fila("r1", "2026-10-01", "RESERVADO"),
    ]).map((t) => t.id);
    assert.deepEqual(orden, ["r1", "r2", "c2", "c1"]);
  });
});

describe("US-16 · aviso de cancelación por email", () => {
  it("se dirige al usuario que reservó, con los datos del turno", () => {
    const params = buildCancelacionTurnoParams({
      reservador: { nombre: "María García", email: "maria@example.com" },
      doctorNombre: "Dr. Carlos Méndez",
      especialidad: "Traumatología",
      fecha: new Date(Date.UTC(2026, 9, 1)),
      startTime: "08:00",
    });
    assert.deepEqual(params, {
      pacienteNombre: "María García",
      doctorNombre: "Dr. Carlos Méndez",
      especialidad: "Traumatología",
      fecha: "01/10/2026",
      hora: "08:00",
    });
  });

  it("toma la casilla de la sala del remitente configurado", () => {
    assert.equal(emailDeLaSala('"AuraHealth" <sala@aurahealth.com>'), "sala@aurahealth.com");
    assert.equal(emailDeLaSala("sala@aurahealth.com"), "sala@aurahealth.com");
    assert.equal(emailDeLaSala("AuraHealth"), null);
  });
});
