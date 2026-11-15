import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Los adjuntos de US-62 ya no viajan por Server Actions: usan el Route
      // Handler POST /api/historial/adjuntos/[id], que no está sujeto a este
      // límite. Se conserva un margen para el resto de los formularios.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
