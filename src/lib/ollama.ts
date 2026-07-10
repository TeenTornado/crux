// Single source of truth for on-device Ollama config.
//
// WHY THIS EXISTS: `keep_alive` is set PER REQUEST. Ollama resets the model's
// eviction timer on every generate call, so a single call that omits keep_alive
// silently reverts the model to the default ~5-minute idle eviction — even if a
// prior call asked for "never". When the model is then evicted mid-session, the
// next call pays a 30–60s reload of the 9.5 GB model (observed as a 17-minute
// /api/extract spike). Every call site must therefore send the SAME numeric
// keep_alive. Import these constants; never hardcode the host/model/keep_alive.

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_GEMMA_MODEL || "gemma4:e4b";

// Ollama wants a NUMBER for the sentinels (-1 = never evict, 0 = evict now) and
// REJECTS the string "-1" ("missing unit in duration"); a real duration like
// "10m"/"24h" stays a string. Default: -1 (resident for the whole session).
export const OLLAMA_KEEP_ALIVE: number | string = (() => {
  const v = (process.env.OLLAMA_KEEP_ALIVE ?? "-1").trim();
  return /^-?\d+$/.test(v) ? Number(v) : v;
})();

export const OLLAMA_CHUNK_TIMEOUT_MS =
  Number(process.env.OLLAMA_CHUNK_TIMEOUT_MS) || 120_000;

/** Is the Ollama server up? (does not load the model) */
export async function ollamaReachable(timeoutMs = 2500): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Preload the model and RE-ARM keep_alive so the first real chunk isn't cold.
 * Fire-and-forget from the route / warmup endpoint. Returns the reported load
 * time (0 when already resident or unreachable).
 */
export async function warmOllama(): Promise<{ ready: boolean; loadMs: number }> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: "ok",
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        // Match the extraction context (num_ctx: 8192) so the warm load has the
        // SAME memory footprint — otherwise Ollama reloads to resize on the
        // first real extract, defeating the preload.
        options: { num_ctx: 8192, num_predict: 1 },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return { ready: false, loadMs: 0 };
    const d = await res.json();
    return { ready: true, loadMs: Math.round((d.load_duration || 0) / 1e6) };
  } catch {
    return { ready: false, loadMs: 0 };
  }
}

export interface OllamaWarmth {
  reachable: boolean;
  warm: boolean; // model currently resident in memory
  model?: string;
  sizeVramMb?: number;
}

/**
 * Read whether the model is currently loaded, via /api/ps — WITHOUT loading it.
 * Drives the "Model warm ✓ / cold ⚠" indicator.
 */
export async function ollamaWarmth(): Promise<OllamaWarmth> {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/ps`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return { reachable: true, warm: false };
    const d = await r.json();
    const models: any[] = Array.isArray(d.models) ? d.models : [];
    const base = OLLAMA_MODEL.split(":")[0];
    const m = models.find((x) => String(x.name || x.model || "").startsWith(base));
    return {
      reachable: true,
      warm: !!m,
      model: m?.name || m?.model,
      sizeVramMb: m ? Math.round((m.size_vram || m.size || 0) / 1e6) : 0,
    };
  } catch {
    return { reachable: false, warm: false };
  }
}
