import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNodeTargetBrowserAdapter,mutateGraph} from '../lib/node-target-browser.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {nodePlacementPoint,nodePlacementPosition,nodePlacementGap,nodePlacementOverflow,revealNodePlacement,revealPreparedGraphNode,samePlacementGraph} from '../lib/node-placement.mjs';

function gapFixture(occupied=[]){
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF'},target:{kind:'new',type:'integration.rest_request'},inputs:[]};
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[],links:[]};
 const box={x:0,y:0,left:0,right:800,top:0,bottom:600,width:800,height:600};
 const canvas={getBoundingClientRect:()=>box,querySelectorAll:()=>occupied.map(r=>({getBoundingClientRect:()=>({...r,width:r.right-r.left,height:r.bottom-r.top})})),scrollLeft:0,scrollTop:0};
 const controller={FController:{FDiagram:{FmxGraph:{container:canvas,view:{scale:1,translate:{x:0,y:0}}}}}};
 const context={innerWidth:800,innerHeight:600,document:{elementFromPoint:()=>canvas},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}}}};
 const adapter=createNodeTargetBrowserAdapter({build:'7.4.2',execute:async code=>{
  if(code.includes('async function readGraph'))return graph;
  if(code.includes('evaluateAll')||code.includes('const row=page.locator'))return true;
  return runInNewContext('('+code+')',context)({locator:()=>({evaluate:async(fn,arg)=>fn(canvas,arg)})});
 }});
 return {adapter,request,graph};
}
test('D32 automatic placement reserves the whole REST footprint above an observed encoder port',async()=>{
 const f=gapFixture([{left:80,right:136,top:160,bottom:244},{left:140,right:149,top:192,bottom:204}]);
 const p=await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000);
 // Observed native REST body is 56x104; the old point-only choice (80,80)
 // intersected the encoder body below it even though the drop point was free.
 assert.equal(p.x<149&&p.x+72>80&&p.y<244&&p.y+104>160,false);
});
test('D32 an implicit encoder reserves its parent REST requested location without changing it',async()=>{
 const f=gapFixture(),reserved={x:80,y:80};
 const p=await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000,undefined,[reserved]);
 assert.ok(Math.abs(p.x-reserved.x)>=128||Math.abs(p.y-reserved.y)>=160);
 assert.deepEqual(reserved,{x:80,y:80});
});
test('D32 explicit REST coordinates retain their prior preflight without a new clearance refusal',async()=>{
 const f=gapFixture([{left:400,right:456,top:336,bottom:420},{left:460,right:469,top:368,bottom:380}]);
 f.request.target.position={x:400,y:300};
 await f.adapter.preflight(f.request,f.graph,Date.now()+10000);
 assert.deepEqual(f.request.target.position,{x:400,y:300});
});
test('D32 explicit Import beside the observed scenario variables retains its prior preflight',async()=>{
 const occupied=[{left:17,right:73,top:193,bottom:249},...Array.from({length:5},(_,i)=>({left:17,right:32,top:53+i*28,bottom:77+i*28}))];
 for(const position of [{x:100,y:300},{x:80,y:280},{x:80,y:320}]){
  const f=gapFixture(occupied);f.request.target={kind:'new',type:'imports.text',position};
  await f.adapter.preflight(f.request,f.graph,Date.now()+10000);
  assert.deepEqual(f.request.target.position,position);
 }
});
test('D32 automatic placement of unrelated node types keeps the old point clearance',async()=>{
 const f=gapFixture([{left:80,right:136,top:160,bottom:244}]);
 f.request.target.type='imports.text';
 assert.deepEqual(structuredClone(await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000)),{x:80,y:80});
 f.request.target.type='programming.javascript';
 assert.deepEqual(structuredClone(await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000)),{x:80,y:80});
});
test('D32 implicit encoder alone opts into REST clearance even without a reserved explicit REST',async()=>{
 const f=gapFixture([{left:80,right:136,top:160,bottom:244}]);f.request.target.type='programming.javascript';
 const p=await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000,undefined,[]);
 assert.notDeepEqual(structuredClone(p),{x:80,y:80});
});
test('D28/D32 search the visible gap missed by the coarse grid before choosing unreachable overflow',async()=>{
 for(const implicit of [false,true]){
  const occupied=[{left:0,right:180,top:0,bottom:600},{left:500,right:800,top:0,bottom:600}],f=gapFixture(occupied);
  if(implicit)f.request.target.type='programming.javascript';
  const p=await f.adapter.choosePosition(f.request,f.graph,Date.now()+10000,undefined,implicit?[]:undefined);
  assert.ok(p.x>=276&&p.x<=340&&p.y>=64&&p.y<520,JSON.stringify(p));
  assert.equal(nodePlacementGap({scale:1},p,occupied),true);
 }
});
test('D32 clearance keeps the observed 120-unit native auto-link case apart at every scale',()=>{
 for(const scale of [.5,1,2]){
  const v={x:324,y:100,scale,translate:{x:32,y:-16},scroll:{x:40,y:24}};
  const source=nodePlacementPoint(v,{x:184,y:144});
  const occupied=[{left:source.x,right:source.x+72*scale,top:source.y,bottom:source.y+80*scale}];
  assert.equal(nodePlacementGap(v,nodePlacementPoint(v,{x:304,y:144}),occupied),false);
  assert.equal(nodePlacementGap(v,nodePlacementPoint(v,{x:600,y:144}),occupied),true);
 }
 assert.throws(()=>nodePlacementGap({scale:1},{x:0,y:0},[{left:0,right:1,top:NaN,bottom:2}]),/clearance bounds/);
});

