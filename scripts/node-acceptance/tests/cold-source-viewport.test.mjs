import test from 'node:test';
import assert from 'node:assert/strict';
import {revealColdSource,makeColdSourceRevealCode} from '../cold-source-viewport.mjs';
import {revealNodePlacement,nodePlacementViewport,nodePlacementPoint,samePlacementGraph} from '../../../packages/loginom-runtime/client/lib/node-placement.mjs';
const ref={document_id:'doc',workflow_id:'wf',node_id:'source'};
const graph=()=>({complete:true,interaction_ready:true,nodes:[{ref:{...ref},type:'imports.text',position:{x:120,y:120},dom_epoch:1}],links:[]});
const args=()=>({node:{...ref},type:'imports.text',request:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'}},deadline:Date.now()+30000});
const root={count:async()=>1,isVisible:async()=>true};
const page=()=>({graph:graph(),locator:()=>root});
async function readGraph(p){return structuredClone(p.graph);}
test('source navigation serializes the real bounded UI navigator and retains the complete graph',async()=>{
 const p=page();p.locator=tid=>{
  if(tid.includes('cmpDiagram'))return {...root,evaluate:async(fn,id)=>{
   assert.equal(id,'source');return {x:0,y:0,width:800,height:600,viewportWidth:800,viewportHeight:600,scale:1,
    translate:{x:0,y:0},scroll:{x:0,y:0},node_bounds:{x:120,y:120,width:100,height:80}};
  }};
  return root;
 };
 const code=makeColdSourceRevealCode(args(),{readGraph,revealNodePlacement,nodePlacementViewport,nodePlacementPoint,samePlacementGraph});
 const r=await new Function('page',`return (${code})(page)`)(p);
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.graph_unchanged,true);assert.equal(r.fully_visible,true);
 assert.equal(r.settings_applied,false);assert.equal(r.zoom_steps,0);assert.deepEqual(p.graph,graph());
});
test('an offscreen source is revealed through the bounded native zoom control without moving its model node',async()=>{
 const p=page();p.graph.nodes[0].position.x=1200;const before=structuredClone(p.graph);let scale=1,clicks=0;
 const zoom={count:async()=>1,isVisible:async()=>true,getAttribute:async()=> 'Уменьшить масштаб',
  click:async()=>{scale*=0.9;clicks++;}};
 p.locator=tid=>tid.includes('cmpDiagram')?{...root,evaluate:async()=>({
  x:0,y:0,width:800,height:600,viewportWidth:800,viewportHeight:600,scale,translate:{x:0,y:0},scroll:{x:0,y:0},
  node_bounds:{x:1200*scale,y:120*scale,width:100*scale,height:80*scale}})}:{...root,locator:()=>zoom};
 const code=makeColdSourceRevealCode(args(),{readGraph,revealNodePlacement,nodePlacementViewport,nodePlacementPoint,samePlacementGraph});
 const r=await new Function('page',`return (${code})(page)`)(p);
 assert.equal(r.fully_visible,true);assert.ok(clicks>0&&clicks<=12);assert.equal(r.zoom_steps,clicks);
 assert.deepEqual(p.graph,before);
});
test('foreign owners, duplicate GUIDs, changed types, unbounded positions and incomplete graphs refuse before navigation',async()=>{
 const damage=[p=>p.graph.nodes[0].ref.document_id='foreign',p=>p.graph.nodes.push(structuredClone(p.graph.nodes[0])),
  p=>p.graph.nodes[0].type='transform.cross_table',p=>p.graph.nodes[0].position.y=10001,
  p=>p.graph.complete=false,p=>p.graph.interaction_ready=false];
 for(const mutate of damage){const p=page();mutate(p);let calls=0;
  await assert.rejects(revealColdSource(p,args(),readGraph,async()=>{calls++;},null,null,samePlacementGraph));
  assert.equal(calls,0);
 }
});
test('navigation cannot accept a graph mutation or a source that remains invisible',async()=>{
 for(const change of [p=>p.graph.nodes[0].position.x++,p=>p.graph.links.push({source:'source',target:'foreign'})]){
  const p=page();await assert.rejects(revealColdSource(p,args(),readGraph,async opts=>{
   change(p);await opts.guard();return {fully_visible:true};
  },null,null,samePlacementGraph),/graph changed/);
 }
 await assert.rejects(revealColdSource(page(),args(),readGraph,async()=>({fully_visible:false}),null,null,samePlacementGraph),/not revealed/);
});
