import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {nodePlacementViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph} from '../lib/node-placement.mjs';

function fixture({covered=false,changed=false,foreign=false,contextLost=false,toggleCount=1,toggleVisible=true,zoomCount=1,wrongTip=false,stuck=false,interactive=true,addOffset=692,input=3,create=false,scrollable=false}={}){
 const prefix='MF;TF-1',tid=prefix+';Graph;Слияние',events=[];
 let scale=1,outline=false,clicks=0,toggleClicks=0,scroll=0;
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:'tab'}};
 const node={ref:{document_id:'doc',workflow_id:'wf',node_id:'union'},position:{x:80,y:592},dom_epoch:2,inputs:Array.from({length:input},(_,i)=>i),outputs:[0]};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,dom_epoch:1,interaction_ready:true,
  nodes:create?[]:[node],links:[]};
 const rectangle=(x,y,width,height)=>({x,y,width,height,right:x+width,bottom:y+height});
 const body={getAttribute:()=>tid,getBoundingClientRect:()=>rectangle(324+80*scale,100+592*scale-scroll,88*scale,120*scale)};
 const add={getAttribute:()=>tid+';Input_Add',getBoundingClientRect:()=>rectangle(324+100*scale,100+addOffset*scale-scroll,16*scale,16*scale),contains:()=>false};
 const palette={getBoundingClientRect:()=>rectangle(0,0,100,50),contains:()=>false};
 const covering={getAttribute:name=>name==='data-tid'?'MF;footer;covered':null};
 const root={getBoundingClientRect:()=>rectangle(324,100,950,694),contains:e=>[body,add].includes(e),querySelectorAll:()=>[body,add],scrollLeft:0,get scrollTop(){return scroll;},clientWidth:950,scrollWidth:950,clientHeight:694,scrollHeight:scrollable?1100:694,scrollTo:({top})=>{events.push('scroll');scroll=top;}};
 const tab={classList:{contains:()=>true}},epochs=new WeakMap([[root,1]]);
 const document={querySelectorAll:s=>s==='[data-tid="tab"]'?[tab]:s==='[data-tid="MF;TF-1;ModelForm;cmpDiagram"]'?[root]:[],
  elementFromPoint:(x)=>{events.push('point');if(create&&!graph.nodes.length)return x<200?palette:root;return covered?covering:add;}};
 const preparation={document,id:'doc',receipts:new Map([['wf',{workflowId:'wf',phase:'verified',tab}]]),nodeTargetDomEpochs:{objects:epochs}};
 const diagram={FNodes:{FCollection:foreign?[]:[{FGuid:'union',FCell:body}]},FmxGraph:{container:root,view:{get scale(){return scale;},translate:{x:0,y:0},getState:()=>({shape:{node:body}})}}};
 const sandbox={document,innerWidth:1280,innerHeight:800,__loginomDockPreparationV1:preparation,
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FDiagram:diagram}}})}}}}}}}};
 const evaluate=(fn,...args)=>runInNewContext('('+fn.toString()+')',sandbox)(...args);
 const zoom={count:async()=>zoomCount,isVisible:async()=>outline,getAttribute:async()=>wrongTip?'Увеличить масштаб':'Уменьшить масштаб',waitFor:async()=>{},
  click:async()=>{events.push('reveal');if(!stuck)scale/=1.1;if(changed)graph.nodes[0].ref.node_id='other';if(contextLost)preparation.id='other';}};
 const toggle={count:async()=>toggleCount,isVisible:async()=>{assert.equal(toggleCount,1);return toggleVisible;},click:async()=>{events.push('toggle');toggleClicks++;outline=!outline;}};
 const owner={count:async()=>1,isVisible:async()=>true,locator:()=>zoom};
 const locator=selector=>({
  locator,
  count:async()=>selector.startsWith('[data-tid^=')?graph.nodes[0].inputs.length:1,
  isVisible:async()=>true,isEnabled:async()=>interactive,
  boundingBox:async()=>root.getBoundingClientRect(),
  evaluate:async(fn,arg)=>{
   if(selector.includes('cmpDiagram')){events.push('footprint');return evaluate(fn,root,arg);}
   if(selector.includes('TreeText'))return evaluate(fn,palette,arg);
   assert.equal(selector,'[data-tid='+JSON.stringify(tid+';Input_Add')+']');return evaluate(fn,add,arg);
  },
  click:async()=>{assert.equal(selector,'[data-tid='+JSON.stringify(tid+';Input_Add')+']');events.push('click');clicks++;graph.nodes[0].inputs.push(input);},
 });
 const page={evaluate:async(fn,arg)=>evaluate(fn,arg),locator:s=>s.includes('btnShowOutline')?toggle:s.includes('cntDiagram')?owner:locator(s),mouse:{move:async()=>{},down:async()=>{events.push('drop-start');},up:async()=>{events.push('drop-end');graph.nodes.push(node);}},waitForTimeout:async()=>{}};
 const task={request,effect:{id:'add-input',kind:'add_input',parameters:{ref:node.ref,input},before:structuredClone(graph)},deadline:Date.now()+30000};
 if(create){task.effect.kind='create';task.effect.parameters={type:'transform.union_data',position:{x:80,y:592}};task.types={'transform.union_data':{title:'Слияние',palette_group:'Трансформация'}};}
 const reveal=runInNewContext('('+revealNodePlacement.toString()+')');
 const mutate=runInNewContext('('+mutateGraph.toString()+')');
 return {run:()=>mutate(page,task,async()=>structuredClone(graph),()=>{},nodePlacementViewport,nodePlacementPoint,reveal,samePlacementGraph),events,stats:()=>({clicks,outline,toggleClicks}),graph};
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

