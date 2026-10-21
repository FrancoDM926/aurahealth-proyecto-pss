import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  efectosEstadoTurno,
  ESTADOS_REGISTRO_ASISTENCIA,
  ESTADOS_TURNO_US18,
  formatearAutorCambioEstado,
  formatearFechaHoraAuditoriaAr,
  puedeModificarEstadoEnFecha,
  resolverNombrePacienteTurno,
  validarCambioEstadoTurno,
} from "@/lib/estado-turno";

describe("US-18 — Criterio 1: Estados posibles del turno", () => {
  it("reconoce los cuatro estados del ciclo de reserva: reservado, cumplido, ausente y cancelado", () => {
    assert.deepEqual(ESTADOS_TURNO_US18, [
      "RESERVADO",
      "CUMPLIDO",
      "AUSENTE",
      "CANCELADO",
    ]);
    assert.deepEqual(ESTADOS_REGISTRO_ASISTENCIA, [
      "CUMPLIDO",
      "AUSENTE",
      "CANCELADO",
    ]);
  });

  it("permite pasar un turno RESERVADO a CUMPLIDO, AUSENTE o CANCELADO", () => {
    for (const destino of ["CUMPLIDO", "AUSENTE", "CANCELADO"] as const) {
      const res = validarCambioEstadoTurno({
        turno: {
          id: "t-1",
          doctorId: "doc-1",
          date: "2026-10-01",
          status: "RESERVADO",
        },
        nuevoEstado: destino,
        actor: { id: "doc-1", role: "MEDICO" },
        hoyArgentina: "2026-10-01",
      });
      assert.deepEqual(res, { valid: true, nuevoEstado: destino });
    }
  });

  it("rechaza registrar asistencia sobre un turno DISPONIBLE o ya cerrado", () => {
    const disponible = validarCambioEstadoTurno({
      turno: {
        id: "t-1",
        doctorId: "doc-1",
        date: "2026-10-01",
        status: "DISPONIBLE",
      },
      nuevoEstado: "CUMPLIDO",
      actor: { id: "doc-1", role: "MEDICO" },
      hoyArgentina: "2026-10-01",
    });
    assert.equal(disponible.valid, false);

    const yaCumplido = validarCambioEstadoTurno({
      turno: {
        id: "t-1",
        doctorId: "doc-1",
        date: "2026-10-01",
        status: "CUMPLIDO",
      },
      nuevoEstado: "AUSENTE",
      actor: { id: "doc-1", role: "MEDICO" },
      hoyArgentina: "2026-10-01",
    });
    assert.equal(yaCumplido.valid, false);
  });
});

describe("US-18 — Criterio 2: Modificación solo el día del turno o posteriormente (RF-AGE-09)", () => {
  it("permite modificar el estado el mismo día del turno o en días posteriores", () => {
    assert.equal(puedeModificarEstadoEnFecha("2026-10-01", "2026-10-01"), true);
    assert.equal(puedeModificarEstadoEnFecha("2026-10-01", "2026-10-05"), true);
  });

  it("bloquea la modificación de estado si la fecha del turno es futura", () => {
    assert.equal(puedeModificarEstadoEnFecha("2026-10-02", "2026-10-01"), false);

    const res = validarCambioEstadoTurno({
      turno: {
        id: "t-futuro",
        doctorId: "doc-1",
        date: "2026-10-20",
        status: "RESERVADO",
      },
      nuevoEstado: "CUMPLIDO",
      actor: { id: "doc-1", role: "MEDICO" },
      hoyArgentina: "2026-10-19",
    });
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.error, /día del turno o posteriormente/i);
    }
  });

  it("el cambio de estado no constituye una modificación de la reserva (RF-AGE-09)", () => {
    for (const st of ["RESERVADO", "CUMPLIDO", "AUSENTE", "CANCELADO"] as const) {
      assert.equal(efectosEstadoTurno(st).modificaReservaOriginal, false);
    }
  });
});

