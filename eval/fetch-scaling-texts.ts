// Fetch Kaplan (2001.08361) + Chinchilla (2203.15556) through the real ingest
// source + cleaner, dump to scratchpad so miner patterns are grounded in the
// ACTUAL post-clean text.  npx tsx eval/fetch-scaling-texts.ts
import { writeFileSync } from "node:fs";
import { fetchArxiv } from "../src/lib/ingest/sources";
import { cleanDoc } from "../src/lib/ingest/clean";

const OUT =
  "/private/tmp/claude-501/-Users-sreeramkumarvr-Documents-Google/830e93b6-df84-492d-9a47-4568ad9fcbd9/scratchpad";

async function main() {
  for (const [id, name] of [
    ["2001.08361", "kaplan"],
    ["2203.15556", "chinchilla"],
  ] as const) {
    const doc = await fetchArxiv(id);
    if (!doc) {
      console.log(`${name}: FETCH FAILED`);
      continue;
    }
    const clean = cleanDoc(doc);
    writeFileSync(`${OUT}/${name}.txt`, clean.fullText);
    // Frozen fixture for the offline scaling-e2e test.
    const sections = clean.sections
      .map((s) => `## ${s.heading}\n${s.text}`)
      .join("\n");
    writeFileSync(`eval/corpus/structured/${name}.txt`, sections);
    console.log(`${name}: ${clean.source} · ${clean.sections.length} sections · ${clean.fullText.length} chars`);
  }
}
main();
