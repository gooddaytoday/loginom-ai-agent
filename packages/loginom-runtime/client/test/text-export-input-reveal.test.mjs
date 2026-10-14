import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createTextExportNodeSupport} from '../lib/text-export-node.mjs';
import {Page,Element,origin} from './support/workspace-ui-fixture.mjs';

// Actual first-last-touch candidate1 journal3363–3365 (20261013T233119Z-4699a5):
// graph=(324,100,950,694), viewport=1280x800, input=(1164,780,15,24),
// same canvas scrollTop=0/max82; native input0 has SVG/native index1.
// This external DOM/native-protocol fixture executes the real serialized observer,
// scroll and port opener. Stop at the verified wizard boundary: mapping is separate.
function fixture({onRecord=()=>{},deadlineMs=15000}={}) {
 const page=new Page();page.app.Version='7.4.2';page.context.innerWidth=1280;page.context.innerHeight=800;
 page.viewportSize=()=>({width:1280,height:800});page.waitForTimeout=async()=>{};
 const prefix='MF;TF-1',tid=prefix+';Graph;Export';
 const body=page.add('g',tid,'',{x:1180,y:740,width:56,height:76});
 const canvas=body.parentElement;canvas.box={x:324,y:100,width:950,height:694};
 Object.assign(canvas,{scrollLeft:48,scrollTop:0,clientHeight:678,scrollHeight:760,clientWidth:933,scrollWidth:998,style:{overflowY:'auto',overflowX:'auto'}});
 const input=page.add('g',tid+';Input_Data-1','',{x:1164,y:780,width:15,height:24});
 const anchor=page.add('g',prefix+';Graph;Sort','',{x:356,y:692,width:56,height:60});
 const native=page.graphModels.get(canvas),node=native.byTid.get(tid),port=node.FPorts[0].FCollection[0];
 node.FGuid='export';node.FLocked=false;node.FIconCls='bg-vendor-icon-exporttextfile';
 native.byTid.get(prefix+';Graph;Sort').FIconCls='bg-vendor-icon-sorting';
 port.FPortIndex=1;port.FGuid='input-port';
 const rawBox=input.getBoundingClientRect.bind(input);
 input.getBoundingClientRect=()=>({...rawBox(),y:input.box.y-canvas.scrollTop});
 const hit=page.document.elementFromPoint.bind(page.document);
 page.document.elementFromPoint=(x,y)=>{
  const current=native.states.get(port.FCell).shape.node,b=current.getBoundingClientRect();
  if(x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height)return y<canvas.box.y+canvas.clientHeight?current:canvas;
  return hit(x,y);
 };
 native.model.FDiagram.FmxGraph.getCellAt=(x,y)=>{
  const b=native.states.get(port.FCell).shape.node.getBoundingClientRect();
  return x===b.x-canvas.box.x+canvas.scrollLeft+b.width/2&&y===b.y-canvas.box.y+canvas.scrollTop+b.height/2?port.FCell:null;
 };
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};
 class ModelInputPortsTreeNode{};class ModelPortTreeNode{};class WizardTreeNode{};
 Object.assign(page.app,{PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelInputPortsTreeNode,ModelPortTreeNode,WizardTreeNode});
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const nodeTree=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:node.FGuid,FModelNode:node.data});
 const group=Object.assign(new ModelInputPortsTreeNode(),{ParentNode:nodeTree});
 const portTree=Object.assign(new ModelPortTreeNode(),{ParentNode:group,FIndex:1,FModelNodePort:port.data});
 const wizardTree=Object.assign(new WizardTreeNode(),{ParentNode:portTree});
 const card={Controller:{FController:native.model,Node:{data:{node:workflow}}}};
 page.app.Application.FInstance.FMainForm.FItems.Workspace.getActiveTab=()=>card;
 const crumb=page.add('button',prefix+';cnrNaviMode;b.s_Flow','Flow');
 const workflowRef={workflow_id:'flow',prefix,tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:crumb.getAttribute('data-tid'),label:'Flow'}]};
 const nodeRef={document_id:'doc',workflow_id:'flow',node_id:'export'};
 page.context.__loginomDockPreparationV1={document:page.document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',tab:page.tab,packageNode,nodeTargetWorkflowNode:workflow}]])};
 const menu=page.add('div','mn'),configure=page.add('button','mn;mniConfigurePort','Configure',undefined,menu),wizardRoot=page.add('div',prefix+';WizrdMCF');
 menu.style.display='none';wizardRoot.style.display='none';
 native.model.FPortContextMenu={el:{dom:menu}};
 page.context.Ext={getCmp:id=>id===menu.id?native.model.FPortContextMenu:null};
 class WizardModelComponentForm{};
 const wizard=Object.assign(new WizardModelComponentForm(),{FModelSocket:{},FView:{el:{dom:wizardRoot}}});
 for(const e of page.document.all())e.checkVisibility=()=>e.style.display!=='none'&&e.style.visibility!=='hidden';
 const gestures=[];
 page.mouse.click=async(x,y,options)=>{
  assert.equal(options.button,'right');assert.equal(page.document.elementFromPoint(x,y),native.states.get(port.FCell).shape.node);
  gestures.push({kind:'right-click',x,y});menu.style.display='block';native.model.FCurrentPortMenu=port;
 };
 const locate=page.locator.bind(page);
 page.locator=selector=>{
  const loc=locate(selector.replace(/:visible$/,''));
  return {...loc,waitFor:async()=>{},click:async options=>{
   assert.equal(selector,'[data-tid="mn;mniConfigurePort"]:visible');
   if(options?.trial)return;
   gestures.push({kind:'configure'});menu.style.display='none';wizardRoot.style.display='block';
   card.Controller.FController=wizard;card.Controller.Node.data.node=wizardTree;
  }};
 };
 const controller=new AbortController(),stop=new Error('Fixture stopped after verified own input wizard'),records=[];
 const operation={id:'export',action:{action_key:'node.apply',revision:'1.0.0'},nodeApply:{request:{finish:'execute'}}};
 const support=createTextExportNodeSupport({targetOrigin:origin,targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation,now:Date.now,
  execute:async code=>JSON.parse(JSON.stringify(await vm.runInContext('('+code+')',page.context)(page))),
  receiptOptions:(id,key,signature)=>({receipt_namespace:'test',receipt_id:id,receipt_signature:signature}),
  onRecord:async event=>{records.push(event);onRecord(event);if(event.phase==='node_step_completed'&&event.outcome?.output?.verified===true&&event.outcome.output.direction==='input')controller.abort(stop);return event;}});
 return {page,canvas,input,body,anchor,node,port,native,records,gestures,stop,
  run:()=>driver.mapPorts([],{document_id:'doc',workflow_ref:workflowRef,node:nodeRef,deadline:Date.now()+deadlineMs,signal:controller.signal,receipt_id:'export:input_mapping'})};
}