for(const {scale,translate,expected} of [
 {scale:1.5,translate:{x:0,y:0},expected:{x:160,y:136}},
 {scale:2,translate:{x:0,y:0},expected:{x:120,y:104}},
 {scale:1,translate:{x:32,y:32},expected:{x:208,y:176}},
 {scale:1,translate:{x:16,y:16},expected:{x:64,y:64}},
 {scale:1,translate:{x:-9920,y:-9920},expected:{x:10000,y:10000}},
 {scale:1,translate:{x:-10000,y:0},expected:null},
 {scale:1,translate:{x:0,y:-10000},expected:null},
])test('automatic placement respects model bounds: '+JSON.stringify({scale,translate}),async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'imports.text'},inputs:[]};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[],links:[]};
 const canvas={getBoundingClientRect:()=>({x:0,y:0,width:800,height:600,right:800,bottom:600}),querySelectorAll:()=>[],scrollLeft:0,scrollTop:0};
 const controller={FController:{FDiagram:{FmxGraph:{container:canvas,view:{scale,translate}}}}};
 const context={innerWidth:800,innerHeight:600,document:{elementFromPoint:()=>canvas},
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}}}};
 let calls=0;
 const adapter=createNodeTargetBrowserAdapter({build:'7.4.2',execute:async code=>{
  if(++calls===1)return graph;
  return runInNewContext('('+code+')',context)({locator:()=>({evaluate:async fn=>fn(canvas)})});
 }});
 const result=adapter.choosePosition(request,graph,Date.now()+10000);
 if(!expected){await assert.rejects(result,/no free visible canvas position/);return;}
 const position=structuredClone(await result);
 assert.deepEqual(position,expected);
 assert.doesNotThrow(()=>validateNodeTargetRequest({...request,target:{...request.target,position}}));
});
test('viewport rebinding ignores only node DOM epochs and preserves graph root and domain identities',()=>{
 const before={dom_epoch:1,document_id:'d',nodes:[{dom_epoch:2,ref:{node_id:'n'},position:{x:1,y:2},outputs:[0]}],links:[]};
 const after=structuredClone(before);after.nodes[0].dom_epoch=3;assert.equal(samePlacementGraph(before,after),true);
 for(const change of [g=>g.dom_epoch++,g=>g.document_id='other',g=>g.nodes[0].ref.node_id='other',g=>g.nodes[0].position.x++,g=>g.nodes[0].outputs=[],g=>g.links.push({source:'other'})]){
  const bad=structuredClone(after);change(bad);assert.equal(samePlacementGraph(before,bad),false);
 }
});
const view=()=>({x:324,y:100,width:1178,height:756,viewportWidth:1508,viewportHeight:862,scale:1,translate:{x:0,y:0},scroll:{x:0,y:0}});
test('crowded automatic placement chooses a bounded row beyond all observed drawings',async()=>{
 const v=view(),occupied=[{left:324,right:1502,top:100,bottom:856},{left:400,right:700,top:950,bottom:1200}];
 const run=runInNewContext('('+nodePlacementOverflow.toString()+')');
 const position=structuredClone(run(v,occupied,64,10000));
 assert.deepEqual(position,{x:80,y:1232});
 const f=fixture();f.args.position=position;
 assert.equal((await revealNodePlacement(f.args)).fully_visible,true);
 assert.ok(f.state().clicks>0);assert.equal(f.state().open,false);
});
test('browser automatic placement retains overflow coordinates in its serialized evaluator',async()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF'},target:{kind:'new',type:'imports.text'},inputs:[]};
 const graph={complete:true,document_id:'doc',workflow_ref:request.workflow_ref,nodes:[],links:[]};
 const box={x:0,y:0,left:0,right:800,top:0,bottom:600,width:800,height:600};
 const canvas={getBoundingClientRect:()=>box,querySelectorAll:()=>[{getBoundingClientRect:()=>box}],scrollLeft:0,scrollTop:0};
 const controller={FController:{FDiagram:{FmxGraph:{container:canvas,view:{scale:1,translate:{x:0,y:0}}}}}};
 const context={innerWidth:800,innerHeight:600,document:{elementFromPoint:()=>canvas},bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}}}};
 let calls=0;const adapter=createNodeTargetBrowserAdapter({build:'7.4.2',execute:async code=>++calls===1?graph:runInNewContext('('+code+')',context)({locator:()=>({evaluate:async fn=>fn(canvas)})})});
 assert.deepEqual(structuredClone(await adapter.choosePosition(request,graph,Date.now()+10000)),{x:80,y:728});
});
test('overflow remains beyond occupied drawings under zoom, translation and scroll',()=>{
 for(const scale of [.5,1,2]){
  const v={...view(),scale,translate:{x:32,y:-16},scroll:{x:24,y:40}};
  const occupied=[{left:350,right:800,top:200,bottom:950}];
  const p=nodePlacementOverflow(v,occupied,64,10000),screen=nodePlacementPoint(v,p);
  assert.ok(screen.y>=950+128);assert.ok(p.x>=64&&p.y>=64);
 }
});
test('overflow refuses absent, malformed and out-of-contract space',()=>{
 assert.equal(nodePlacementOverflow(view(),[],64,10000),null);
 assert.equal(nodePlacementOverflow(view(),[{left:324,right:1500,top:100,bottom:10100}],64,10000),null);
 for(const r of [{left:1,right:0,top:1,bottom:2},{left:1,right:2,top:NaN,bottom:2}])assert.throws(()=>nodePlacementOverflow(view(),[r],64,10000),/bounds/);
});
test('model coordinates account for zoom, translation, scroll and grid before screen rounding',()=>{
 for(const scale of [.5,1,.8264462809917354,1.5,2]){
  const v={...view(),x:324.125,y:100.375,scale,translate:{x:32.25,y:-16.125},scroll:{x:40.375,y:24.125}};
  const point=nodePlacementPoint(v,{x:1300,y:100});
  assert.deepEqual(nodePlacementPosition(v,point),{x:1304,y:104});
  assert.deepEqual(nodePlacementPosition(v,{x:Math.round(point.x),y:Math.round(point.y)}),{x:1304,y:104});
 }
 assert.throws(()=>nodePlacementPoint({...view(),scale:0},{x:1,y:2}),/transform/);
});
function fixture({visible=false,stuck=false,changed=false,ambiguous=false,wrongTip=false,delayed=false}={}){
 let v=view(),open=visible,clicks=0,guards=0;
 const toggle={count:async()=>1,isVisible:async()=>true,click:async()=>{open=!open;}};
 let ready=!delayed;
 const zoom={count:async()=>ambiguous?2:1,isVisible:async()=>open&&ready,getAttribute:async()=>wrongTip?'Увеличить масштаб':'Уменьшить масштаб',click:async()=>{assert.ok(ready);clicks++;if(!stuck)v.scale/=1.1;},waitFor:async({state})=>{ready=true;assert.equal(open,state==='visible');}};
 const owner={count:async()=>1,isVisible:async()=>true,locator:s=>{assert.equal(s,'.bg-workflow-outline-toolbar [data-tid$=";tlb;b"]');return zoom;}};
 return {args:{page:{locator:s=>{if(s.includes('btnShowOutline'))return toggle;assert.equal(s,'[data-tid="MF;TF;ModelForm;cntDiagram"]');return owner;},waitForTimeout:async()=>{}},root:{evaluate:async()=>structuredClone(v)},position:{x:1300,y:100},prefix:'MF;TF',guard:async()=>{guards++;if(changed&&clicks)throw Error('Graph changed');},remaining:()=>10000,readViewport:()=>{},project:nodePlacementPoint},state:()=>({v,open,clicks,guards})};
}
test('outline is awaited after opening; another workflow cannot provide the control',async()=>{
 const f=fixture({delayed:true});assert.equal((await revealNodePlacement(f.args)).fully_visible,true);assert.equal(f.state().open,false);
});
test('ambiguous controls and wrong zoom direction never receive a zoom gesture',async()=>{
 for(const options of [{ambiguous:true},{wrongTip:true}]){
  const f=fixture(options);await assert.rejects(revealNodePlacement(f.args),/zoom-out control/);assert.equal(f.state().clicks,0);assert.equal(f.state().open,false);
 }
});
test('offscreen position is revealed by bounded UI zoom without changing requested coordinates',async()=>{
 const f=fixture(),original=structuredClone(f.args.position),r=await revealNodePlacement(f.args);
 assert.equal(r.zoom_steps,2);assert.equal(f.state().open,false);assert.deepEqual(f.args.position,original);
 assert.ok(r.point.x<1500);assert.deepEqual(nodePlacementPosition(r.view,r.point),{x:1304,y:104});
});
test('visible positions do not touch outline and existing outline is preserved',async()=>{
 const f=fixture();f.args.position={x:104,y:200};await revealNodePlacement(f.args);assert.equal(f.state().clicks,0);
 const opened=fixture({visible:true});await revealNodePlacement(opened.args);assert.equal(opened.state().open,true);
});
test('graph changes during navigation never permit a drop or claim verified cleanup',async()=>{
 const f=fixture({changed:true});await assert.rejects(revealNodePlacement(f.args),e=>e.placement_navigation_unverified===true);assert.equal(f.state().clicks,1);
});
test('distant positions stop after the bounded number of zoom steps',async()=>{
 const f=fixture();f.args.position={x:1000000,y:100};const r=await revealNodePlacement(f.args);
 assert.equal(r.zoom_steps,12);assert.equal(f.state().open,false);assert.ok(r.point.x>r.view.viewportWidth);
});

