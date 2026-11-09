/**
 * US-45: Reporte de turnos por especialidad (RF-REP-01, RN-08, RF-REP-05).
 *
 * Criterios de aceptación:
 * 1. Muestra turnos totales, cumplidos, ausentes y cancelados por especialidad.
 * 2. Puede desglosarse por profesional.
 * 3. Admite un rango de fechas definido por el usuario (por defecto el mes en curso).
 * 4. Incluye una representación gráfica de la distribución.
 */

import type { EstadoTurno, MedicalSpecialty, Role } from "@/generated/prisma/client";

export type EspecialidadReporteKey =
  | "TRAUMATOLOGIA"
  | "CLINICA_MEDICA"
  | "PEDIATRIA"
  | "VACUNATORIO";

/** Orden del selector y de la tabla/gráfico según el wireframe `wf_reporte_turnos.html`. */
export const ESPECIALIDADES_REPORTE: EspecialidadReporteKey[] = [
  "TRAUMATOLOGIA",
  "CLINICA_MEDICA",
  "PEDIATRIA",
  "VACUNATORIO",
];

export const ESPECIALIDAD_REPORTE_LABELS: Record<EspecialidadReporteKey, string> = {
  TRAUMATOLOGIA: "Traumatología",
  CLINICA_MEDICA: "Clínica Médica",
  PEDIATRIA: "Pediatría",
  VACUNATORIO: "Vacunatorio",
};

export type FiltrosReporteTurnosInput = {
  desde?: string | null;
  hasta?: string | null;
  especialidad?: string | null;
};

export type FiltrosReporteTurnosNormalizados = {
  desde: string;
  hasta: string;
  especialidad: EspecialidadReporteKey | "";
  especialidadLabel: string;
  periodoLabel: string;
  error: string | null;
};

export type TurnoReporteCandidato = {
  id: string;
  /** Fecha del turno en formato "YYYY-MM-DD" */
  date: string;
  status: EstadoTurno;
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  doctorRole: Role;
  doctorSpecialty: MedicalSpecialty | null;
};

export type ProfesionalReporteInfo = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  specialty: MedicalSpecialty | null;
  isActive?: boolean;
};

export type FilaReporteEspecialidad = {
  especialidad: EspecialidadReporteKey;
  especialidadLabel: string;
  total: number;
  cumplidos: number;
  ausentes: number;
  cancelados: number;
  reservados: number;
  /** Altura relativa (0 a 100) respecto del máximo del período para el gráfico de barras. */
  porcentajeBarra: number;
};

export type FilaDesgloseProfesional = {
  profesionalId: string;
  profesionalNombre: string;
  especialidad: EspecialidadReporteKey;
  especialidadLabel: string;
  total: number;
  cumplidos: number;
  ausentes: number;
  cancelados: number;
  reservados: number;
};

export type ResumenTotalesReporte = {
  total: number;
  cumplidos: number;
  ausentes: number;
  cancelados: number;
  reservados: number;
};

export type ResultadoReporteTurnos = {
  filtros: FiltrosReporteTurnosNormalizados;
  rangoDefecto: { desde: string; hasta: string };
  porEspecialidad: FilaReporteEspecialidad[];
  porProfesional: FilaDesgloseProfesional[];
  totalesGenerales: ResumenTotalesReporte;
  maxTotalEspecialidad: number;
};

function esFechaIsoValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function formatearFechaReporteAr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * RF-REP-05 (US-49): El rango de fechas por defecto en todos los reportes es el
 * mes en curso (del día 01 al último día del mes actual en hora de Argentina).
 */
export function rangoMesEnCurso(hoyArgentina: string): {
  desde: string;
  hasta: string;
} {
  const base = esFechaIsoValida(hoyArgentina) ? hoyArgentina : "2026-11-01";
  const [y, m] = base.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  const dd = String(ultimoDia).padStart(2, "0");
  return {
    desde: `${y}-${mm}-01`,
    hasta: `${y}-${mm}-${dd}`,
  };
}

export function esEspecialidadReporteValida(
  valor: unknown
): valor is EspecialidadReporteKey {
  return (
    typeof valor === "string" &&
    (ESPECIALIDADES_REPORTE as string[]).includes(valor)
  );
}