// Actual diagnostic journal758/760, SHA107d308e7f755ac774abff77b6b659332c354d0f75441271cf924d9c4299c97a:
// after scroll82, input=(1164,698,15,24), own label=(1167,637,82,16).
// All nine port points hit U under tooltip-2760/ttip; its owner was not established.
// Dismissal on legitimate label selection is an external UI response under test,
// not a claim that the historical tooltip's trigger or native owner was proved.
function coveredFixture(options={}) {
 const f=fixture(options),tid=f.body.getAttribute('data-tid');
 f.body.box.height=104;
 const label=f.page.add('g',tid+';Label;Label','Export',{x:1167,y:719,width:82,height:16});
 for(const e of [f.body,label]){
  const box=e.getBoundingClientRect.bind(e);
  e.getBoundingClientRect=()=>({...box(),y:e.box.y-f.canvas.scrollTop});
 }
 const tooltip=f.page.add('div','ttip','',{x:1162,y:686,width:118,height:114});
 tooltip.attrs.class='x-tip x-layer x-tip-default x-border-box';
 const cover=f.page.add('u',null,'',{x:1168,y:691,width:58.328125,height:35},tooltip);
 const hit=f.page.document.elementFromPoint.bind(f.page.document),click=f.page.mouse.click;
 f.page.document.elementFromPoint=(x,y)=>{
  const point=hit(x,y),box=label.getBoundingClientRect();
  if(x>=box.x&&x<box.x+box.width&&y>=box.y&&y<box.y+box.height)return label;
  return point===f.native.states.get(f.port.FCell).shape.node&&f.canvas.scrollTop===82&&tooltip.style.display!=='none'?cover:point;
 };
 f.page.mouse.click=async(x,y,options)=>{
  if(options.button!=='left')return click(x,y,options);
  assert.equal(f.page.document.elementFromPoint(x,y),label);
  f.gestures.push({kind:'label-click',x,y});
  tooltip.style.display='none';f.page.mutationObserver.pending.push({type:'attributes'});
 };
 return {...f,label,tooltip,cover};
}

