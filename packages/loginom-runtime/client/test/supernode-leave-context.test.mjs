import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Page,clone} from './support/workspace-ui-fixture.mjs';
import {makeWorkspacePrepareCode} from '../lib/workspace.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {returnToExecutedWorkflow} from '../lib/node-execution-procedure.mjs';

// frozen-r1/main/execution-events.jsonl:1011,1165: leave retains the selected
// ModelNode breadcrumb. Native context is verified, all DOM contexts unobserved.
// Source epoch: f49a2d3d-4c2b-49e6-98d5-91cb58b4823d:90324.
function fixture({root=false,directRoot=false,foreignOwner=false,foreignPath=false,duplicate=false,trialFailure=false,lostReturnReply=false}={}) {
 const page=new Page({clock:Date}),prefix='MF;TF-1',guid='e0216061-4678-409e-a89a-731c5da7dbac';
 page.app.Version='7.4.2';page.location.origin='https://app.loginom.ai';
 page.context.innerWidth=1280;page.context.innerHeight=800;
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};
 Object.assign(page.app,{PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode});
 const label=root?'Калькулятор':'Подмодель',body=page.add('g',prefix+';Graph;'+label,'',{x:700,y:180,width:80,height:60});
 page.add('g',prefix+';Graph;'+label+';Label;Label',label,{x:700,y:150,width:80,height:20});
 const graphRoot=body.parentElement,{model,byTid}=page.graphModels.get(graphRoot),native=byTid.get(prefix+';Graph;'+label);
 native.FGuid=guid;native.FIconCls=root?'bg-vendor-icon-calcdata':'bg-vendor-icon-modelgeneric';native.FLabel.FRawValue=label;
 const pkg=Object.assign(new PackageTreeNode(),{PackageName:'Package1',PackageFileName:''});
 const outer=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg});
 const owner=Object.assign(new ModelNodeTreeNode(),{FGuid:guid,FModelNode:native.data,ParentNode:outer});
 const inner=Object.assign(new WorkFlowTreeNode(),{ParentNode:{ParentNode:owner}});
 const panel=page.add('div',prefix+';NavigationBar;NavigationPanel','',{x:182,y:35,width:1054,height:36});
 const names=['Сервер','Пакеты','Package1','Модуль1','Сценарий'];
 const path=ns=>ns.map((label,i)=>({tid:prefix+';cnrNaviMode;b.s_'+ns.slice(0,i+1).join('>'),label:i?label:''}));
 const parentPath=path(names),innerPath=path([...names,'Подмодель','Модуль','Сценарий']);
 let current=root?outer:inner,crumbs=[],leaveClicks=0,parentClicks=0;
 const leave=page.add('a',prefix+';Graph;LeaveSubmodelLabel;Label','Выход',{x:120,y:180,width:40,height:30},page.document.body);
 const render=mode=>{
  for(const c of crumbs)c.remove();crumbs=[];
  const ns=mode==='child'?[...names,'Подмодель','Модуль','Сценарий']:mode==='card'?[...names,'Подмодель']:names;
  for(const [i,c] of path(foreignPath&&mode==='card'?ns.map((n,j)=>j===2?'foreign':n):ns).entries()){
   const hidden=i<(mode==='child'?7:4),box=hidden?{x:0,y:0,width:0,height:0}:{x:190+(i-4)*160,y:41,width:150,height:24};
   const e=page.add('a',c.tid,c.label,box,panel);if(hidden)e.style.display='none';
   if(i===4||i===7||i===5)page.add('span',null,'',{...box,width:hidden?0:16},e).attrs.class=i===5?'bg-vendor-icon-modelgeneric':'maptree-icon-workflow';
   crumbs.push(e);
  }
  if(duplicate&&mode==='card')page.add('a',parentPath.at(-1).tid,'Сценарий',{x:190,y:41,width:150,height:24},panel);
  body.style.display=mode==='child'?'none':'block';leave.style.display=mode==='child'?'block':'none';
  page.tab.ownText=mode==='card'?'Подмодель':'Сценарий';
 };
 render(root?'workflow':'child');
 const parent={phase:root?'verified':'superseded',workflowId:'outer',packageNode:pkg,tab:page.tab,nodeTargetWorkflowNode:outer,crumbs:parentPath};
 const source={phase:'verified',workflowId:'inner',packageNode:pkg,tab:page.tab,nodeTargetWorkflowNode:inner,crumbs:innerPath,
  navigationParentWorkflow:outer,navigationParentReceipt:parent,navigationOwner:native,navigationOwnerGuid:guid,navigationOwnerData:native.data};
 const preparation={id:'doc',document:page.document,receipts:new Map([['parent',parent],...(!root?[['entered',source]]:[])])};
 page.context.__loginomDockPreparationV1=preparation;
 const items={Workspace:{getActiveTab:()=>({Controller:{FController:model,Node:{data:{node:current}}}})}};
 page.app.Application={FInstance:{FMainForm:{Items:items,FItems:items,FMapTree:{FServerConnection:{UserName:'worker'}}}}};
 page.evaluate=async(fn,arg)=>{page.context.__arg=arg;return vm.runInContext('('+fn.toString()+')(__arg)',page.context);};
 page.waitForTimeout=async()=>{};
 page.locator=selector=>({click:async options=>{
  if(options?.trial){if(trialFailure&&selector.includes('cnrNaviMode')){trialFailure=false;throw Error('parent trial refused');}return;}
  if(selector==='[data-tid='+JSON.stringify(leave.attrs['data-tid'])+']'){
   leaveClicks++;current=directRoot?outer:owner;if(foreignOwner)owner.FGuid='foreign';render(directRoot?'workflow':'card');
  }else if(selector==='[data-tid='+JSON.stringify(parentPath.at(-1).tid)+']'){
   parentClicks++;current=outer;render('workflow');if(lostReturnReply){lostReturnReply=false;throw Error('parent reply lost');}
  }else assert.fail('Unexpected gesture '+selector);
 }});
 const ref={workflow_id:root?'outer':'inner',prefix,tab_tid:page.tab.attrs['data-tid'],navigation_path:root?parentPath:innerPath};
 const navigate=async({recoverOnly=false}={})=>clone(await vm.runInNewContext('('+makeWorkspacePrepareCode({loginomUrl:'https://app.loginom.ai/app/?testable=true',
  compatibility:{profile_id:'native',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},intent:'existing_workflow',
  workflowRef:{...ref,document_id:'doc'},graphNavigation:{direction:'leave'},operationId:'leave',timeoutMs:2000,recoverOnly})+')')(page));
 const node=wf=>({document_id:'doc',workflow_id:wf.workflow_id,node_id:guid});
 const observe=async wf=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {mode:'observe',expected_build:'7.4.2',expected_origin:'https://app.loginom.ai',prepared_node_context:{document_id:'doc',node:node(wf),workflow_ref:wf},node_navigation_read:true},readPreparedNodeContext));
 return {navigate,observe,node,ref,parentPath,counts:()=>({leaveClicks,parentClicks})};
}