// A valid drop point does not guarantee that the node's lower data port fits.
test('created node zoom uses its full rendered footprint, not only the drop point',async()=>{
 const f=fixture();f.args.position={x:400,y:900};f.args.nodeId='created';
 f.args.root.evaluate=async(_fn,id)=>{
  assert.equal(id,'created');const v=f.state().v;
  return {...structuredClone(v),node_bounds:{x:v.x+386*v.scale,y:v.y+870*v.scale,width:88*v.scale,height:142*v.scale}};
 };
 const r=await revealNodePlacement(f.args);
 assert.equal(r.fully_visible,true);assert.equal(r.zoom_steps,4);assert.equal(f.state().open,false);
 assert.ok(r.view.node_bounds.y+r.view.node_bounds.height<r.view.y+r.view.height-8);
});
test('created node without verified rendered bounds cannot silently use a point',async()=>{
 const f=fixture();f.args.nodeId='missing';
 await assert.rejects(revealNodePlacement(f.args),/footprint unavailable/);assert.equal(f.state().clicks,0);
});

for(const edge of ['canvas','browser'])for(const axis of ['right','bottom'])test('rendered node exactly eight pixels inside '+edge+' '+axis+' boundary needs no navigation',async()=>{
 const f=fixture();f.args.nodeId='edge';
 const v={...structuredClone(f.state().v),y:80,...(edge==='browser'?{viewportWidth:1280,viewportHeight:800}:{})};
 f.args.root.evaluate=async()=>({...v,node_bounds:{
  x:axis==='right'?Math.min(v.x+v.width,v.viewportWidth)-8-111:500,
  y:axis==='bottom'?Math.min(v.y+v.height,v.viewportHeight)-8-154:106,width:111,height:154}});
 const r=await revealNodePlacement(f.args);
 assert.equal(r.fully_visible,true);assert.equal(r.zoom_steps,0);
 assert.equal(f.state().clicks,0);assert.equal(f.state().open,false);
});
test('navigation accepts an eight pixel inset after zoom and outline cleanup, but never a smaller inset',async()=>{
 const f=fixture();f.args.nodeId='edge';
 f.args.root.evaluate=async()=>({...structuredClone(f.state().v),y:80,viewportWidth:1280,viewportHeight:800,node_bounds:{
  x:f.state().clicks?1161:1161.01,y:106,width:111,height:154}});
 const r=await revealNodePlacement(f.args);
 assert.equal(r.fully_visible,true);assert.equal(r.zoom_steps,1);
 assert.equal(f.state().clicks,1);assert.equal(f.state().open,false);
 assert.equal(r.view.node_bounds.x+r.view.node_bounds.width,1272);
});

