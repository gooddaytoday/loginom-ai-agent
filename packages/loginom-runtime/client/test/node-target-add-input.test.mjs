import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {nodePlacementViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph} from '../lib/node-placement.mjs';

function fixture({covered=false,changed=false,foreign=false,contextLost=false}={}){
 const prefix='MF;TF-1',tid=prefix+';Graph;Слияние',events=[];
 let scale=1,outline=false,clicks=0;
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:'tab'}};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,dom_epoch:1,interaction_ready:true,
  nodes:[{ref:{document_id:'doc',workflow_id:'wf',node_id:'union'},position:{x:80,y:592},dom_epoch:2,inputs:[0,1,2],outputs:[0]}],links:[]};
 const rectangle=(x,y,width,height)=>({x,y,width,height,right:x+width,bottom:y+height});
 const body={getAttribute:()=>tid,getBoundingClientRect:()=>rectangle(324+80*scale,100+592*scale,88*scale,120*scale)};
 const add={getAttribute:()=>tid+';Input_Add',getBoundingClientRect:()=>rectangle(324+100*scale,100+692*scale,16*scale,16*scale),contains:()=>false};
 const covering={getAttribute:name=>name==='data-tid'?'MF;footer;covered':null};
 const root={getBoundingClientRect:()=>rectangle(324,100,950,694),contains:e=>[body,add].includes(e),querySelectorAll:()=>[body,add],scrollLeft:0,scrollTop:0};
 const tab={classList:{contains:()=>true}},epochs=new WeakMap([[root,1]]);
 const document={querySelectorAll:s=>s==='[data-tid="tab"]'?[tab]:s==='[data-tid="MF;TF-1;ModelForm;cmpDiagram"]'?[root]:[],
  elementFromPoint:()=>{events.push('point');return covered?covering:add;}};
 const preparation={document,id:'doc',receipts:new Map([['wf',{workflowId:'wf',phase:'verified',tab}]]),nodeTargetDomEpochs:{objects:epochs}};
 const diagram={FNodes:{FCollection:foreign?[]:[{FGuid:'union',FCell:body}]},FmxGraph:{container:root,view:{get scale(){return scale;},translate:{x:0,y:0},getState:()=>({shape:{node:body}})}}};
 const sandbox={document,innerWidth:1280,innerHeight:800,__loginomDockPreparationV1:preparation,
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:diagram}}})}}}}}}}};
 const evaluate=(fn,...args)=>runInNewContext('('+fn.toString()+')',sandbox)(...args);
 const zoom={count:async()=>1,isVisible:async()=>outline,getAttribute:async()=> 'Уменьшить масштаб',waitFor:async()=>{},
  click:async()=>{events.push('reveal');scale/=1.1;if(changed)graph.nodes[0].ref.node_id='other';if(contextLost)preparation.id='other';}};
 const toggle={count:async()=>1,isVisible:async()=>true,click:async()=>{outline=!outline;}};
 const owner={count:async()=>1,isVisible:async()=>true,locator:()=>zoom};
 const locator=selector=>({
  locator,
  count:async()=>selector.startsWith('[data-tid^=')?graph.nodes[0].inputs.length:1,
  isVisible:async()=>true,isEnabled:async()=>true,
  evaluate:async(fn,arg)=>{
   if(selector.includes('cmpDiagram')){events.push('footprint');return evaluate(fn,root,arg);}
   assert.equal(selector,'[data-tid='+JSON.stringify(tid+';Input_Add')+']');return evaluate(fn,add,arg);
  },
  click:async()=>{assert.equal(selector,'[data-tid='+JSON.stringify(tid+';Input_Add')+']');events.push('click');clicks++;graph.nodes[0].inputs.push(3);},
 });
 const page={evaluate:async(fn,arg)=>evaluate(fn,arg),locator:s=>s.includes('btnShowOutline')?toggle:s.includes('cntDiagram')?owner:locator(s),mouse:{move:async()=>{}},waitForTimeout:async()=>{}};
 const task={request,effect:{id:'add-input',kind:'add_input',parameters:{ref:graph.nodes[0].ref,input:3},before:structuredClone(graph)},deadline:Date.now()+30000};
 const mutate=runInNewContext('('+mutateGraph.toString()+')');
 return {run:()=>mutate(page,task,async()=>structuredClone(graph),()=>{},nodePlacementViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph),events,stats:()=>({clicks,outline})};
}
test('add_input reveals the full owned node footprint before its original point guard and click',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(f.stats().clicks,1);assert.equal(f.stats().outline,false);
 assert.ok(f.events.indexOf('reveal')>=0);assert.ok(f.events.indexOf('reveal')<f.events.indexOf('point'));assert.ok(f.events.indexOf('point')<f.events.indexOf('click'));
});
test('a center still covered after add_input reveal retains Target is covered and records the hit data-tid',async()=>{
 const f=fixture({covered:true}),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.error,'Target is covered');assert.equal(f.stats().clicks,0);
 assert.ok(f.events.indexOf('reveal')<f.events.indexOf('point'));assert.equal(r.input_add_point_refusal.covering_data_tid,'MF;footer;covered');assert.equal(r.input_add_point_refusal.target_data_tid,'MF;TF-1;Graph;Слияние;Input_Add');
});
for(const [name,options]of [['foreign node',{foreign:true}],['graph changed during reveal',{changed:true}],['prepared context changed during reveal',{contextLost:true}]])test('add_input refuses '+name+' before point or port click',async()=>{
 const f=fixture(options),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.equal(f.stats().clicks,0);assert.equal(f.events.includes('point'),false);
});