test('Export selects its own label once when the revealed input remains tooltip-covered',async()=>{
 const f=coveredFixture();await assert.rejects(f.run(),error=>error===f.stop);
 assert.equal(f.canvas.scrollTop,82);
 assert.deepEqual(f.gestures.map(g=>g.kind),['label-click','right-click','configure']);
 assert.deepEqual(f.gestures[0],{kind:'label-click',x:1208,y:645});
 assert.equal(f.records.flatMap(e=>e.outcome?.trace??[]).filter(e=>e.event==='ui_gesture_applied'&&e.verb==='click').length,1);
 const opened=f.records.find(e=>e.phase==='node_step_completed'&&e.outcome?.output?.direction==='input');
 assert.equal(opened.outcome.status,'SUCCEEDED');assert.equal(opened.outcome.output.port_guid,'input-port');
});

test('Export rebinds its native owner after label selection redraws the body label and port',async()=>{
 const f=coveredFixture({onRecord:event=>{
  if(event.phase!=='node_step_completed'||!event.outcome?.trace?.some(e=>e.event==='ui_gesture_applied'&&e.verb==='click'))return;
  for(const e of [f.body,f.label]){
   f.page.add('g',e.getAttribute('data-tid'),e.ownText,{...e.getBoundingClientRect()});e.remove();
  }
  const input=f.canvas.append(new Element('g',{'data-tid':f.input.getAttribute('data-tid')},'',{...f.input.getBoundingClientRect()}));
  input.checkVisibility=()=>true;f.native.states.set(f.port.FCell,{shape:{node:input}});f.input.remove();
  f.page.mutationObserver.pending.push({type:'childList'});
 }});
 await assert.rejects(f.run(),error=>error===f.stop);
 const before=f.records.find(e=>e.phase==='node_observation_completed'&&e.readiness?.condition==='export input after canvas scroll').outcome.output;
 const after=f.records.find(e=>e.phase==='node_observation_completed'&&e.readiness?.condition==='export input after own label selection').outcome.output;
 assert.deepEqual(after.prepared_node_context,before.prepared_node_context);
 assert.equal(after.dom_epoch.document,before.dom_epoch.document);
 assert.notEqual(after.dom_epoch.revision,before.dom_epoch.revision);
 for(const e of [f.body,f.label,f.input])assert.notEqual(after.ui.elements.find(x=>x.tid===e.getAttribute('data-tid')).ref,
  before.ui.elements.find(x=>x.tid===e.getAttribute('data-tid')).ref);
 assert.deepEqual(f.gestures.map(g=>g.kind),['label-click','right-click','configure']);
});

test('Export retains all native input hit guards when selection does not clear the covering element',async()=>{
 const f=coveredFixture(),click=f.page.mouse.click;
 f.page.mouse.click=async(x,y,options)=>{await click(x,y,options);if(options.button==='left')f.tooltip.style.display='block';};
 await assert.rejects(f.run(),/Port has no observed interaction point/);
 assert.deepEqual(f.gestures.map(g=>g.kind),['label-click']);
 const refused=f.records.find(e=>e.phase==='node_step_completed'&&e.outcome.error?.code==='OUTPUT_PORT_OPEN_UNCONFIRMED');
 assert.equal(refused.outcome.status,'NOT_APPLIED');assert.equal(refused.outcome.effect_possible,false);
 assert.equal(refused.outcome.cleanup_complete,true);
});

for(const mode of ['missing','duplicate','covered','foreign','disabled','script'])test('Export refuses a '+mode+' own label after reveal',async()=>{
 const f=coveredFixture(),hit=f.page.document.elementFromPoint.bind(f.page.document);
 if(mode==='missing')f.label.remove();
 if(mode==='duplicate')f.page.add('g',f.label.getAttribute('data-tid'),'Export',{...f.label.box});
 if(mode==='covered')f.page.document.elementFromPoint=(x,y)=>{const e=hit(x,y);return e===f.label?f.cover:e;};
 if(mode==='foreign'){f.label.remove();f.page.document.body.append(f.label);}
 if(mode==='disabled')f.label.disabled=true;
 if(mode==='script')f.node.FIconCls='bg-vendor-icon-javascript';
 await assert.rejects(f.run());
 assert.equal(f.canvas.scrollTop,82);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='click').length,0);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

