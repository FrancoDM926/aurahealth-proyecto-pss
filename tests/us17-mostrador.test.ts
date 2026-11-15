import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MENSAJE_TURNO_PASADO_MOSTRADOR,
  TIPO_OPERACION_LABELS,
  construirTurnosPacienteMostrador,
  filtrarPacientesMostrador,
  filtrarTurnosDisponiblesMostrador,
  formatearCoberturaPaciente,
  resolverTipoTurnoPorRol,
  validarAltaPacienteMostrador,
  validarHorarioReservableMostrador,
  validarReprogramacionMostrador,
  type PacienteMostradorItem,
  type TurnoDisponibleMostradorItem,
} from "@/lib/mostrador";
import { renderNotificationTemplate } from "@/services/email/templates";

const PACIENTES_BASE: PacienteMostradorItem[] = [
  {
    id: "p1",
    firstName: "María",
    lastName: "García",
    fullName: "María García",
    docType: "DNI",
    docNumber: "30123456",
    email: "maria.garcia@correo.com",
    phone: "221 555-1234",
    coverageType: "OBRA_SOCIAL",
    healthInsuranceEntity: "IOMA",
    healthInsurancePlan: "Plan A",
    healthInsuranceNumber: "998877",
    coberturaLabel: "IOMA (Plan A)",
  },
  {
    id: "p2",
    firstName: "Juan",
    lastName: "Pérez",
    fullName: "Juan Pérez",
    docType: "DNI",
    docNumber: "28999111",
    email: "juan.perez@ejemplo.ar",
    phone: "221 444-0000",
    coverageType: "PARTICULAR",
    healthInsuranceEntity: null,
    healthInsurancePlan: null,
    healthInsuranceNumber: null,
    coberturaLabel: "Particular",
  },
];

