// Phase 5 — demo hardening: content-hash idempotency cache (5.4) + warmth
// probe shape (5.1). Model-free: sections under the chunk-length floor produce
// zero chunks, so no backend is hit — this isolates the cache/progress layer.
// Run: npx tsx eval/phase5-check.ts
import { extractClaims, warmOllama } from "../src/lib/extract";

let fail = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fail++;
};

async function main() {
  const input = {
    title: "Test Paper",
    paperId: "p1",
    sections: [{ heading: "Results", text: "tiny" }], // < chunk floor → 0 chunks
  };

  const a = await extractClaims(input, { backend: "hosted" });
  ok(a.stats.cached === false, "first extraction is a cache miss");

  let progressSeen = false;
  const b = await extractClaims(input, {
    backend: "hosted",
    onProgress: () => (progressSeen = true),
  });
  ok(b.stats.cached === true, "identical re-run is served from the content-hash cache");
  ok(progressSeen, "cached path still emits a progress tick");

  const c = await extractClaims(
    { ...input, sections: [{ heading: "Results", text: "other" }] },
    { backend: "hosted" }
  );
  ok(c.stats.cached === false, "different content misses the cache (hash-keyed)");

  const d = await extractClaims(input, { backend: "hosted", noCache: true });
  ok(d.stats.cached === false, "noCache bypasses the cache");

  const w = await warmOllama();
  ok(typeof w.ready === "boolean" && typeof w.loadMs === "number",
    `warmOllama returns {ready,loadMs}: ready=${w.ready} loadMs=${w.loadMs}`);

  console.log(fail === 0 ? "\nAll Phase-5 checks passed." : `\n${fail} check(s) failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
