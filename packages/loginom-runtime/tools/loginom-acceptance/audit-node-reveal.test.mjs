import test from 'node:test';
import assert from 'node:assert/strict';
import {revealAuditNode} from './audit-node-reveal.mjs';
import {samePlacementGraph} from '../../client/lib/node-placement.mjs';

const graph=()=>({complete:true,nodes:[{ref:{node_id:'export'},position:{x:1600,y:128},dom_epoch:1}],links:[]});
const task=()=>({deadline:Date.now()+10000,node_id:'export',request:{workflow_ref:{prefix:'MF;TF-1'}}});
const page={locator:selector=>({selector})};
test('config-only offscreen export is revealed with exact node and unchanged graph',async()=>{
 let reads=0;
 const result=await revealAuditNode(page,task(),async()=>({...graph(),nodes:graph().nodes.map(n=>({...n,dom_epoch:++reads}))}),async args=>{
  assert.equal(args.nodeId,'export');assert.deepEqual(args.position,{x:1600,y:128});
  await args.guard();return {fully_visible:true,zoom_steps:2};
 },()=>{},()=>{},samePlacementGraph);
 assert.equal(result.graph_unchanged,true);assert.equal(reads,3);
});
test('navigation refuses a moved node or added connection',async()=>{
 for(const change of [g=>{g.nodes[0].position.x++;},g=>{g.links.push({source:'other',target:'export'});}]){
  let reads=0;
  await assert.rejects(revealAuditNode(page,task(),async()=>{const g=graph();if(reads++)change(g);return g;},async args=>{await args.guard();return {fully_visible:true};},()=>{},()=>{},samePlacementGraph),/Graph changed/);
 }
});
test('navigation refuses incomplete graph and unresolved footprint',async()=>{
 await assert.rejects(revealAuditNode(page,task(),async()=>({...graph(),complete:false}),async()=>({fully_visible:true}),()=>{},()=>{},samePlacementGraph),/complete audit graph/);
 await assert.rejects(revealAuditNode(page,task(),async()=>graph(),async()=>({fully_visible:false}),()=>{},()=>{},samePlacementGraph),/outside viewport/);
});
