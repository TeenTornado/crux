// Confirms keep_alive is sent as a NUMBER (not the string "-1" Ollama rejects)
// and logs the exact request body every Ollama call site now sends.
//   npx tsx eval/keepalive-check.ts
import { OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_KEEP_ALIVE } from "../src/lib/ollama";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

// The shipped default (no OLLAMA_KEEP_ALIVE env) must be the NUMBER -1.
ok(typeof OLLAMA_KEEP_ALIVE === "number", `keep_alive type is number (got ${typeof OLLAMA_KEEP_ALIVE})`);
ok(OLLAMA_KEEP_ALIVE === -1, `keep_alive default value is -1 (got ${JSON.stringify(OLLAMA_KEEP_ALIVE)})`);

// The exact body /api/extract → ollamaExtract serialises for one chunk:
const body = {
  model: OLLAMA_MODEL,
  prompt: "<chunk prompt>",
  format: "json",
  stream: false,
  keep_alive: OLLAMA_KEEP_ALIVE,
  options: { temperature: 0.2, num_ctx: 8192, num_predict: 1600 },
};
const serialised = JSON.stringify(body);
console.log(`\nPOST ${OLLAMA_HOST}/api/generate body:\n${serialised}\n`);
ok(/"keep_alive":-1(,|})/.test(serialised), 'serialised JSON contains "keep_alive":-1 (numeric, not "-1")');
ok(!/"keep_alive":"-1"/.test(serialised), 'serialised JSON does NOT contain the rejected string "keep_alive":"-1"');

// The coercion rule (mirror of ollama.ts) across representative env values:
const coerce = (v: string) => (/^-?\d+$/.test(v.trim()) ? Number(v) : v);
ok(coerce("-1") === -1, 'env "-1" → number -1 (never evict)');
ok(coerce("0") === 0, 'env "0" → number 0 (evict now)');
ok(coerce("600") === 600, 'env "600" → number 600 (seconds)');
ok(coerce("24h") === "24h", 'env "24h" → string "24h" (valid duration, left as-is)');
ok(coerce("10m") === "10m", 'env "10m" → string "10m"');

console.log(fail === 0 ? "\nAll keep_alive checks passed." : `\n${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
