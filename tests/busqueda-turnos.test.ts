import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agruparTurnosPorDia,
  ahoraEnArgentina,
  DIAS_RANGO_DEFECTO,
  esTurnoFuturo,
  filtrarYOrdenarTurnosDisponibles,
  MENSAJE_SIN_RESULTADOS,
  normalizarFiltrosBusqueda,
  rangoFechasPorDefecto,
  type InstanteArgentina,
  type TurnoCandidatoBusqueda,
} from "@/lib/busqueda-turnos";

const AHORA_FIJO: InstanteArgentina = {
  fecha: "2026-10-05",
  hora: "10:00",
};

const TURNOS_BASE: TurnoCandidatoBusqueda[] = [
  {
    id: "t-1",
    date: "2026-10-05",
    startTime: "11:00",
    endTime: "11:30",
    status: "DISPONIBLE",
    doctorId: "doc-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "TRAUMATOLOGIA",
    agendaConfirmada: true,
  },
  {
    id: "t-2",
    date: "2026-10-05",
    startTime: "10:30",
    endTime: "11:00",
    status: "DISPONIBLE",
    doctorId: "doc-fernandez",
    doctorName: "Dra. Laura Fernández",
    specialty: "CLINICA_MEDICA",
    agendaConfirmada: true,
  },
  {
    id: "t-3",
    date: "2026-10-06",
    startTime: "09:00",
    endTime: "09:30",
    status: "DISPONIBLE",
    doctorId: "doc-robles",
    doctorName: "Dra. M. Robles",
    specialty: "PEDIATRIA",
    agendaConfirmada: true,
  },
  {
    id: "t-4",
    date: "2026-10-06",
    startTime: "08:00",
    endTime: "08:30",
    status: "DISPONIBLE",
    doctorId: "doc-mendez",
    doctorName: "Dr. Carlos Méndez",
    specialty: "TRAUMATOLOGIA",
    agendaConfirmada: true,
  },
];

describe("US-10 — Criterio 1: Apertura automática tras confirmación de disponibilidad", () => {
  it("antes de la confirmación, ningún turno de ese mes es visible; al confirmarse queda visible sin intervención manual", () => {
    const turnosSinConfirmar: TurnoCandidatoBusqueda[] = TURNOS_BASE.map((t) => ({
      ...t,
      agendaConfirmada: false,
    }));

    const antes = filtrarYOrdenarTurnosDisponibles(
      turnosSinConfirmar,
      { desde: "2026-10-01", hasta: "2026-10-31" },
      AHORA_FIJO
    );
    assert.equal(antes.length, 0);

    const turnosConfirmados = turnosSinConfirmar.map((t) => ({
      ...t,
      agendaConfirmada: true,
    }));

    const despues = filtrarYOrdenarTurnosDisponibles(
      turnosConfirmados,
      { desde: "2026-10-01", hasta: "2026-10-31" },
      AHORA_FIJO
    );
    assert.equal(despues.length, 4);
  });

  it("no muestra turnos de profesionales dados de baja", () => {
    const turnos: TurnoCandidatoBusqueda[] = [
      { ...TURNOS_BASE[0], doctorActivo: false },
      { ...TURNOS_BASE[1], doctorActivo: true },
    ];
    const resultado = filtrarYOrdenarTurnosDisponibles(
      turnos,
      { desde: "2026-10-01", hasta: "2026-10-31" },
      AHORA_FIJO
    );
    assert.deepEqual(resultado.map((t) => t.id), ["t-2"]);
  });
});

