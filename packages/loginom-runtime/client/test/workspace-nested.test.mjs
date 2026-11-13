import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeWorkspacePrepareCode} from '../lib/workspace.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';

// LAB-1543 DOM: entering keeps TF-1 and changes breadcrumbs; service GUIDs
// repeat. Leaving can retain the selected owner's breadcrumb.
function fixture({loseReply=false,foreignOwner=false,block=false}={}) {
  class PackageTreeNode {}; class WorkFlowTreeNode {}; class ModelForm {};
  const prefix='MF;TF-1',tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';
  const element=(tid,text='')=>({tid,textContent:text,isConnected:true,getAttribute:()=>tid,
    getBoundingClientRect:()=>({width:20,height:20}),classList:{contains:()=>true}});
  const tab=element(tabTid),root=element(prefix+';ModelForm;cmpDiagram');
  const pkg=new PackageTreeNode();pkg.PackageFileName='/worker/nested.lgp';
  const outer=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg});
  const owner={FGuid:'supernode',ParentNode:outer};
  const inner=Object.assign(new WorkFlowTreeNode(),{ParentNode:{ParentNode:owner}});
  let current=outer,crumbs=['Server','Packages','Package','Module','Scenario'],clicks=0,masked=false;
  const states=new Map(),nodes=[];
  const add=(id,label,icon)=>{
    const node={FGuid:id,FIconCls:icon,FCell:{geometry:{x:100,y:100}},FPorts:[],data:{}};
    node.FLabel={parent:node,FCell:{parent:node.FCell,visible:true},FRawValue:label};
    states.set(node.FCell,{shape:{node:element(prefix+';Graph;'+label)}});
    states.set(node.FLabel.FCell,{text:{node:element(prefix+';Graph;'+label+';Label;Label',label)}});
    nodes.push(node);return node;
  };
  const composite=add('supernode','Подмодель','bg-vendor-icon-modelgeneric');
  owner.FModelNode=composite.data;
  const service=add('repeated-guid','Переменные_сценария','bg-vendor-icon-user-variables');
  const innerService=add('repeated-guid','Переменные_сценария','bg-vendor-icon-user-variables');
  const calc=add('calc','Калькулятор','bg-vendor-icon-calcdata');
  const input=add('input','Входной_узел','bg-vendor-icon-nullvendor');
  const output=add('output','Выходной_узел','bg-vendor-icon-nullvendor');
  const graph={container:root,view:{getState:cell=>states.get(cell)}};
  root.contains=e=>[...states.values()].some(s=>s.shape?.node===e||s.text?.node===e);
  root.querySelectorAll=()=>[];
  const diagram={FmxGraph:graph,GenericInputNode:input,GenericOutputNode:output,get FIsSubmodel(){return current===inner;},
    FNodes:{get FCollection(){return current===outer?[composite,service]:[calc,innerService,input,output];}}};
  const model=Object.assign(new ModelForm(),{FDiagram:diagram});
  const enter=element(prefix+';Graph;Подмодель;GenericEnterLabel;Label');
  composite.FEnterLabel={parent:composite,FCell:{parent:composite.FCell}};
  states.set(composite.FEnterLabel.FCell,{text:{node:enter}});
  const leave=element(prefix+';Graph;LeaveSubmodelLabel;Label');
  const crumbsNow=()=>crumbs.map((v,i)=>element(prefix+';cnrNaviMode;b.s_'+crumbs.slice(0,i+1).join('>'),v));
  const all=()=>[tab,root,current===outer?enter:leave,...crumbsNow(),...model.FDiagram.FNodes.FCollection.flatMap(n=>[states.get(n.FCell).shape.node,states.get(n.FLabel.FCell).text.node])];
  const mask={...element('mask'),matches:()=>true};
  const document={querySelectorAll:q=>q.startsWith('[data-tid^=')?crumbsNow():q.startsWith('[role=')?(masked||block?[mask]:[]):all().filter(e=>q==='[data-tid='+JSON.stringify(e.tid)+']')};
  const ref={workflow_id:'outer',tab_tid:tabTid,prefix,navigation_path:crumbsNow().map(e=>({tid:e.tid,label:e.textContent}))};
  const receipt={phase:'verified',workflowId:'outer',packageNode:pkg,tab,nodeTargetWorkflowNode:outer,crumbs:ref.navigation_path};
  const preparation={id:'doc',document,receipts:new Map([['initial',receipt]])};
  const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm};
  const workspace={getActiveTab:()=>({Controller:{Node:{data:{get node(){return current;}}},FController:model}})};
  app.Application={FInstance:{FMainForm:{Items:{Workspace:workspace},FMapTree:{FServerConnection:{UserName:'worker'}}}}};
  const context=vm.createContext({document,location:{origin:'https://app.loginom.ai'},getComputedStyle:()=>({visibility:'visible'}),
    __loginomDockPreparationV1:preparation,bg:{app}});
  const page={evaluate:(fn,args)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(args)+')',context),
    locator:selector=>({click:async options=>{if(options?.trial)return;clicks++;if(selector.includes('GenericEnterLabel')){current=inner;crumbs.push('Подмодель','Модуль','Сценарий');if(foreignOwner)owner.FGuid='foreign';}else if(selector.includes('LeaveSubmodelLabel')){current=outer;crumbs=crumbs.slice(0,5).concat('Подмодель');}else throw Error('Unexpected click');masked=true;if(loseReply){loseReply=false;throw Error('lost click reply');}}}),
    waitForTimeout:async()=>{masked=false;},mouse:{up:async()=>{}}};
  const adapter=createNodeTargetBrowserAdapter({origin:'https://app.loginom.ai',build:'7.4.2',pinned:{},execute:code=>vm.runInNewContext('('+code+')')(page)});
  const navigate=(wf,direction='enter',operationId='enter')=>vm.runInNewContext('('+makeWorkspacePrepareCode({
    loginomUrl:'https://app.loginom.ai/app/?testable=true',compatibility:{profile_id:'native',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},
    intent:'existing_workflow',workflowRef:{...wf,document_id:'doc'},operationId,
    graphNavigation:{direction,...(direction==='enter'?{node_ref:{document_id:'doc',workflow_id:wf.workflow_id,node_id:'supernode'}}:{})},
  })+')')(page);
  return {navigate,ref,receipt,preparation,read:wf=>adapter.observe({document_id:'doc',workflow_ref:wf},Date.now()+2000),
    context:wf=>readPreparedNodeContext(page,{document_id:'doc',workflow_ref:wf,node:{document_id:'doc',workflow_id:wf.workflow_id,node_id:'calc'}}),
    unmask:()=>{masked=false;},clicks:()=>clicks};
}

