import test, { describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Transporter } from "nodemailer";

import {
  clasificarTurnosDeFranja,
  construirPreviewBloqueoFranja,
  construirTextoAvisoBloqueo,
  esBloqueoReversible,
  etiquetaEstadoAviso,
  turnoPerteneceAFranja,
  validarSolicitudBloqueo,
  type TurnoEnFranjaCandidato,
} from "../src/lib/bloqueo-agenda";
import {
  filtrarYOrdenarTurnosDisponibles,
  type InstanteArgentina,
  type TurnoCandidatoBusqueda,
} from "../src/lib/busqueda-turnos";
import { huecosLibres, pasaFiltro, resumenDelDia, type TurnoAgenda } from "../src/lib/agenda-profesional";
import {
  renderNotificationTemplate,
  resetTransporter,
  sendNotificationEmail,
  setTransporterForTesting,
} from "../src/services/email";
import { buildAvisoBloqueoAgendaParams } from "../src/services/notificaciones/bloqueo-agenda";

const AHORA: InstanteArgentina = {
  fecha: "2026-11-14",
  hora: "10:35",
};

const TURNOS_EJEMPLO: TurnoEnFranjaCandidato[] = [
  {
    id: "t-1400",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "14:00",
    endTime: "14:30",
    status: "RESERVADO",
    reservedBy: {
      id: "pac-1",
      firstName: "Sofía",
      lastName: "Acosta",
      email: "sofia.acosta@correo.com",
      phone: "11 5555-0102",
    },
  },
  {
    id: "t-1430",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "14:30",
    endTime: "15:00",
    status: "DISPONIBLE",
    bloqueoId: null,
  },
  {
    id: "t-1500",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "15:00",
    endTime: "15:30",
    status: "DISPONIBLE",
    bloqueoId: null,
  },
  {
    id: "t-1530",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "15:30",
    endTime: "16:00",
    status: "RESERVADO",
    reservedBy: {
      id: "pac-2",
      firstName: "Martín",
      lastName: "Benítez",
      email: "m.benitez@correo.com",
      phone: "11 5555-0148",
    },
  },
  {
    id: "t-1600",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "16:00",
    endTime: "16:30",
    status: "DISPONIBLE",
    bloqueoId: null,
  },
  {
    id: "t-1630",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "16:30",
    endTime: "17:00",
    status: "DISPONIBLE",
    bloqueoId: null,
  },
  {
    id: "t-1700-fuera",
    doctorId: "doc-mendez",
    date: "2026-11-24",
    startTime: "17:00",
    endTime: "17:30",
    status: "DISPONIBLE",
    bloqueoId: null,
  },
];

afterEach(() => {
  resetTransporter();
});

