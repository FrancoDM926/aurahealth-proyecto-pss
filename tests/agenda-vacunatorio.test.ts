import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_SOLAPAMIENTO,
  calcularCambiosAgenda,
  cantidadTurnosDeFranja,
  franjasSolapadas,
  mensajeBloqueoPorReservas,
  validarAgendaMes,
  validarFranjaSimple,
  type FranjaGuardada,
  type TurnoVacunatorioExistente,
} from "../src/lib/agenda-vacunatorio";

// "Hoy" fijo: 2026-11-10 12:00 (Argentina, UTC-3).
const AHORA = new Date("2026-11-10T15:00:00Z");

const f = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });

describe("validarFranjaSimple (US-63)", () => {
  it("acepta una franja en grilla de 30 minutos", () => {
    assert.equal(validarFranjaSimple(f("2026-11-24", "14:00", "18:00")), null);
  });
  it("rechaza fin <= inicio, horarios fuera de grilla y formatos inválidos", () => {
    assert.match(validarFranjaSimple(f("2026-11-24", "18:00", "14:00"))!, /posterior/);
    assert.match(validarFranjaSimple(f("2026-11-24", "14:00", "14:00"))!, /posterior/);
    assert.match(validarFranjaSimple(f("2026-11-24", "14:10", "15:00"))!, /30 en 30/);
    assert.ok(validarFranjaSimple(f("2026-11-24", "xx", "15:00")));
    assert.ok(validarFranjaSimple(f("24/11/2026", "14:00", "15:00")));
  });
});

describe("franjasSolapadas / validarAgendaMes (US-63)", () => {
  it("tocarse en el borde no es solapar; pisarse sí; otro día no", () => {
    assert.equal(franjasSolapadas(f("2026-11-24", "08:00", "12:00"), f("2026-11-24", "12:00", "14:00")), false);
    assert.equal(franjasSolapadas(f("2026-11-24", "08:00", "12:00"), f("2026-11-24", "11:30", "14:00")), true);
    assert.equal(franjasSolapadas(f("2026-11-24", "08:00", "12:00"), f("2026-11-25", "08:00", "12:00")), false);
  });

  it("permite varias franjas el mismo día y no aplica límite semanal", () => {
    const franjas = [
      f("2026-11-24", "08:00", "12:00"),
      f("2026-11-24", "14:00", "18:00"),
      ...["25", "26", "27", "28", "29", "30"].map((d) => f(`2026-11-${d}`, "08:00", "12:00")),
    ];
    assert.deepEqual(validarAgendaMes(franjas, 2026, 11, [], AHORA), {});
  });

  it("marca la segunda franja solapada del mismo día", () => {
    const errores = validarAgendaMes(
      [f("2026-11-24", "08:00", "12:00"), f("2026-11-24", "11:00", "13:00")],
      2026,
      11,
      [],
      AHORA
    );
    assert.deepEqual(errores, { 1: ERROR_SOLAPAMIENTO });
  });

  it("rechaza fechas pasadas y fuera del mes, pero acepta pasadas ya guardadas sin cambios", () => {
    const pasada = f("2026-11-03", "08:00", "12:00");
    const errores = validarAgendaMes([pasada, f("2026-12-01", "08:00", "12:00")], 2026, 11, [], AHORA);
    assert.match(errores[0], /ya pasó/);
    assert.match(errores[1], /no pertenece al mes/);
    assert.deepEqual(validarAgendaMes([pasada], 2026, 11, [pasada], AHORA), {});
  });

  it("hoy no admite una franja que arranca en un horario que ya pasó", () => {
    const errores = validarAgendaMes([f("2026-11-10", "08:00", "12:00")], 2026, 11, [], AHORA);
    assert.match(errores[0], /ya pasó/);
    assert.deepEqual(validarAgendaMes([f("2026-11-10", "14:00", "16:00")], 2026, 11, [], AHORA), {});
  });
});

describe("cantidadTurnosDeFranja", () => {
  it("genera turnos de 30 minutos y descarta el sobrante", () => {
    assert.equal(cantidadTurnosDeFranja(f("2026-11-24", "08:00", "12:00")), 8);
    assert.equal(cantidadTurnosDeFranja({ startTime: "08:00", endTime: "08:30" }), 1);
  });
});

describe("calcularCambiosAgenda (US-63)", () => {
  const guardada: FranjaGuardada = { id: "j1", ...f("2026-11-24", "14:00", "16:00") };
  const turno = (startTime: string, endTime: string, status = "DISPONIBLE"): TurnoVacunatorioExistente => ({
    id: `t-${startTime}`,
    date: "2026-11-24",
    startTime,
    endTime,
    status,
  });
  const turnos = [turno("14:00", "14:30"), turno("14:30", "15:00"), turno("15:00", "15:30"), turno("15:30", "16:00")];

  it("genera los turnos de cada franja nueva y no duplica los existentes (idempotente)", () => {
    const nuevo = calcularCambiosAgenda([f("2026-11-25", "08:00", "10:00")], [], [], AHORA);
    assert.equal(nuevo.turnosACrear.length, 4);
    assert.deepEqual(nuevo.turnosACrear.map((t) => t.startTime), ["08:00", "08:30", "09:00", "09:30"]);

    const igual = calcularCambiosAgenda([guardada], [guardada], turnos, AHORA);
    assert.equal(igual.turnosACrear.length, 0);
    assert.equal(igual.franjasACrear.length, 0);
    assert.equal(igual.franjasAQuitar.length, 0);
    assert.equal(igual.turnosAQuitar.length, 0);
    assert.equal(igual.preservados, 4);
  });

  it("quitar una franja sin reservas elimina sus turnos libres", () => {
    const c = calcularCambiosAgenda([], [guardada], turnos, AHORA);
    assert.equal(c.franjasAQuitar.length, 1);
    assert.equal(c.turnosAQuitar.length, 4);
    assert.equal(c.bloqueadosPorReserva.length, 0);
  });

  it("quitar una franja con turnos reservados queda bloqueado y se lista", () => {
    const conReserva = [turno("14:00", "14:30", "RESERVADO"), ...turnos.slice(1)];
    const c = calcularCambiosAgenda([], [guardada], conReserva, AHORA);
    assert.equal(c.bloqueadosPorReserva.length, 1);
    assert.equal(c.turnosAQuitar.length, 3);
    assert.match(mensajeBloqueoPorReservas(c.bloqueadosPorReserva), /24\/11\/2026 14:00/);
  });

  it("acortar una franja conserva los turnos reservados que siguen dentro", () => {
    const conReserva = [turno("14:00", "14:30", "RESERVADO"), ...turnos.slice(1)];
    const c = calcularCambiosAgenda([f("2026-11-24", "14:00", "15:00")], [guardada], conReserva, AHORA);
    assert.equal(c.bloqueadosPorReserva.length, 0);
    assert.deepEqual(c.turnosAQuitar.map((t) => t.startTime), ["15:00", "15:30"]);
    assert.equal(c.franjasAQuitar.length, 1);
    assert.equal(c.franjasACrear.length, 1);
  });

  it("no crea ni toca turnos de horarios que ya pasaron", () => {
    const c = calcularCambiosAgenda([f("2026-11-10", "08:00", "16:00")], [], [], AHORA);
    assert.ok(c.turnosACrear.every((t) => t.startTime > "12:00"));
  });
});
