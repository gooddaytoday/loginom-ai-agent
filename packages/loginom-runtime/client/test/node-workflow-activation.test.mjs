import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {activatePreparedWorkflow} from '../lib/node-workflow-activation.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';

function fixture(){
 let active=false;const calls=[];
 const tab={isConnected:true,getBoundingClientRect:()=>({width:100,height:25}),classList:{contains:()=>active}};
 const crumb={getAttribute:()=> 'MF;TF-1;cnrNaviMode;b.s_Сценарий',textContent:'Сценарий'};
 const document={querySelectorAll:selector=>selector.startsWith('[data-tid^=')?[crumb]:selector.startsWith('[data-tid=')?[tab]:[]};
 const request={document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'tab-1',prefix:'MF;TF-1',
   navigation_path:[{tid:crumb.getAttribute(),label:'Сценарий'}]}};
 const record={phase:'verified',workflowId:'flow',tab,packageNode:{}};
 const context={document,location:{origin:'http://loginom'},bg:{app:{Version:'7.4.2'}},
   __loginomDockPreparationV1:{document,id:'doc',receipts:new Map([['prepare',record]])},getComputedStyle:()=>({visibility:'visible'})};
 const page={evaluate:async(fn,arg)=>vm.runInNewContext('('+fn.toString()+')(task)',{...context,task:arg}),
   locator:()=>({click:async options=>{calls.push(options.trial?'trial':'click');if(!options.trial)active=true;}}),mouse:{up:async()=>calls.push('release')}};
 const task={request,origin:'http://loginom',build:'7.4.2',deadline:Date.now()+10000};
 return {page,task,context,record,tab,crumb,calls,setActive:value=>{active=value},run:()=>activatePreparedWorkflow(page,task)};
}
test('inactive exact prepared tab is activated once with before/after identity',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(r.verified,true);
 assert.deepEqual(f.calls,['trial','click']);assert.equal(r.effect_possible,true);
 assert.deepEqual(r.trace.map(t=>t.event),['prepared_workflow_observed','prepared_workflow_clicked','prepared_workflow_active']);
 assert.equal((await f.run()).effect_possible,false);assert.deepEqual(f.calls,['trial','click']);
});
test('an already active workflow needs no click',async()=>{
 const f=fixture();f.setActive(true);const r=await f.run();assert.equal(r.verified,true);assert.equal(r.effect_possible,false);assert.deepEqual(f.calls,[]);
});
test('equivalent JSON object key order does not change prepared navigation identity',async()=>{
 const f=fixture();f.task.request.workflow_ref.navigation_path=f.task.request.workflow_ref.navigation_path.map(({tid,label})=>({label,tid}));
 assert.equal((await f.run()).verified,true);assert.deepEqual(f.calls,['trial','click']);
 f.crumb.textContent='Changed';assert.equal((await f.run()).verified,false);
 assert.deepEqual(f.calls,['trial','click']);
});
test('continuation observation never switches an inactive tab',async()=>{
 const f=fixture();f.task.observeOnly=true;
 assert.equal((await f.run()).status,'NOT_APPLIED');assert.deepEqual(f.calls,[]);
 f.setActive(true);assert.equal((await f.run()).verified,true);assert.deepEqual(f.calls,[]);
 f.context.__loginomDockPreparationV1.id='replaced';
 assert.equal((await f.run()).status,'NOT_APPLIED');assert.deepEqual(f.calls,[]);
});
test('foreign document, removed tab or changed navigation refuse before a gesture',async()=>{
 for(const mutate of [f=>{f.context.__loginomDockPreparationV1.id='foreign'},f=>{f.tab.isConnected=false},
   f=>{f.crumb.textContent='Changed'},f=>{f.record.packageNode=null}]){
  const f=fixture();mutate(f);const r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.cleanup_complete,true);assert.deepEqual(f.calls,[]);
 }
});
test('an unknown click result remains ambiguous and releases the mouse',async()=>{
 const f=fixture();f.page.locator=()=>({click:async o=>{if(!o.trial)throw Error('lost click response')}});
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.verified,false);assert.deepEqual(f.calls,['release']);
});
test('late adapter reconciliation reads the original Page receipt without reissuing a click',async()=>{
 const f=fixture();let calls=0;
 const adapter=createNodeTargetBrowserAdapter({origin:f.task.origin,build:f.task.build,execute:async code=>{
  const result=await vm.runInNewContext('('+code+')(page)',{page:f.page});
  calls++;
  if(calls===1)throw Error('lost transport response');
  // Simulate an earlier inspection reply arriving before completion is visible.
  if(calls===2)return {output:{state:'running'}};
  return result;
 }});
 const ctx={receipt_id:'apply:workflow',deadline:Date.now()+10000};
 await assert.rejects(adapter.activateWorkflow(f.task.request,ctx),/lost transport/);
 const late=await adapter.readWorkflowReceipt(f.task.request,ctx);
 assert.equal(late.output.state,'completed');assert.equal(late.output.receipt.verified,true);
 assert.equal((await adapter.verifyWorkflow(f.task.request,ctx)).verified,true);
 assert.deepEqual(f.calls,['trial','click']);
 f.setActive(false);assert.equal((await adapter.verifyWorkflow(f.task.request,ctx)).verified,false);
 assert.deepEqual(f.calls,['trial','click']);
 const other=await adapter.readWorkflowReceipt({...f.task.request,document_id:'other'},ctx);
 assert.equal(other.output.state,'missing');
});
