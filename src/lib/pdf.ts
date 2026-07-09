import { extractText, getDocumentProxy } from "unpdf";

export interface ParsedPaper {
  title: string;
  pageTexts: string[]; // text per page (1-indexed via pageTexts[page-1])
  fullText: string;
  numPages: number;
}

/** Guess a title from the first non-trivial lines of page 1. */
function guessTitle(firstPage: string, fallback: string): string {
  const lines = firstPage
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && l.length < 160 && !/^\d/.test(l));
  const candidate = lines.find(
    (l) => !/abstract|university|@|http|arxiv|department/i.test(l)
  );
  return (candidate || fallback).slice(0, 160);
}

export async function parsePdf(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParsedPaper> {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: false });
  const pageTexts: string[] = Array.isArray(text) ? text : [String(text)];
  const fullText = pageTexts.join("\n\n");
  const title = guessTitle(
    pageTexts[0] || "",
    filename.replace(/\.pdf$/i, "")
  );
  return {
    title,
    pageTexts,
    fullText,
    numPages: pdf.numPages,
  };
}

/**
 * Section-aware slice biased toward Abstract / Results / Tables — the highest
 * yield regions for empirical claims — while keeping page provenance usable.
 */
export function priorityText(parsed: ParsedPaper): string {
  const full = parsed.fullText;
  const lower = full.toLowerCase();
  const anchors = [
    "abstract",
    "results",
    "experiments",
    "evaluation",
    "table",
    "benchmark",
  ];
  // If the doc is short, just return it.
  if (full.length < 20000) return full;

  const windows: string[] = [];
  for (const a of anchors) {
    let idx = 0;
    while ((idx = lower.indexOf(a, idx)) !== -1 && windows.length < 12) {
      windows.push(full.slice(Math.max(0, idx - 200), idx + 2600));
      idx += a.length;
    }
  }
  const joined = windows.join("\n…\n");
  return (joined.length > 4000 ? joined : full).slice(0, 26000);
}

/** Locate the page a quoted span most likely came from (1-indexed). */
export function findPageForSpan(parsed: ParsedPaper, span: string): number {
  const needle = span.slice(0, 40).toLowerCase();
  for (let i = 0; i < parsed.pageTexts.length; i++) {
    if (parsed.pageTexts[i].toLowerCase().includes(needle)) return i + 1;
  }
  return 1;
}
