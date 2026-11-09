import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularReporteTurnos,
  ESPECIALIDADES_REPORTE,
  formatearNombreProfesionalReporte,
  normalizarFiltrosReporteTurnos,
  rangoMesEnCurso,
  resolverEspecialidadReporte,
  type TurnoReporteCandidato,
} from "../src/lib/reporte-turnos";

function crearTurnosLote(params: {
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorRole: "MEDICO" | "ENFERMERA";
  doctorSpecialty: "TRAUMATOLOGIA" | "CLINICA_MEDICA" | "PEDIATRIA" | null;
  date: string;
  cumplidos: number;
  ausentes: number;
  cancelados: number;
  disponibles?: number;
}): TurnoReporteCandidato[] {
  const out: TurnoReporteCandidato[] = [];
  let seq = 1;
  const push = (
    status: "CUMPLIDO" | "AUSENTE" | "CANCELADO" | "DISPONIBLE",
    cantidad: number
  ) => {
    for (let i = 0; i < cantidad; i++) {
      out.push({
        id: `${params.doctorId}-${status}-${seq++}`,
        date: params.date,
        status,
        doctorId: params.doctorId,
        doctorFirstName: params.doctorFirstName,
        doctorLastName: params.doctorLastName,
        doctorRole: params.doctorRole,
        doctorSpecialty: params.doctorSpecialty,
      });
    }
  };
  push("CUMPLIDO", params.cumplidos);
  push("AUSENTE", params.ausentes);
  push("CANCELADO", params.cancelados);
  push("DISPONIBLE", params.disponibles ?? 0);
  return out;
}

const DATASET_WIREFRAME: TurnoReporteCandidato[] = [
  ...crearTurnosLote({
    doctorId: "doc-mendez",
    doctorFirstName: "Carlos",
    doctorLastName: "Méndez",
    doctorRole: "MEDICO",
    doctorSpecialty: "TRAUMATOLOGIA",
    date: "2026-11-10",
    cumplidos: 40,
    ausentes: 5,
    cancelados: 3,
    disponibles: 15,
  }),
  ...crearTurnosLote({
    doctorId: "doc-fernandez",
    doctorFirstName: "Laura",
    doctorLastName: "Fernández",
    doctorRole: "MEDICO",
    doctorSpecialty: "CLINICA_MEDICA",
    date: "2026-11-12",
    cumplidos: 31,
    ausentes: 3,
    cancelados: 2,
    disponibles: 10,
  }),
  ...crearTurnosLote({
    doctorId: "doc-ramos",
    doctorFirstName: "Sofía",
    doctorLastName: "Ramos",
    doctorRole: "MEDICO",
    doctorSpecialty: "PEDIATRIA",
    date: "2026-11-15",
    cumplidos: 19,
    ausentes: 2,
    cancelados: 1,
    disponibles: 8,
  }),
  ...crearTurnosLote({
    doctorId: "enf-diaz",
    doctorFirstName: "Rosa",
    doctorLastName: "Díaz",
    doctorRole: "ENFERMERA",
    doctorSpecialty: null,
    date: "2026-11-18",
    cumplidos: 17,
    ausentes: 1,
    cancelados: 0,
    disponibles: 5,
  }),
];

describe("US-45 — Criterio 1: Totales, cumplidos, ausentes y cancelados por especialidad", () => {
  it("calcula exactamente los totales por especialidad del wireframe e ignora los turnos DISPONIBLE", () => {
    const rangoDefecto = rangoMesEnCurso("2026-11-06");
    const filtros = normalizarFiltrosReporteTurnos({}, "2026-11-06");
    const reporte = calcularReporteTurnos({
      turnos: DATASET_WIREFRAME,
      filtros,
      rangoDefecto,
    });

    assert.deepEqual(
      reporte.porEspecialidad.map((f) => ({
        especialidad: f.especialidad,
        especialidadLabel: f.especialidadLabel,
        total: f.total,
        cumplidos: f.cumplidos,
        ausentes: f.ausentes,
        cancelados: f.cancelados,
      })),
      [
        {
          especialidad: "TRAUMATOLOGIA",
          especialidadLabel: "Traumatología",
          total: 48,
          cumplidos: 40,
          ausentes: 5,
          cancelados: 3,
        },
        {
          especialidad: "CLINICA_MEDICA",
          especialidadLabel: "Clínica Médica",
          total: 36,
          cumplidos: 31,
          ausentes: 3,
          cancelados: 2,
        },
        {
          especialidad: "PEDIATRIA",
          especialidadLabel: "Pediatría",
          total: 22,
          cumplidos: 19,
          ausentes: 2,
          cancelados: 1,
        },
        {
          especialidad: "VACUNATORIO",
          especialidadLabel: "Vacunatorio",
          total: 18,
          cumplidos: 17,
          ausentes: 1,
          cancelados: 0,
        },
      ]
    );

    assert.deepEqual(reporte.totalesGenerales, {
      total: 124,
      cumplidos: 107,
      ausentes: 11,
      cancelados: 6,
      reservados: 0,
    });
  });

  it("resuelve Vacunatorio para enfermeras y la especialidad médica para médicos (RN-08)", () => {
    assert.equal(
      resolverEspecialidadReporte({ role: "ENFERMERA", specialty: null }),
      "VACUNATORIO"
    );
    assert.equal(
      resolverEspecialidadReporte({
        role: "MEDICO",
        specialty: "TRAUMATOLOGIA",
      }),
      "TRAUMATOLOGIA"
    );
    assert.equal(
      resolverEspecialidadReporte({ role: "ADMINISTRATIVO", specialty: null }),
      null
    );
  });
});

