import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {applyNode} from '../lib/node-apply.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {actions} from './support/executor-fixture.mjs';

// The source observation executes the production readGraph against native
// cached objects. Only the unrelated configuration/output phases are stubs.
function fixture({active=false}={}){
 class PackageTreeNode {} class WorkFlowTreeNode {} class ModelForm {}
 const clicks=[],phases=[];
 const tab={isConnected:true,classList:{contains:()=>active},getBoundingClientRect:()=>({width:100,height:20})};
 const diagram={getBoundingClientRect:()=>({width:100,height:100}),querySelectorAll:()=>[]};
 const crumb={getAttribute:()=> 'MF;TF-1;cnrNaviMode;b.s_Scenario',textContent:'Scenario'};
 const crumbs=[...['Server','Package'].map(label=>({getAttribute:()=> 'MF;TF-1;cnrNaviMode;b.s_'+label,textContent:label})),crumb];
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FNodes:{FCollection:[]},FmxGraph:{container:diagram}}});
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const card={Controller:{Node:{data:{node:workflow}},FController:model}};
 let queriedTab=tab;
 const document={querySelectorAll:q=>q.startsWith('[data-tid^=')?crumbs:q==='[data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1"]'?(queriedTab.isConnected?[queriedTab]:[]):q==='[data-tid="MF;TF-1;ModelForm;cmpDiagram"]'?[diagram]:[]};
 const preparation={document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'wf',tab,packageNode}]])};
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active?card:{Controller:{}}}}}}}};
 const realm=vm.createContext({document,location:{origin:'https://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'})});
 const page={evaluate:async(fn,arg)=>{realm.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',realm);},
  locator:selector=>({click:async options=>{assert.equal(selector,'[data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1"]');clicks.push(options.trial?'trial':'click');if(!options.trial)setTimeout(()=>{active=true;},5);}}),
  waitForFunction:async(fn,arg)=>{for(let i=0;i<100;i++){if(await page.evaluate(fn,arg))return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('tab activation did not settle');},mouse:{up:async()=>{}}};
 const adapter=createNodeTargetBrowserAdapter({origin:'https://loginom.test',build:'7.4.2',execute:code=>vm.runInContext('('+code+')',realm)(page)});
 const node={document_id:'doc',workflow_id:'wf',node_id:'user'};
 const request={operation_id:'values',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:crumbs.map(c=>({tid:c.getAttribute(),label:c.textContent}))},
  target:{kind:'existing',type:'variables.user',ref:node},mode:'values',parameters:{variables:[]},inputs:[],mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:2000,execute_ms:1000,total_ms:5000}};
 const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 const drivers={needsWorkflowActivation:ctx=>adapter.needsWorkflowActivation(request,ctx),activateWorkflow:ctx=>adapter.activateWorkflow(request,ctx),
  verifySource:async(_p,ctx)=>{const graph=await adapter.observe(request,ctx.deadline);assert.equal(graph.complete,true);return verified({});},
  prepareTarget:async()=>verified({node}),mapPorts:async()=>verified({}),openWizard:async()=>verified({}),
  finish:async mode=>verified({mode,execution_id:null,execution_started:false}),waitExecution:async()=>assert.fail('No execution'),
  readOutput:async()=>verified({status:'complete',evidence_ref:'read',ports:[]})};
 const handlers=new Map([['variables.user',{revision:'test',modes:['values'],validate:()=>{},configure:async()=>verified({})}]]);
 return {tab,crumb,preparation,clicks,phases,adapter,request,foreignTab:()=>{queriedTab={...tab};},run:()=>applyNode({request,operation:{id:'values'},handlers,drivers,
  record:async e=>{if(e.phase==='node_phase_prepared')phases.push(e.receipt.phase);return structuredClone(e);}})};
}

test('apply activates the still-owned workflow selected away by upload before its source graph read',async()=>{
 const f=fixture();
 await assert.rejects(f.adapter.observe(f.request,Date.now()+2000),/Prepared workflow changed/);
 assert.deepEqual(f.clicks,[],'readGraph remains read-only');
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.deepEqual(f.phases.slice(0,2),['workflow','source']);assert.deepEqual(f.clicks,['trial','click']);
});

