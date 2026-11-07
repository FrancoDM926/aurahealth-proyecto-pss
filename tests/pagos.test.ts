import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  armarHistorialVigencias,
  calcularImporte,
  descuentoParaCobertura,
  formatearNumeroComprobante,
  formatearPesos,
  pesosACentavos,
  precioVigenteEn,
  puedeDescargarComprobante,
  resolverCobertura,
  validarDescuentoPorcentaje,
  validarNombreObraSocial,
  validarPrecioConsulta,
  validarRegistroPago,
  type VigenciaPrecio,
} from "@/lib/pagos";

// Historial del wireframe wf_costo_consulta.html.
const VIGENCIAS: VigenciaPrecio[] = [
  { vigenteDesde: "2026-03-01", montoCentavos: 1_500_000 },
  { vigenteDesde: "2026-07-01", montoCentavos: 1_650_000 },
  { vigenteDesde: "2026-10-01", montoCentavos: 1_800_000 },
];
const HOY = "2026-11-07";

describe("Importes en pesos", () => {
  it("formatea como los wireframes: sin decimales si el importe es entero", () => {
    assert.equal(formatearPesos(1_800_000), "$ 18.000");
    assert.equal(formatearPesos(1_260_000), "$ 12.600");
    assert.equal(formatearPesos(0), "$ 0");
    assert.equal(formatearPesos(1_260_050), "$ 12.600,50");
    assert.equal(formatearPesos(5), "$ 0,05");
  });

  it("interpreta lo que escribe el usuario (miles con punto, decimales con coma)", () => {
    assert.equal(pesosACentavos("18000"), 1_800_000);
    assert.equal(pesosACentavos("18.000"), 1_800_000);
    assert.equal(pesosACentavos("18.000,50"), 1_800_050);
    assert.equal(pesosACentavos("18000,5"), 1_800_050);
    assert.equal(pesosACentavos("18000.50"), 1_800_050);
    assert.equal(pesosACentavos("$ 18.000"), 1_800_000);
  });

  it("rechaza textos que no son un importe", () => {
    for (const malo of ["", "   ", "abc", "-5", "1.2.3", "18,000,5", "12,345"]) {
      assert.equal(pesosACentavos(malo), null, `«${malo}» no debería ser válido`);
    }
  });
});

describe("US-33 — Precio de la consulta con historial de vigencias", () => {
  it("el precio vigente es la vigencia más reciente que ya rige", () => {
    assert.deepEqual(precioVigenteEn(VIGENCIAS, HOY), VIGENCIAS[2]);
    assert.deepEqual(precioVigenteEn(VIGENCIAS, "2026-09-15"), VIGENCIAS[1]);
    assert.deepEqual(precioVigenteEn(VIGENCIAS, "2026-03-01"), VIGENCIAS[0]);
  });

  it("antes de la primera vigencia no hay precio", () => {
    assert.equal(precioVigenteEn(VIGENCIAS, "2026-02-28"), null);
    assert.equal(precioVigenteEn([], HOY), null);
  });

  it("arma el historial del wireframe: vigente aparte y vigencias cerradas con su «hasta»", () => {
    const { vigente, historial } = armarHistorialVigencias(VIGENCIAS, HOY);
    assert.deepEqual(vigente, {
      desde: "2026-10-01",
      hasta: null,
      montoCentavos: 1_800_000,
      estado: "VIGENTE",
    });
    assert.deepEqual(historial, [
      { desde: "2026-07-01", hasta: "2026-09-30", montoCentavos: 1_650_000, estado: "CERRADO" },
      { desde: "2026-03-01", hasta: "2026-06-30", montoCentavos: 1_500_000, estado: "CERRADO" },
    ]);
  });

  it("un precio con fecha futura queda programado y el actual sigue vigente", () => {
    const { vigente, historial } = armarHistorialVigencias(
      [...VIGENCIAS, { vigenteDesde: "2026-12-01", montoCentavos: 2_000_000 }],
      HOY
    );
    assert.equal(vigente?.desde, "2026-10-01");
    assert.equal(vigente?.hasta, "2026-11-30");
    assert.equal(historial[0].estado, "PROGRAMADO");
    assert.equal(historial[0].hasta, null);
  });

  it("sin vigencias no hay precio vigente ni historial", () => {
    assert.deepEqual(armarHistorialVigencias([], HOY), { vigente: null, historial: [] });
  });

  it("acepta un precio positivo desde una fecha posterior al inicio de la vigencia actual", () => {
    const errores = validarPrecioConsulta(
      { monto: "19.500", vigenteDesde: "2026-11-15" },
      { hoy: HOY, vigencias: VIGENCIAS }
    );
    assert.deepEqual(errores, {});
  });

  it("exige un monto válido, positivo y dentro del tope", () => {
    const ctx = { hoy: HOY, vigencias: VIGENCIAS };
    assert.ok(validarPrecioConsulta({ monto: "", vigenteDesde: "2026-11-15" }, ctx).monto);
    assert.ok(validarPrecioConsulta({ monto: "abc", vigenteDesde: "2026-11-15" }, ctx).monto);
    assert.match(
      validarPrecioConsulta({ monto: "0", vigenteDesde: "2026-11-15" }, ctx).monto ?? "",
      /mayor a cero/
    );
    assert.match(
      validarPrecioConsulta({ monto: "999.999.999", vigenteDesde: "2026-11-15" }, ctx).monto ?? "",
      /no puede superar/
    );
  });

  it("rechaza una fecha anterior al inicio de la vigencia actual (error del wireframe)", () => {
    const errores = validarPrecioConsulta(
      { monto: "19000", vigenteDesde: "2026-09-30" },
      { hoy: HOY, vigencias: VIGENCIAS }
    );
    assert.match(errores.vigenteDesde ?? "", /no puede ser anterior al inicio de la vigencia actual/);
    assert.match(errores.vigenteDesde ?? "", /01\/10\/2026/);
  });

  it("no pisa el historial: rechaza una fecha de vigencia ya cargada", () => {
    const errores = validarPrecioConsulta(
      { monto: "19000", vigenteDesde: "2026-10-01" },
      { hoy: HOY, vigencias: VIGENCIAS }
    );
    assert.match(errores.vigenteDesde ?? "", /Ya existe un precio con esa fecha/);
  });

  it("rechaza una fecha vacía o inexistente", () => {
    const ctx = { hoy: HOY, vigencias: VIGENCIAS };
    assert.ok(validarPrecioConsulta({ monto: "1000", vigenteDesde: "" }, ctx).vigenteDesde);
    assert.ok(validarPrecioConsulta({ monto: "1000", vigenteDesde: "2026-02-31" }, ctx).vigenteDesde);
  });

  it("el primer precio del médico puede cargarse con cualquier fecha", () => {
    assert.deepEqual(
      validarPrecioConsulta({ monto: "18000", vigenteDesde: "2026-01-01" }, { hoy: HOY, vigencias: [] }),
      {}
    );
  });
});

