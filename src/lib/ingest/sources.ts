import { htmlToStructured, type Section } from "./html";

export type SourceKind =
  | "arxiv-html"
  | "ar5iv"
  | "arxiv-abstract"
  | "openalex"
  | "crossref"
  | "pmc-jats"
  | "pdf";

export interface StructuredDoc {
  title: string;
  abstract: string;
  sections: Section[];
  fullText: string;
  source: SourceKind;
  identifier?: string;
  fidelity: "high" | "medium" | "low";
}

const MAILTO = "crux@example.com";
const UA = { "User-Agent": "Crux/1.0 (research prototype)" };
const timeout = (ms: number) => AbortSignal.timeout(ms);

async function getText(url: string, ms = 15000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: timeout(ms), redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
async function getJson<T = any>(url: string, ms = 12000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: timeout(ms), redirect: "follow" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** arXiv: prefer native HTML, then ar5iv (LaTeX→HTML), then API abstract. */
export async function fetchArxiv(id: string): Promise<StructuredDoc | null> {
  // 1) Native HTML (newer papers).
  for (const url of [
    `https://arxiv.org/html/${id}`,
    `https://ar5iv.labs.arxiv.org/html/${id}`,
  ]) {
    const html = await getText(url, 22000);
    if (html && html.length > 20000) {
      const s = htmlToStructured(html);
      if (s.fullText.length > 4000) {
        return {
          ...s,
          source: url.includes("ar5iv") ? "ar5iv" : "arxiv-html",
          identifier: `arXiv:${id}`,
          fidelity: "high",
        };
      }
    }
  }
  // 2) API abstract fallback.
  const xml = await getText(`https://export.arxiv.org/api/query?id_list=${id}`, 12000);
  if (xml) {
    const t = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
    const a = xml.match(/<summary>([\s\S]*?)<\/summary>/);
    const title = (t?.[1] || "").replace(/\s+/g, " ").trim();
    const abstract = (a?.[1] || "").replace(/\s+/g, " ").trim();
    if (abstract) {
      return {
        title,
        abstract,
        sections: [{ heading: "Abstract", text: abstract }],
        fullText: `${title}\n\n## Abstract\n${abstract}`,
        source: "arxiv-abstract",
        identifier: `arXiv:${id}`,
        fidelity: "medium",
      };
    }
  }
  return null;
}

/** Reconstruct an OpenAlex abstract from its inverted index. */
function fromInverted(inv: Record<string, number[]> | null | undefined): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

export async function fetchOpenAlex(doi: string): Promise<StructuredDoc | null> {
  const d = await getJson<any>(
    `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?mailto=${MAILTO}`
  );
  if (!d || !d.title) return null;
  const abstract = fromInverted(d.abstract_inverted_index);
  if (!abstract) return null;
  return {
    title: d.title,
    abstract,
    sections: [{ heading: "Abstract", text: abstract }],
    fullText: `${d.title}\n\n## Abstract\n${abstract}`,
    source: "openalex",
    identifier: doi,
    fidelity: "medium",
  };
}

export async function fetchCrossref(doi: string): Promise<StructuredDoc | null> {
  const d = await getJson<any>(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${MAILTO}`
  );
  const m = d?.message;
  if (!m) return null;
  const title = (m.title?.[0] || "").trim();
  const abstract = (m.abstract || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!title && !abstract) return null;
  return {
    title,
    abstract,
    sections: abstract ? [{ heading: "Abstract", text: abstract }] : [],
    fullText: `${title}${abstract ? `\n\n## Abstract\n${abstract}` : ""}`,
    source: "crossref",
    identifier: doi,
    fidelity: "medium",
  };
}

/** PubMed Central OA JATS XML (biomedical) — DOI→PMCID→OAI full text. */
export async function fetchPmc(doi: string): Promise<StructuredDoc | null> {
  const conv = await getJson<any>(
    `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${encodeURIComponent(
      doi
    )}&format=json&tool=crux&email=${MAILTO}`
  );
  const pmcid = conv?.records?.[0]?.pmcid;
  if (!pmcid) return null;
  const xml = await getText(
    `https://www.ncbi.nlm.nih.gov/pmc/oai/oai.cgi?verb=GetRecord&identifier=oai:pubmedcentral.nih.gov:${pmcid.replace(
      /^PMC/,
      ""
    )}&metadataPrefix=pmc`,
    18000
  );
  if (!xml || xml.length < 2000) return null;
  // JATS is XML but htmlToStructured's tag-walk handles <sec><title><p><table> well enough.
  const s = htmlToStructured(xml);
  if (s.fullText.length < 1000) return null;
  return { ...s, source: "pmc-jats", identifier: doi, fidelity: "high" };
}
