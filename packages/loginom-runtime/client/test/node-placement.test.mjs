import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {nodePlacementPoint,nodePlacementPosition,revealNodePlacement,samePlacementGraph} from '../lib/node-placement.mjs';

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
test('model coordinates account for zoom, translation, scroll and grid before screen rounding',()=>{
 for(const scale of [1,.8264462809917354,1.5]){
  const v={...view(),scale,translate:{x:32,y:-16},scroll:{x:40,y:24}};
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