describe("US-30 — Bloqueo de turnos disponibles de una franja publicada", () => {
  test("Criterio 1 y 2: médico bloquea su propia agenda con motivo; administrativo puede bloquear a pedido de un médico", () => {
    const resMedico = validarSolicitudBloqueo(
      {
        dia: "2026-11-24",
        desde: "14:00",
        hasta: "17:00",
        motivo: "Ausencia por congreso médico",
      },
      { id: "doc-mendez", role: "MEDICO", fullName: "Dr. Carlos Méndez" },
      AHORA
    );
    assert.equal(resMedico.ok, true);
    if (resMedico.ok) {
      assert.equal(resMedico.datos.doctorId, "doc-mendez");
      assert.equal(resMedico.datos.dia, "2026-11-24");
      assert.equal(resMedico.datos.diaHasta, "2026-11-24");
      assert.equal(resMedico.datos.motivo, "Ausencia por congreso médico");
    }

    const resAdmin = validarSolicitudBloqueo(
      {
        doctorId: "doc-mendez",
        dia: "2026-11-24",
        diaHasta: "2026-11-25",
        desde: "14:00",
        hasta: "17:00",
        motivo: "Licencia médica solicitada por el profesional",
      },
      { id: "adm-1", role: "ADMINISTRATIVO", fullName: "Laura Administrativo" },
      AHORA
    );
    assert.equal(resAdmin.ok, true);
    if (resAdmin.ok) {
      assert.equal(resAdmin.datos.doctorId, "doc-mendez");
      assert.equal(resAdmin.datos.diaHasta, "2026-11-25");
    }
  });

  test("Criterio 1 y 2: rechaza falta de motivo, roles no autorizados, médico sobre agenda ajena y fechas/horarios pasados", () => {
    const sinMotivo = validarSolicitudBloqueo(
      {
        dia: "2026-11-24",
        desde: "14:00",
        hasta: "17:00",
        motivo: "   ",
      },
      { id: "doc-mendez", role: "MEDICO", fullName: "Dr. Carlos Méndez" },
      AHORA
    );
    assert.equal(sinMotivo.ok, false);
    if (!sinMotivo.ok) {
      assert.match(sinMotivo.error, /motivo/i);
    }

    const rolInvalido = validarSolicitudBloqueo(
      {
        doctorId: "doc-mendez",
        dia: "2026-11-24",
        desde: "14:00",
        hasta: "17:00",
        motivo: "Ausencia",
      },
      { id: "pac-1", role: "USUARIO", fullName: "Paciente" },
      AHORA
    );
    assert.equal(rolInvalido.ok, false);

    const medicoAjeno = validarSolicitudBloqueo(
      {
        doctorId: "otro-medico",
        dia: "2026-11-24",
        desde: "14:00",
        hasta: "17:00",
        motivo: "Ausencia",
      },
      { id: "doc-mendez", role: "MEDICO", fullName: "Dr. Carlos Méndez" },
      AHORA
    );
    assert.equal(medicoAjeno.ok, false);

    const fechaPasada = validarSolicitudBloqueo(
      {
        dia: "2026-11-10",
        desde: "14:00",
        hasta: "17:00",
        motivo: "Ausencia",
      },
      { id: "doc-mendez", role: "MEDICO", fullName: "Dr. Carlos Méndez" },
      AHORA
    );
    assert.equal(fechaPasada.ok, false);

    const horarioInvertido = validarSolicitudBloqueo(
      {
        dia: "2026-11-24",
        desde: "17:00",
        hasta: "14:00",
        motivo: "Ausencia",
      },
      { id: "doc-mendez", role: "MEDICO", fullName: "Dr. Carlos Méndez" },
      AHORA
    );
    assert.equal(horarioInvertido.ok, false);
  });

  test("Criterio 4 y 5: separa turnos libres a bloquear de los turnos reservados (que quedan fuera del bloqueo) y advierte la cantidad", () => {
    const preview = construirPreviewBloqueoFranja(TURNOS_EJEMPLO, {
      doctorId: "doc-mendez",
      doctorName: "Dr. Carlos Méndez",
      dia: "2026-11-24",
      desde: "14:00",
      hasta: "17:00",
    });

    assert.equal(preview.cantidadReservados, 2);
    assert.equal(preview.cantidadLibres, 4);
    assert.match(
      preview.mensajeAdvertenciaReservados,
      /En la franja hay 2 turnos reservados\. Quedan excluidos del bloqueo/
    );

    assert.deepEqual(
      preview.turnosReservados.map((t) => ({
        startTime: t.startTime,
        pacienteNombre: t.pacienteNombre,
        contactoTexto: t.contactoTexto,
      })),
      [
        {
          startTime: "14:00",
          pacienteNombre: "Sofía Acosta",
          contactoTexto: "sofia.acosta@correo.com · 11 5555-0102",
        },
        {
          startTime: "15:30",
          pacienteNombre: "Martín Benítez",
          contactoTexto: "m.benitez@correo.com · 11 5555-0148",
        },
      ]
    );

    assert.deepEqual(
      preview.turnosLibres.map((t) => t.startTime),
      ["14:30", "15:00", "16:00", "16:30"]
    );
  });

  test("Criterio 3: los turnos bloqueados dejan de ofrecerse en la búsqueda de pacientes y no cuentan como libres en la agenda", () => {
    const candidatosBusqueda: TurnoCandidatoBusqueda[] = [
      {
        id: "t-libre",
        date: "2026-11-24",
        startTime: "17:00",
        endTime: "17:30",
        status: "DISPONIBLE",
        doctorId: "doc-mendez",
        doctorName: "Dr. Carlos Méndez",
        specialty: "CLINICA_MEDICA",
        agendaConfirmada: true,
        bloqueado: false,
      },
      {
        id: "t-bloqueado",
        date: "2026-11-24",
        startTime: "14:30",
        endTime: "15:00",
        status: "DISPONIBLE",
        doctorId: "doc-mendez",
        doctorName: "Dr. Carlos Méndez",
        specialty: "CLINICA_MEDICA",
        agendaConfirmada: true,
        bloqueado: true,
      },
    ];

    const ofrecidos = filtrarYOrdenarTurnosDisponibles(
      candidatosBusqueda,
      { desde: "2026-11-14", hasta: "2026-12-14" },
      AHORA
    );

    assert.equal(ofrecidos.length, 1);
    assert.equal(ofrecidos[0].id, "t-libre");

    const turnosAgenda: TurnoAgenda[] = [
      {
        id: "t-libre",
        date: "2026-11-24",
        startTime: "17:00",
        endTime: "17:30",
        status: "DISPONIBLE",
        bloqueado: false,
      },
      {
        id: "t-bloqueado",
        date: "2026-11-24",
        startTime: "14:30",
        endTime: "15:00",
        status: "DISPONIBLE",
        bloqueado: true,
      },
      {
        id: "t-reservado",
        date: "2026-11-24",
        startTime: "14:00",
        endTime: "14:30",
        status: "RESERVADO",
      },
    ];

    const resumen = resumenDelDia(turnosAgenda);
    assert.equal(resumen.DISPONIBLE, 1);
    assert.equal(resumen.RESERVADO, 1);
    assert.equal(resumen.total, 3);
    assert.equal(pasaFiltro(turnosAgenda[1], "libres"), false);
    assert.equal(huecosLibres(turnosAgenda).length, 1);
  });

  test("Criterio 6: el bloqueo puede revertirse mientras no hayan pasado las fechas involucradas", () => {
    const futuro = esBloqueoReversible(
      {
        date: "2026-11-24",
        dateHasta: "2026-11-24",
        endTime: "17:00",
        revertedAt: null,
      },
      AHORA
    );
    assert.equal(futuro.reversible, true);

    const pasado = esBloqueoReversible(
      {
        date: "2026-11-10",
        dateHasta: "2026-11-10",
        endTime: "17:00",
        revertedAt: null,
      },
      AHORA
    );
    assert.equal(pasado.reversible, false);
    assert.match(pasado.motivoNoReversible ?? "", /ya pasaron/);

    const yaRevertido = esBloqueoReversible(
      {
        date: "2026-11-24",
        dateHasta: "2026-11-24",
        endTime: "17:00",
        revertedAt: new Date(),
      },
      AHORA
    );
    assert.equal(yaRevertido.reversible, false);
    assert.match(yaRevertido.motivoNoReversible ?? "", /ya fue revertido/);
  });
});