describe("US-34 — Cálculo del importe según la cobertura", () => {
  it("aplica el descuento de la obra social sobre el precio sin cobertura (ejemplo del wireframe: IOMA 30%)", () => {
    assert.deepEqual(calcularImporte(1_800_000, 30), {
      precioSinCoberturaCentavos: 1_800_000,
      descuentoPorcentaje: 30,
      descuentoCentavos: 540_000,
      importeCentavos: 1_260_000,
    });
  });

  it("un paciente particular abona el precio completo", () => {
    const r = calcularImporte(1_800_000, 0);
    assert.equal(r.descuentoCentavos, 0);
    assert.equal(r.importeCentavos, 1_800_000);
  });

  it("redondea el descuento al centavo", () => {
    // 33% de $10,01 = $3,3033 → 33 centavos de descuento.
    const r = calcularImporte(1_001, 33);
    assert.equal(r.descuentoCentavos, 330);
    assert.equal(r.importeCentavos, 671);
  });

  it("limita el porcentaje al rango 0–100", () => {
    assert.equal(calcularImporte(1_000, 150).importeCentavos, 0);
    assert.equal(calcularImporte(1_000, -10).importeCentavos, 1_000);
  });

  it("valida el porcentaje de descuento que configura el administrador", () => {
    assert.equal(validarDescuentoPorcentaje(0), null);
    assert.equal(validarDescuentoPorcentaje(30), null);
    assert.equal(validarDescuentoPorcentaje(100), null);
    assert.ok(validarDescuentoPorcentaje(-1));
    assert.ok(validarDescuentoPorcentaje(101));
    assert.ok(validarDescuentoPorcentaje(12.5));
    assert.ok(validarDescuentoPorcentaje(Number.NaN));
  });

  it("valida el nombre de una obra social nueva", () => {
    assert.equal(validarNombreObraSocial("Galeno"), null);
    assert.ok(validarNombreObraSocial("   "));
    assert.ok(validarNombreObraSocial("x".repeat(51)));
  });

  it("si el turno es de otra persona se aplica SU cobertura, no la de quien reservó", () => {
    const cobertura = resolverCobertura({
      personaAtendida: { healthInsuranceEntity: "IOMA", healthInsurancePlan: "2-1100" },
      titular: { coverageType: "OBRA_SOCIAL", healthInsuranceEntity: "OSDE", healthInsurancePlan: "210" },
    });
    assert.deepEqual(cobertura, { entidad: "IOMA", plan: "2-1100" });
  });

  it("si el turno es propio rige la cobertura del titular; sin cobertura es particular", () => {
    assert.deepEqual(
      resolverCobertura({
        personaAtendida: null,
        titular: { coverageType: "OBRA_SOCIAL", healthInsuranceEntity: "OSDE", healthInsurancePlan: "210" },
      }),
      { entidad: "OSDE", plan: "210" }
    );
    assert.deepEqual(
      resolverCobertura({
        personaAtendida: null,
        titular: { coverageType: "PARTICULAR", healthInsuranceEntity: "OSDE", healthInsurancePlan: null },
      }),
      { entidad: null, plan: null }
    );
  });

  it("el descuento sale del listado del administrador; particulares y entidades sin cargar no reciben", () => {
    const obras = [
      { nombre: "IOMA", descuentoPorcentaje: 30 },
      { nombre: "OSDE", descuentoPorcentaje: 20 },
    ];
    assert.deepEqual(descuentoParaCobertura({ entidad: "ioma", plan: null }, obras), {
      descuentoPorcentaje: 30,
      configurada: true,
    });
    assert.deepEqual(descuentoParaCobertura({ entidad: null, plan: null }, obras), {
      descuentoPorcentaje: 0,
      configurada: true,
    });
    assert.deepEqual(descuentoParaCobertura({ entidad: "Galeno", plan: null }, obras), {
      descuentoPorcentaje: 0,
      configurada: false,
    });
  });
});

