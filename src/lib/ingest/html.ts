import { parse, type HTMLElement, type Node } from "node-html-parser";

export interface Section {
  heading: string;
  text: string;
}

export interface StructuredText {
  title: string;
  abstract: string;
  sections: Section[];
  fullText: string;
}

const clean = (s: string) =>
  (s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** Flatten an HTML table to readable rows so numeric cells survive as text. */
function flattenTable(table: HTMLElement): string {
  const rows: string[] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells = tr
      .querySelectorAll("td,th")
      .map((c) => clean(c.text))
      .filter(Boolean);
    if (cells.length) rows.push(cells.join(" | "));
  }
  return rows.length ? "TABLE:\n" + rows.join("\n") : "";
}

/**
 * Convert scholarly HTML (arXiv native HTML or ar5iv LaTeX→HTML) into clean,
 * section-tagged text. Walks the DOM in reading order so two-column artifacts
 * and table garbling (the pdf.js failure modes) don't occur.
 */
export function htmlToStructured(html: string): StructuredText {
  const root = parse(html, {
    comment: false,
    blockTextElements: { script: false, style: false, pre: true, code: true },
  });
  root
    .querySelectorAll(
      "script,style,nav,header,footer,.ltx_page_header,.ltx_page_footer,.ltx_bibliography,.navbar,figure img"
    )
    .forEach((e) => e.remove());

  const rawTitle =
    root.querySelector("h1.ltx_title, h1.title, h1")?.text ||
    root.querySelector("title")?.text ||
    "";
  const title = clean(rawTitle).replace(/^\[[^\]]+\]\s*/, "");

  const absEl = root.querySelector(
    ".ltx_abstract, .abstract, #abstract, div[role='doc-abstract']"
  );
  const abstract = absEl ? clean(absEl.text.replace(/^abstract\.?/i, "")) : "";

  // Walk block elements in document order.
  type Block = { type: "heading" | "para" | "table"; text: string };
  const blocks: Block[] = [];
  const seen = new Set<HTMLElement>();
  const walk = (node: Node) => {
    const el = node as HTMLElement;
    const tag = (el.rawTagName || "").toLowerCase();
    if (!tag) return;
    if (tag === "script" || tag === "style") return;
    if (/^h[1-6]$/.test(tag)) {
      const t = clean(el.text);
      if (t && t.length < 200) blocks.push({ type: "heading", text: t });
      return;
    }
    if (tag === "table") {
      if (!seen.has(el)) {
        seen.add(el);
        const t = flattenTable(el);
        if (t) blocks.push({ type: "table", text: t });
      }
      return;
    }
    if (tag === "p" || tag === "figcaption" || tag === "li") {
      const t = clean(el.text);
      if (t && t.length > 1) blocks.push({ type: "para", text: t });
      return;
    }
    for (const c of el.childNodes) walk(c);
  };
  const body =
    root.querySelector("article, .ltx_document, main, body") || root;
  for (const c of body.childNodes) walk(c);

  // Group into sections under the most recent heading.
  const sections: Section[] = [];
  let cur: Section = { heading: abstract ? "Abstract" : "", text: abstract };
  const push = () => {
    if (cur.text.trim() || cur.heading) sections.push(cur);
  };
  for (const b of blocks) {
    if (b.type === "heading") {
      push();
      cur = { heading: b.text, text: "" };
    } else {
      cur.text += (cur.text ? "\n" : "") + b.text;
    }
  }
  push();

  const fullText = sections
    .map((s) => (s.heading ? `## ${s.heading}\n${s.text}` : s.text))
    .join("\n\n");

  return { title, abstract, sections, fullText };
}