for(const fault of [null,'foreign','lost'])test('existing target scroll preserves native scale and refuses '+(fault??'no owner change'),async()=>{
 const f=fixture();f.args.nodeId='existing';f.args.scrollNode=true;let scrolled=false;
 const canvas={scrollLeft:0,scrollTop:0};
 f.args.root.evaluate=async(fn,arg)=>{
  if(typeof arg==='object'){
   scrolled=true;fn(canvas,arg);
   if(fault==='lost')throw Error('Lost native scroll reply');
   return;
  }
  const v=structuredClone(f.state().v);
  return {...v,scroll:{x:canvas.scrollLeft,y:canvas.scrollTop},node_bounds:{x:1600-canvas.scrollLeft,y:228-canvas.scrollTop,width:100,height:120}};
 };
 f.args.guard=async()=>{if(scrolled&&fault==='foreign')throw Error('Graph changed');};
 if(fault){await assert.rejects(revealNodePlacement(f.args),e=>fault==='lost'?e.placement_navigation_unverified===true:e.message==='Graph changed');}
 else {const r=await revealNodePlacement(f.args);assert.equal(r.fully_visible,true);assert.equal(r.view.scale,1);assert.equal(r.zoom_steps,0);}
 assert.equal(f.state().clicks,0);assert.ok(canvas.scrollLeft>0);
});