describe("US-17 — Gestión de turnos desde mostrador", () => {
  it("Criterio 1: encuentra al paciente por documento ignorando puntos o espacios", () => {
    const res = filtrarPacientesMostrador(PACIENTES_BASE, {
      documento: "30.123.456",
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, "p1");
  });

  it("Criterio 1: encuentra al paciente por apellido ignorando mayúsculas y tildes, o por email", () => {
    const resSinTilde = filtrarPacientesMostrador(PACIENTES_BASE, {
      apellido: "garcia",
    });
    assert.equal(resSinTilde.length, 1);
    assert.equal(resSinTilde[0].id, "p1");

    const resPerez = filtrarPacientesMostrador(PACIENTES_BASE, {
      apellido: "PEREZ",
    });
    assert.equal(resPerez.length, 1);
    assert.equal(resPerez[0].id, "p2");

    const resEmail = filtrarPacientesMostrador(PACIENTES_BASE, {
      email: "MARIA.GARCIA@",
    });
    assert.equal(resEmail.length, 1);
    assert.equal(resEmail[0].id, "p1");
  });

  it("Criterio 2: valida positivamente el alta de un paciente nuevo en mostrador con su obra social", () => {
    const resultado = validarAltaPacienteMostrador({
      firstName: "Lucía",
      lastName: "Fernández",
      docType: "DNI",
      docNumber: "35111222",
      birthDate: "1990-05-15",
      phone: "221 555-9999",
      email: "lucia.fernandez@correo.com",
      coverageType: "OBRA_SOCIAL",
      healthInsuranceEntity: "OSDE",
      healthInsurancePlan: "210",
      healthInsuranceNumber: "123456789",
    });

    assert.equal(resultado.valid, true);
    assert.deepEqual(resultado.errors, {});
    assert.ok(resultado.parsedBirthDate instanceof Date);
    assert.equal(
      formatearCoberturaPaciente({
        coverageType: "OBRA_SOCIAL",
        healthInsuranceEntity: "OSDE",
        healthInsurancePlan: "210",
      }),
      "OSDE (210)"
    );
  });

  it("Criterio 2: exige obra social y número de afiliado cuando la cobertura es OBRA_SOCIAL", () => {
    const resultado = validarAltaPacienteMostrador({
      firstName: "Lucía",
      lastName: "Fernández",
      docType: "DNI",
      docNumber: "35111222",
      birthDate: "1990-05-15",
      phone: "221 555-9999",
      email: "lucia@correo.com",
      coverageType: "OBRA_SOCIAL",
      healthInsuranceEntity: "",
      healthInsuranceNumber: "",
    });

    assert.equal(resultado.valid, false);
    assert.ok(resultado.errors.healthInsuranceEntity);
    assert.ok(resultado.errors.healthInsuranceNumber);
  });

  it("Criterio 3: gestiona y filtra turnos de ambos tipos (consulta médica y vacunación)", () => {
    const ahora = { fecha: "2026-11-14", hora: "11:00" };
    const turnosDisponibles: TurnoDisponibleMostradorItem[] = [
      {
        id: "t-med-1",
        tipoTurno: "MEDICO",
        date: "2026-11-24",
        fechaFormateada: "24/11/2026",
        startTime: "14:00",
        endTime: "14:30",
        profesionalId: "doc-1",
        profesionalNombre: "Dr. Carlos Méndez",
        especialidadOVacunatorio: "Traumatología",
        specialty: "TRAUMATOLOGIA",
        status: "DISPONIBLE",
      },
      {
        id: "t-vac-1",
        tipoTurno: "VACUNACION",
        date: "2026-11-24",
        fechaFormateada: "24/11/2026",
        startTime: "09:30",
        endTime: "10:00",
        profesionalId: "enf-1",
        profesionalNombre: "Enf. Valeria Sosa",
        especialidadOVacunatorio: "Vacunatorio",
        specialty: null,
        status: "DISPONIBLE",
      },
    ];

    assert.equal(resolverTipoTurnoPorRol("MEDICO"), "MEDICO");
    assert.equal(resolverTipoTurnoPorRol("ENFERMERA"), "VACUNACION");

    const medicos = filtrarTurnosDisponiblesMostrador(
      turnosDisponibles,
      { tipoTurno: "MEDICO", specialty: "TRAUMATOLOGIA" },
      ahora
    );
    assert.equal(medicos.length, 1);
    assert.equal(medicos[0].id, "t-med-1");

    const vacunacion = filtrarTurnosDisponiblesMostrador(
      turnosDisponibles,
      { tipoTurno: "VACUNACION" },
      ahora
    );
    assert.equal(vacunacion.length, 1);
    assert.equal(vacunacion[0].id, "t-vac-1");
  });

  it("Criterio 3: clasifica los turnos del paciente para reprogramar/cancelar y para asistencia/pago", () => {
    const ahora = { fecha: "2026-11-14", hora: "11:00" };
    const clasificados = construirTurnosPacienteMostrador(
      [
        {
          id: "t-futuro",
          date: "2026-11-24",
          startTime: "14:00",
          endTime: "14:30",
          status: "RESERVADO",
          doctorId: "doc-1",
          doctorFirstName: "Carlos",
          doctorLastName: "Méndez",
          doctorRole: "MEDICO",
          doctorSpecialty: "TRAUMATOLOGIA",
        },
        {
          id: "t-hoy-medico-cumplido",
          date: "2026-11-14",
          startTime: "10:00",
          endTime: "10:30",
          status: "CUMPLIDO",
          doctorId: "doc-1",
          doctorFirstName: "Carlos",
          doctorLastName: "Méndez",
          doctorRole: "MEDICO",
          doctorSpecialty: "TRAUMATOLOGIA",
        },
        {
          id: "t-hoy-cumplido",
          date: "2026-11-14",
          startTime: "09:00",
          endTime: "09:30",
          status: "CUMPLIDO",
          doctorId: "enf-1",
          doctorFirstName: "Valeria",
          doctorLastName: "Sosa",
          doctorRole: "ENFERMERA",
          doctorSpecialty: null,
          vacunaId: "vac-1",
          vacunaNombre: "Antigripal",
        },
      ],
      ahora
    );

    assert.equal(clasificados.turnosParaGestion.length, 1);
    assert.equal(clasificados.turnosParaGestion[0].id, "t-futuro");
    assert.equal(clasificados.turnosParaGestion[0].puedeReprogramarOCancelar, true);

    assert.equal(clasificados.turnosAsistenciaYPago.length, 2);
    const turnoMed = clasificados.turnosAsistenciaYPago.find(
      (t) => t.id === "t-hoy-medico-cumplido"
    )!;
    const turnoVac = clasificados.turnosAsistenciaYPago.find(
      (t) => t.id === "t-hoy-cumplido"
    )!;
    assert.equal(turnoMed.habilitaPago, true);
    assert.equal(turnoVac.habilitaPago, false);
    assert.ok(
      turnoVac.especialidadOVacunatorio.includes("Vacunatorio (Antigripal)")
    );
  });

  it("Criterio 4: reprograma como cancelación del turno original más reserva de uno nuevo sin editar el original", () => {
    const ahora = { fecha: "2026-11-14", hora: "10:00" };
    const res = validarReprogramacionMostrador({
      turnoOriginal: {
        id: "turno-orig-1",
        status: "RESERVADO",
        reservedById: "p1",
        tipoTurno: "MEDICO",
        date: "2026-11-20",
        startTime: "10:00",
        doctorId: "doc-1",
      },
      turnoNuevo: {
        id: "turno-nuevo-2",
        status: "DISPONIBLE",
        bloqueoId: null,
        tipoTurno: "MEDICO",
        date: "2026-11-24",
        startTime: "14:00",
        doctorId: "doc-1",
      },
      pacienteId: "p1",
      ahora,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.plan.seEditaTurnoOriginal, false);
      assert.deepEqual(res.plan.cancelacionOriginal, {
        turnoId: "turno-orig-1",
        previousStatus: "RESERVADO",
        newStatus: "CANCELADO",
        preservaFechaHoraProfesional: {
          date: "2026-11-20",
          startTime: "10:00",
          doctorId: "doc-1",
        },
      });
      assert.deepEqual(res.plan.reservaNueva, {
        turnoId: "turno-nuevo-2",
        previousStatus: "DISPONIBLE",
        newStatus: "RESERVADO",
        reservedById: "p1",
      });
    }
  });

  it("Criterio 4: rechaza reprogramar sobre el mismo turno o entre tipos de turno distintos", () => {
    const ahora = { fecha: "2026-11-14", hora: "10:00" };
    const mismoTurno = validarReprogramacionMostrador({
      turnoOriginal: {
        id: "t1",
        status: "RESERVADO",
        reservedById: "p1",
        tipoTurno: "MEDICO",
        date: "2026-11-20",
        startTime: "10:00",
        doctorId: "doc-1",
      },
      turnoNuevo: {
        id: "t1",
        status: "DISPONIBLE",
        tipoTurno: "MEDICO",
        date: "2026-11-20",
        startTime: "10:00",
        doctorId: "doc-1",
      },
      pacienteId: "p1",
      ahora,
    });
    assert.equal(mismoTurno.ok, false);

    const distintoTipo = validarReprogramacionMostrador({
      turnoOriginal: {
        id: "t1",
        status: "RESERVADO",
        reservedById: "p1",
        tipoTurno: "MEDICO",
        date: "2026-11-20",
        startTime: "10:00",
        doctorId: "doc-1",
      },
      turnoNuevo: {
        id: "t2",
        status: "DISPONIBLE",
        tipoTurno: "VACUNACION",
        date: "2026-11-24",
        startTime: "09:30",
        doctorId: "enf-1",
      },
      pacienteId: "p1",
      ahora,
    });
    assert.equal(distintoTipo.ok, false);
  });

  it("Criterios 5 y 6: renderiza los emails de confirmación y cancelación y define las etiquetas de auditoría", () => {
    const confMed = renderNotificationTemplate("CONFIRMACION_TURNO_MEDICO", {
      pacienteNombre: "María García",
      doctorNombre: "Dr. Carlos Méndez",
      especialidad: "Traumatología",
      fecha: "24/11/2026",
      hora: "14:00",
    });
    assert.ok(confMed.html.includes("Dr. Carlos Méndez"));
    assert.ok(confMed.html.includes("24/11/2026"));

    const confVac = renderNotificationTemplate("CONFIRMACION_TURNO_VACUNATORIO", {
      pacienteNombre: "María García",
      vacunaNombre: "Antigripal",
      enfermeraNombre: "Enf. Valeria Sosa",
      fecha: "24/11/2026",
      hora: "09:30",
    });
    assert.ok(confVac.subject.toLowerCase().includes("vacun"));
    assert.ok(confVac.html.includes("Antigripal"));

    const cancMed = renderNotificationTemplate("CANCELACION_TURNO_MEDICO", {
      pacienteNombre: "María García",
      doctorNombre: "Dr. Carlos Méndez",
      especialidad: "Traumatología",
      fecha: "24/11/2026",
      hora: "14:00",
      motivo: "Cancelado en mostrador",
    });
    assert.ok(cancMed.subject.toLowerCase().includes("cancelad"));

    assert.equal(TIPO_OPERACION_LABELS.ALTA_PACIENTE, "Alta de paciente");
    assert.equal(TIPO_OPERACION_LABELS.RESERVA, "Reserva de turno");
    assert.equal(TIPO_OPERACION_LABELS.REPROGRAMACION, "Reprogramación de turno");
    assert.equal(TIPO_OPERACION_LABELS.CANCELACION, "Cancelación de turno");
    assert.equal(TIPO_OPERACION_LABELS.ASISTENCIA, "Marca de asistencia");
  });
});

describe("US-17 — horarios ya pasados del día en mostrador", () => {
  const AHORA = { fecha: "2026-11-14", hora: "14:23" };

  const turno = (
    id: string,
    date: string,
    startTime: string,
    tipoTurno: "MEDICO" | "VACUNACION" = "MEDICO"
  ): TurnoDisponibleMostradorItem => ({
    id,
    tipoTurno,
    date,
    fechaFormateada: date,
    startTime,
    endTime: startTime,
    profesionalId: tipoTurno === "MEDICO" ? "doc-1" : "vacunatorio",
    profesionalNombre: tipoTurno === "MEDICO" ? "Dr. Carlos Méndez" : "Sala de Vacunación",
    especialidadOVacunatorio: tipoTurno === "MEDICO" ? "Clínica médica" : "Vacunatorio",
    specialty: tipoTurno === "MEDICO" ? "CLINICA_MEDICA" : null,
    status: "DISPONIBLE",
  });

  it("descarta el turno de hoy cuya hora ya pasó y conserva los posteriores", () => {
    const disponibles = [
      turno("pasado", "2026-11-14", "14:00"),
      turno("posterior", "2026-11-14", "15:00"),
      turno("manana", "2026-11-15", "09:00"),
      turno("pasado-vac", "2026-11-14", "09:30", "VACUNACION"),
    ];

    const medicos = filtrarTurnosDisponiblesMostrador(
      disponibles,
      { tipoTurno: "MEDICO" },
      AHORA
    );
    assert.deepEqual(
      medicos.map((t) => t.id),
      ["posterior", "manana"]
    );

    const vacunacion = filtrarTurnosDisponiblesMostrador(
      disponibles,
      { tipoTurno: "VACUNACION" },
      AHORA
    );
    assert.deepEqual(vacunacion, []);
  });

  it("un turno que empieza exactamente ahora tampoco se ofrece", () => {
    const disponibles = [turno("justo-ahora", "2026-11-14", "14:23")];

    assert.deepEqual(
      filtrarTurnosDisponiblesMostrador(disponibles, { tipoTurno: "MEDICO" }, AHORA),
      []
    );
  });

  it("la acción de reserva rechaza un horario pasado con un mensaje claro", () => {
    assert.equal(
      validarHorarioReservableMostrador(
        { date: "2026-11-14", startTime: "14:00" },
        AHORA
      ),
      MENSAJE_TURNO_PASADO_MOSTRADOR
    );
    assert.equal(
      MENSAJE_TURNO_PASADO_MOSTRADOR,
      "Ese horario ya pasó. Elegí otro turno."
    );
    assert.equal(
      validarHorarioReservableMostrador(
        { date: "2026-11-14", startTime: "15:00" },
        AHORA
      ),
      null
    );
    assert.equal(
      validarHorarioReservableMostrador(
        { date: "2026-11-15", startTime: "09:00" },
        AHORA
      ),
      null
    );
  });

  it("la reprogramación tampoco acepta un horario nuevo ya transcurrido", () => {
    const res = validarReprogramacionMostrador({
      turnoOriginal: {
        id: "t-orig",
        status: "RESERVADO",
        reservedById: "p1",
        tipoTurno: "MEDICO",
        date: "2026-11-14",
        startTime: "13:00",
        doctorId: "doc-1",
      },
      turnoNuevo: {
        id: "t-nuevo",
        status: "DISPONIBLE",
        bloqueoId: null,
        tipoTurno: "MEDICO",
        date: "2026-11-14",
        startTime: "14:00",
        doctorId: "doc-1",
      },
      pacienteId: "p1",
      ahora: AHORA,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(
        res.error,
        "No se puede reprogramar hacia un turno cuyo horario ya pasó."
      );
    }
  });
});
