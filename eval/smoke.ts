import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { extractClaims } from "../src/lib/extract";
async function main(){
  const text = readFileSync("eval/corpus/structured/resnet.txt","utf8");
  const secs = text.split(/\n(?=## )/).map(p=>{const m=p.match(/^## (.+)\n([\s\S]*)$/);return m?{heading:m[1].trim(),text:m[2].trim()}:{heading:"",text:p.trim()};}).filter(s=>s.text.length>20);
  const t0=Date.now();
  const out = await extractClaims({title:"Deep Residual Learning for Image Recognition", paperId:"resnet", sections:secs}, {backend:"auto", maxChunks:3});
  console.log("elapsed", ((Date.now()-t0)/1000).toFixed(0)+"s", "| stats", JSON.stringify(out.stats));
  for(const c of out.claims.slice(0,8)) console.log("  • task="+(c.task||"EMPTY")+" | ds="+(c.dataset||"?")+" | metric="+(c.metric||"EMPTY")+" | val="+(c.result_value||"none"));
}
main();