function insetFixture({lost=false}={}){
 const f=fixture();Object.assign(f.state().v,{width:950,height:694,viewportWidth:1280,viewportHeight:800});
 f.args.nodeId='long-label';f.args.position={x:864,y:56};let left=0,increases=0;
 const canvas={get scrollLeft(){return left;},set scrollLeft(x){left=Math.max(0,Math.min(x,975*f.state().v.scale-950));},scrollTop:0};
 f.args.root.evaluate=async(fn,arg)=>{
  if(typeof arg==='object'){fn(canvas,arg);canvas.scrollTop=0;if(lost)throw Error('Lost scroll reply');return;}
  const v=structuredClone(f.state().v),s=v.scale;
  return {...v,scroll:{x:left,y:0},node_bounds:{x:v.x+836*s-left,y:v.y+Math.round(6*s),width:112*s,height:158*s}};
 };
 const locate=f.args.page.locator;
 f.args.page.locator=s=>{
  const owner=locate(s);if(!s.endsWith(';cntDiagram"]'))return owner;
  return {...owner,locator:s=>s.endsWith(';tlb;b-1"]')?{count:async()=>1,isVisible:async()=>f.state().open,
   getAttribute:async()=> 'Увеличить масштаб',click:async()=>{increases++;f.state().v.scale*=1.1;},
   waitFor:async({state})=>assert.equal(f.state().open,state==='visible')}:owner.locator(s)};
 };
 return {...f,increases:()=>increases};
}
test('D15 top inset grows through native zoom-in and scroll without moving the model node',async()=>{
 const f=insetFixture(),position=structuredClone(f.args.position),r=await revealNodePlacement(f.args);
 assert.equal(r.fully_visible,true);assert.equal(f.increases(),3);assert.equal(f.state().clicks,0);
 assert.ok(r.view.node_bounds.y>=108);assert.ok(r.view.scroll.x>0);assert.equal(f.state().open,false);
 assert.deepEqual(f.args.position,position);
 assert.ok(r.navigation_steps.some(s=>s.action==='zoom_in'&&s.before.scale<s.after.scale));
 assert.ok(r.navigation_steps.some(s=>s.action==='scroll'&&s.after.scroll.x>s.before.scroll.x));
});
test('D15 lost native scroll reply stops navigation and retains uncertainty',async()=>{
 const f=insetFixture({lost:true});
 await assert.rejects(revealNodePlacement(f.args),e=>e.placement_navigation_unverified===true&&/Lost scroll reply/.test(e.message));
 assert.equal(f.increases(),1);assert.equal(f.state().clicks,0);assert.equal(f.state().open,false);
});