for(const mode of ['mask','lock'])test('Export stops before opening input when a '+mode+' appears after label admission',async()=>{
 const f=coveredFixture({deadlineMs:1000,onRecord:event=>{
  if(event.phase!=='node_step_prepared'||event.action.verb!=='click')return;
  if(mode==='mask')f.page.add('div','busy','Loading').attrs.class='x-mask-msg';
  if(mode==='lock')f.node.FLocked=true;
 }});
 await assert.rejects(f.run());assert.equal(f.canvas.scrollTop,82);
 // A native-only lock race may permit the admitted safe selection, as for scroll.
 // Fresh locked context must still stop before any port/menu or mapping gesture.
 assert.deepEqual(f.gestures.map(g=>g.kind),mode==='lock'?['label-click']:[]);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

test('Export never admits a label click when the fresh revealed native node is locked',async()=>{
 const f=coveredFixture({deadlineMs:1000,onRecord:event=>{
  if(event.phase==='node_step_completed'&&event.outcome?.trace?.some(e=>e.event==='ui_scroll_applied'))f.node.FLocked=true;
 }});
 await assert.rejects(f.run(),/readiness timeout/);assert.equal(f.canvas.scrollTop,82);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.action?.verb==='click'||e.action?.verb==='open_input_port').length,0);
});

for(const mode of ['port identity','label geometry'])test('Export refuses changed '+mode+' on pre-gesture label refresh',async()=>{
 let changed=false;
 const f=coveredFixture({onRecord:event=>{
  if(changed||event.phase!=='node_step_prepared'||event.action.verb!=='click')return;
  changed=true;f.page.mutationObserver.pending.push({type:'attributes'});
  if(mode==='port identity')f.port.data={};
  if(mode==='label geometry')f.label.box.x-=1;
 }});
 await assert.rejects(f.run(),/Node procedure recovery target or intent changed/);
 assert.ok(f.records.some(e=>e.phase==='node_step_completed'&&e.outcome.error?.code==='UI_EPOCH_CHANGED'));
 assert.equal(f.canvas.scrollTop,82);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='click').length,1);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

for(const mode of ['native owner','graph container'])test('Export refuses changed '+mode+' after label selection',async()=>{
 const f=coveredFixture({deadlineMs:1000,onRecord:event=>{
  if(event.phase!=='node_step_completed'||!event.outcome?.trace?.some(e=>e.event==='ui_gesture_applied'&&e.verb==='click'))return;
  if(mode==='native owner')f.node.FGuid='foreign';
  if(mode==='graph container')f.canvas.attrs['data-tid']='MF;TF-2;ModelForm;cmpDiagram';
 }});
 await assert.rejects(f.run());assert.deepEqual(f.gestures.map(g=>g.kind),['label-click']);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

test('Export does not select a label for a covered input without its own clipping reveal',async()=>{
 const f=coveredFixture(),hit=f.page.document.elementFromPoint.bind(f.page.document);f.input.box.y=650;
 f.page.document.elementFromPoint=(x,y)=>{const e=hit(x,y);return e===f.input?f.cover:e;};
 await assert.rejects(f.run(),/Port has no observed interaction point/);
 assert.equal(f.canvas.scrollTop,0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.action?.verb==='click'||e.action?.verb==='scroll').length,0);
});

test('Export opens its clipped post-Link input through its own canvas without outline',async()=>{
 const f=fixture();await assert.rejects(f.run(),error=>error===f.stop);
 const opened=f.records.find(e=>e.phase==='node_step_completed'&&e.outcome?.output?.direction==='input');
 assert.equal(opened?.outcome.status,'SUCCEEDED');assert.equal(opened.outcome.output.port_guid,'input-port');
 assert.equal(f.canvas.scrollTop,82);
 const before=f.records.find(e=>e.phase==='node_observation_completed'&&e.readiness?.condition==='export input viewport');
 const scroll=f.records.flatMap(e=>e.outcome?.trace??[]).filter(e=>e.event==='ui_scroll_applied');
 assert.deepEqual(scroll.map(e=>({from:e.from,to:e.to,owner_ref:e.owner_ref})),[{from:0,to:82,owner_ref:before.outcome.output.graph_identity.container_ref}]);
 assert.deepEqual(f.gestures.map(g=>g.kind),['right-click','configure']);
});


test('Export does not scroll an already observed input',async()=>{
 const f=fixture();f.input.box.y=650;
 await assert.rejects(f.run(),error=>error===f.stop);
 assert.equal(f.canvas.scrollTop,0);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,0);
 assert.deepEqual(f.gestures.map(g=>g.kind),['right-click','configure']);
});

test('Export never clicks a covered port when its own label is unavailable after reveal',async()=>{
 const f=fixture(),hit=f.page.document.elementFromPoint.bind(f.page.document);
 f.page.document.elementFromPoint=(x,y)=>{const found=hit(x,y);return found===f.input?f.canvas:found;};
 await assert.rejects(f.run(),/Unique export control required/);
 assert.equal(f.canvas.scrollTop,82);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,1);
 assert.deepEqual(f.gestures,[]);
});

