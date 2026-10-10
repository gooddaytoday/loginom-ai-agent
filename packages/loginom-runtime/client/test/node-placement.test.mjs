import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNodeTargetBrowserAdapter,mutateGraph} from '../lib/node-target-browser.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {nodePlacementPoint,nodePlacementPosition,nodePlacementOverflow,revealNodePlacement,samePlacementGraph} from '../lib/node-placement.mjs';

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

// Native 7.4.2 toolbar/menu identities captured from the case diagnostic copy.
function overflowFixture({foreignToolbar=false,foreignMenu=false,duplicate=false,selfHide=false,cleanupFailure=false,focusOnly=false,changedOnOpen=false}={}){
 const f=fixture(),base=f.args.page.locator;let menuOpen=false,itemClicks=0,opens=0;
 const toolbarTid='MF;TF;ModelForm;tlbModel',triggerTid=toolbarTid+';b',menuTid=triggerTid+';mn';
 const attrs=(id,tid)=>({id,getAttribute:k=>k==='data-tid'?tid:k==='data-qtip'?'Показать карту сценария':null});
 const toolbarEl=attrs('bar',toolbarTid),triggerEl=attrs('trigger',triggerTid),buttonEl=attrs('button','MF;TF;ModelForm;btnShowOutline');
 toolbarEl.querySelector=()=>triggerEl;buttonEl.closest=()=>toolbarEl;
 const bar={},button={ownerCt:foreignToolbar?{}:bar,getEl:()=>({dom:buttonEl}),get pressed(){return f.state().open;}},triggerComponent={ownerCt:bar};
 const menuComponent={el:{dom:attrs('menu',menuTid)}};
 bar.layout={overflowHandler:{$className:'Ext.layout.container.boxOverflow.Menu',menuTrigger:triggerComponent,menuItems:[button],menu:menuComponent}};
 const itemEl=attrs('item',menuTid+';mn.ch-2'),itemComponent={ownerCt:foreignMenu?{}:menuComponent,text:'Показать карту сценария',disabled:false,get checked(){return f.state().open;}};
 const components={bar,button,trigger:triggerComponent,item:itemComponent};
 const evaluate=(el,fn,args)=>runInNewContext('('+fn.toString()+')(element,args)',{element:el,args,Ext:{getCmp:id=>components[id]},document:{querySelector:s=>s.includes('tlbModel')?toolbarEl:buttonEl}});
 const trigger={count:async()=>1,isVisible:async()=>true,press:async key=>{assert.equal(key,'ArrowDown');opens++;menuOpen=!focusOnly||opens>1;if(changedOnOpen){menuOpen=false;await base('[data-tid="MF;TF;ModelForm;btnShowOutline"]').click();}}};
 const toolbar={count:async()=>1,locator:s=>{assert.equal(s,'[data-tid="'+triggerTid+'"]');return trigger;}};
 const toggle={...base('[data-tid="MF;TF;ModelForm;btnShowOutline"]'),isVisible:async()=>false,evaluate:async(fn,args)=>evaluate(buttonEl,fn,args)};
 const item={count:async()=>duplicate?2:1,isVisible:async()=>menuOpen,evaluate:async(fn,args)=>evaluate(itemEl,fn,args),click:async()=>{itemClicks++;await toggle.click();if(selfHide)menuOpen=false;}};
 const menu={count:async()=>1,isVisible:async()=>menuOpen,waitFor:async({state})=>assert.equal(menuOpen,state==='visible'),locator:()=>({filter:()=>item}),press:async key=>{assert.equal(key,'Escape');if(cleanupFailure)throw Error('Menu cleanup failed');menuOpen=false;}};
 f.args.page.locator=s=>s==='[data-tid="'+toolbarTid+'"]'?toolbar:s==='[data-tid="'+menuTid+'"]'?menu:s.includes('btnShowOutline')?toggle:base(s);
 return {...f,overflowState:()=>({menuOpen,itemClicks})};
}
for(const selfHide of [false,true])test('hidden owned outline toggles through its exact native overflow menu; cleanup '+selfHide,async()=>{
 const f=overflowFixture({selfHide});const r=await revealNodePlacement(f.args);
 assert.equal(r.fully_visible,true);assert.equal(f.state().open,false);
 assert.deepEqual(f.overflowState(),{menuOpen:false,itemClicks:2});
});
test('foreign toolbar, foreign menu and ambiguous item refuse before zoom and clean only owned menus',async()=>{
 for(const options of [{foreignToolbar:true},{foreignMenu:true},{duplicate:true}]){
  const f=overflowFixture(options);await assert.rejects(revealNodePlacement(f.args),/overflow.*(identity|item)/);
  assert.equal(f.state().clicks,0);assert.equal(f.state().open,false);
  assert.deepEqual(f.overflowState(),{menuOpen:false,itemClicks:0});
 }
});
test('overflow cleanup failure is never presented as verified navigation',async()=>{
 const f=overflowFixture({cleanupFailure:true});
 await assert.rejects(revealNodePlacement(f.args),e=>e.placement_navigation_unverified===true);
 assert.equal(f.state().clicks,0);
});
test('strictly visible placement never opens a hidden outline overflow menu',async()=>{
 const f=overflowFixture();f.args.position={x:104,y:200};
 assert.equal((await revealNodePlacement(f.args)).fully_visible,true);
 assert.deepEqual(f.overflowState(),{menuOpen:false,itemClicks:0});
});
test('native focus-only open may retry only with the same unchanged toggle',async()=>{
 const f=overflowFixture({focusOnly:true});assert.equal((await revealNodePlacement(f.args)).fully_visible,true);
 assert.equal(f.state().open,false);assert.equal(f.overflowState().menuOpen,false);
 const changed=overflowFixture({changedOnOpen:true});
 await assert.rejects(revealNodePlacement(changed.args),e=>e.placement_navigation_unverified===true);
 assert.equal(changed.state().clicks,0);
});

