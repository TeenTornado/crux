// Clean ar5iv/JATS artifacts BEFORE chunking so provenance spans are clean and
// value extraction doesn't ingest LaTeX macros or citation markers. Because the
// same cleaned text is what the grounding gate checks against, span-grounding is
// preserved (source and extraction input are cleaned identically).

/**
 * Collapse the ar5iv `\%` triple-expansion artifact, e.g.
 *   `6.7%percent6.76.7\%`  →  `6.7%`
 *   `11.2%percent11.211.2%` → `11.2%`
 * and strip LaTeX macros (`\times`, general `\macro`) and `[41]`-style citations.
 */
export function cleanText(input: string): string {
  let x = input;

  // 0. Zero-width chars (ar5iv math spacing, e.g. `No​p​t` for N_opt)
  //    break pattern matching and span grounding — strip them globally.
  x = x.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 1. Collapse ar5iv `\%` expansion artifacts BEFORE touching backslashes.
  //    Single value: `6.7%percent6.76.7\%` → `6.7%`.
  x = x.replace(/(\d+(?:\.\d+)?)\s*%?\s*percent\s*\1\s*\1\s*\\?%/g, "$1%");
  //    Slash pair (top-1/top-5): `24.8%/7.5%percent24.8percent7.524.8%/7.5%` → `24.8%/7.5%`.
  x = x.replace(
    /(\d+(?:\.\d+)?)%\/(\d+(?:\.\d+)?)%percent\1percent\2\1%\/\2%/g,
    "$1%/$2%"
  );
  //    General safety net: the literal word "percent" is never legitimately glued
  //    to a digit/percent — strip it (leaves the numeric value, drops the junk).
  x = x.replace(/(?<=[%\d.])\s*percent\s*(?=[\d.])/g, "");
  //    Collapse a clean value token immediately re-echoed with junk digits:
  //    `24.8%/7.5%24.87.524.8%/7.5%` → `24.8%/7.5%`.
  x = x.replace(
    /(\d+(?:\.\d+)?%(?:\/\d+(?:\.\d+)?%)?)[\d.]+\1/g,
    "$1"
  );
  x = x.replace(/(\d+(?:\.\d+)?)\s*percent\b/g, "$1%");

  // 2. LaTeX macros: unescape \% then strip the rest (\times, \cite, …). The ar5iv
  //    output usually already carries the unicode glyph (e.g. × next to \times).
  x = x.replace(/\\%/g, "%");
  x = x.replace(/\\[a-zA-Z]+\s?/g, " ");

  // 3. Citation markers: [41], [1,2], [1, 2, 3].
  x = x.replace(/\s*\[\d{1,3}(?:\s*,\s*\d{1,3})*\]/g, "");

  // 4. Tidy whitespace / duplicated percent signs.
  x = x.replace(/%\s*%/g, "%");
  x = x.replace(/\s+([.,;%)])/g, "$1");
  x = x.replace(/\s{2,}/g, " ");
  return x.trim();
}

import type { StructuredDoc } from "./sources";

/** Apply cleaning across a structured doc (title, abstract, sections, fullText). */
export function cleanDoc(doc: StructuredDoc): StructuredDoc {
  const sections = doc.sections.map((s) => ({
    heading: cleanText(s.heading),
    text: cleanText(s.text),
  }));
  return {
    ...doc,
    title: cleanText(doc.title),
    abstract: cleanText(doc.abstract),
    sections,
    fullText: cleanText(doc.fullText),
  };
}
