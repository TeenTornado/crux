import { canonDataset, canonMetric, buildCandidateEdges } from "../src/lib/graph";
console.log("canonDataset ILSVRC-2014 =>", JSON.stringify(canonDataset("ILSVRC-2014")));
console.log("canonDataset ImageNet    =>", JSON.stringify(canonDataset("ImageNet")));
console.log("canonMetric 'test error' =>", JSON.stringify(canonMetric("test error")));
console.log("canonMetric 'top-5 error'=>", JSON.stringify(canonMetric("top-5 error")));
const mk = (id:string,paper:string,dataset:string,metric:string,val:string,own=true):any => ({claim_id:id,paper_id:paper,claim_text:"",task:"image classification",dataset,metric,result_value:val,result_confidence:"medium",conditions:{},source_span:{page:0,text:""},is_own_contribution:own});
const claims = [
  mk("v1","vgg","ILSVRC-2014","test error","7.3%"),
  mk("r1","resnet","ImageNet","top-5 error","3.57%"),
  mk("clarifai","vgg","ImageNet","top-5 error","11.2%",false),
  mk("g1","resnet","COCO","mAP","48.4"),
];
const edges = buildCandidateEdges(claims);
console.log("\nedges:", edges.length);
for(const e of edges) console.log("  ", e.source_claim_id, "<->", e.target_claim_id, "on", e.dataset, "/", e.metric);
