import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // US-62: el administrador puede configurar hasta 25 MB por adjunto.
      // El límite del cuerpo incluye el sobre multipart, por eso 30 MB.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
