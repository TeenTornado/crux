import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { extractClaims } from "../src/lib/extract";
const para = "Our result is competitive with respect to the classification task winner (GoogLeNet with 6.7% error) and substantially outperforms the ILSVRC-2013 winning submission Clarifai, which achieved 11.2% with outside training data and 11.7% without it. In terms of the single-net performance, our VGG architecture achieves the best result (7.0% test error), outperforming a single GoogLeNet by 0.9%.";
async function main(){
  const out = await extractClaims({title:"Very Deep Convolutional Networks for Large-Scale Image Recognition", paperId:"vgg", sections:[{heading:"Comparison with the state of the art", text:para}]}, {backend:"auto", maxChunks:1});
  console.log("claims:", out.claims.length, "| backend", out.stats.backend);
  for(const c of out.claims) console.log(`  • about=${c.about_system||"?"} own=${c.is_own_contribution} | ${c.metric} = ${c.result_value}`);
}
main();