function overflowFixture({foreign=false,missing=false,wrongIcon=false,ambiguous=false,changed=false,buffered=false}={}){
 const f=fixture();let menuOpen=false,triggers=0,items=0,clock=1000,lastHide=-Infinity,suppressed=0;
 const old=f.args.page.locator;
 const toggle=old('[data-tid="MF;TF;ModelForm;btnShowOutline"]');
 const item={count:async()=>foreign||missing?0:ambiguous?2:1,isVisible:async()=>menuOpen,
  locator:s=>{assert.equal(s,'.bg-icon-preview');return {count:async()=>wrongIcon?0:1};},
  click:async()=>{assert.ok(menuOpen);items++;await toggle.click();}};
 const menu={count:async()=>menuOpen?1:0,isVisible:async()=>menuOpen,
  waitFor:async({state})=>assert.equal(menuOpen,state==='visible'),
  locator:s=>{assert.equal(s,'[role="menuitem"][data-qtip="Показать карту сценария"]');return item;}};
 f.args.prefix='MF;TF-7';
 f.args.page.locator=s=>{
  if(s==='[data-tid="MF;TF-7;ModelForm;btnShowOutline"]')return {...toggle,isVisible:async()=>false,getAttribute:async()=> 'Показать карту сценария'};
  if(s==='[data-tid="MF;TF-7;ModelForm;tlbModel;b"]')return {count:async()=>1,isVisible:async()=>true,click:async()=>{triggers++;if(buffered&&!menuOpen&&clock-lastHide<250){suppressed++;return;}menuOpen=!menuOpen;if(!menuOpen)lastHide=clock;}};
  if(s==='[data-tid="MF;TF-7;ModelForm;tlbModel;b;mn"]')return menu;
  assert.equal(s,'[data-tid="MF;TF-7;ModelForm;cntDiagram"]');return old('[data-tid="MF;TF;ModelForm;cntDiagram"]');
 };
 f.args.page.waitForTimeout=async ms=>{clock+=ms;};
 const guard=f.args.guard;f.args.guard=async()=>{await guard();if(changed&&triggers)throw Error('Graph changed');};
 return {...f,overflow:()=>({menuOpen,triggers,items}),timing:()=>({clock,lastHide,suppressed})};
}
test('hidden native outline button opens its exact form overflow, reveals target and restores both menus',async()=>{
 const f=overflowFixture();const run=runInNewContext('('+revealNodePlacement.toString()+')');
 const r=await run(f.args);
 assert.equal(r.fully_visible,true);assert.equal(r.zoom_steps,2);assert.equal(r.outline_closed,true);
 assert.deepEqual(f.overflow(),{menuOpen:false,triggers:4,items:2});assert.equal(f.state().open,false);
});
test('foreign or missing outline items, wrong icons and ambiguous items never toggle or zoom',async()=>{
 for(const options of [{foreign:true},{missing:true},{wrongIcon:true},{ambiguous:true}]){
  const f=overflowFixture(options);await assert.rejects(revealNodePlacement(f.args),/outline menu item unavailable/);
  assert.equal(f.overflow().items,0);assert.equal(f.overflow().menuOpen,false);assert.equal(f.state().clicks,0);
 }
});
test('graph change after opening overflow refuses the outline gesture',async()=>{
 const f=overflowFixture({changed:true});
 await assert.rejects(revealNodePlacement(f.args),e=>e.message==='Graph changed'&&e.placement_navigation_unverified===true);
 assert.equal(f.overflow().items,0);assert.equal(f.state().clicks,0);
});

test('consecutive reveals respect native menu reopen suppression without repeating any opening click',async()=>{
 const f=overflowFixture({buffered:true});
 assert.equal((await revealNodePlacement(f.args)).fully_visible,true);
 f.args.position={x:2000,y:100};
 assert.equal((await revealNodePlacement(f.args)).fully_visible,true);
 assert.deepEqual(f.overflow(),{menuOpen:false,triggers:8,items:4});
 assert.equal(f.timing().suppressed,0);assert.equal(f.state().open,false);
});
test('menu settling consumes the original deadline and cannot dispatch after it expires',async()=>{
 const f=overflowFixture({buffered:true});let available=100;
 f.args.remaining=()=>{if(available<=0)throw Error('Original deadline');return available;};
 f.args.page.waitForTimeout=async ms=>{available-=ms;};
 await assert.rejects(revealNodePlacement(f.args),/Original deadline/);
 assert.deepEqual(f.overflow(),{menuOpen:false,triggers:0,items:0});assert.equal(f.state().clicks,0);
});