describe("US-10 — Criterio 2: Únicamente turnos futuros y disponibles", () => {
  it("excluye turnos reservados, cumplidos, ausentes o cancelados", () => {
    const turnos: TurnoCandidatoBusqueda[] = [
      { ...TURNOS_BASE[0], id: "disp", status: "DISPONIBLE" },
      { ...TURNOS_BASE[0], id: "res", status: "RESERVADO" },
      { ...TURNOS_BASE[0], id: "cump", status: "CUMPLIDO" },
      { ...TURNOS_BASE[0], id: "aus", status: "AUSENTE" },
      { ...TURNOS_BASE[0], id: "canc", status: "CANCELADO" },
    ];

    const resultado = filtrarYOrdenarTurnosDisponibles(
      turnos,
      { desde: "2026-10-01", hasta: "2026-10-31" },
      AHORA_FIJO
    );
    assert.deepEqual(resultado.map((t) => t.id), ["disp"]);
  });

  it("excluye turnos de días pasados y horarios ya transcurridos en el día actual", () => {
    assert.equal(esTurnoFuturo({ date: "2026-10-04", startTime: "18:00" }, AHORA_FIJO), false);
    assert.equal(esTurnoFuturo({ date: "2026-10-05", startTime: "09:30" }, AHORA_FIJO), false);
    assert.equal(esTurnoFuturo({ date: "2026-10-05", startTime: "10:00" }, AHORA_FIJO), false);
    assert.equal(esTurnoFuturo({ date: "2026-10-05", startTime: "10:30" }, AHORA_FIJO), true);
    assert.equal(esTurnoFuturo({ date: "2026-10-06", startTime: "08:00" }, AHORA_FIJO), true);
  });

  it("calcula la fecha y hora actual en el huso horario de Argentina", () => {
    // 2026-10-06 01:30 UTC son las 22:30 del 2026-10-05 en Argentina (UTC-3)
    const instante = ahoraEnArgentina(new Date("2026-10-06T01:30:00.000Z"));
    assert.equal(instante.fecha, "2026-10-05");
    assert.equal(instante.hora, "22:30");
  });
});

describe("US-10 — Criterio 3: Filtro por especialidad, por profesional o por ambos", () => {
  it("filtra únicamente por especialidad", () => {
    const res = filtrarYOrdenarTurnosDisponibles(
      TURNOS_BASE,
      { specialty: "TRAUMATOLOGIA", desde: "2026-10-05", hasta: "2026-11-04" },
      AHORA_FIJO
    );
    assert.deepEqual(res.map((t) => t.id), ["t-1", "t-4"]);
  });

  it("filtra únicamente por profesional", () => {
    const res = filtrarYOrdenarTurnosDisponibles(
      TURNOS_BASE,
      { doctorId: "doc-robles", desde: "2026-10-05", hasta: "2026-11-04" },
      AHORA_FIJO
    );
    assert.deepEqual(res.map((t) => t.id), ["t-3"]);
  });

  it("filtra por especialidad y profesional simultáneamente", () => {
    const coincidente = filtrarYOrdenarTurnosDisponibles(
      TURNOS_BASE,
      {
        specialty: "TRAUMATOLOGIA",
        doctorId: "doc-mendez",
        desde: "2026-10-05",
        hasta: "2026-11-04",
      },
      AHORA_FIJO
    );
    assert.deepEqual(coincidente.map((t) => t.id), ["t-1", "t-4"]);

    const disjunto = filtrarYOrdenarTurnosDisponibles(
      TURNOS_BASE,
      {
        specialty: "PEDIATRIA",
        doctorId: "doc-mendez",
        desde: "2026-10-05",
        hasta: "2026-11-04",
      },
      AHORA_FIJO
    );
    assert.equal(disjunto.length, 0);
  });
});

describe("US-10 — Criterio 4: Rango de fechas por defecto de 30 días", () => {
  it("el rango por defecto abarca los próximos 30 días desde hoy (como en el wireframe)", () => {
    assert.equal(DIAS_RANGO_DEFECTO, 30);
    const rango = rangoFechasPorDefecto("2026-10-05");
    assert.deepEqual(rango, { desde: "2026-10-05", hasta: "2026-11-04" });
  });

  it("normalizarFiltrosBusqueda aplica los próximos 30 días cuando no se indican fechas", () => {
    const norm = normalizarFiltrosBusqueda({}, "2026-10-05");
    assert.equal(norm.desde, "2026-10-05");
    assert.equal(norm.hasta, "2026-11-04");
    assert.equal(norm.esRangoPorDefecto, true);
    assert.equal(norm.error, null);
  });

  it("rechaza rangos donde la fecha desde es posterior a la fecha hasta", () => {
    const norm = normalizarFiltrosBusqueda(
      { desde: "2026-11-10", hasta: "2026-10-10" },
      "2026-10-05"
    );
    assert.ok(norm.error);
  });
});

