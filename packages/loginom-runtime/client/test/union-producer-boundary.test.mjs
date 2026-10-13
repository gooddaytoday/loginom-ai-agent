import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MessageChannel} from 'node:worker_threads';
const lib=process.env.UNION_PRODUCER_LIB || new URL('../lib/',import.meta.url).pathname;
const {createUnionNodeSupport}=await import(pathToFileURL(join(lib,'union-node.mjs')));
const {unionCleanupWitness}=await import(pathToFileURL(join(lib,'union-configure-cleanup.mjs')));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
// No Page/native/controller/service is executed. SDK request is a transport
// double; actual production factory/procedure, AbortController, IPC and FS run.
async function fixture() {
 const directory=await mkdtemp(join(tmpdir(),'union-birth-gap-'));const ipc=new MessageChannel();
 const node={document_id:'document',workflow_id:'workflow',node_id:'node'};
 const workflow={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'root',label:'workflow'}]};
 const operation={id:'original',signature:'original-signature',deadline:9000,action:{action_key:'node.apply',revision:'original'},parameters:{operation_id:'original',target:{type:'transform.union'}},
  nodeApply:{node,phases:[],request:{document_id:'document',workflow_ref:workflow}}};
 const calls=[],started=deferred(),waiting=new Map();let sequence=0;
 ipc.port2.on('message',id=>ipc.port2.postMessage(id));
 ipc.port1.on('message',id=>{const callback=waiting.get(id);if(callback){waiting.delete(id);callback();}});
 const execute=(code,options)=>{const d=deferred();calls.push({code,options,d});started.resolve();return d.promise;};
 const record=async event=>{
  const id=++sequence;await new Promise(resolve=>{waiting.set(id,resolve);ipc.port1.postMessage(id);});
  const f=await open(join(directory,id+'.json'),'wx',0o600);
  try{await f.writeFile(JSON.stringify(event));await f.sync();}finally{await f.close();}
  return structuredClone(event);
 };
 const {nodeApplyDriverFactory}=createUnionNodeSupport({targetOrigin:'http://fixture.invalid',targetBuild:'7.4.2'});
 const drivers=nodeApplyDriverFactory({operation,execute,onRecord:record,now:()=>0,receiptOptions:()=>({})});
 const a=new AbortController(),b=new AbortController();
 const context=(signal,deadline)=>({signal,deadline,document_id:'document',workflow_ref:workflow,node});
 return {operation,drivers,calls,started,a,b,context,async cleanup(){ipc.port1.close();ipc.port2.close();await rm(directory,{recursive:true});}};
}
for(const primary of [Error('original transport',{cause:0}),undefined,null,false,0,''])
 test('pre-open factory preserves transport primary; has no original native packet '+String(primary),async()=>{
  const f=await fixture();try{
   const work=f.drivers.openWizard(f.context(f.a.signal,1000));const observed=work.catch(e=>({rejected:true,error:e}));
   await f.started.promise;assert.equal(f.operation.deadline,1000);
   assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.signal,undefined);
   assert.equal(f.operation.originalWizardCreation,undefined);
   assert.equal(unionCleanupWitness({verified:true,callback_complete:true,cookie:'copy'},f.operation),false);
   f.calls[0].d.reject(primary);const result=await observed;assert.equal(result.rejected,true);assert.equal(result.error,primary);
   assert.equal(f.calls.length,1);assert.equal(f.operation.nodeApply.request.document_id,'document');
  }finally{await f.cleanup();}
 });
test('actual shared enter rebinds phase deadline while original pre-open transport waits',async()=>{
 const f=await fixture();try{
  const first=f.drivers.openWizard(f.context(f.a.signal,1000));const a=first.catch(e=>e);
  await f.started.promise;const firstDeadline=f.operation.deadline;assert.equal(firstDeadline,1000);
  f.a.abort(false);
  const second=f.drivers.configureCalculator(f.context(f.b.signal,2000),{});const b=second.catch(e=>e);
  const until=Date.now()+5000;while(f.calls.length<2&&Date.now()<until)await new Promise(r=>setImmediate(r));
  assert.equal(f.operation.deadline,2000);assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].options.signal,undefined);assert.equal(f.calls[1].options.signal,undefined);
  assert.equal(f.operation.originalWizardCreation,undefined);
  const original=Error('held pre-open transport',{cause:0}),next=Error('second phase transport');
  f.calls[0].d.reject(original);f.calls[1].d.reject(next);assert.equal(await a,original);assert.equal(await b,next);
  assert.equal(f.operation.id,'original');assert.equal(f.operation.signature,'original-signature');
 }finally{await f.cleanup();}
});