for(const fault of [null,'foreign-document','foreign-workflow','foreign-tab','foreign-prefix','foreign-path','failed-save'])
test('table reread uses only its confirmed Save continuation through the browser adapter: '+fault,async()=>{
 const f=fixture({active:true}),old=structuredClone(f.request.workflow_ref);
 const next={...old,navigation_path:[...old.navigation_path.slice(0,-1),{tid:'MF;TF-1;cnrNaviMode;b.s_Saved',label:'Saved'}]};
 const continuation={document_id:'doc',previous_workflow_ref:old,workflow_ref:structuredClone(next)};
 const save={status:'SUCCEEDED',action_key:'package.save_checkpoint',action_revision:'1',operation_id:'save',
  phase:'verified',effect_possible:true,cleanup_complete:true,trace:[],error:null,output:{save_completed:true,workflow_preserved:true,reopened:false,persisted_content_verified:false,
   package_ref:{kind:'package',path:'/user/report.lgp',active_identity:'/user/report.lgp'},
   workflow_continuations:[continuation]}};
 if(fault==='foreign-document')continuation.document_id='other';
 if(fault==='foreign-workflow')continuation.workflow_ref.workflow_id='other';
 if(fault==='foreign-tab')continuation.workflow_ref.tab_tid='other';
 if(fault==='foreign-prefix')continuation.workflow_ref.prefix='MF;TF-2';
 if(fault==='foreign-path')continuation.previous_workflow_ref={...old,navigation_path:[...old.navigation_path.slice(0,-1),{tid:'other',label:'Other'}]};
 if(fault==='failed-save')save.status='FAILED';
 const node={document_id:'doc',workflow_id:'wf',node_id:'report'},schema=[{index:0,name:'Id',label:'Id',type:'integer'}];
 const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 let saveCalls=0,executes=0;
 const adapter={...f.adapter,observe:async(...args)=>({...await f.adapter.observe(...args),nodes:[{ref:node,type:'transform.filter_data',label:'Report',
  position:{x:100,y:100},inputs:[],outputs:[0]}]})};
 const runtime=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,onRecord:async e=>structuredClone(e),
  execute:async()=>++saveCalls===1?{...save,status:'NOT_APPLIED',phase:'prepared',effect_possible:false,checkpoint:{workflow_ref:old}}:save,
  nodeTargetAdapterFactory:()=>adapter,nodeApplyHandlers:new Map([['transform.filter_data',{revision:'1',modes:['conditions'],validate(){},configure:async()=>verified({})}]]),
  nodeApplyDriverFactory:()=>({verifySource:async()=>verified({}),mapPorts:async()=>verified({}),openWizard:async()=>verified({}),
   finish:async mode=>verified({mode,execution_id:'exec'}),finishGraph:async mode=>{executes++;return verified({mode,execution_id:'exec',settings_applied:false});},
   waitExecution:async()=>verified({status:'completed',execution_id:'exec'}),verifyContinuation:async()=>true,
   readOutput:async()=>verified({status:'complete',execution_id:'exec',evidence_ref:'output',ports:[{port:0,schema,fresh:true,execution_id:'exec'}]})})});
 const request={...f.request,operation_id:'initial',target:{kind:'existing',type:'transform.filter_data',ref:node},mode:'conditions',parameters:{},
  finish:'execute',read:{ports:[0],sample_rows:1,require_exact_numbers:true}};
 const initial=await runtime.runNodeApply(request);assert.equal(initial.status,'SUCCEEDED',JSON.stringify(initial));
 const initialExecutes=executes;assert.equal(initialExecutes,1,'unchanged initial Filter executes through its read lifecycle');
 const saved=await runtime.run('package.save_checkpoint',{path:'/user/report.lgp',conflict_policy:'fail'},{operationId:'save'});
 assert.equal(saved.status,save.status,JSON.stringify(saved));
 f.crumb.textContent='Saved';f.crumb.getAttribute=()=>next.navigation_path.at(-1).tid;
 await runtime.startNodeRead({operation_id:'reread',source_operation_id:'initial'});
 const result=await runtime.waitNodeApply('reread',{timeoutMs:1000});
 assert.equal(result.outcome.status,fault?'NOT_APPLIED':'SUCCEEDED',JSON.stringify(result));
 assert.equal(executes-initialExecutes,fault?0:1);assert.deepEqual(f.clicks,[]);
 assert.deepEqual(request.workflow_ref,old,'the completed source keeps its original immutable request');
});
test('an active workflow preserves source-before-workflow order without a gesture',async()=>{
 const f=fixture({active:true}),result=await f.run();assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.deepEqual(f.phases.slice(0,2),['source','workflow']);assert.deepEqual(f.clicks,[]);
});
for(const change of ['disconnected','foreign-tab','foreign-document'])
test('source activation never repairs '+change,async()=>{
 const f=fixture();if(change==='disconnected')f.tab.isConnected=false;
 if(change==='foreign-tab')f.foreignTab();if(change==='foreign-document')f.preparation.document={};
 const result=await f.run();assert.notEqual(result.status,'SUCCEEDED');
 assert.match(result.error.message,/Prepared (workflow|graph document) changed/);assert.deepEqual(f.clicks,[]);
});
