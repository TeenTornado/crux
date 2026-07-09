// Freeze parsed-text fixtures for the eval corpus (deterministic extraction eval).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parsePdf } from "../src/lib/pdf";

const papers = [
  { id: "resnet", title: "Deep Residual Learning for Image Recognition", arxiv: "1512.03385", pdf: "sample-papers/resnet.pdf" },
  { id: "vgg", title: "Very Deep Convolutional Networks for Large-Scale Image Recognition", arxiv: "1409.1556", pdf: "sample-papers/vgg.pdf" },
  { id: "densenet", title: "Densely Connected Convolutional Networks", arxiv: "1608.06993", pdf: "sample-papers/densenet.pdf" },
];

async function main() {
  mkdirSync("eval/corpus/text", { recursive: true });
  for (const p of papers) {
    const buf = readFileSync(p.pdf);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const parsed = await parsePdf(ab as ArrayBuffer, p.pdf);
    writeFileSync(`eval/corpus/text/${p.id}.txt`, parsed.fullText);
    console.log(`${p.id}: ${parsed.fullText.length} chars, ${parsed.numPages} pages, title="${parsed.title.slice(0, 50)}"`);
  }
  writeFileSync("eval/corpus/manifest.json", JSON.stringify(papers, null, 2));
  console.log("wrote eval/corpus/manifest.json");
}

main();
