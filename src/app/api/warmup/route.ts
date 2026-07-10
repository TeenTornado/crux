import { warmOllama, ollamaWarmth } from "@/lib/ollama";

export const runtime = "nodejs";
// Warming loads ~9.5GB; allow generous time on a cold MacBook.
export const maxDuration = 90;

/**
 * GET  /api/warmup — report warmth WITHOUT loading (drives the header badge).
 * POST /api/warmup — preload the model + re-arm keep_alive so the first real
 *                    extract call is instant. Called on /app mount.
 */
export async function GET() {
  const s = await ollamaWarmth();
  return Response.json(s, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const w = await warmOllama();
  const s = await ollamaWarmth();
  return Response.json(
    { ...s, ready: w.ready, loadMs: w.loadMs },
    { headers: { "Cache-Control": "no-store" } }
  );
}
