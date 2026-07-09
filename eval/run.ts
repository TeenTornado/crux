// Run the CURRENT extraction pipeline over the frozen corpus and score it.
//   npx tsx eval/run.ts [label]                 # source = pdf (route-faithful)
//   EVAL_SOURCE=structured npx tsx eval/run.ts structured-preview
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parsePdf, priorityText } from "../src/lib/pdf";
import { extractClaimsForPaper } from "../src/lib/extractor";
import { extractClaims } from "../src/lib/extract";
import {
  scorePaper,
  aggregate,
  loadJsonl,
  type GoldClaim,
  type PaperMetrics,
} from "./metrics";

const label = process.argv[2] || "baseline";
const sourceMode = (process.env.EVAL_SOURCE || "pdf") as "pdf" | "structured";
const extractor = (process.env.EVAL_EXTRACTOR || "v1") as "v1" | "v2";

/** Split "## heading\ntext" structured text back into sections. */
function parseSections(text: string): { heading: string; text: string }[] {
  const parts = text.split(/\n(?=## )/);
  const secs = parts.map((p) => {
    const m = p.match(/^## (.+)\n([\s\S]*)$/);
    return m ? { heading: m[1].trim(), text: m[2].trim() } : { heading: "", text: p.trim() };
  });
  return secs.filter((s) => s.text.length > 20);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PaperDef {
  id: string;
  title: string;
  arxiv: string;
  pdf: string;
}

async function inputFor(p: PaperDef): Promise<{ source: string; input: string }> {
  if (sourceMode === "structured") {
    const source = readFileSync(`eval/corpus/structured/${p.id}.txt`, "utf8");
    return { source, input: source };
  }
  // pdf mode: parse and construct the extractor input exactly like /api/extract.
  const buf = readFileSync(p.pdf);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const parsed = await parsePdf(ab as ArrayBuffer, p.pdf);
  const input = parsed.fullText.slice(0, 6000) + "\n…\n" + priorityText(parsed);
  return { source: parsed.fullText, input };
}

async function main() {
  const papers: PaperDef[] = JSON.parse(readFileSync("eval/corpus/manifest.json", "utf8"));
  const gold = loadJsonl<GoldClaim>("eval/gold/claims.jsonl");

  const rows: PaperMetrics[] = [];
  for (const p of papers) {
    const { source, input } = await inputFor(p);
    let claims: any[] = [];
    let err = "";
    let statStr = "";
    try {
      if (extractor === "v2") {
        const sections = parseSections(input);
        const out = await extractClaims(
          { title: p.title, paperId: p.id, sections: sections.length ? sections : [{ heading: "", text: input }] },
          { backend: "auto", maxChunks: Number(process.env.EVAL_MAXCHUNKS) || 6 }
        );
        claims = out.claims;
        statStr = ` [${out.stats.backend} chunks=${out.stats.chunks} raw=${out.stats.raw} esc=${out.stats.escalated}]`;
      } else {
        const out = await extractClaimsForPaper(p.title, input, p.id);
        claims = out.claims;
      }
    } catch (e: any) {
      err = e?.message?.slice(0, 80) || "failed";
    }
    const m = scorePaper(p.id, claims, source, gold);
    rows.push(m);
    console.log(
      `${p.id.padEnd(9)} claims=${String(m.claims).padStart(2)} ` +
        `span=${(m.span_grounding_rate * 100).toFixed(0).padStart(3)}% ` +
        `value=${(m.value_grounding_rate * 100).toFixed(0).padStart(3)}% ` +
        `goldrecall=${m.gold_recalled}/${m.gold_total}` +
        statStr +
        (err ? `  ERR:${err}` : "")
    );
    await sleep(2000); // respect free-tier quota
  }

  const agg = aggregate(rows);
  const result = {
    label,
    source_mode: sourceMode,
    gemma_model: process.env.OLLAMA_HOST ? process.env.OLLAMA_GEMMA_MODEL : process.env.GEMMA_MODEL,
    timestamp: new Date().toISOString(),
    aggregate: agg,
    per_paper: rows,
  };
  mkdirSync("eval/results", { recursive: true });
  writeFileSync(`eval/results/${label}.json`, JSON.stringify(result, null, 2));

  console.log("\n── aggregate ──");
  console.log(`papers               ${agg.papers}`);
  console.log(`mean yield           ${agg.mean_yield.toFixed(1)} claims/paper`);
  console.log(`span-grounding rate  ${(agg.span_grounding_rate * 100).toFixed(1)}%`);
  console.log(`hallucination rate   ${(agg.hallucination_rate * 100).toFixed(1)}%`);
  console.log(`value-grounding rate ${(agg.value_grounding_rate * 100).toFixed(1)}%`);
  console.log(`gold recall          ${(agg.gold_recall * 100).toFixed(1)}%`);
  console.log(`\nwrote eval/results/${label}.json`);
}

main();
