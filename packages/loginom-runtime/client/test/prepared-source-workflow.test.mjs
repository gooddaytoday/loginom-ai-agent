import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {applyNode} from '../lib/node-apply.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';

// The source observation executes the production readGraph against native
// cached objects. Only the unrelated configuration/output phases are stubs.
function fixture({active=false}={}){
 class PackageTreeNode {} class WorkFlowTreeNode {} class ModelForm {}
 const clicks=[],phases=[];
 const tab={isConnected:true,classList:{contains:()=>active},getBoundingClientRect:()=>({width:100,height:20})};
 const diagram={getBoundingClientRect:()=>({width:100,height:100}),querySelectorAll:()=>[]};
 const crumb={getAttribute:()=> 'MF;TF-1;cnrNaviMode;b.s_Scenario',textContent:'Scenario'};
 const model=Object.assign(new ModelForm(),{FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FNodes:{FCollection:[]},FmxGraph:{container:diagram}}});
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode});
 const card={Controller:{Node:{data:{node:workflow}},FController:model}};
 let queriedTab=tab;
 const document={querySelectorAll:q=>q.startsWith('[data-tid^=')?[crumb]:q==='[data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1"]'?(queriedTab.isConnected?[queriedTab]:[]):q==='[data-tid="MF;TF-1;ModelForm;cmpDiagram"]'?[diagram]:[]};
 const preparation={document,id:'doc',receipts:new Map([['prepare',{phase:'verified',workflowId:'wf',tab,packageNode}]])};
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active?card:{Controller:{}}}}}}}};
 const realm=vm.createContext({document,location:{origin:'https://loginom.test'},bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'})});
 const page={evaluate:async(fn,arg)=>{realm.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',realm);},
  locator:selector=>({click:async options=>{assert.equal(selector,'[data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1"]');clicks.push(options.trial?'trial':'click');if(!options.trial)setTimeout(()=>{active=true;},5);}}),
  waitForFunction:async(fn,arg)=>{for(let i=0;i<100;i++){if(await page.evaluate(fn,arg))return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('tab activation did not settle');},mouse:{up:async()=>{}}};
 const adapter=createNodeTargetBrowserAdapter({origin:'https://loginom.test',build:'7.4.2',execute:code=>vm.runInContext('('+code+')',realm)(page)});
 const node={document_id:'doc',workflow_id:'wf',node_id:'user'};
 const request={operation_id:'values',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:crumb.getAttribute(),label:'Scenario'}]},
  target:{kind:'existing',type:'variables.user',ref:node},mode:'values',parameters:{variables:[]},inputs:[],mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:2000,execute_ms:1000,total_ms:5000}};
 const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
 const drivers={needsWorkflowActivation:ctx=>adapter.needsWorkflowActivation(request,ctx),activateWorkflow:ctx=>adapter.activateWorkflow(request,ctx),
  verifySource:async(_p,ctx)=>{const graph=await adapter.observe(request,ctx.deadline);assert.equal(graph.complete,true);return verified({});},
  prepareTarget:async()=>verified({node}),mapPorts:async()=>verified({}),openWizard:async()=>verified({}),
  finish:async mode=>verified({mode,execution_id:null,execution_started:false}),waitExecution:async()=>assert.fail('No execution'),
  readOutput:async()=>verified({status:'complete',evidence_ref:'read',ports:[]})};
 const handlers=new Map([['variables.user',{revision:'test',modes:['values'],validate:()=>{},configure:async()=>verified({})}]]);
 return {tab,preparation,clicks,phases,adapter,request,foreignTab:()=>{queriedTab={...tab};},run:()=>applyNode({request,operation:{id:'values'},handlers,drivers,
  record:async e=>{if(e.phase==='node_phase_prepared')phases.push(e.receipt.phase);return structuredClone(e);}})};
}

test('apply activates the still-owned workflow selected away by upload before its source graph read',async()=>{
 const f=fixture();
 await assert.rejects(f.adapter.observe(f.request,Date.now()+2000),/Prepared workflow changed/);
 assert.deepEqual(f.clicks,[],'readGraph remains read-only');
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.deepEqual(f.phases.slice(0,2),['workflow','source']);assert.deepEqual(f.clicks,['trial','click']);
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