// Lost replies are injected after the native fixture gesture, and classified
// by the real mutation wrapper. No creation gesture may follow an unknown UI.
for(const fault of ['overflow-open','overflow-toggle','visible-toggle','zoom','overflow-close','menu-cleanup'])test('lost navigation reply preserves mutation uncertainty: '+fault,async()=>{
 const f=fault==='visible-toggle'?fixture():overflowFixture({selfHide:fault!=='menu-cleanup'});
 const base=f.args.page.locator;let toggles=0,opens=0,creates=0;
 const failAfter=async(fn,args)=>{await fn(...args);throw Error('Lost reply after '+fault);};
 f.args.page.locator=selector=>{
  if(selector==='[data-tid="MF;TF;ModelForm;cmpDiagram"]')return f.args.root;
  if(!selector.includes('ModelForm')){creates++;throw Error('Unexpected creation locator');}
  const original=base(selector);
  if(selector.includes('btnShowOutline')&&fault==='visible-toggle')return {...original,click:async(...args)=>{toggles++;await failAfter(original.click,args);}};
  if(selector==='[data-tid="MF;TF;ModelForm;tlbModel"]')return {...original,locator:child=>{
   const trigger=original.locator(child);
   return {...trigger,press:async(...args)=>{opens++;if(fault==='overflow-open')await failAfter(trigger.press,args);else await trigger.press(...args);}};
  }};
  if(selector==='[data-tid="MF;TF;ModelForm;tlbModel;b;mn"]')return {...original,
   press:async(...args)=>{if(fault==='menu-cleanup')await failAfter(original.press,args);else await original.press(...args);},
   locator:child=>{const children=original.locator(child);return {...children,filter:options=>{
    const item=children.filter(options);return {...item,click:async(...args)=>{
     toggles++;if(fault==='overflow-toggle'||fault==='overflow-close'&&toggles===2)await failAfter(item.click,args);else await item.click(...args);
    }};
   }};}
  };
  if(selector==='[data-tid="MF;TF;ModelForm;cntDiagram"]'&&fault==='zoom')return {...original,locator:child=>{
   const control=original.locator(child);return {...control,click:async(...args)=>failAfter(control.click,args)};
  }};
  return original;
 };
 f.args.page.evaluate=async()=>true;
 const graph={interaction_ready:true,dom_epoch:1,document_id:'doc',nodes:[],links:[]};
 const task={deadline:Date.now()+10000,request:{document_id:'doc',workflow_ref:{prefix:'MF;TF',workflow_id:'wf'}},effect:{id:'lost-navigation',kind:'create',parameters:{type:'transform.join_data',position:f.args.position},before:graph},types:{'transform.join_data':{title:'Join',palette_group:'Transforms'}}};
 const outcome=await mutateGraph(f.args.page,task,async()=>graph,()=>{},f.args.readViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph);
 assert.equal(outcome.status,'AMBIGUOUS');assert.equal(outcome.effect_possible,true);assert.equal(outcome.cleanup_complete,false);
 assert.equal(creates,0);assert.deepEqual(graph.nodes,[]);
 if(['overflow-open','overflow-toggle','visible-toggle','menu-cleanup'].includes(fault))assert.equal(f.state().clicks,0);
 if(fault==='overflow-open'){assert.equal(opens,1);assert.equal(toggles,0);assert.equal(f.overflowState().menuOpen,false);}
 if(fault==='overflow-toggle'){assert.equal(toggles,1);assert.equal(opens,1);assert.equal(f.state().open,true);}
 if(fault==='visible-toggle'){assert.equal(toggles,1);assert.equal(f.state().open,true);}
 if(fault==='overflow-close'){assert.equal(toggles,2);assert.equal(opens,2);}
});
