"use client";

import { useState } from "react";

/**
 * Paginación del lado del cliente: los datos ya están cargados y solo se
 * recorta la lista que se muestra.
 */
export function usePaginacion<T>(items: readonly T[], porPagina = 10) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
  // Si la lista se achica (filtros, reservas, etc.) no quedamos en una página inexistente.
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * porPagina;

  return {
    items: items.slice(inicio, inicio + porPagina),
    pagina: paginaActual,
    totalPaginas,
    total: items.length,
    desde: items.length === 0 ? 0 : inicio + 1,
    hasta: Math.min(inicio + porPagina, items.length),
    setPagina,
    volverAlInicio: () => setPagina(1),
  };
}

type PaginacionProps = {
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
  onChange: (pagina: number) => void;
};

const BTN =
  "cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-primary/50 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50";

export function Paginacion({ pagina, totalPaginas, total, desde, hasta, onChange }: PaginacionProps) {
  if (totalPaginas <= 1) return null;

  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-secondary"
    >
      <span>
        Mostrando {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={BTN}
          disabled={pagina <= 1}
          onClick={() => onChange(pagina - 1)}
        >
          ← Anterior
        </button>
        <span className="px-1 font-medium text-ink">
          Página {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          className={BTN}
          disabled={pagina >= totalPaginas}
          onClick={() => onChange(pagina + 1)}
        >
          Siguiente →
        </button>
      </div>
    </nav>
  );
}
