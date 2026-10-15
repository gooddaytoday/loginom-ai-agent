import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {mkdtemp,open,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const lib=process.env.UNION_CALLER_LIB||new URL('../lib/',import.meta.url).pathname;
const {retainUnionOriginalCaller,unionOriginalCallerMatches}=await import(pathToFileURL(join(lib,'union-original-caller.mjs')));
const {createNodeProcedure}=await import(pathToFileURL(join(lib,'node-procedure.mjs')));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const controller=new AbortController(),wait=deferred(),started=deferred(),ipc=new MessageChannel();let sends=0,time=100;
 const operation={id:'original',signature:'original-signature',parameters:{operation_id:'original',target:{type:'transform.union_data'},inputs:[]},
  action:{action_key:'node.apply',revision:'original'},deadline:9000,checkpoint:{document_id:'document'}};
 ipc.port2.on('message',()=>{sends++;started.resolve();});
 const execute=(code,options)=>{f.delivered={code,options};ipc.port1.postMessage('dispatch');return wait.promise;};
 const input={operation,signal:controller.signal,deadline:9000,execute,now:()=>time};
 const f={controller,wait,started,operation,input,delivered:null,setTime:v=>time=v,get sends(){return sends;},close(){ipc.port1.close();ipc.port2.close();}};return f;
}
for(const primary of [Error('original transport',{cause:0}),undefined,null,false,0,''])
 test('production procedure preserves first raw rejection '+String(primary),async()=>{
  const f=fixture();try{
   const caller=retainUnionOriginalCaller(f.input);let sequence=0;
   const channel=createNodeProcedure({operation:f.operation,execute:(code,options)=>caller.execute('original:read'+ ++sequence,code,options),
    signal:f.controller.signal,record:async e=>e,targetOrigin:'http://fixture.invalid',targetBuild:'7.4.2',now:()=>100,monotonicNow:()=>100});
   const work=channel.observe({condition:'original graph',ready:()=>false}).then(()=>({ok:true}),error=>({error}));
   await f.started.promise;assert.equal(f.delivered.options.signal,f.controller.signal);assert.equal(f.delivered.options.deadline,9000);
   f.input.deadline=10000;f.wait.reject(primary);assert.equal((await work).error,primary);assert.equal(f.sends,1);
   assert.equal(caller.facts().nativeAuthority,false);assert.equal(caller.facts().cleanupAuthority,false);
  }finally{f.close();}
 });
test('phase deadline does not replace original caller; same pending Promise',async()=>{
 const f=fixture();try{
  const caller=retainUnionOriginalCaller(f.input),options={timeout:5000};const work=caller.execute('original:read','fixed',options);await f.started.promise;
  f.operation.deadline=1000;assert.equal(caller.execute('original:read','fixed',options),work);
  await assert.rejects(caller.execute('original:second','next phase',{}),/PENDING/);f.operation.deadline=2000;
  f.wait.resolve({original:true});assert.deepEqual(await work,{original:true});assert.equal(f.delivered.options.deadline,9000);assert.equal(f.sends,1);
  assert.equal(unionOriginalCallerMatches({...caller},f.operation),false);assert.equal(unionOriginalCallerMatches(caller,{...f.operation}),false);
 }finally{f.close();}
});
for(const change of ['id','signature','request','nested','signal','deadline','execute'])
 test('initial drift before transport '+change,async()=>{
  const f=fixture();try{const caller=retainUnionOriginalCaller(f.input);
   if(change==='id')f.operation.id='foreign';if(change==='signature')f.operation.signature='foreign';
   if(change==='request')f.operation.parameters=structuredClone(f.operation.parameters);
   if(change==='nested')f.operation.parameters.inputs.original_pin='must-not-be-lost';
   if(change==='signal')f.input.signal=new AbortController().signal;if(change==='deadline')f.input.deadline=10000;if(change==='execute')f.input.execute=()=>{};
   await assert.rejects(caller.execute('original:read','fixed',{}));assert.equal(f.sends,0);
  }finally{f.close();}
 });