export function normalizarFiltrosReporteTurnos(
  input: FiltrosReporteTurnosInput,
  hoyArgentina: string
): FiltrosReporteTurnosNormalizados {
  const defecto = rangoMesEnCurso(hoyArgentina);
  const rawDesde = input.desde?.trim() || defecto.desde;
  const rawHasta = input.hasta?.trim() || defecto.hasta;
  const rawEsp = input.especialidad?.trim() ?? "";

  const especialidad: EspecialidadReporteKey | "" = esEspecialidadReporteValida(rawEsp)
    ? rawEsp
    : "";

  const especialidadLabel = especialidad
    ? ESPECIALIDAD_REPORTE_LABELS[especialidad]
    : "Todas";

  let error: string | null = null;
  if (!esFechaIsoValida(rawDesde) || !esFechaIsoValida(rawHasta)) {
    error = "Las fechas ingresadas no son válidas. Utilizá el formato AAAA-MM-DD.";
  } else if (rawDesde > rawHasta) {
    error = "La fecha «Desde» no puede ser posterior a la fecha «Hasta».";
  }

  return {
    desde: rawDesde,
    hasta: rawHasta,
    especialidad,
    especialidadLabel,
    periodoLabel: `${formatearFechaReporteAr(rawDesde)} al ${formatearFechaReporteAr(rawHasta)}`,
    error,
  };
}

/**
 * RN-08: Resuelve la especialidad del reporte a partir del rol y la especialidad
 * médica del profesional. Las enfermeras corresponden a «Vacunatorio».
 */
export function resolverEspecialidadReporte(prof: {
  role: Role;
  specialty?: MedicalSpecialty | null;
}): EspecialidadReporteKey | null {
  if (prof.role === "ENFERMERA") {
    return "VACUNATORIO";
  }
  if (
    prof.role === "MEDICO" &&
    prof.specialty &&
    esEspecialidadReporteValida(prof.specialty)
  ) {
    return prof.specialty;
  }
  return null;
}

/**
 * Formatea el nombre del profesional según el wireframe `wf_reporte_turnos.html`:
 * - Médico: "Dr. Nombre Apellido"
 * - Enfermera: "Enf. Nombre Apellido"
 */
export function formatearNombreProfesionalReporte(prof: {
  firstName: string;
  lastName: string;
  role: Role;
}): string {
  const prefijo = prof.role === "ENFERMERA" ? "Enf." : "Dr.";
  const nombre = `${prof.firstName} ${prof.lastName}`.trim();
  return `${prefijo} ${nombre}`;
}

/**
 * Calcula los totales por especialidad, los porcentajes para la representación
 * gráfica y el desglose por profesional dentro del período y filtros indicados.
 *
 * Solo contabiliza turnos demandados (RESERVADO, CUMPLIDO, AUSENTE, CANCELADO),
 * excluyendo los huecos libres en estado DISPONIBLE.
 */