describe("US-45 — Criterio 2: Desglose por profesional", () => {
  it("desglosa los turnos por profesional con su prefijo (Dr. / Enf.) y especialidad", () => {
    const rangoDefecto = rangoMesEnCurso("2026-11-06");
    const filtros = normalizarFiltrosReporteTurnos({}, "2026-11-06");
    const reporte = calcularReporteTurnos({
      turnos: DATASET_WIREFRAME,
      filtros,
      rangoDefecto,
    });

    assert.equal(
      formatearNombreProfesionalReporte({
        firstName: "Carlos",
        lastName: "Méndez",
        role: "MEDICO",
      }),
      "Dr. Carlos Méndez"
    );
    assert.equal(
      formatearNombreProfesionalReporte({
        firstName: "Rosa",
        lastName: "Díaz",
        role: "ENFERMERA",
      }),
      "Enf. Rosa Díaz"
    );

    assert.deepEqual(
      reporte.porProfesional.map((p) => ({
        profesionalNombre: p.profesionalNombre,
        especialidadLabel: p.especialidadLabel,
        total: p.total,
        cumplidos: p.cumplidos,
        ausentes: p.ausentes,
        cancelados: p.cancelados,
      })),
      [
        {
          profesionalNombre: "Dr. Carlos Méndez",
          especialidadLabel: "Traumatología",
          total: 48,
          cumplidos: 40,
          ausentes: 5,
          cancelados: 3,
        },
        {
          profesionalNombre: "Dr. Laura Fernández",
          especialidadLabel: "Clínica Médica",
          total: 36,
          cumplidos: 31,
          ausentes: 3,
          cancelados: 2,
        },
        {
          profesionalNombre: "Dr. Sofía Ramos",
          especialidadLabel: "Pediatría",
          total: 22,
          cumplidos: 19,
          ausentes: 2,
          cancelados: 1,
        },
        {
          profesionalNombre: "Enf. Rosa Díaz",
          especialidadLabel: "Vacunatorio",
          total: 18,
          cumplidos: 17,
          ausentes: 1,
          cancelados: 0,
        },
      ]
    );
  });
});

describe("US-45 — Criterio 3: Rango de fechas y filtro por especialidad", () => {
  it("toma como rango por defecto el mes en curso completo (RF-REP-05)", () => {
    assert.deepEqual(rangoMesEnCurso("2026-11-06"), {
      desde: "2026-11-01",
      hasta: "2026-11-30",
    });
    assert.deepEqual(rangoMesEnCurso("2028-02-15"), {
      desde: "2028-02-01",
      hasta: "2028-02-29",
    });
  });

  it("filtra los turnos por el rango de fechas y por la especialidad seleccionada", () => {
    const rangoDefecto = rangoMesEnCurso("2026-11-06");

    // Rango acotado del 10/11 al 12/11: solo incluye Traumatología (10/11) y Clínica Médica (12/11)
    const filtrosRango = normalizarFiltrosReporteTurnos(
      { desde: "2026-11-10", hasta: "2026-11-12" },
      "2026-11-06"
    );
    const reporteRango = calcularReporteTurnos({
      turnos: DATASET_WIREFRAME,
      filtros: filtrosRango,
      rangoDefecto,
    });
    assert.equal(reporteRango.totalesGenerales.total, 48 + 36);
    assert.equal(
      reporteRango.porEspecialidad.find((e) => e.especialidad === "PEDIATRIA")?.total,
      0
    );

    // Filtro por especialidad específica: solo Pediatría
    const filtrosEsp = normalizarFiltrosReporteTurnos(
      { especialidad: "PEDIATRIA" },
      "2026-11-06"
    );
    const reporteEsp = calcularReporteTurnos({
      turnos: DATASET_WIREFRAME,
      filtros: filtrosEsp,
      rangoDefecto,
    });
    assert.equal(reporteEsp.porEspecialidad.length, 1);
    assert.equal(reporteEsp.porEspecialidad[0].especialidad, "PEDIATRIA");
    assert.equal(reporteEsp.porEspecialidad[0].total, 22);
    assert.equal(reporteEsp.porProfesional.length, 1);
    assert.equal(reporteEsp.porProfesional[0].profesionalNombre, "Dr. Sofía Ramos");
  });

  it("rechaza un rango donde la fecha «Desde» es posterior a «Hasta»", () => {
    const filtros = normalizarFiltrosReporteTurnos(
      { desde: "2026-11-20", hasta: "2026-11-05" },
      "2026-11-06"
    );
    assert.ok(filtros.error);
    assert.match(filtros.error!, /no puede ser posterior/i);
  });
});

describe("US-45 — Criterio 4: Representación gráfica de la distribución", () => {
  it("calcula el máximo y el porcentaje relativo de cada especialidad para el gráfico de barras", () => {
    const rangoDefecto = rangoMesEnCurso("2026-11-06");
    const filtros = normalizarFiltrosReporteTurnos({}, "2026-11-06");
    const reporte = calcularReporteTurnos({
      turnos: DATASET_WIREFRAME,
      filtros,
      rangoDefecto,
    });

    assert.equal(reporte.maxTotalEspecialidad, 48);
    assert.deepEqual(
      reporte.porEspecialidad.map((e) => ({
        especialidad: e.especialidad,
        porcentajeBarra: e.porcentajeBarra,
      })),
      [
        { especialidad: "TRAUMATOLOGIA", porcentajeBarra: 100 },
        { especialidad: "CLINICA_MEDICA", porcentajeBarra: 75 },
        { especialidad: "PEDIATRIA", porcentajeBarra: 46 },
        { especialidad: "VACUNATORIO", porcentajeBarra: 38 },
      ]
    );
    assert.equal(ESPECIALIDADES_REPORTE.length, 4);
  });
});