test('abort false precedes late ID drift',async()=>{
 const f=fixture();try{const caller=retainUnionOriginalCaller(f.input);const work=caller.execute('original:read','fixed',{}).catch(error=>({error}));
  await f.started.promise;f.controller.abort(false);f.operation.id='foreign';f.wait.resolve('confirmed');assert.equal((await work).error,false);assert.equal(f.sends,1);
 }finally{f.close();}
});
test('original deadline expires while reply pending',async()=>{
 const f=fixture();try{const caller=retainUnionOriginalCaller(f.input);const work=caller.execute('original:read','fixed',{});
  await f.started.promise;f.setTime(9000);f.wait.resolve('confirmed');await assert.rejects(work,/DEADLINE/);assert.equal(f.sends,1);
 }finally{f.close();}
});
test('confirmed reply permits original storage-only repair, no read replay',async()=>{
 const f=fixture(),directory=await mkdtemp(join(tmpdir(),'union-caller-'));try{
  const caller=retainUnionOriginalCaller(f.input),options={timeout:5000},work=caller.execute('original:read','fixed',options);
  await f.started.promise;f.operation.id='foreign';f.wait.resolve({value:'original'});await assert.rejects(work,/BINDING/);
  assert.throws(()=>caller.confirmed('original:read'));f.operation.id='original';const reply=caller.confirmed('original:read');
  const path=join(directory,'original.json'),writer=await open(path,'wx',0o600);
  try{await writer.writeFile(JSON.stringify(reply));await writer.sync();}finally{await writer.close();}
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),reply);assert.equal(f.sends,1);
  assert.equal(caller.execute('original:read','fixed',options),work);await assert.rejects(work,/BINDING/);
  await assert.rejects(caller.execute('original:new','fixed',{}),/REFUSED/);assert.equal(caller.facts().releaseAuthority,false);
 }finally{f.close();await rm(directory,{recursive:true});}
});
test('input accessor and copied signal facade refused without invocation',()=>{
 const f=fixture();try{let getters=0;Object.defineProperty(f.input,'signal',{get(){getters++;return f.controller.signal;}});
  assert.throws(()=>retainUnionOriginalCaller(f.input),/DATA_OPERAND/);assert.equal(getters,0);
  assert.throws(()=>retainUnionOriginalCaller({operation:f.operation,deadline:9000,execute:()=>{},now:()=>100,signal:{aborted:false,reason:undefined}}));
 }finally{f.close();}
});
test('options getter and synchronous substitution refused before dispatch; preabort 0 exact',async()=>{
 const f=fixture();try{const caller=retainUnionOriginalCaller(f.input);let getters=0;const options={};
  Object.defineProperty(options,'timeout',{enumerable:true,get(){getters++;return 5000;}});
  await assert.rejects(caller.execute('original:read','fixed',options));assert.equal(getters,0);
  const late={timeout:5000},work=caller.execute('original:late','fixed',late);late.timeout=9999;await assert.rejects(work,/OPTIONS_CHANGED/);assert.equal(f.sends,0);
  const g=fixture();try{g.controller.abort(0);assert.throws(()=>retainUnionOriginalCaller(g.input),e=>e===0);}finally{g.close();}
 }finally{f.close();}
});

test('missing absolute deadline or legacy kind refuses before retain',()=>{
 const f=fixture();try{delete f.input.deadline;assert.throws(()=>retainUnionOriginalCaller(f.input));f.input.deadline=9000;
  f.operation.parameters.target.type='transform.union';assert.throws(()=>retainUnionOriginalCaller(f.input));assert.equal(f.sends,0);
 }finally{f.close();}
});
test('duplicate code and foreign operation key never replace dispatch',async()=>{
 const f=fixture();try{const caller=retainUnionOriginalCaller(f.input),options={timeout:5000},work=caller.execute('original:read','fixed',options);
  await f.started.promise;await assert.rejects(caller.execute('original:read','replacement',options),/DUPLICATE/);
  await assert.rejects(caller.execute('foreign:read','fixed',{}));f.wait.resolve('original');assert.equal(await work,'original');assert.equal(f.sends,1);
 }finally{f.close();}
});
test('confirmed receipt inspection guards late option accessor without invoking it',async()=>{
 const f=fixture();try{const caller=retainUnionOriginalCaller(f.input),options={timeout:5000},work=caller.execute('original:read','fixed',options);
  await f.started.promise;f.wait.resolve('original');await work;let getters=0;
  Object.defineProperty(options,'timeout',{get(){getters++;return 5000;}});assert.throws(()=>caller.confirmed('original:read'));assert.equal(getters,0);assert.equal(f.sends,1);
 }finally{f.close();}
});