test('frozen-r1 leave returns the attested parent workflow before execute observes navigation',async()=>{
 const f=fixture(),left=await f.navigate();assert.equal(left.status,'READY',JSON.stringify(left));
 const s=(await f.observe(left.workflow_ref)).output;
 assert.equal(s.prepared_node_context.verified,true);assert.equal(s.navigation_context.status,'observed');
 assert.deepEqual(left.workflow_ref.navigation_path,f.parentPath);assert.equal(s.navigation_context.path.length,5);
 await returnToExecutedWorkflow({observe:async o=>{assert.ok(o.ready(s),o.condition);return s;},perform:()=>assert.fail('Already in the parent workflow')},f.node(left.workflow_ref));
 assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:1});
});
test('root Calculator without NW1 retains its observed five-crumb workflow and no gesture',async()=>{
 const f=fixture({root:true}),s=(await f.observe(f.ref)).output;
 assert.equal(s.navigation_context.status,'observed',JSON.stringify({prepared:s.prepared_node_context,nav:s.navigation_context,wizard:s.wizard,ui:s.ui.elements.map(e=>({tid:e.tid,kind:e.kind}))}));assert.deepEqual(s.navigation_context.path,f.parentPath);
 await returnToExecutedWorkflow({observe:async o=>{assert.ok(o.ready(s));return s;},perform:()=>assert.fail('Unexpected root gesture')},f.node(f.ref));
 assert.deepEqual(f.counts(),{leaveClicks:0,parentClicks:0});
});
test('leave already at the parent workflow adds no breadcrumb gesture',async()=>{
 const f=fixture({directRoot:true}),r=await f.navigate();assert.equal(r.status,'READY');assert.deepEqual(r.workflow_ref.navigation_path,f.parentPath);
 assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:0});
});
for(const fault of ['foreignOwner','foreignPath','duplicate'])test('leave refuses '+fault+' before parent navigation',async()=>{
 const f=fixture({[fault]:true}),r=await f.navigate();assert.equal(r.status,'NOT_READY');assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:0});
});
test('lost parent return reply is reconciled read-only without a second gesture',async()=>{
 const f=fixture({lostReturnReply:true});assert.equal((await f.navigate()).status,'NOT_READY');
 const r=await f.navigate({recoverOnly:true});assert.equal(r.status,'READY');assert.deepEqual(r.workflow_ref.navigation_path,f.parentPath);
 assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:1});
});
test('refused parent trial permits one new return gesture without replaying leave',async()=>{
 const f=fixture({trialFailure:true});assert.equal((await f.navigate()).status,'NOT_READY');
 assert.equal((await f.navigate({recoverOnly:true})).status,'NOT_READY');assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:0});
 const r=await f.navigate();assert.equal(r.status,'READY');assert.deepEqual(f.counts(),{leaveClicks:1,parentClicks:1});
});