describe("US-35 — Registro del pago", () => {
  const base = {
    rol: "ADMINISTRATIVO" as const,
    turnoStatus: "CUMPLIDO" as const,
    medio: "EFECTIVO",
    referencia: undefined,
    tienePagoActivo: false,
    tienePrecio: true,
  };

  it("registra un pago en efectivo sobre un turno cumplido, sin referencia", () => {
    assert.deepEqual(validarRegistroPago(base), { valid: true, medio: "EFECTIVO", referencia: null });
    // La referencia solo corresponde a la transferencia: en efectivo se descarta.
    assert.deepEqual(validarRegistroPago({ ...base, referencia: "123" }), {
      valid: true,
      medio: "EFECTIVO",
      referencia: null,
    });
  });

  it("la transferencia se registra contra la referencia de la operación", () => {
    assert.deepEqual(validarRegistroPago({ ...base, medio: "TRANSFERENCIA", referencia: "  OP-884213 " }), {
      valid: true,
      medio: "TRANSFERENCIA",
      referencia: "OP-884213",
    });
    const sinRef = validarRegistroPago({ ...base, medio: "TRANSFERENCIA", referencia: "  " });
    assert.equal(sinRef.valid, false);
    const larga = validarRegistroPago({ ...base, medio: "TRANSFERENCIA", referencia: "x".repeat(101) });
    assert.equal(larga.valid, false);
  });

  it("solo admite efectivo y transferencia", () => {
    for (const medio of ["TARJETA", "MERCADOPAGO", "", null, undefined, 3]) {
      assert.equal(validarRegistroPago({ ...base, medio }).valid, false, `medio ${String(medio)}`);
    }
  });

  it("solo el personal administrativo registra pagos (el efectivo, en particular)", () => {
    for (const rol of ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRADOR"] as const) {
      assert.equal(validarRegistroPago({ ...base, rol }).valid, false, `rol ${rol}`);
      assert.equal(validarRegistroPago({ ...base, rol, medio: "TRANSFERENCIA", referencia: "1" }).valid, false);
    }
  });

  it("solo se cobra un turno cumplido", () => {
    for (const turnoStatus of ["DISPONIBLE", "RESERVADO", "AUSENTE", "CANCELADO"] as const) {
      const r = validarRegistroPago({ ...base, turnoStatus });
      assert.equal(r.valid, false, `estado ${turnoStatus}`);
    }
  });

  it("un turno no puede tener dos pagos activos", () => {
    const r = validarRegistroPago({ ...base, tienePagoActivo: true });
    assert.deepEqual(r, { valid: false, error: "Ya existe un pago activo para este turno." });
  });

  it("sin precio de consulta configurado no se puede cerrar el cobro (US-34)", () => {
    const r = validarRegistroPago({ ...base, tienePrecio: false });
    assert.equal(r.valid, false);
    if (!r.valid) assert.match(r.error, /precio de su consulta/);
  });
});

describe("US-36 — Comprobante", () => {
  it("numera con ceros a la izquierda, como el wireframe", () => {
    assert.equal(formatearNumeroComprobante(123), "000123");
    assert.equal(formatearNumeroComprobante(1), "000001");
    assert.equal(formatearNumeroComprobante(1234567), "1234567");
  });

  it("la descarga es para quien reservó el turno y para el personal administrativo", () => {
    assert.equal(
      puedeDescargarComprobante({ rol: "USUARIO", usuarioId: "u1", turnoReservadoPorId: "u1" }),
      true
    );
    assert.equal(
      puedeDescargarComprobante({ rol: "ADMINISTRATIVO", usuarioId: "adm", turnoReservadoPorId: "u1" }),
      true
    );
  });

  it("los demás —otro paciente, médico, enfermera, administrador— no pueden descargarlo", () => {
    for (const rol of ["USUARIO", "MEDICO", "ENFERMERA", "ADMINISTRADOR"] as const) {
      assert.equal(
        puedeDescargarComprobante({ rol, usuarioId: "otro", turnoReservadoPorId: "u1" }),
        false,
        `rol ${rol}`
      );
    }
  });

  it("si el turno perdió a quien lo reservó, solo el personal administrativo accede", () => {
    assert.equal(
      puedeDescargarComprobante({ rol: "USUARIO", usuarioId: "u1", turnoReservadoPorId: null }),
      false
    );
  });
});