// Inject failure after the native fixture gesture, then classify it through
// the real graph mutation wrapper. A lost reply must never permit creation.
for(const fault of ['visible-toggle','overflow-open','overflow-toggle','zoom','overflow-close','menu-cleanup'])test('lost outline gesture reply retains mutation uncertainty: '+fault,async()=>{
 const f=fault==='visible-toggle'?fixture():overflowFixture();
 const base=f.args.page.locator;let creates=0,triggers=0,items=0,toggles=0;
 const lost=async(dispatch)=>{await dispatch();throw Error('Lost reply after '+fault);};
 f.args.page.locator=selector=>{
  if(selector==='[data-tid='+JSON.stringify(f.args.prefix+';ModelForm;cmpDiagram')+']')return f.args.root;
  if(!selector.includes('ModelForm')){creates++;throw Error('Unexpected creation gesture');}
  const original=base(selector);
  if(selector.endsWith(';btnShowOutline"]')&&fault==='visible-toggle')return {...original,click:async(...args)=>{toggles++;await lost(()=>original.click(...args));}};
  if(selector.endsWith(';tlbModel;b"]'))return {...original,click:async(...args)=>{
   triggers++;if(fault==='overflow-open'&&triggers===1||fault==='menu-cleanup'&&triggers===2)await lost(()=>original.click(...args));
   else await original.click(...args);
  }};
  if(selector.endsWith(';tlbModel;b;mn"]'))return {...original,locator:child=>{
   const item=original.locator(child);return {...item,click:async(...args)=>{
    items++;if(fault==='overflow-toggle'&&items===1||fault==='overflow-close'&&items===2)await lost(()=>item.click(...args));
    else await item.click(...args);
   }};
  }};
  if(selector.endsWith(';cntDiagram"]')&&fault==='zoom')return {...original,locator:child=>{
   const zoom=original.locator(child);return {...zoom,click:async(...args)=>lost(()=>zoom.click(...args))};
  }};
  return original;
 };
 f.args.page.evaluate=async()=>true;
 const graph={interaction_ready:true,dom_epoch:1,document_id:'doc',nodes:[],links:[]};
 const task={deadline:Date.now()+10000,request:{document_id:'doc',workflow_ref:{prefix:f.args.prefix,workflow_id:'wf'}},
  effect:{id:'lost-outline',kind:'create',parameters:{type:'transform.join_data',position:f.args.position},before:graph},
  types:{'transform.join_data':{title:'Join',palette_group:'Transforms'}}};
 const r=await mutateGraph(f.args.page,task,async()=>graph,()=>{},f.args.readViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph);
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.cleanup_complete,false);
 assert.match(r.error,/Lost reply after/);assert.equal(creates,0);assert.deepEqual(graph.nodes,[]);
 if(fault==='visible-toggle')assert.equal(toggles,1);
 if(fault==='overflow-open'){assert.equal(triggers,1);assert.equal(items,0);}
 if(fault==='overflow-toggle')assert.equal(items,1);
 if(fault==='overflow-close')assert.equal(items,2);
 // After the menu-close reply is lost, a fresh owned-menu opening may restore
 // the known-open outline. That cleanup must not erase the original fault.
 if(fault==='menu-cleanup'){assert.equal(triggers,4);assert.equal(items,2);assert.equal(f.state().open,false);}
 assert.equal(f.state().clicks,fault==='zoom'?1:fault==='overflow-close'?2:0);
});

// LAB-151 line 3905: pinning the process console clips a minimum-scale node.
for(const maxScroll of [151,148])test('D28 minimum zoom scroll range '+maxScroll+' preserves full drawing inset',async()=>{
 const f=fixture({stuck:true});Object.assign(f.state().v,{x:324,y:100,width:950,height:494,viewportWidth:1280,viewportHeight:800,scale:0.3855432894295314});
 f.args.nodeId='rest-country-de';f.args.position={x:208,y:1536};let top=0;
 const canvas={scrollLeft:0,get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(maxScroll,value));}};
 f.args.root.evaluate=async(fn,arg)=>{
  if(typeof arg==='object'){fn(canvas,arg);canvas.scrollLeft=0;return;}
  return {...structuredClone(f.state().v),scroll:{x:0,y:top},node_bounds:{x:398,y:673-top,width:34.5,height:61.5}};
 };
 const run=runInNewContext('('+revealNodePlacement.toString()+')');
 const r=await run(f.args);
 assert.equal(r.fully_visible,maxScroll===151);assert.equal(top,maxScroll);
 assert.equal(r.view.scale,0.3855432894295314);assert.equal(r.zoom_steps,1);assert.equal(f.state().open,false);
 assert.equal(r.navigation_steps.filter(s=>s.action==='scroll').length,1);
 assert.equal(r.view.node_bounds.y+r.view.node_bounds.height<=586,maxScroll===151);
});

