import type { ReactNode } from "react";

/**
 * Piezas compartidas por las pantallas de pagos (US-33 a US-36 y US-47): el
 * «bloque de wireframe» numerado y los avisos (callouts) de los wireframes.
 */

export function Bloque({
  num,
  titulo,
  children,
}: {
  /** Etiqueta del wireframe, p. ej. «1 · Precio vigente». */
  num: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border-2 border-line bg-surface p-4 shadow-2xs sm:p-6">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">{num}</span>
      <h2 className="mt-0.5 text-lg font-bold text-ink">{titulo}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

const CALLOUT_CLASSES = {
  info: "border-line bg-background text-ink",
  error: "border-red-300 bg-red-50 text-red-900",
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
} as const;

export function Callout({
  tipo = "info",
  children,
}: {
  tipo?: keyof typeof CALLOUT_CLASSES;
  children: ReactNode;
}) {
  return (
    <div
      role={tipo === "error" ? "alert" : undefined}
      className={`rounded-lg border p-3 text-sm ${CALLOUT_CLASSES[tipo]}`}
    >
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-secondary">{children}</p>;
}

export function Badge({
  children,
  tono = "neutro",
}: {
  children: ReactNode;
  tono?: "neutro" | "ok" | "aviso" | "error";
}) {
  const clases = {
    neutro: "border-line bg-background text-ink-secondary",
    ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
    aviso: "border-amber-300 bg-amber-50 text-amber-900",
    error: "border-red-300 bg-red-50 text-red-800",
  }[tono];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${clases}`}
    >
      {children}
    </span>
  );
}

/** Tabla con scroll horizontal propio: la página nunca desborda en 360 px (RNF-08). */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const TH = "px-3 py-2.5 text-xs uppercase tracking-wider text-ink-secondary";
export const TD = "px-3 py-2.5 text-ink";
export const THEAD_TR = "border-b border-line bg-background/60";
export const TBODY = "divide-y divide-line";

export const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
export const BTN_PRIMARY =
  "cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_SECONDARY =
  "cursor-pointer rounded-lg border border-line bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50";
