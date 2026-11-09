import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ patientKey?: string }>;
};

/**
 * US-40: la vista consolidada de US-39 se unificó en `/dashboard/historial`,
 * que agrega filtros, autor/especialidad y auditoría. Se mantiene esta ruta
 * como redirección para no romper los enlaces de US-39.
 */
export default async function FichaConsolidadaPage({ searchParams }: PageProps) {
  const { patientKey } = await searchParams;
  const key = patientKey?.trim();
  redirect(
    key
      ? `/dashboard/historial?patientKey=${encodeURIComponent(key)}`
      : "/dashboard/historial"
  );
}