describe("US-22 — Aviso por modificación de agenda", () => {
  test("Criterio 1, 2 y 3: renderiza y envía el email indicando el turno afectado, que no fue modificado y cómo reprogramarlo", async () => {
    const params = buildAvisoBloqueoAgendaParams({
      pacienteNombre: "Sofía Acosta",
      doctorNombre: "Dr. Carlos Méndez",
      especialidad: "Clínica Médica",
      diaBloqueo: "2026-11-24",
      diaBloqueoHasta: "2026-11-24",
      desde: "14:00",
      hasta: "17:00",
      fechaTurno: "2026-11-24",
      horaTurno: "14:00",
      motivo: "Ausencia por congreso médico",
    });

    const rendered = renderNotificationTemplate("AVISO_BLOQUEO_AGENDA", params);

    assert.equal(
      rendered.subject,
      "Su turno del 24/11 se vio afectado por un bloqueo de agenda"
    );
    assert.match(
      rendered.text,
      /Estimado\/a Sofía Acosta: el Dr\. Carlos Méndez bloqueó la franja del 24\/11\/2026 \(14:00 a 17:00\)\. Su turno del 24\/11\/2026 14:00 no fue modificado\. Para reprogramarlo, contacte a la sala\./
    );
    assert.match(rendered.html, /Sofía Acosta/);
    assert.match(rendered.html, /24\/11\/2026 14:00 hs \(sin modificar\)/);
    assert.match(rendered.html, /contacte a la sala/);

    let enviados = 0;
    const mockTransporter = {
      sendMail: async () => {
        enviados++;
        return { messageId: "msg-us22-1" };
      },
    } as unknown as Transporter;

    setTransporterForTesting(mockTransporter);

    const sendRes = await sendNotificationEmail({
      to: "sofia.acosta@correo.com",
      template: "AVISO_BLOQUEO_AGENDA",
      params,
      initialDelayMs: 1,
    });

    assert.equal(sendRes.success, true);
    assert.equal(enviados, 1);
  });

  test("Criterio 4: arma los datos de contacto y etiquetas de estado del aviso para el listado del administrativo", () => {
    const { turnosReservados } = clasificarTurnosDeFranja(TURNOS_EJEMPLO, {
      doctorId: "doc-mendez",
      dia: "2026-11-24",
      desde: "14:00",
      hasta: "17:00",
    });

    assert.equal(turnosReservados.length, 2);
    assert.equal(turnosReservados[0].pacienteNombre, "Sofía Acosta");
    assert.equal(turnosReservados[0].contactoTexto, "sofia.acosta@correo.com · 11 5555-0102");
    assert.equal(turnosReservados[1].pacienteNombre, "Martín Benítez");
    assert.equal(turnosReservados[1].contactoTexto, "m.benitez@correo.com · 11 5555-0148");

    assert.equal(etiquetaEstadoAviso("SENT"), "Enviado");
    assert.equal(etiquetaEstadoAviso("PENDING"), "Pendiente");
    assert.equal(etiquetaEstadoAviso("FAILED"), "Fallido");
  });

  test("turnoPerteneceAFranja y construirTextoAvisoBloqueo soportan franjas de un día y de varios días", () => {
    assert.equal(
      turnoPerteneceAFranja(
        { date: "2026-11-25", startTime: "15:00", endTime: "15:30" },
        { dia: "2026-11-24", diaHasta: "2026-11-26", desde: "14:00", hasta: "17:00" }
      ),
      true
    );

    const texto = construirTextoAvisoBloqueo({
      pacienteNombre: "Sofía Acosta",
      doctorNombre: "Carlos Méndez",
      fechaFranjaTexto: "24/11/2026",
      desde: "14:00",
      hasta: "17:00",
      fechaTurno: "24/11/2026",
      horaTurno: "14:00",
    });

    assert.equal(
      texto.subject,
      "Su turno del 24/11 se vio afectado por un bloqueo de agenda"
    );
    assert.match(texto.bodyText, /el Dr\. Carlos Méndez bloqueó la franja/);
  });
});
