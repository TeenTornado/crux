/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["unpdf"],
  // Standalone server bundle — the Electron shell spawns .next/standalone/
  // server.js so the desktop app ships its own API routes (extract/reconcile/
  // experiment run locally, talking to Ollama on 127.0.0.1). Harmless for
  // Vercel, which uses its own build output.
  output: "standalone",
};

export default nextConfig;
