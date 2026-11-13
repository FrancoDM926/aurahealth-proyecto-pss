"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  buscarPacientesMostradorAction,
  cancelarTurnoMostradorAction,
  marcarAsistenciaMostradorAction,
  registrarPacienteMostradorAction,
  reprogramarTurnoMostradorAction,
  reservarTurnoMostradorAction,
  seleccionarPacienteMostradorAction,
  type DatosInicialesMostrador,
} from "@/actions/mostrador";
import {
  filtrarPacientesMostrador,
  type PacienteMostradorItem,
  type TipoTurnoMostrador,
  type TurnoPacienteMostradorItem,
} from "@/lib/mostrador";
import { SPECIALTY_LABELS } from "@/lib/roles";
import { DOC_TYPES, ENTITY_OPTIONS } from "@/lib/validation";
import type { MedicalSpecialty } from "@/generated/prisma/client";
import { Paginacion, usePaginacion } from "@/components/paginacion";

type Props = {
  initialData: DatosInicialesMostrador;
};

const ESPECIALIDADES: MedicalSpecialty[] = [
  "CLINICA_MEDICA",
  "PEDIATRIA",
  "TRAUMATOLOGIA",
];

export function MostradorView({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const reservaSectionRef = useRef<HTMLElement | null>(null);

  const obrasSocialesDisponibles =
    initialData.obrasSociales && initialData.obrasSociales.length > 0
      ? initialData.obrasSociales
      : ENTITY_OPTIONS.map((o) => o.value);

  // Estado de pacientes y búsqueda (Sección 1)
  const [pacientes, setPacientes] = useState<PacienteMostradorItem[]>(
    initialData.pacientes
  );
  const [pacienteSeleccionado, setPacienteSeleccionado] =
    useState<PacienteMostradorItem | null>(initialData.pacienteSeleccionado);
  const [docFiltro, setDocFiltro] = useState("");
  const [apellidoFiltro, setApellidoFiltro] = useState("");
  const [emailFiltro, setEmailFiltro] = useState("");

  // Estado de alta de paciente nuevo en el mismo flujo (Criterio 2)
  const [mostrarFormAlta, setMostrarFormAlta] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [docType, setDocType] = useState<string>("DNI");
  const [docNumber, setDocNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [emailAlta, setEmailAlta] = useState("");
  const [address, setAddress] = useState("");
  const [coverageType, setCoverageType] = useState<"PARTICULAR" | "OBRA_SOCIAL">(
    "OBRA_SOCIAL"
  );
  const [healthInsuranceEntity, setHealthInsuranceEntity] = useState<string>(
    obrasSocialesDisponibles[0] ?? "OSDE"
  );
  const [healthInsurancePlan, setHealthInsurancePlan] = useState("");
  const [healthInsuranceNumber, setHealthInsuranceNumber] = useState("");
  const [erroresAlta, setErroresAlta] = useState<Record<string, string>>({});

  // Estado de reserva / reprogramación (Sección 2)
  const [tipoTurno, setTipoTurno] = useState<TipoTurnoMostrador>("MEDICO");
  const [especialidad, setEspecialidad] = useState<MedicalSpecialty | "">("");
  const [profesionalId, setProfesionalId] = useState<string>("");
  const [vacunaId, setVacunaId] = useState<string>(
    initialData.vacunas[0]?.id ?? ""
  );
  const [dosisPrevistaOrden, setDosisPrevistaOrden] = useState<number>(
    initialData.vacunas[0]?.dosis[0]?.orden ?? 1
  );
  const [motivoConsulta, setMotivoConsulta] = useState<string>("");
  const [turnoAReprogramar, setTurnoAReprogramar] =
    useState<TurnoPacienteMostradorItem | null>(null);

  // Estado de turnos del paciente (Secciones 3 y 4)
  const [turnosParaGestion, setTurnosParaGestion] = useState<
    TurnoPacienteMostradorItem[]
  >(initialData.turnosParaGestion);
  const [turnosAsistenciaYPago, setTurnosAsistenciaYPago] = useState<
    TurnoPacienteMostradorItem[]
  >(initialData.turnosAsistenciaYPago);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const vacunaSeleccionadaObj = useMemo(
    () => initialData.vacunas.find((v) => v.id === vacunaId) ?? null,
    [initialData.vacunas, vacunaId]
  );

  // Profesionales filtrados según tipo de turno y especialidad
  const profesionalesFiltrados = useMemo(() => {
    return initialData.profesionales.filter((p) => {
      if (p.tipoTurno !== tipoTurno) return false;
      if (tipoTurno === "MEDICO" && especialidad && p.specialty !== especialidad) {
        return false;
      }
      return true;
    });
  }, [initialData.profesionales, tipoTurno, especialidad]);

  // Turnos disponibles filtrados para la tabla de reserva / reprogramación
  const turnosDisponiblesFiltrados = useMemo(() => {
    return initialData.turnosDisponibles.filter((t) => {
      if (t.tipoTurno !== tipoTurno) return false;
      if (tipoTurno === "MEDICO" && especialidad && t.specialty !== especialidad) {
        return false;
      }
      if (
        tipoTurno === "MEDICO" &&
        profesionalId &&
        t.profesionalId !== profesionalId
      ) {
        return false;
      }
      if (turnoAReprogramar && t.id === turnoAReprogramar.id) {
        return false;
      }
      return true;
    });
  }, [
    initialData.turnosDisponibles,
    tipoTurno,
    especialidad,
    profesionalId,
    turnoAReprogramar,
  ]);

  const handleBuscarPacientes = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await buscarPacientesMostradorAction({
        documento: docFiltro,
        apellido: apellidoFiltro,
        email: emailFiltro,
      });
      if (res.success) {
        setPacientes(res.pacientes);
        pagPacientes.volverAlInicio();
        if (res.pacientes.length === 0) {
          setMostrarFormAlta(true);
          if (docFiltro.trim() && !docNumber) setDocNumber(docFiltro.trim());
          if (apellidoFiltro.trim() && !lastName) setLastName(apellidoFiltro.trim());
          if (emailFiltro.trim() && !emailAlta) setEmailAlta(emailFiltro.trim());
        }
      } else {
        setFeedback({
          type: "error",
          text: res.message ?? "No se pudo realizar la búsqueda.",
        });
      }
    });
  };

  const handleLimpiarBusqueda = () => {
    setDocFiltro("");
    setApellidoFiltro("");
    setEmailFiltro("");
    setFeedback(null);
    pagPacientes.volverAlInicio();
    setPacientes(
      filtrarPacientesMostrador(initialData.pacientes, {
        documento: "",
        apellido: "",
        email: "",
      })
    );
  };

  const handleSeleccionarPaciente = (paciente: PacienteMostradorItem) => {
    setFeedback(null);
    setTurnoAReprogramar(null);
    setPacienteSeleccionado(paciente);
    startTransition(async () => {
      const res = await seleccionarPacienteMostradorAction(paciente.id);
      if (res.success && res.paciente) {
        setPacienteSeleccionado(res.paciente);
        setTurnosParaGestion(res.turnosParaGestion ?? []);
        setTurnosAsistenciaYPago(res.turnosAsistenciaYPago ?? []);
      } else if (res.message) {
        setFeedback({ type: "error", text: res.message });
      }
    });
  };

  const handleRegistrarPacienteNuevo = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setErroresAlta({});

    startTransition(async () => {
      const res = await registrarPacienteMostradorAction({
        firstName,
        lastName,
        docType,
        docNumber,
        birthDate,
        phone,
        email: emailAlta,
        address,
        coverageType,
        healthInsuranceEntity:
          coverageType === "OBRA_SOCIAL" ? healthInsuranceEntity : undefined,
        healthInsurancePlan:
          coverageType === "OBRA_SOCIAL"
            ? healthInsurancePlan || "General"
            : undefined,
        healthInsuranceNumber:
          coverageType === "OBRA_SOCIAL" ? healthInsuranceNumber : undefined,
      });

      if (!res.success) {
        if (res.errors) setErroresAlta(res.errors);
        setFeedback({ type: "error", text: res.message });
        return;
      }

      if (res.paciente) {
        const nuevo = res.paciente;
        setPacientes((prev) => [
          nuevo,
          ...prev.filter((p) => p.id !== nuevo.id),
        ]);
        setPacienteSeleccionado(nuevo);
        setTurnosParaGestion([]);
        setTurnosAsistenciaYPago([]);
        setMostrarFormAlta(false);
        setFirstName("");
        setLastName("");
        setDocNumber("");
        setBirthDate("");
        setPhone("");
        setEmailAlta("");
        setAddress("");
        setHealthInsurancePlan("");
        setHealthInsuranceNumber("");
      }

      setFeedback({ type: "success", text: res.message });
      router.refresh();
    });
  };

  const handleIniciarReprogramacion = (turno: TurnoPacienteMostradorItem) => {
    setFeedback(null);
    setTurnoAReprogramar(turno);
    setTipoTurno(turno.tipoTurno);
    setEspecialidad("");
    setProfesionalId("");
    if (turno.tipoTurno === "VACUNACION" && turno.vacunaId) {
      setVacunaId(turno.vacunaId);
      if (turno.dosisPrevistaOrden) {
        setDosisPrevistaOrden(turno.dosisPrevistaOrden);
      }
    }
    reservaSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleReservarOReprogramar = (turnoDisponibleId: string) => {
    if (!pacienteSeleccionado) {
      setFeedback({
        type: "error",
        text: "Primero buscá y seleccioná un paciente (o dalo de alta) en la sección superior.",
      });
      return;
    }

    setFeedback(null);

    if (turnoAReprogramar) {
      startTransition(async () => {
        const res = await reprogramarTurnoMostradorAction({
          pacienteId: pacienteSeleccionado.id,
          turnoOriginalId: turnoAReprogramar.id,
          turnoNuevoId: turnoDisponibleId,
          tipoTurno,
          vacunaId: tipoTurno === "VACUNACION" ? vacunaId : undefined,
          dosisPrevistaOrden:
            tipoTurno === "VACUNACION" ? dosisPrevistaOrden : undefined,
          motivoConsulta:
            tipoTurno === "MEDICO" ? motivoConsulta || undefined : undefined,
        });

        if (!res.success) {
          setFeedback({ type: "error", text: res.message });
          return;
        }

        setTurnoAReprogramar(null);
        setMotivoConsulta("");
        const recarga = await seleccionarPacienteMostradorAction(
          pacienteSeleccionado.id
        );
        if (recarga.success) {
          setTurnosParaGestion(recarga.turnosParaGestion ?? []);
          setTurnosAsistenciaYPago(recarga.turnosAsistenciaYPago ?? []);
        }
        setFeedback({ type: "success", text: res.message });
        router.refresh();
      });
      return;
    }

    startTransition(async () => {
      const res = await reservarTurnoMostradorAction({
        pacienteId: pacienteSeleccionado.id,
        turnoId: turnoDisponibleId,
        tipoTurno,
        vacunaId: tipoTurno === "VACUNACION" ? vacunaId : undefined,
        dosisPrevistaOrden:
          tipoTurno === "VACUNACION" ? dosisPrevistaOrden : undefined,
        motivoConsulta:
          tipoTurno === "MEDICO" ? motivoConsulta || undefined : undefined,
      });

      if (!res.success) {
        setFeedback({ type: "error", text: res.message });
        return;
      }

      setMotivoConsulta("");
      const recarga = await seleccionarPacienteMostradorAction(
        pacienteSeleccionado.id
      );
      if (recarga.success) {
        setTurnosParaGestion(recarga.turnosParaGestion ?? []);
        setTurnosAsistenciaYPago(recarga.turnosAsistenciaYPago ?? []);
      }
      setFeedback({ type: "success", text: res.message });
      router.refresh();
    });
  };

  const handleCancelarTurno = (turno: TurnoPacienteMostradorItem) => {
    if (!pacienteSeleccionado) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await cancelarTurnoMostradorAction({
        pacienteId: pacienteSeleccionado.id,
        turnoId: turno.id,
        tipoTurno: turno.tipoTurno,
      });

      if (!res.success) {
        setFeedback({ type: "error", text: res.message });
        return;
      }

      if (turnoAReprogramar?.id === turno.id) {
        setTurnoAReprogramar(null);
      }

      const recarga = await seleccionarPacienteMostradorAction(
        pacienteSeleccionado.id
      );
      if (recarga.success) {
        setTurnosParaGestion(recarga.turnosParaGestion ?? []);
        setTurnosAsistenciaYPago(recarga.turnosAsistenciaYPago ?? []);
      }
      setFeedback({ type: "success", text: res.message });
      router.refresh();
    });
  };

  const handleMarcarAsistencia = (
    turnoId: string,
    nuevoEstado: "CUMPLIDO" | "AUSENTE"
  ) => {
    if (!pacienteSeleccionado) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await marcarAsistenciaMostradorAction({
        pacienteId: pacienteSeleccionado.id,
        turnoId,
        nuevoEstado,
      });

      if (!res.success) {
        setFeedback({ type: "error", text: res.message });
        return;
      }

      const recarga = await seleccionarPacienteMostradorAction(
        pacienteSeleccionado.id
      );
      if (recarga.success) {
        setTurnosParaGestion(recarga.turnosParaGestion ?? []);
        setTurnosAsistenciaYPago(recarga.turnosAsistenciaYPago ?? []);
      }
      setFeedback({ type: "success", text: res.message });
      router.refresh();
    });
  };

  // Paginación del lado del cliente de cada listado.
  const pagPacientes = usePaginacion(pacientes, 8);
  const pagDisponibles = usePaginacion(turnosDisponiblesFiltrados, 12);
  const pagGestion = usePaginacion(turnosParaGestion, 8);
  const pagAsistencia = usePaginacion(turnosAsistenciaYPago, 8);

  const paginador = (p: {
    pagina: number;
    totalPaginas: number;
    total: number;
    desde: number;
    hasta: number;
    setPagina: (n: number) => void;
  }) => (
    <Paginacion
      pagina={p.pagina}
      totalPaginas={p.totalPaginas}
      total={p.total}
      desde={p.desde}
      hasta={p.hasta}
      onChange={p.setPagina}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 sm:px-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary-dark sm:text-3xl">
          Mostrador — Turnos de pacientes
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Búsqueda de pacientes, alta desde el mismo flujo, gestión de turnos médicos y de vacunación, y marca de asistencia que habilita el cobro.
        </p>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* SECCIÓN 1: BUSCAR AL PACIENTE + ALTA EN EL MISMO FLUJO */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-ink">Buscar al paciente</h2>
          <button
            type="button"
            onClick={() => setMostrarFormAlta((v) => !v)}
            className="cursor-pointer rounded-lg border border-primary bg-primary-light/50 px-3.5 py-1.5 text-xs font-semibold text-primary-dark transition hover:bg-primary hover:text-white"
          >
            {mostrarFormAlta
              ? "Ocultar formulario de alta"
              : "+ Registrar paciente nuevo"}
          </button>
        </div>

        {/* Formulario inline de alta de paciente nuevo */}
        {mostrarFormAlta && (
          <form
            onSubmit={handleRegistrarPacienteNuevo}
            className="mt-4 rounded-xl border border-primary/30 bg-white p-5 shadow-xs"
          >
            <h3 className="text-base font-bold text-primary-dark">
              Alta de paciente nuevo en mostrador
            </h3>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Completá los datos personales, de contacto y cobertura médica. Al guardar, el paciente queda seleccionado para reservar su turno.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ej. María"
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                />
                {erroresAlta.firstName && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.firstName}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Apellido *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ej. García"
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                />
                {erroresAlta.lastName && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.lastName}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Tipo y N.º de documento *
                </label>
                <div className="flex gap-2">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="cursor-pointer rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                  >
                    {DOC_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    placeholder="30123456"
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                  />
                </div>
                {erroresAlta.docNumber && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.docNumber}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Fecha de nacimiento *
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                />
                {erroresAlta.birthDate && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.birthDate}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Teléfono *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="221 555-1234"
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                />
                {erroresAlta.phone && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.phone}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Email *
                </label>
                <input
                  type="email"
                  value={emailAlta}
                  onChange={(e) => setEmailAlta(e.target.value)}
                  placeholder="paciente@correo.com"
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                />
                {erroresAlta.email && (
                  <span className="text-xs text-red-600">
                    {erroresAlta.email}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">
                  Cobertura médica *
                </label>
                <select
                  value={coverageType}
                  onChange={(e) =>
                    setCoverageType(
                      e.target.value === "PARTICULAR"
                        ? "PARTICULAR"
                        : "OBRA_SOCIAL"
                    )
                  }
                  className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                >
                  <option value="OBRA_SOCIAL">Obra social / Prepaga</option>
                  <option value="PARTICULAR">Particular</option>
                </select>
              </div>

              {coverageType === "OBRA_SOCIAL" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-ink">
                      Obra social *
                    </label>
                    <select
                      value={healthInsuranceEntity}
                      onChange={(e) => setHealthInsuranceEntity(e.target.value)}
                      className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                    >
                      {obrasSocialesDisponibles.map((nombre) => (
                        <option key={nombre} value={nombre}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                    {erroresAlta.healthInsuranceEntity && (
                      <span className="text-xs text-red-600">
                        {erroresAlta.healthInsuranceEntity}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-ink">
                      N.º de afiliado / credencial *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={healthInsuranceNumber}
                        onChange={(e) =>
                          setHealthInsuranceNumber(e.target.value)
                        }
                        placeholder="N.º de afiliado"
                        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={healthInsurancePlan}
                        onChange={(e) => setHealthInsurancePlan(e.target.value)}
                        placeholder="Plan (opc.)"
                        className="w-32 rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                      />
                    </div>
                    {erroresAlta.healthInsuranceNumber && (
                      <span className="text-xs text-red-600">
                        {erroresAlta.healthInsuranceNumber}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                Registrar paciente y seleccionar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setMostrarFormAlta(false)}
                className="cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink-secondary hover:bg-neutral-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc" className="text-xs font-semibold text-ink">
              Documento
            </label>
            <input
              id="doc"
              type="text"
              value={docFiltro}
              onChange={(e) => setDocFiltro(e.target.value)}
              placeholder="30.123.456"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ape" className="text-xs font-semibold text-ink">
              Apellido
            </label>
            <input
              id="ape"
              type="text"
              value={apellidoFiltro}
              onChange={(e) => setApellidoFiltro(e.target.value)}
              placeholder="García"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-ink">
              Email
            </label>
            <input
              id="email"
              type="text"
              value={emailFiltro}
              onChange={(e) => setEmailFiltro(e.target.value)}
              placeholder="nombre@correo.com"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleBuscarPacientes}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            Buscar
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleLimpiarBusqueda}
            className="cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink-secondary hover:bg-neutral-50 disabled:opacity-50"
          >
            Limpiar
          </button>
        </div>

        {/* Lista de pacientes encontrados */}
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
          {pacientes.length === 0 ? (
            <li className="flex flex-col items-start justify-between gap-2 px-4 py-3 text-sm text-ink-secondary sm:flex-row sm:items-center">
              <span>
                No se encontraron pacientes registrados con esos criterios.
              </span>
              <button
                type="button"
                onClick={() => setMostrarFormAlta(true)}
                className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark"
              >
                Dar de alta paciente nuevo
              </button>
            </li>
          ) : (
            pagPacientes.items.map((p) => {
              const esActivo = pacienteSeleccionado?.id === p.id;
              return (
                <li
                  key={p.id}
                  className={`flex flex-col items-start justify-between gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center ${
                    esActivo ? "bg-primary-light/40" : ""
                  }`}
                >
                  <div>
                    <span className="font-semibold text-ink">{p.fullName}</span>
                    <span className="text-ink-secondary">
                      {" "}
                      — {p.docNumber ?? "Sin documento"} — {p.coberturaLabel}
                    </span>
                    <span className="ml-2 text-xs text-ink-secondary">
                      ({p.email})
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSeleccionarPaciente(p)}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      esActivo
                        ? "border border-primary bg-primary text-white hover:bg-primary-dark"
                        : "border border-line bg-white text-ink hover:border-primary hover:bg-primary-light/30"
                    }`}
                  >
                    {esActivo ? "Seleccionado" : "Seleccionar"}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {paginador(pagPacientes)}
      </section>

      {/* SECCIÓN 2: RESERVAR UN TURNO (O ELEGIR NUEVO TURNO EN REPROGRAMACIÓN) */}
      <section
        ref={reservaSectionRef}
        className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-ink">
            {turnoAReprogramar
              ? "Seleccionar nuevo horario para reprogramar turno"
              : "Reservar un turno"}
          </h2>
          {turnoAReprogramar && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTurnoAReprogramar(null)}
                className="cursor-pointer rounded-lg border border-amber-500 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Cancelar reprogramación
              </button>
            </div>
          )}
        </div>

        {turnoAReprogramar && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <strong>Modo reprogramación activo:</strong> Estás reprogramando el turno original del{" "}
            <strong>
              {turnoAReprogramar.fechaFormateada} a las{" "}
              {turnoAReprogramar.startTime}
            </strong>{" "}
            con <strong>{turnoAReprogramar.profesionalNombre}</strong>. Al confirmar un nuevo horario abajo, el sistema cancelará el turno original (sin editarlo) y reservará el nuevo turno en una sola operación.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo" className="text-xs font-semibold text-ink">
              Tipo de turno
            </label>
            <select
              id="tipo"
              disabled={Boolean(turnoAReprogramar)}
              value={tipoTurno}
              onChange={(e) => {
                const nuevoTipo =
                  e.target.value === "VACUNACION" ? "VACUNACION" : "MEDICO";
                setTipoTurno(nuevoTipo);
                setEspecialidad("");
                setProfesionalId("");
              }}
              className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-100"
            >
              <option value="MEDICO">Médico</option>
              <option value="VACUNACION">Vacunación</option>
            </select>
          </div>

          {tipoTurno === "MEDICO" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="esp" className="text-xs font-semibold text-ink">
                  Especialidad
                </label>
                <select
                  id="esp"
                  value={especialidad}
                  onChange={(e) => {
                    setEspecialidad(e.target.value as MedicalSpecialty | "");
                    setProfesionalId("");
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                >
                  <option value="">Todas las especialidades</option>
                  {ESPECIALIDADES.map((esp) => (
                    <option key={esp} value={esp}>
                      {SPECIALTY_LABELS[esp]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="prof" className="text-xs font-semibold text-ink">
                  Profesional
                </label>
                <select
                  id="prof"
                  value={profesionalId}
                  onChange={(e) => setProfesionalId(e.target.value)}
                  className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                >
                  <option value="">Todos los profesionales</option>
                  {profesionalesFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.specialtyLabel})
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="vacuna"
                  className="text-xs font-semibold text-ink"
                >
                  Vacuna del catálogo
                </label>
                <select
                  id="vacuna"
                  value={vacunaId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setVacunaId(nextId);
                    const found = initialData.vacunas.find(
                      (v) => v.id === nextId
                    );
                    if (found?.dosis[0]) {
                      setDosisPrevistaOrden(found.dosis[0].orden);
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                >
                  {initialData.vacunas.length === 0 ? (
                    <option value="">Sin vacunas activas en catálogo</option>
                  ) : (
                    initialData.vacunas.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.denominacion} — {v.laboratorio}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="dosis"
                  className="text-xs font-semibold text-ink"
                >
                  Dosis prevista
                </label>
                <select
                  id="dosis"
                  value={dosisPrevistaOrden}
                  onChange={(e) =>
                    setDosisPrevistaOrden(Number(e.target.value) || 1)
                  }
                  className="cursor-pointer rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink transition hover:border-primary/60 focus:border-primary focus:outline-none"
                >
                  {vacunaSeleccionadaObj && vacunaSeleccionadaObj.dosis.length > 0 ? (
                    vacunaSeleccionadaObj.dosis.map((d) => (
                      <option key={d.orden} value={d.orden}>
                        {d.etiqueta}
                      </option>
                    ))
                  ) : (
                    <option value={1}>1.ª dosis / Dosis única</option>
                  )}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="px-4 py-3">Día</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Profesional / Sala</th>
                <th className="px-4 py-3 text-right">
                  {turnoAReprogramar ? "Reprogramar" : "Reservar"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {turnosDisponiblesFiltrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-ink-secondary"
                  >
                    No hay turnos disponibles para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                pagDisponibles.items.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-medium text-ink">
                      {t.fechaFormateada}
                    </td>
                    <td className="px-4 py-3 text-ink">{t.startTime}</td>
                    <td className="px-4 py-3 text-ink">
                      {t.profesionalNombre}{" "}
                      <span className="text-xs text-ink-secondary">
                        · {t.especialidadOVacunatorio}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={isPending || !pacienteSeleccionado}
                        onClick={() => handleReservarOReprogramar(t.id)}
                        className="cursor-pointer rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {turnoAReprogramar
                          ? "Confirmar reprogramación"
                          : "Reservar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {paginador(pagDisponibles)}
      </section>

      {/* SECCIÓN 3: REPROGRAMAR O CANCELAR TURNOS DEL PACIENTE */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink">Reprogramar o cancelar</h2>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="px-4 py-3">Día</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Profesional</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!pacienteSeleccionado ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-ink-secondary"
                  >
                    Seleccioná un paciente para ver sus turnos reservados.
                  </td>
                </tr>
              ) : turnosParaGestion.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-ink-secondary"
                  >
                    El paciente seleccionado no registra turnos reservados ni cancelados.
                  </td>
                </tr>
              ) : (
                pagGestion.items.map((t) => {
                  const enModoReprog = turnoAReprogramar?.id === t.id;
                  return (
                    <tr
                      key={t.id}
                      className={
                        enModoReprog
                          ? "bg-amber-50/70"
                          : "hover:bg-neutral-50/80"
                      }
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {t.fechaFormateada}
                      </td>
                      <td className="px-4 py-3 text-ink">{t.startTime}</td>
                      <td className="px-4 py-3 text-ink">
                        {t.profesionalNombre}{" "}
                        <span className="text-xs text-ink-secondary">
                          · {t.especialidadOVacunatorio}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            t.status === "RESERVADO"
                              ? "bg-blue-100 text-blue-900"
                              : "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {t.estadoLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.puedeReprogramarOCancelar ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleIniciarReprogramacion(t)}
                              className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary hover:bg-primary-light/40 disabled:opacity-50"
                            >
                              {enModoReprog
                                ? "Eligiendo nuevo turno…"
                                : "Reprogramar"}
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleCancelarTurno(t)}
                              className="cursor-pointer rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:border-red-400 hover:bg-red-100 disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-secondary">
                            Sin acciones disponibles
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {paginador(pagGestion)}
      </section>

      {/* SECCIÓN 4: MARCAR ASISTENCIA DE TURNOS YA OCURRIDOS */}
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold text-ink">
          Marcar asistencia de turnos ya ocurridos
        </h2>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <th className="px-4 py-3">Día</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Profesional</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!pacienteSeleccionado ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-ink-secondary"
                  >
                    Seleccioná un paciente para gestionar la asistencia de sus turnos.
                  </td>
                </tr>
              ) : turnosAsistenciaYPago.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-ink-secondary"
                  >
                    No hay turnos del día de hoy o anteriores para marcar asistencia en este paciente.
                  </td>
                </tr>
              ) : (
                pagAsistencia.items.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3 font-medium text-ink">
                      {t.fechaFormateada}
                    </td>
                    <td className="px-4 py-3 text-ink">{t.startTime}</td>
                    <td className="px-4 py-3 text-ink">
                      {t.profesionalNombre}{" "}
                      <span className="text-xs text-ink-secondary">
                        · {t.especialidadOVacunatorio}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          t.status === "CUMPLIDO"
                            ? "bg-emerald-100 text-emerald-900"
                            : t.status === "AUSENTE"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-100 text-blue-900"
                        }`}
                      >
                        {t.estadoLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.puedeMarcarAsistenciaHoy ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleMarcarAsistencia(t.id, "CUMPLIDO")
                            }
                            className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                          >
                            Marcar cumplido
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleMarcarAsistencia(t.id, "AUSENTE")
                            }
                            className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink-secondary hover:bg-neutral-100 disabled:opacity-50"
                          >
                            Marcar ausente
                          </button>
                        </div>
                      ) : t.habilitaPago ? (
                        t.pagoId ? (
                          <a
                            href={`/api/comprobantes/${t.pagoId}`}
                            className="cursor-pointer inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                          >
                            Descargar comprobante
                          </a>
                        ) : (
                          <Link
                            href={`/dashboard/pagos/${t.id}`}
                            className="cursor-pointer inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark"
                          >
                            Registrar pago
                          </Link>
                        )
                      ) : (
                        <span className="text-xs text-ink-secondary">
                          {t.tipoTurno === "VACUNACION"
                            ? "Se acredita al registrar la dosis (US-29)"
                            : "Asistencia registrada"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {paginador(pagAsistencia)}
      </section>
    </div>
  );
}
