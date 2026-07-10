// Build 3 proof: a chunk yielding zero grounded claims triggers ONE local
// retry (expanded boundary when the chunk was a slice), streams the recovery
// status, then defers — before any cloud escalation. Fully local (fetch guard).
//   npx tsx eval/retry-check.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const realFetch = globalThis.fetch;
const blocked: string[] = [];
globalThis.fetch = ((input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input?.url ?? input);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    blocked.push(url);
    throw new TypeError(`fetch blocked (offline simulation): ${url}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

import { extractClaims } from "../src/lib/extract";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

// Prose with no numbers/results — the grounding gate guarantees 0 claims, so
// the retry path fires deterministically.
// ~2.3k chars → exactly ONE chunk at the 3000-char default.
const filler =
  "The committee deliberated at length about procedural matters and the seating arrangement. ".repeat(
    25
  );

async function main() {
  const statuses: string[] = [];
  const out = await extractClaims(
    {
      title: "Retry Path Probe",
      paperId: "probe",
      sections: [{ heading: "Results", text: filler }],
    },
    {
      backend: "ollama",
      noCache: true,
      escalate: false, // Build 3 is about LOCAL recovery — no cloud branch
      onStatus: (m) => {
        statuses.push(m);
        console.log(`  status: ${m}`);
      },
    }
  );
  console.log(
    `claims=${out.claims.length} retried=${out.stats.retried} ${(out.stats.ms / 1000).toFixed(1)}s`
  );
  ok(out.stats.retried === 1, `exactly one local retry fired (got ${out.stats.retried})`);
  ok(
    statuses.some((s) => /Retrying chunk 1\/1/.test(s)),
    "streams 'Retrying chunk 1/1 …' status"
  );
  ok(
    statuses.some((s) => /deferred — no grounded claims/.test(s)),
    "streams the honest 'deferred' status when retry also finds nothing"
  );
  ok(out.claims.length === 0, "no hallucinated claims from numberless prose");
  ok(blocked.length === 0, `zero cloud fetches (blocked: ${blocked.length})`);
  ok(out.stats.ms < 200_000, "wall-clock bounded (no runaway retries)");

  console.log(fail === 0 ? "\nRetry check PASSED." : `\n${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
