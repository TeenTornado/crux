export interface PaperId {
  arxiv?: string; // e.g. 1512.03385 or 2310.06825
  doi?: string; // e.g. 10.1145/3292500.3330701
}

const ARXIV_RE = /arxiv[:\s]*(\d{4}\.\d{4,5})(v\d+)?/i;
const ARXIV_BARE_RE = /\b(\d{4}\.\d{4,5})(v\d+)?\b/;
const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/;

/** Detect an arXiv id or DOI from the filename + the first page(s) of text. */
export function identify(firstPageText: string, filename = ""): PaperId {
  const id: PaperId = {};
  const hay = `${filename}\n${firstPageText}`;

  const ax = hay.match(ARXIV_RE);
  if (ax) id.arxiv = ax[1];
  else {
    // Filenames like 1512.03385.pdf, or an "arXiv:xxxx" header.
    const fnm = filename.match(ARXIV_BARE_RE);
    if (fnm) id.arxiv = fnm[1];
  }

  const doi = hay.match(DOI_RE);
  if (doi) {
    // Trim trailing punctuation that regex greedily grabbed.
    id.doi = doi[1].replace(/[.,;)]+$/, "");
  }
  return id;
}