for(const options of [{toggleCount:0},{toggleCount:2},{toggleCount:1,toggleVisible:false}]){
 const name=JSON.stringify(options),fallback={...options,zoomCount:0,addOffset:660,input:2};
 test('Eight128 outline facts permit only the original add-input point check: '+name,async()=>{
  const f=fixture(fallback),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(f.stats().toggleClicks,0);assert.equal(f.stats().clicks,1);
  const nav=r.placement_navigation;assert.equal(nav.fully_visible,false);assert.equal(nav.point_check_required,true);assert.equal(nav.zoom_steps,0);
  assert.deepEqual(structuredClone(nav.point),{x:404,y:692});assert.ok(nav.view.node_bounds.y+nav.view.node_bounds.height>786);
  assert.deepEqual(structuredClone(nav.outline_controls),{toggle:{count:options.toggleCount,visible:options.toggleCount===1?false:options.toggleCount===0?false:null},zoom:{count:0,visible:false}});
  assert.ok(f.events.indexOf('footprint')<f.events.indexOf('point'));assert.ok(f.events.indexOf('point')<f.events.indexOf('click'));
  assert.deepEqual(f.graph.nodes[0].position,{x:80,y:592});
 });
 test('Eight128 covered add-input center keeps its refusal and hit identity: '+name,async()=>{
  const f=fixture({...fallback,covered:true}),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(r.error,'Target is covered');
  assert.equal(f.stats().clicks,0);assert.equal(f.stats().toggleClicks,0);
  assert.deepEqual(structuredClone(r.input_add_point_refusal),{covered:true,target_data_tid:'MF;TF-1;Graph;Слияние;Input_Add',covering_data_tid:'MF;footer;covered',point:{x:432,y:768}});
 });
 test('Eight128 create retains its possible drop effect and incomplete node visibility: '+name,async()=>{
  const f=fixture({...fallback,create:true}),r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.error,'Created node and ports are not fully visible');
  assert.equal(f.graph.nodes.length,1);assert.equal(f.stats().toggleClicks,0);assert.equal(f.stats().clicks,0);assert.ok(f.events.includes('drop-end'));
  assert.equal(r.placement_navigation.fully_visible,true);assert.equal(r.placement_navigation.node_visibility.fully_visible,false);
  assert.equal(r.placement_navigation.node_visibility.outline_controls.toggle.count,options.toggleCount);
 });
}
test('uninteractive add-input target still refuses without a click when outline is unavailable',async()=>{
 const f=fixture({toggleCount:0,zoomCount:0,addOffset:660,interactive:false}),r=await f.run();
 assert.equal(r.status,'NOT_APPLIED');assert.equal(r.error,'Exact interactive target unavailable');assert.equal(f.stats().clicks,0);assert.equal(f.events.includes('point'),false);
});
for(const options of [{stuck:true},{zoomCount:2},{wrongTip:true}])test('unverified zoom does not fall through to add-input point: '+JSON.stringify(options),async()=>{
 const f=fixture(options),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(f.stats().clicks,0);assert.equal(f.events.includes('point'),false);
 if(options.stuck)assert.equal(r.error,'Input-add node and ports are not fully visible');
});

for(const covered of [false,true])test('Eight133 offscreen input scroll precedes the unchanged point guard: '+covered,async()=>{
 const f=fixture({scrollable:true,toggleCount:1,toggleVisible:false,zoomCount:0,addOffset:692,covered}),r=await f.run();
 assert.equal(r.status,covered?'NOT_APPLIED':'SUCCEEDED');assert.equal(f.stats().clicks,covered?0:1);
 assert.ok(f.events.indexOf('scroll')<f.events.indexOf('point'));assert.equal(f.stats().toggleClicks,0);assert.deepEqual(f.graph.nodes[0].position,{x:80,y:592});
 if(covered){assert.equal(r.error,'Target is covered');assert.equal(r.input_add_point_refusal.covering_data_tid,'MF;footer;covered');}
});
