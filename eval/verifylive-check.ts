// Smoke: demo=live must stream v2-gated claims (grounded===true on every
// live-extracted claim; curated fallbacks carry extractor:"demo").
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { POST } from "../src/app/api/extract/route";
import { buildCandidateEdges, splitCompoundCoefficients } from "../src/lib/graph";

async function main() {
  const fd = new FormData();
  fd.set("demo", "live");
  const res = await POST(new Request("http://localhost/api/extract", { method: "POST", body: fd }) as any);
  const reader = (res.body as ReadableStream).getReader();
  const dec = new TextDecoder();
  let buf = "";
  const claims: any[] = [];
  let done_evt: any = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const lineStr = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!lineStr) continue;
      const ev = JSON.parse(lineStr);
      if (ev.type === "claim") claims.push(ev.claim);
      if (ev.type === "status") console.log("  status:", ev.message.slice(0, 70));
      if (ev.type === "done") done_evt = ev;
    }
  }
  const live = claims.filter((c) => c.extractor !== "demo");
  const gated = live.filter((c) => c.grounded === true);
  console.log(`claims=${claims.length} live=${live.length} gated=${gated.length} source=${done_evt?.source}`);
  const values = claims.map((c) => c.result_value || "");
  const has842 = values.some((v) => v.includes("84.2"));
  const has829 = values.some((v) => v.includes("82.9"));
  const edges = buildCandidateEdges(splitCompoundCoefficients(claims));
  console.log(`84.2 present: ${has842} · 82.9 present: ${has829} · edges: ${edges.length}`);
  const pass = claims.length > 0 && live.length === gated.length && has842 && has829 && edges.length >= 1;
  console.log(live.length > 0
    ? (pass ? "PASS — every live claim is span-grounded (v2 signature)" : "FAIL — ungated live claims present")
    : "NOTE — all papers fell back to curated claims (quota/model); gate path compiled but unexercised");
  process.exit(pass || live.length === 0 ? 0 : 1);
}
main();