test('NW1 real adapter enters, reads nested Calculator, leaves and issues fresh scoped refs',async()=>{
  const f=fixture(),before=await f.read(f.ref);
  const entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  assert.equal(entered.loginom_account,'worker');
  assert.notEqual(entered.workflow_ref.workflow_id,f.ref.workflow_id);
  assert.equal(entered.workflow_ref.prefix,f.ref.prefix);
  const inside=await f.read(entered.workflow_ref);
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='input').boundary_role,'input');
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='output').boundary_role,'output');
  assert.equal((await f.context(entered.workflow_ref)).verified,true);
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='calc').type,'transform.calculator');
  assert.notEqual(inside.nodes.find(n=>n.ref.node_id==='repeated-guid').ref.workflow_id,before.nodes.find(n=>n.ref.node_id==='repeated-guid').ref.workflow_id);
  await assert.rejects(f.read(f.ref));
  const left=await f.navigate(entered.workflow_ref,'leave','leave');
  assert.equal(left.status,'READY',JSON.stringify(left));
  assert.notEqual(left.workflow_ref.workflow_id,f.ref.workflow_id);
  assert.ok((await f.read(left.workflow_ref)).nodes.some(n=>n.ref.node_id==='supernode'));
  await assert.rejects(f.read(entered.workflow_ref));
  await assert.rejects(f.read(f.ref));
  assert.equal(f.clicks(),2);
});

test('NW1 uncertain click is reconciled read-only under the same operation ID',async()=>{
  const f=fixture({loseReply:true}),unknown=await f.navigate(f.ref);
  assert.equal(unknown.status,'NOT_READY');assert.equal(unknown.effect_possible,true);
  f.unmask();
  const recovered=await f.navigate(f.ref);
  assert.equal(recovered.status,'READY',JSON.stringify(recovered));assert.equal(f.clicks(),1);
  assert.ok((await f.read(recovered.workflow_ref)).nodes.some(n=>n.ref.node_id==='calc'));
});

test('NW1 refuses a foreign nested owner after a gesture and blockers before one',async()=>{
  const f=fixture({foreignOwner:true}),foreign=await f.navigate(f.ref);
  assert.equal(foreign.status,'NOT_READY');assert.equal(foreign.effect_possible,true);
  assert.match(foreign.reason,/different submodel/);assert.equal(f.clicks(),1);
  const b=fixture({block:true}),blocked=await b.navigate(b.ref);
  assert.equal(blocked.status,'NOT_READY');assert.equal(blocked.effect_possible,false);assert.equal(b.clicks(),0);
});

test('NW1 validates scoped enter and leave arguments before browser work',()=>{
  const base={loginomUrl:'https://app.loginom.ai/app/',compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'}};
  assert.throws(()=>makeWorkspacePrepareCode({...base,graphNavigation:{direction:'leave'}}),/Graph navigation/);
  const f=fixture(),workflowRef={...f.ref,document_id:'doc'};
  for(const graphNavigation of [{direction:'enter',node_ref:{document_id:'other',workflow_id:'outer',node_id:'x'}},{direction:'leave',node_ref:{}},{direction:'enter'}])
    assert.throws(()=>makeWorkspacePrepareCode({...base,intent:'existing_workflow',workflowRef,graphNavigation}),/Graph navigation/);
});

test('NW1 same operation never repeats a completed navigation; foreign/stale refs do not click',async()=>{
  const f=fixture(),entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  const replay=await f.navigate(f.ref);
  assert.equal(replay.status,'READY',JSON.stringify(replay));
  assert.equal(f.clicks(),1);
  const stale=await f.navigate(f.ref,'enter','different');
  assert.equal(stale.status,'NOT_READY');assert.equal(stale.effect_possible,false);
  assert.equal(f.clicks(),1);
});
