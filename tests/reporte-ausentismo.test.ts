import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  armarReporteAusentismo,
  diaDeLaSemanaAr,
  formatearPeriodo,
  formatearPorcentaje,
  normalizarFiltrosReporteAusentismo,
  reporteAusentismoACsv,
  reporteAusentismoAPdf,
  type TurnoReporteAusentismo,
} from "@/lib/reporte-ausentismo";

const turno = (t: Partial<TurnoReporteAusentismo>): TurnoReporteAusentismo => {
  const profesionalNombre = t.profesionalNombre ?? "Dr. Carlos Méndez";
  const pacienteNombre = t.pacienteNombre ?? "Juan Pérez";
  return {
    id: `t_${Math.random()}`,
    fecha: "2026-11-02", // Lunes
    diaSemana: "Lunes",
    tipoTurno: "Consulta médica",
    profesionalId: t.profesionalId ?? profesionalNombre,
    profesionalNombre,
    especialidad: "Traumatología",
    pacienteKey: t.pacienteKey ?? pacienteNombre,
    pacienteNombre,
    status: "CUMPLIDO",
    ...t,
  };
};

describe("US-48 — Reporte de asistencia y ausentismo", () => {
  it("calcula correctamente el día de la semana sin desviación horaria", () => {
    assert.equal(diaDeLaSemanaAr("2026-11-02"), "Lunes");
    assert.equal(diaDeLaSemanaAr("2026-11-03"), "Martes");
    assert.equal(diaDeLaSemanaAr("2026-11-04"), "Miércoles");
    assert.equal(diaDeLaSemanaAr("2026-11-05"), "Jueves");
    assert.equal(diaDeLaSemanaAr("2026-11-06"), "Viernes");
    assert.equal(diaDeLaSemanaAr("2026-11-07"), "Sábado");
    assert.equal(diaDeLaSemanaAr("2026-11-08"), "Domingo");
    assert.equal(formatearPeriodo("2026-11-01", "2026-11-15"), "01/11/2026 – 15/11/2026");
    assert.equal(formatearPorcentaje(12.34), "12,3 %");
  });

  it("normaliza filtros válidos y detecta errores de rango", () => {
    const ok = normalizarFiltrosReporteAusentismo(
      { desde: "2026-11-01", hasta: "2026-11-15", profesionalId: "p1" },
      "2026-11-08"
    );
    assert.equal(ok.error, null);
    assert.equal(ok.desde, "2026-11-01");
    assert.equal(ok.hasta, "2026-11-15");
    assert.equal(ok.profesionalId, "p1");

    const invertido = normalizarFiltrosReporteAusentismo(
      { desde: "2026-11-20", hasta: "2026-11-10" },
      "2026-11-08"
    );
    assert.ok(invertido.error?.includes("no puede ser posterior"));

    const defecto = normalizarFiltrosReporteAusentismo({}, "2026-11-08");
    assert.equal(defecto.desde, "2026-11-01");
    assert.equal(defecto.hasta, "2026-11-08");
    assert.equal(defecto.error, null);
  });

  it("Criterio 4: excluye del cálculo los turnos cancelados por la sala (CANCELADO) y los DISPONIBLE", () => {
    const datos: TurnoReporteAusentismo[] = [
      turno({ id: "1", status: "CUMPLIDO" }),
      turno({ id: "2", status: "AUSENTE" }),
      turno({ id: "3", status: "CANCELADO" }), // Cancelado por la sala: debe ignorarse
      turno({ id: "4", status: "DISPONIBLE" }), // No reservado: debe ignorarse
    ];

    const r = armarReporteAusentismo(datos);
    assert.equal(r.totalReservados, 2);
    assert.equal(r.totalAusentes, 1);
    assert.equal(r.porcentajeGeneralLabel, "50,0 %");
  });

  it("reproduce exactamente los totales y porcentajes del wireframe (96 reservados, 11 ausentes, 11,5 %)", () => {
    const datos: TurnoReporteAusentismo[] = [];

    // Carlos Méndez: 46 reservados, 6 ausentes (Traumatología, Consulta médica)
    for (let i = 0; i < 40; i++) {
      datos.push(
        turno({
          profesionalNombre: "Dr. Carlos Méndez",
          especialidad: "Traumatología",
          tipoTurno: "Consulta médica",
          status: "CUMPLIDO",
        })
      );
    }
    for (let i = 0; i < 6; i++) {
      datos.push(
        turno({
          profesionalNombre: "Dr. Carlos Méndez",
          especialidad: "Traumatología",
          tipoTurno: "Consulta médica",
          status: "AUSENTE",
        })
      );
    }

    // Laura Fernández: 34 reservados, 4 ausentes (Clínica Médica, Consulta médica)
    for (let i = 0; i < 30; i++) {
      datos.push(
        turno({
          profesionalNombre: "Dra. Laura Fernández",
          especialidad: "Clínica Médica",
          tipoTurno: "Consulta médica",
          status: "CUMPLIDO",
        })
      );
    }
    for (let i = 0; i < 4; i++) {
      datos.push(
        turno({
          profesionalNombre: "Dra. Laura Fernández",
          especialidad: "Clínica Médica",
          tipoTurno: "Consulta médica",
          status: "AUSENTE",
        })
      );
    }

    // Rosa Díaz: 16 reservados, 1 ausente (Vacunatorio, Vacunación)
    for (let i = 0; i < 15; i++) {
      datos.push(
        turno({
          profesionalNombre: "Enf. Rosa Díaz",
          especialidad: "Vacunatorio",
          tipoTurno: "Vacunación",
          status: "CUMPLIDO",
        })
      );
    }
    for (let i = 0; i < 1; i++) {
      datos.push(
        turno({
          profesionalNombre: "Enf. Rosa Díaz",
          especialidad: "Vacunatorio",
          tipoTurno: "Vacunación",
          status: "AUSENTE",
        })
      );
    }

    // Agregar turnos cancelados para asegurar que no alteren el 96 ni el 11
    datos.push(
      turno({ status: "CANCELADO" }),
      turno({ status: "CANCELADO" })
    );

    const r = armarReporteAusentismo(datos);
    assert.equal(r.totalReservados, 96);
    assert.equal(r.totalAusentes, 11);
    assert.equal(r.porcentajeGeneralLabel, "11,5 %");

    // Desglose profesional
    const mendez = r.porProfesional.find((p) => p.etiqueta === "Dr. Carlos Méndez");
    assert.ok(mendez);
    assert.equal(mendez.reservados, 46);
    assert.equal(mendez.ausentes, 6);
    assert.equal(mendez.porcentajeLabel, "13,0 %");

    const fernandez = r.porProfesional.find((p) => p.etiqueta === "Dra. Laura Fernández");
    assert.ok(fernandez);
    assert.equal(fernandez.reservados, 34);
    assert.equal(fernandez.ausentes, 4);
    assert.equal(fernandez.porcentajeLabel, "11,8 %");

    const diaz = r.porProfesional.find((p) => p.etiqueta === "Enf. Rosa Díaz");
    assert.ok(diaz);
    assert.equal(diaz.reservados, 16);
    assert.equal(diaz.ausentes, 1);
    assert.equal(diaz.porcentajeLabel, "6,3 %");

    // Desglose especialidad
    const trau = r.porEspecialidad.find((e) => e.etiqueta === "Traumatología");
    assert.equal(trau?.reservados, 46);
    assert.equal(trau?.porcentajeLabel, "13,0 %");

    const clin = r.porEspecialidad.find((e) => e.etiqueta === "Clínica Médica");
    assert.equal(clin?.reservados, 34);
    assert.equal(clin?.porcentajeLabel, "11,8 %");

    const vac = r.porEspecialidad.find((e) => e.etiqueta === "Vacunatorio");
    assert.equal(vac?.reservados, 16);
    assert.equal(vac?.porcentajeLabel, "6,3 %");

    // Desglose tipo de turno
    const consulta = r.porTipoTurno.find((t) => t.etiqueta === "Consulta médica");
    assert.equal(consulta?.reservados, 80);
    assert.equal(consulta?.ausentes, 10);
    assert.equal(consulta?.porcentajeLabel, "12,5 %");

    const vacunacion = r.porTipoTurno.find((t) => t.etiqueta === "Vacunación");
    assert.equal(vacunacion?.reservados, 16);
    assert.equal(vacunacion?.ausentes, 1);
    assert.equal(vacunacion?.porcentajeLabel, "6,3 %");
  });

  it("Criterio 2: desglosa correctamente por día de la semana según el wireframe", () => {
    const datos: TurnoReporteAusentismo[] = [
      // Lunes: 22 reservados, 3 ausentes (13,6 %)
      ...Array.from({ length: 19 }, () => turno({ diaSemana: "Lunes", status: "CUMPLIDO" })),
      ...Array.from({ length: 3 }, () => turno({ diaSemana: "Lunes", status: "AUSENTE" })),

      // Martes: 20 reservados, 2 ausentes (10,0 %)
      ...Array.from({ length: 18 }, () => turno({ diaSemana: "Martes", status: "CUMPLIDO" })),
      ...Array.from({ length: 2 }, () => turno({ diaSemana: "Martes", status: "AUSENTE" })),

      // Miércoles: 18 reservados, 2 ausentes (11,1 %)
      ...Array.from({ length: 16 }, () => turno({ diaSemana: "Miércoles", status: "CUMPLIDO" })),
      ...Array.from({ length: 2 }, () => turno({ diaSemana: "Miércoles", status: "AUSENTE" })),

      // Jueves: 19 reservados, 2 ausentes (10,5 %)
      ...Array.from({ length: 17 }, () => turno({ diaSemana: "Jueves", status: "CUMPLIDO" })),
      ...Array.from({ length: 2 }, () => turno({ diaSemana: "Jueves", status: "AUSENTE" })),

      // Viernes: 17 reservados, 2 ausentes (11,8 %)
      ...Array.from({ length: 15 }, () => turno({ diaSemana: "Viernes", status: "CUMPLIDO" })),
      ...Array.from({ length: 2 }, () => turno({ diaSemana: "Viernes", status: "AUSENTE" })),
    ];

    const r = armarReporteAusentismo(datos);
    assert.equal(r.totalReservados, 96);
    assert.equal(r.totalAusentes, 11);

    const lunes = r.porDiaSemana.find((d) => d.etiqueta === "Lunes");
    assert.equal(lunes?.reservados, 22);
    assert.equal(lunes?.ausentes, 3);
    assert.equal(lunes?.porcentajeLabel, "13,6 %");

    const martes = r.porDiaSemana.find((d) => d.etiqueta === "Martes");
    assert.equal(martes?.reservados, 20);
    assert.equal(martes?.ausentes, 2);
    assert.equal(martes?.porcentajeLabel, "10,0 %");

    const miercoles = r.porDiaSemana.find((d) => d.etiqueta === "Miércoles");
    assert.equal(miercoles?.reservados, 18);
    assert.equal(miercoles?.ausentes, 2);
    assert.equal(miercoles?.porcentajeLabel, "11,1 %");

    const jueves = r.porDiaSemana.find((d) => d.etiqueta === "Jueves");
    assert.equal(jueves?.reservados, 19);
    assert.equal(jueves?.ausentes, 2);
    assert.equal(jueves?.porcentajeLabel, "10,5 %");

    const viernes = r.porDiaSemana.find((d) => d.etiqueta === "Viernes");
    assert.equal(viernes?.reservados, 17);
    assert.equal(viernes?.ausentes, 2);
    assert.equal(viernes?.porcentajeLabel, "11,8 %");
  });

  it("Criterio 3: identifica y ordena a los pacientes con mayor cantidad de ausencias", () => {
    const datos: TurnoReporteAusentismo[] = [
      // Juan Pérez: 4 reservados, 2 ausentes
      turno({ pacienteNombre: "Juan Pérez", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Juan Pérez", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Juan Pérez", status: "AUSENTE" }),
      turno({ pacienteNombre: "Juan Pérez", status: "AUSENTE" }),

      // Emilia Ruiz: 3 reservados, 1 ausente
      turno({ pacienteNombre: "Emilia Ruiz", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Emilia Ruiz", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Emilia Ruiz", status: "AUSENTE" }),

      // Julián Sosa: 3 reservados, 1 ausente
      turno({ pacienteNombre: "Julián Sosa", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Julián Sosa", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Julián Sosa", status: "AUSENTE" }),

      // Paciente ejemplar: 5 reservados, 0 ausentes -> NO debe figurar en pacientes con ausencias
      turno({ pacienteNombre: "Ana Asistente", status: "CUMPLIDO" }),
      turno({ pacienteNombre: "Ana Asistente", status: "CUMPLIDO" }),
    ];

    const r = armarReporteAusentismo(datos);
    assert.equal(r.pacientesReincidentes.length, 3);
    assert.equal(r.pacientesReincidentes[0].pacienteNombre, "Juan Pérez");
    assert.equal(r.pacientesReincidentes[0].reservados, 4);
    assert.equal(r.pacientesReincidentes[0].ausentes, 2);

    assert.equal(r.pacientesReincidentes[1].pacienteNombre, "Emilia Ruiz");
    assert.equal(r.pacientesReincidentes[1].reservados, 3);
    assert.equal(r.pacientesReincidentes[1].ausentes, 1);

    assert.equal(r.pacientesReincidentes[2].pacienteNombre, "Julián Sosa");
    assert.equal(r.pacientesReincidentes[2].reservados, 3);
    assert.equal(r.pacientesReincidentes[2].ausentes, 1);
  });

  it("exporta a CSV con BOM y estructura de tablas esperada", () => {
    const datos = [
      turno({ pacienteNombre: "Juan Pérez", status: "AUSENTE" }),
      turno({ pacienteNombre: "Juan Pérez", status: "CUMPLIDO" }),
    ];
    const r = armarReporteAusentismo(datos);
    const csv = reporteAusentismoACsv(r, { desde: "2026-11-01", hasta: "2026-11-30" });

    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes("Reporte de asistencia y ausentismo"));
    assert.ok(csv.includes("Ausentismo general;50,0 %"));
    assert.ok(csv.includes("Juan Pérez;2;1"));
  });

  it("exporta a PDF devolviendo un Uint8Array válido con cabecera %PDF", () => {
    const datos = [
      turno({ pacienteNombre: "Juan Pérez", status: "AUSENTE" }),
      turno({ pacienteNombre: "Juan Pérez", status: "CUMPLIDO" }),
    ];
    const r = armarReporteAusentismo(datos);
    const pdf = reporteAusentismoAPdf(r, { desde: "2026-11-01", hasta: "2026-11-30" });

    assert.ok(pdf instanceof Uint8Array);
    assert.ok(pdf.byteLength > 100);
    const encabezado = Buffer.from(pdf.slice(0, 5)).toString("latin1");
    assert.equal(encabezado, "%PDF-");
  });
});
