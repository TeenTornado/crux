// Thin, dependency-free client over the Google Generative Language REST API.
// We call REST directly (rather than an SDK) so we can (a) filter out `thought`
// parts, (b) drive a per-call model fallback chain when a preview model is
// quota-blocked, and (c) keep everything on the server.

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

export function hasKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GenOptions {
  json?: boolean;
  thinkingLevel?: "low" | "medium" | "high";
  temperature?: number;
  maxOutputTokens?: number;
  system?: string;
}

interface GenResult {
  text: string;
  thought: string;
  model: string;
}

/** Models that accept a `thinkingConfig`. Gemma + 2.0 do not. */
function supportsThinking(model: string): boolean {
  return /gemini-(3|2\.5)/.test(model);
}
/** Gemma on the Gemini API rejects systemInstruction; fold it into the prompt. */
function supportsSystem(model: string): boolean {
  return model.startsWith("gemini");
}

async function callOnce(
  model: string,
  prompt: string,
  opts: GenOptions
): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY!;
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
      ...(opts.thinkingLevel && supportsThinking(model)
        ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } }
        : {}),
    },
  };
  if (opts.system && supportsSystem(model)) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify(body),
    // Preview reasoning models can be slow.
    signal: AbortSignal.timeout(110_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`${model} → ${res.status}: ${errText.slice(0, 200)}`);
    // Tag quota / not-found / transient-overload so the chain skips to the next model.
    (err as any).retryable =
      res.status === 429 ||
      res.status === 404 ||
      res.status === 400 ||
      res.status >= 500;
    throw err;
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  let thought = "";
  for (const p of parts) {
    if (typeof p.text !== "string") continue;
    if (p.thought) thought += p.text;
    else text += p.text;
  }
  text = text.trim();
  thought = thought.trim();
  // A 200 with no usable content usually means a soft rate-limit / safety block
  // on the free tier. Treat it as retryable so the chain falls to the next model.
  if (!text && !thought) {
    const err = new Error(
      `${model} → empty response (${data?.candidates?.[0]?.finishReason || "no finishReason"})`
    );
    (err as any).retryable = true;
    throw err;
  }
  return { text, thought, model: data.modelVersion || model };
}

/**
 * Call the first model in `chain` that succeeds. Lets us default to a preview
 * model and gracefully fall back when it's rate-limited on a given key.
 */
export async function generate(
  chain: string[],
  prompt: string,
  opts: GenOptions = {}
): Promise<GenResult> {
  if (!hasKey()) throw new Error("NO_API_KEY");
  let lastErr: unknown;
  for (const model of chain) {
    try {
      return await callOnce(model, prompt, opts);
    } catch (e) {
      lastErr = e;
      if (!(e as any)?.retryable) throw e;
      // else try next model in the chain
    }
  }
  throw lastErr ?? new Error("All models failed");
}

/**
 * Streaming generation over SSE (`:streamGenerateContent?alt=sse`). Calls
 * `onToken` with each text delta. Falls through the model chain on failure.
 */
export async function generateStream(
  chain: string[],
  prompt: string,
  opts: GenOptions,
  onToken: (delta: string) => void
): Promise<{ text: string; model: string }> {
  if (!hasKey()) throw new Error("NO_API_KEY");
  const key = process.env.GEMINI_API_KEY!;
  let lastErr: unknown;

  for (const model of chain) {
    try {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
          ...(opts.thinkingLevel && supportsThinking(model)
            ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } }
            : {}),
        },
      };
      if (opts.system && supportsSystem(model)) {
        body.systemInstruction = { parts: [{ text: opts.system }] };
      }

      const res = await fetch(
        `${API_ROOT}/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        }
      );
      if (!res.ok || !res.body) {
        const err = new Error(`${model} stream → ${res.status}`);
        (err as any).retryable = res.status >= 500 || res.status === 429;
        throw err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n");
        buf = chunks.pop() || "";
        for (const raw of chunks) {
          const l = raw.trim();
          if (!l.startsWith("data:")) continue;
          const payload = l.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            const parts = data?.candidates?.[0]?.content?.parts ?? [];
            for (const p of parts) {
              if (typeof p.text === "string" && !p.thought) {
                full += p.text;
                onToken(p.text);
              }
            }
          } catch {
            /* skip partial line */
          }
        }
      }
      if (!full.trim()) {
        const err = new Error(`${model} stream → empty`);
        (err as any).retryable = true;
        throw err;
      }
      return { text: full, model };
    } catch (e) {
      lastErr = e;
      if (!(e as any)?.retryable) throw e;
    }
  }
  throw lastErr ?? new Error("All stream models failed");
}

/** Extract the first JSON value (object or array) from a possibly-noisy string. */
export function extractJson<T = unknown>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback: scan for the first balanced { } or [ ] block.
    const start = cleaned.search(/[[{]/);
    if (start === -1) throw new Error("No JSON found in model output");
    const open = cleaned[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === open) depth++;
      else if (cleaned[i] === close) {
        depth--;
        if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
    throw new Error("Unbalanced JSON in model output");
  }
}

// Model routing (env-overridable) with fallback chains for quota resilience.
export const MODELS = {
  gemma: () => [
    process.env.GEMMA_MODEL || "gemma-4-31b-it",
    // Flash is the immediate fallback: reliable + higher free-tier quota, so a
    // throttled Gemma fails over fast rather than cascading through empty calls.
    "gemini-flash-latest",
    "gemma-4-26b-a4b-it",
  ],
  reconcile: () => [
    process.env.GEMINI_RECONCILE_MODEL || "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.0-flash",
  ],
  experiment: () => [
    process.env.GEMINI_EXPERIMENT_MODEL || "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-2.0-flash",
  ],
  chat: () => [
    process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest",
    "gemini-3-flash-preview",
    "gemini-2.0-flash",
  ],
};