describe("US-10 — Criterio 5: Agrupación por día, orden cronológico y datos visibles", () => {
  it("ordena cronológicamente y agrupa por día exponiendo especialidad, profesional, fecha y hora", () => {
    const turnos = filtrarYOrdenarTurnosDisponibles(
      TURNOS_BASE,
      { desde: "2026-10-05", hasta: "2026-11-04" },
      AHORA_FIJO
    );

    // Día 05/10: primero 10:30 (t-2) y luego 11:00 (t-1)
    // Día 06/10: primero 08:00 (t-4) y luego 09:00 (t-3)
    assert.deepEqual(turnos.map((t) => t.id), ["t-2", "t-1", "t-4", "t-3"]);

    const grupos = agruparTurnosPorDia(turnos);
    assert.equal(grupos.length, 2);
    assert.equal(grupos[0].date, "2026-10-05");
    assert.equal(grupos[0].etiquetaCorta, "Lun 05/10");
    assert.equal(grupos[0].etiquetaLarga, "Lunes 05/10/2026");
    assert.deepEqual(grupos[0].turnos.map((t) => t.id), ["t-2", "t-1"]);

    assert.equal(grupos[1].date, "2026-10-06");
    assert.deepEqual(grupos[1].turnos.map((t) => t.id), ["t-4", "t-3"]);

    // Cada turno expone especialidad, profesional, fecha y hora
    const primero = grupos[0].turnos[0];
    assert.equal(primero.doctorName, "Dra. Laura Fernández");
    assert.equal(primero.specialtyLabel, "Clínica médica");
    assert.equal(primero.fechaFormateada, "05/10/2026");
    assert.equal(primero.startTime, "10:30");
    assert.equal(primero.endTime, "11:00");
  });
});

describe("US-10 — Criterio 6 y 7: Mensaje claro sin resultados y tiempo de respuesta < 3 s", () => {
  it("provee un mensaje claro sugiriendo ampliar el rango cuando no hay coincidencias", () => {
    assert.match(MENSAJE_SIN_RESULTADOS, /ampliar el rango de fechas/i);
  });

  it("procesa y agrupa miles de turnos en mucho menos de 3 segundos (RNF-07)", () => {
    const lote: TurnoCandidatoBusqueda[] = [];
    for (let i = 0; i < 2000; i++) {
      const dia = String((Math.floor(i / 2) % 28) + 1).padStart(2, "0");
      const hora = String(8 + (i % 10)).padStart(2, "0");
      lote.push({
        id: `perf-${i}`,
        date: `2026-11-${dia}`,
        startTime: `${hora}:00`,
        endTime: `${hora}:30`,
        status: "DISPONIBLE",
        doctorId: `doc-${i % 5}`,
        doctorName: `Dr. Profesional ${i % 5}`,
        specialty: i % 2 === 0 ? "CLINICA_MEDICA" : "TRAUMATOLOGIA",
        agendaConfirmada: true,
      });
    }

    const inicio = performance.now();
    const filtrados = filtrarYOrdenarTurnosDisponibles(
      lote,
      { specialty: "CLINICA_MEDICA", desde: "2026-11-01", hasta: "2026-11-30" },
      AHORA_FIJO
    );
    const grupos = agruparTurnosPorDia(filtrados);
    const duracionMs = performance.now() - inicio;

    assert.equal(filtrados.length, 1000);
    assert.equal(grupos.length, 28);
    assert.ok(
      duracionMs < 3000,
      `La búsqueda tardó ${duracionMs.toFixed(1)} ms, superando el límite de 3000 ms (RNF-07)`
    );
  });
});
