"use client";

import { Badge, TBODY, TD, TH, THEAD_TR, Tabla } from "@/components/pagos-ui";
import { Paginacion, usePaginacion } from "@/components/paginacion";

export type FilaAccesoTabla = {
  id: string;
  fechaHoraTexto: string;
  usuarioNombre: string;
  pacienteNombre: string;
  tipoLabel: string;
  resultadoLabel: string;
  tono: "ok" | "error";
  detalle: string | null;
};

/** Registro de accesos con paginación del lado del cliente. */
export function TablaAccesos({ filas }: { filas: FilaAccesoTabla[] }) {
  const pag = usePaginacion(filas, 10);

  return (
    <>
      <Tabla>
        <thead>
          <tr className={THEAD_TR}>
            <th className={TH}>Fecha y hora</th>
            <th className={TH}>Usuario</th>
            <th className={TH}>Paciente</th>
            <th className={TH}>Tipo de acceso</th>
            <th className={TH}>Resultado</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {pag.items.map((fila) => (
            <tr key={fila.id} title={fila.detalle ?? undefined}>
              <td className={`${TD} whitespace-nowrap`}>{fila.fechaHoraTexto}</td>
              <td className={TD}>{fila.usuarioNombre}</td>
              <td className={TD}>{fila.pacienteNombre}</td>
              <td className={TD}>{fila.tipoLabel}</td>
              <td className={TD}>
                <Badge tono={fila.tono}>{fila.resultadoLabel}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <Paginacion
        pagina={pag.pagina}
        totalPaginas={pag.totalPaginas}
        total={pag.total}
        desde={pag.desde}
        hasta={pag.hasta}
        onChange={pag.setPagina}
      />
    </>
  );
}
