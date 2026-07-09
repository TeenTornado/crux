// End-to-end edge acceptance: does the live-default cascade (Gemma-local first,
// escalate empty chunks to Gemini, key loaded) extract VGG's 7.3% and ResNet's
// 3.57% top-5 error and form a candidate edge?   npx tsx eval/edge-check.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { extractClaims } from "../src/lib/extract";
import { buildCandidateEdges } from "../src/lib/graph";
import type { Claim } from "../src/lib/types";

function parseSections(text: string) {
  return text
    .split(/\n(?=## )/)
    .map((p) => {
      const m = p.match(/^## (.+)\n([\s\S]*)$/);
      return m ? { heading: m[1].trim(), text: m[2].trim() } : { heading: "", text: p.trim() };
    })
    .filter((s) => s.text.length > 20);
}

const PAPERS = [
  { id: "vgg", title: "Very Deep Convolutional Networks for Large-Scale Image Recognition" },
  { id: "resnet", title: "Deep Residual Learning for Image Recognition" },
];

async function main() {
  const all: Claim[] = [];
  for (const p of PAPERS) {
    const src = readFileSync(`eval/corpus/structured/${p.id}.txt`, "utf8");
    const sections = parseSections(src);
    const out = await extractClaims(
      { title: p.title, paperId: p.id, sections },
      { backend: "auto", sections: "priority", maxChunks: 4, noCache: true }
    );
    console.log(`\n${p.id}: ${out.claims.length} claims [${out.stats.backend} chunks=${out.stats.chunks} raw=${out.stats.raw} esc=${out.stats.escalated} mined=${out.stats.mined} deg=${out.stats.degraded} ${(out.stats.ms / 1000).toFixed(1)}s]`);
    for (const c of out.claims) {
      console.log(`   • own=${c.is_own_contribution} ${c.dataset || "—"} / ${c.metric || "—"} = ${c.result_value || "—"}  «${c.claim_text.slice(0, 56)}»`);
    }
    all.push(...out.claims);
  }
  const edges = buildCandidateEdges(all);
  console.log(`\n=== candidate edges: ${edges.length} ===`);
  for (const e of edges) console.log(`   ↳ ${e.dataset} / ${e.metric}: ${e.source_claim_id} ↔ ${e.target_claim_id}`);
  const has73 = all.some((c) => (c.result_value || "").includes("7.3") && c.paper_id === "vgg");
  const has357 = all.some((c) => (c.result_value || "").includes("3.57") && c.paper_id === "resnet");
  console.log(`\nVGG 7.3% captured: ${has73} · ResNet 3.57% captured: ${has357} · edge formed: ${edges.length >= 1}`);
}
main();