// Connection placement has no nodeId: its projected point still needs the inset.
for(const maxScroll of [8,7])test('D28 connection point 398.024/793.978 native scroll range '+maxScroll,async()=>{
 const f=fixture({stuck:true});Object.assign(f.state().v,{x:324,y:100,width:950,height:694,viewportWidth:1280,viewportHeight:800,scale:0.3855432894295314});
 f.args.position={x:192,y:1800};let top=0;
 const canvas={scrollLeft:0,get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(maxScroll,value));}};
 f.args.root.evaluate=async(fn,arg)=>{
  if(typeof arg==='object'){fn(canvas,arg);canvas.scrollLeft=0;return;}
  return {...structuredClone(f.state().v),scroll:{x:0,y:top}};
 };
 const before=nodePlacementPoint(f.state().v,f.args.position);
 assert.ok(Math.abs(before.x-398.024)<.001);assert.ok(Math.abs(before.y-793.978)<.001);
 const run=runInNewContext('('+revealNodePlacement.toString()+')'),r=await run(f.args);
 assert.equal(r.fully_visible,maxScroll===8);assert.equal(top,maxScroll);assert.equal(r.zoom_steps,1);
 assert.equal(r.point.y<=786,maxScroll===8);assert.equal(f.state().open,false);
 assert.equal(r.navigation_steps.filter(s=>s.action==='scroll').length,1);
});

// The cold prepared-node path serializes these same viewport helpers.
for(const available of [12,11,0])test('D28 prepared cold top96 requires12px upward scroll; available '+available,async()=>{
 const f=fixture({stuck:true});Object.assign(f.state().v,{x:324,y:100,width:950,height:694,viewportWidth:1280,viewportHeight:800});
 f.args.nodeId='cold-node';f.args.position={x:192,y:80};let top=available;
 const canvas={scrollLeft:0,get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(available,value));}};
 f.args.root.evaluate=async(fn,arg)=>{
  if(typeof arg==='object'){fn(canvas,arg);canvas.scrollLeft=0;return;}
  return {...structuredClone(f.state().v),scroll:{x:0,y:top},node_bounds:{x:646.5,y:96+available-top,width:43.2952880859375,height:61.5}};
 };
 const locate=f.args.page.locator;
 f.args.page.locator=selector=>{
  if(selector.endsWith(';cmpDiagram"]'))return {...f.args.root,count:async()=>1,isVisible:async()=>true};
  const owner=locate(selector);if(!selector.endsWith(';cntDiagram"]'))return owner;
  return {...owner,locator:child=>{const zoom=owner.locator(child);return {...zoom,click:async()=>{await zoom.click();if(f.state().clicks<=10)f.state().v.scale/=1.1;}};}};
 };
 const ref={document_id:'doc',workflow_id:'flow',node_id:'cold-node'};
 const graph={complete:true,interaction_ready:true,nodes:[{ref,locked:false,position:f.args.position}],links:[]};
 const args={binding:{document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF'},node:ref},deadline:Date.now()+10000};
 const r=await revealPreparedGraphNode(f.args.page,args,async()=>structuredClone(graph),revealNodePlacement,f.args.readViewport,nodePlacementPoint,samePlacementGraph);
 assert.equal(r.fully_visible,available===12);assert.equal(r.status,available===12?'SUCCEEDED':'FAILED');
 assert.equal(r.zoom_steps,11);assert.equal(top,0);assert.equal(r.graph_unchanged,true);assert.equal(r.settings_applied,false);
 const scroll=r.navigation_steps.find(s=>s.action==='scroll');assert.ok(scroll);assert.equal(scroll.before.node_bounds.y,96);
 assert.equal(scroll.after.node_bounds.y,96+available);assert.equal(scroll.after.scroll.y,0);assert.equal(f.state().open,false);
});
