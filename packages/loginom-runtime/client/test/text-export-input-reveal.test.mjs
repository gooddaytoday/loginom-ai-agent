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

test('standard Export preserves the baseline refusal for a clipped input without scrolling or selecting a label',async()=>{
 const f=fixture();
 await assert.rejects(f.run(),/Port has no observed interaction point/);
 assert.equal(f.canvas.scrollTop,0);
 assert.deepEqual(f.gestures,[]);
 assert.equal(f.records.flatMap(e=>e.outcome?.trace??[]).some(e=>e.event==='ui_scroll_applied'),false);
});
