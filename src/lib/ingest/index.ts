import { parsePdf } from "../pdf";
import { identify } from "./identify";
import { cleanDoc } from "./clean";
import {
  fetchArxiv,
  fetchOpenAlex,
  fetchCrossref,
  fetchPmc,
  type StructuredDoc,
} from "./sources";

export type { StructuredDoc } from "./sources";

// Small in-process cache so retries / re-uploads within a run are free.
const cache = new Map<string, StructuredDoc>();

/**
 * Resolve-first ingestion: identify a DOI/arXiv id and pull clean structured
 * full text from a scholarly source; only parse the PDF when nothing resolves.
 */
export async function ingest(
  buffer: ArrayBuffer,
  filename = ""
): Promise<StructuredDoc> {
  const parsed = await parsePdf(buffer, filename);
  const firstPages = parsed.pageTexts.slice(0, 2).join("\n");
  const id = identify(firstPages, filename);
  const key = id.arxiv || id.doi || filename || parsed.title;
  const cached = cache.get(key);
  if (cached) return cached;

  let doc: StructuredDoc | null = null;

  if (id.arxiv) {
    doc = await fetchArxiv(id.arxiv);
  }
  if (!doc && id.doi) {
    doc =
      (await fetchPmc(id.doi)) ||
      (await fetchOpenAlex(id.doi)) ||
      (await fetchCrossref(id.doi));
  }

  // Fallback: the parsed PDF (last resort, marked low fidelity).
  if (!doc) {
    doc = {
      title: parsed.title,
      abstract: "",
      sections: [],
      fullText: parsed.fullText,
      source: "pdf",
      identifier: id.arxiv ? `arXiv:${id.arxiv}` : id.doi,
      fidelity: "low",
    };
  }

  // Fix 2: strip LaTeX/citation artifacts BEFORE chunking so spans stay clean.
  doc = cleanDoc(doc);
  cache.set(key, doc);
  return doc;
}

/**
 * Build the highest-signal text slice for extraction from a structured doc:
 * lead with the abstract, then prioritize Results/Experiments/Evaluation
 * sections (where numeric claims live), capped for latency.
 */
export function extractionInput(doc: StructuredDoc, cap = 16000): string {
  if (doc.source === "pdf" || doc.sections.length === 0) {
    // Old behaviour for un-resolved PDFs.
    return doc.fullText.slice(0, cap);
  }
  const priority = /result|experiment|evaluation|benchmark|comparison|ablation|table|main/i;
  const head = doc.abstract ? `## Abstract\n${doc.abstract}\n\n` : "";
  const primary = doc.sections
    .filter((s) => priority.test(s.heading))
    .map((s) => `## ${s.heading}\n${s.text}`)
    .join("\n\n");
  const rest = doc.sections
    .filter((s) => !priority.test(s.heading) && s.heading !== "Abstract")
    .map((s) => `## ${s.heading}\n${s.text}`)
    .join("\n\n");
  return (head + primary + "\n\n" + rest).slice(0, cap);
}
