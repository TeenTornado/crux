import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { readFileSync, writeFileSync } from "node:fs";
import { ingest, extractionInput } from "../src/lib/ingest";

const papers = [
  { id: "resnet", pdf: "sample-papers/resnet.pdf", probe: "3.57" },
  { id: "vgg", pdf: "sample-papers/vgg.pdf", probe: "7.3" },
  { id: "densenet", pdf: "sample-papers/densenet.pdf", probe: "DenseNet" },
];

async function main() {
  for (const p of papers) {
    const buf = readFileSync(p.pdf);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const doc = await ingest(ab as ArrayBuffer, p.pdf);
    const probeHit = doc.fullText.includes(p.probe);
    console.log(
      `${p.id.padEnd(9)} source=${doc.source.padEnd(12)} fidelity=${doc.fidelity} ` +
        `chars=${String(doc.fullText.length).padStart(6)} sections=${String(
          doc.sections.length
        ).padStart(2)} "${p.probe}"=${probeHit} id=${doc.identifier}`
    );
    // write the extraction input as the structured fixture for the Phase 1 eval
    writeFileSync(`eval/corpus/structured/${p.id}.txt`, extractionInput(doc));
  }
}
main();