export function calcularReporteTurnos(params: {
  turnos: TurnoReporteCandidato[];
  profesionales?: ProfesionalReporteInfo[];
  filtros: FiltrosReporteTurnosNormalizados;
  rangoDefecto: { desde: string; hasta: string };
}): ResultadoReporteTurnos {
  const { turnos, profesionales = [], filtros, rangoDefecto } = params;

  const especialidadesVisibles: EspecialidadReporteKey[] = filtros.especialidad
    ? [filtros.especialidad]
    : [...ESPECIALIDADES_REPORTE];

  const mapaEspecialidades = new Map<
    EspecialidadReporteKey,
    {
      total: number;
      cumplidos: number;
      ausentes: number;
      cancelados: number;
      reservados: number;
    }
  >();

  for (const esp of especialidadesVisibles) {
    mapaEspecialidades.set(esp, {
      total: 0,
      cumplidos: 0,
      ausentes: 0,
      cancelados: 0,
      reservados: 0,
    });
  }

  const mapaProfesionales = new Map<
    string,
    {
      profesionalId: string;
      profesionalNombre: string;
      especialidad: EspecialidadReporteKey;
      especialidadLabel: string;
      total: number;
      cumplidos: number;
      ausentes: number;
      cancelados: number;
      reservados: number;
    }
  >();

  // Pre-cargar profesionales activos que correspondan al filtro de especialidad
  for (const prof of profesionales) {
    const esp = resolverEspecialidadReporte(prof);
    if (!esp) continue;
    if (filtros.especialidad && esp !== filtros.especialidad) continue;

    mapaProfesionales.set(prof.id, {
      profesionalId: prof.id,
      profesionalNombre: formatearNombreProfesionalReporte(prof),
      especialidad: esp,
      especialidadLabel: ESPECIALIDAD_REPORTE_LABELS[esp],
      total: 0,
      cumplidos: 0,
      ausentes: 0,
      cancelados: 0,
      reservados: 0,
    });
  }

  if (!filtros.error) {
    for (const turno of turnos) {
      // Los huecos libres (DISPONIBLE) no son turnos demandados del período.
      if (turno.status === "DISPONIBLE") continue;
      if (turno.date < filtros.desde || turno.date > filtros.hasta) continue;

      const esp = resolverEspecialidadReporte({
        role: turno.doctorRole,
        specialty: turno.doctorSpecialty,
      });
      if (!esp) continue;
      if (filtros.especialidad && esp !== filtros.especialidad) continue;

      const acumEsp = mapaEspecialidades.get(esp);
      if (acumEsp) {
        acumEsp.total += 1;
        if (turno.status === "CUMPLIDO") acumEsp.cumplidos += 1;
        else if (turno.status === "AUSENTE") acumEsp.ausentes += 1;
        else if (turno.status === "CANCELADO") acumEsp.cancelados += 1;
        else if (turno.status === "RESERVADO") acumEsp.reservados += 1;
      }

      let acumProf = mapaProfesionales.get(turno.doctorId);
      if (!acumProf) {
        acumProf = {
          profesionalId: turno.doctorId,
          profesionalNombre: formatearNombreProfesionalReporte({
            firstName: turno.doctorFirstName,
            lastName: turno.doctorLastName,
            role: turno.doctorRole,
          }),
          especialidad: esp,
          especialidadLabel: ESPECIALIDAD_REPORTE_LABELS[esp],
          total: 0,
          cumplidos: 0,
          ausentes: 0,
          cancelados: 0,
          reservados: 0,
        };
        mapaProfesionales.set(turno.doctorId, acumProf);
      }

      acumProf.total += 1;
      if (turno.status === "CUMPLIDO") acumProf.cumplidos += 1;
      else if (turno.status === "AUSENTE") acumProf.ausentes += 1;
      else if (turno.status === "CANCELADO") acumProf.cancelados += 1;
      else if (turno.status === "RESERVADO") acumProf.reservados += 1;
    }
  }

  const filasEspBase = especialidadesVisibles.map((esp) => {
    const datos = mapaEspecialidades.get(esp)!;
    return {
      especialidad: esp,
      especialidadLabel: ESPECIALIDAD_REPORTE_LABELS[esp],
      ...datos,
    };
  });

  const maxTotalEspecialidad = filasEspBase.reduce(
    (max, f) => (f.total > max ? f.total : max),
    0
  );

  const porEspecialidad: FilaReporteEspecialidad[] = filasEspBase.map((f) => ({
    ...f,
    porcentajeBarra:
      maxTotalEspecialidad > 0
        ? Math.round((f.total / maxTotalEspecialidad) * 100)
        : 0,
  }));

  const ordenEspecialidad = new Map<EspecialidadReporteKey, number>(
    ESPECIALIDADES_REPORTE.map((e, idx) => [e, idx])
  );

  const porProfesional: FilaDesgloseProfesional[] = [
    ...mapaProfesionales.values(),
  ].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const idxA = ordenEspecialidad.get(a.especialidad) ?? 99;
    const idxB = ordenEspecialidad.get(b.especialidad) ?? 99;
    if (idxA !== idxB) return idxA - idxB;
    return a.profesionalNombre.localeCompare(b.profesionalNombre, "es-AR");
  });

  const totalesGenerales: ResumenTotalesReporte = porEspecialidad.reduce(
    (acc, fila) => ({
      total: acc.total + fila.total,
      cumplidos: acc.cumplidos + fila.cumplidos,
      ausentes: acc.ausentes + fila.ausentes,
      cancelados: acc.cancelados + fila.cancelados,
      reservados: acc.reservados + fila.reservados,
    }),
    { total: 0, cumplidos: 0, ausentes: 0, cancelados: 0, reservados: 0 }
  );

  return {
    filtros,
    rangoDefecto,
    porEspecialidad,
    porProfesional,
    totalesGenerales,
    maxTotalEspecialidad,
  };
}