describe("US-18 — Criterio 3: Habilitación de ficha de diagnóstico y registro de pago", () => {
  it("únicamente el estado CUMPLIDO habilita la ficha de diagnóstico (US-39) y el pago (US-35)", () => {
    assert.deepEqual(efectosEstadoTurno("CUMPLIDO"), {
      habilitaFichaDiagnostico: true,
      habilitaRegistroPago: true,
      modificaReservaOriginal: false,
    });

    for (const otro of ["DISPONIBLE", "RESERVADO", "AUSENTE", "CANCELADO"] as const) {
      assert.deepEqual(efectosEstadoTurno(otro), {
        habilitaFichaDiagnostico: false,
        habilitaRegistroPago: false,
        modificaReservaOriginal: false,
      });
    }
  });
});

describe("US-18 — Criterio 4 y RNF-03: Constancia de autor, fecha/hora y control de acceso", () => {
  it("formatea el autor y la fecha/hora de auditoría como en el wireframe", () => {
    assert.equal(
      formatearAutorCambioEstado({
        firstName: "Carlos",
        lastName: "Méndez",
        role: "MEDICO",
      }),
      "Dr. Carlos Méndez"
    );

    assert.equal(
      formatearAutorCambioEstado({
        firstName: "Ana",
        lastName: "López",
        role: "ADMINISTRATIVO",
      }),
      "Ana López (Administrativo)"
    );

    // 2026-10-01 12:05 UTC = 01/10/2026 09:05 en Argentina (UTC-3)
    const fechaHora = formatearFechaHoraAuditoriaAr(new Date("2026-10-01T12:05:00.000Z"));
    assert.equal(fechaHora, "01/10/2026 09:05");
  });

  it("permite a MEDICO propio y a ADMINISTRATIVO, pero rechaza otros roles o médico ajeno", () => {
    const porAdmin = validarCambioEstadoTurno({
      turno: {
        id: "t-1",
        doctorId: "doc-1",
        date: "2026-10-01",
        status: "RESERVADO",
      },
      nuevoEstado: "AUSENTE",
      actor: { id: "adm-1", role: "ADMINISTRATIVO" },
      hoyArgentina: "2026-10-01",
    });
    assert.equal(porAdmin.valid, true);

    const porMedicoAjeno = validarCambioEstadoTurno({
      turno: {
        id: "t-1",
        doctorId: "doc-1",
        date: "2026-10-01",
        status: "RESERVADO",
      },
      nuevoEstado: "CUMPLIDO",
      actor: { id: "doc-otro", role: "MEDICO" },
      hoyArgentina: "2026-10-01",
    });
    assert.equal(porMedicoAjeno.valid, false);

    for (const rolNoAutorizado of ["USUARIO", "ENFERMERA", "ADMINISTRADOR"] as const) {
      const res = validarCambioEstadoTurno({
        turno: {
          id: "t-1",
          doctorId: "doc-1",
          date: "2026-10-01",
          status: "RESERVADO",
        },
        nuevoEstado: "CUMPLIDO",
        actor: { id: "u-1", role: rolNoAutorizado },
        hoyArgentina: "2026-10-01",
      });
      assert.equal(res.valid, false);
    }
  });

  it("resuelve el nombre del paciente atendido o del titular que reservó", () => {
    assert.equal(resolverNombrePacienteTurno({ status: "DISPONIBLE" }), "—");
    assert.equal(
      resolverNombrePacienteTurno({
        status: "RESERVADO",
        patientFirstName: "Joaquín",
        patientLastName: "García",
        reservedBy: { firstName: "María", lastName: "García" },
      }),
      "Joaquín García"
    );
    assert.equal(
      resolverNombrePacienteTurno({
        status: "RESERVADO",
        reservedBy: { firstName: "María", lastName: "García" },
      }),
      "María García"
    );
  });
});
