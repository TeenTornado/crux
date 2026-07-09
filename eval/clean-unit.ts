import { cleanText } from "../src/lib/ingest/clean";
const cases = [
  "GoogLeNet with 6.7%percent6.76.7\\% error",
  "Clarifai achieved 11.2%percent11.211.2\\% with outside training",
  "8×\\times deeper than VGG nets [41]",
  "single-net performance 7.0%percent7.07.0\\% test error [1, 2]",
];
for(const c of cases) console.log(JSON.stringify(c), "=>", JSON.stringify(cleanText(c)));
console.log("SLASH:", JSON.stringify(cleanText("errors 24.8%/7.5%percent24.8percent7.524.8%/7.5% on val")));