test('Export refuses a refreshed scroll when the clipped input became visible before gesture',async()=>{
 let changed=false;
 const f=fixture({onRecord:event=>{
  if(!changed&&event.phase==='node_step_prepared'&&event.action.verb==='scroll'){
   changed=true;f.input.box.y=650;f.page.mutationObserver.pending.push({});
  }
 }});
 await assert.rejects(f.run(),/Node procedure recovery target or intent changed/);
 assert.ok(f.records.some(e=>e.phase==='node_step_completed'&&e.outcome.error?.code==='UI_EPOCH_CHANGED'));
 assert.equal(f.canvas.scrollTop,0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,1);
});


for(const mode of ['scroll range','anchor identity','input geometry'])test('Export binds refreshed '+mode+' before a second gesture',async()=>{
 let changed=false;
 const f=fixture({onRecord:event=>{
  if(!changed&&event.phase==='node_step_prepared'&&event.action.verb==='scroll'){
   changed=true;f.page.mutationObserver.pending.push({});
   if(mode==='scroll range')f.canvas.scrollHeight+=1;
   if(mode==='anchor identity'){
    const before=f.records.find(e=>e.readiness?.condition==='export input viewport'&&e.phase==='node_observation_completed').outcome.output;
    const tid=before.ui.elements.find(e=>e.ref===event.action.ref).tid;
    f.page.document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')[0].ownText='Changed anchor';
   }
   if(mode==='input geometry')f.input.box.x-=1;
  }
 }});
 await assert.rejects(f.run(),/Node procedure recovery target or intent changed/);
 assert.ok(f.records.some(e=>e.phase==='node_step_completed'&&e.outcome.error?.code==='UI_EPOCH_CHANGED'));
 assert.equal(f.canvas.scrollTop,0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,1);
});

for(const range of [0,2])test('Export refuses insufficient canvas range '+range+' without an input click',async()=>{
 const f=fixture();f.canvas.scrollHeight=f.canvas.clientHeight+range;
 await assert.rejects(f.run(),/Export input scroll owner is unverified|Unique export control required/);
 assert.equal(f.canvas.scrollTop,range);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,range?1:0);
});

for(const mode of ['script','foreign','covered'])test('Export refuses '+mode+' canvas anchors',async()=>{
 const f=fixture(),hit=f.page.document.elementFromPoint.bind(f.page.document);
 f.page.document.elementFromPoint=(x,y)=>{const found=hit(x,y);return found===f.body||mode==='covered'&&found===f.anchor?f.canvas:found;};
 if(mode==='script')f.native.byTid.get(f.anchor.getAttribute('data-tid')).FIconCls='bg-vendor-icon-javascript';
 if(mode==='foreign'){f.anchor.remove();f.page.document.body.append(f.anchor);}
 await assert.rejects(f.run(),/Export input has no observed canvas scroll anchor/);
 assert.equal(f.canvas.scrollTop,0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,0);
});

for(const mode of ['mask','lock','document'])test('Export preserves the '+mode+' guard before opening its input',async()=>{
 const f=fixture({deadlineMs:1000,onRecord:event=>{
  if(event.phase!=='node_step_prepared'||event.action.verb!=='scroll')return;
  if(mode==='mask')f.page.add('div','busy','Loading').attrs.class='x-mask-msg';
  if(mode==='lock')f.node.FLocked=true;
  if(mode==='document')f.page.context.__loginomDockPreparationV1.id='foreign-document';
 }});
 await assert.rejects(f.run());
 assert.equal(f.canvas.scrollTop,mode==='lock'?82:0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='scroll').length,1);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

test('Export rechecks its native canvas after the scroll before opening input',async()=>{
 const f=fixture({onRecord:event=>{
  if(event.phase==='node_step_completed'&&event.outcome?.trace?.some(e=>e.event==='ui_scroll_applied'))
   f.canvas.attrs['data-tid']='MF;TF-2;ModelForm;cmpDiagram';
 }});
 await assert.rejects(f.run(),/could not be observed|Prepared node binding|graph changed/);
 assert.equal(f.canvas.scrollTop,82);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.action?.verb==='open_input_port').length,0);
});

test('Export never starts a reveal while its native node is already locked',async()=>{
 const f=fixture({deadlineMs:500});f.node.FLocked=true;
 await assert.rejects(f.run(),/readiness timeout/);
 assert.equal(f.canvas.scrollTop,0);assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared').length,0);
});
