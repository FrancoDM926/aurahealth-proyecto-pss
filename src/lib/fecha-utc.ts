/** Fecha `@db.Date` (guardada en UTC) como "YYYY-MM-DD". */
export function fechaUtcString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" como `Date` a medianoche UTC (valor para columnas `@db.Date`). */
export function parseFechaUtc(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
