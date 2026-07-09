// Span-grounding gate — the primary hallucination check (SAFE/FActScore standard:
// a claim is trusted only if its span literally appears in the source).

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9%.\-\s]/g, " ").replace(/\s+/g, " ").trim();

export function numericCore(v: string): string | null {
  const m = (v || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? m[0] : null;
}

/** Whitespace/punct-normalized substring, with a distinctive-token fuzzy fallback. */
export function isGrounded(span: string, source: string): boolean {
  const s = norm(span);
  if (!s || s.length < 5) return false;
  const src = norm(source);
  if (src.includes(s)) return true;
  const toks = s.split(" ").filter((t) => t.length >= 4 || /\d/.test(t));
  if (toks.length < 2) return false;
  const hit = toks.filter((t) => src.includes(t)).length;
  return hit / toks.length >= 0.85; // most distinctive tokens present
}

/** Does the numeric value literally appear in the source? */
export function valueInSource(value: string, source: string): boolean {
  const core = numericCore(value);
  if (!core) return false;
  return norm(source).includes(core);
}
