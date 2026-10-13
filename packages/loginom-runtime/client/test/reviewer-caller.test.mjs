import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {retainUnionOriginalCaller}=await import(pathToFileURL(join(process.env.UNION_CALLER_LIB,'union-original-caller.mjs')));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(){
 const controller=new AbortController(),ipc=new MessageChannel(),wait=deferred(),started=deferred();let sends=0;
 ipc.port2.on('message',()=>{sends++;started.resolve();});
 const operation={id:'original',signature:'original-signature',parameters:{operation_id:'original',target:{type:'transform.union_data'},inputs:[],mappings:[{direction:'input',port:0,autosync:true}]}};
 const execute=()=>{ipc.port1.postMessage('dispatch');return wait.promise;};
 const input={operation,signal:controller.signal,deadline:9000,execute,now:()=>100};
 return{operation,input,wait,started,get sends(){return sends;},close(){ipc.port1.close();ipc.port2.close();}};
}
test('lossless request refuses negative-zero mapping port before mint/dispatch',()=>{
 const f=fixture();try{
  f.operation.parameters.mappings[0].port=-0;
  assert(Object.is(f.operation.parameters.mappings[0].port,-0));
  assert.throws(()=>retainUnionOriginalCaller(f.input),'negative zero cannot be pinned by a JSON digest that normalizes it to zero');
  assert.equal(f.sends,0);
 }finally{f.close();}
});
test('original positive-zero request cannot drift to negative zero undetected before dispatch',async()=>{
 const f=fixture();try{
  const caller=retainUnionOriginalCaller(f.input);
  const original=JSON.stringify(f.operation.parameters);
  f.operation.parameters.mappings[0].port=-0;
  assert.equal(JSON.stringify(f.operation.parameters),original);
  assert(Object.is(f.operation.parameters.mappings[0].port,-0));
  f.wait.resolve('execute result double');
  await assert.rejects(caller.execute('original:read','fixed',{}),'request digest must reject this lossy original-operand drift');
  assert.equal(f.sends,0);
 }finally{f.close();}
});
for(const reason of [Error('original',{cause:0}),undefined,null,false,0,''])
 test('retained rejected original call survives secondary refusal and original restoration: '+String(reason),async()=>{
  const f=fixture();try{
   const caller=retainUnionOriginalCaller(f.input),options={timeout:5000};
   const work=caller.execute('original:read','fixed',options);
   const first=work.then(()=>({fulfilled:true}),value=>({rejection:value}));await f.started.promise;f.wait.reject(reason);
   assert.equal((await first).rejection,reason);
   f.operation.signature='secondary drift';
   await assert.rejects(caller.execute('original:read','fixed',options),/BINDING_CHANGED/);
   f.operation.signature='original-signature';
   assert.equal(caller.execute('original:read','fixed',options),work);
   await assert.rejects(work,value=>value===reason);
   await assert.rejects(caller.execute('original:new','fixed',{}),/REFUSED/);
   assert.equal(f.sends,1);assert.equal(caller.facts().completionAuthority,false);
  }finally{f.close();}
 });
