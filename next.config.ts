import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output — docker-deploy.sh copies `.next/standalone` into the
  // runtime image; without this the primary Dockerfile path fails to build
  // (COPY finds no source). Harmless for local `npm run dev` / `npm run build`.
  output: "standalone",
};

export default nextConfig;
