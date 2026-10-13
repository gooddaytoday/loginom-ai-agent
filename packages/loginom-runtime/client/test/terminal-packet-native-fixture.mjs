import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,open,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {MessageChannel} from 'node:worker_threads';
import vm from 'node:vm';
import {parseExpressionAt} from '../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
const {retainTerminalOriginalInterfaces}=await import(process.env.TERMINAL_INTERFACE_MODULE
  ? pathToFileURL(process.env.TERMINAL_INTERFACE_MODULE).href : '../lib/terminal-original-interfaces.mjs');
const inputs=Object.fromEntries(await Promise.all(['rpc.js','bg.rtl.rpc.js','bg.rtl.js'].map(async n=>[n,await readFile(join(process.env.TERMINAL_INPUT_DIR,n),'utf8')])));
function body(file,marker,method) {
 const text=inputs[file],start=text.indexOf(marker);assert(start>=0);
 const b=text.indexOf('\n\t\t'+method+': function',start),a=b+('\n\t\t'+method+': ').length;
 assert(b>=0);let expression=parseExpressionAt(text,a,{ecmaVersion:'latest'});
 if(expression.type==='SequenceExpression')expression=expression.expressions[0];
 assert.equal(expression.type,'FunctionExpression');return text.slice(a,expression.end);
}
const query=body('rpc.js','ss.initClass($rpc_TBGObjectProxy,','QueryInterface');
const methods=Object.fromEntries(['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath','SaveToStream'].map(n=>[n,body('bg.rtl.rpc.js','ss.initClass($bg_rpc_'+(n==='SaveToStream'?'TIBGStreamPersist':'TIBGFileStorage')+'_Proxy,',n)]));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),'terminal-interface-'));const ipc=new MessageChannel();
 const calls=[],waiting=new Map();let sequence=0,hold=false,error,hasError=false,responseMutation;
 let ownership=true,connected=true,root='/personal',currentDirectory='/personal';
 const completionTasks=[];
 class TaskCompletionSource {
 constructor(){let settled=false,failed=false,result;const callbacks=[];
 this.task={continueWith(fn){callbacks.push(fn);if(settled)queueMicrotask(fn)},getAwaitedResult(){if(!settled)throw Error('missing completion');if(failed)throw result;return result}};
 completionTasks.push(this.task);
 const finish=(value,rejected)=>{settled=true;failed=rejected;result=value;for(const fn of callbacks)queueMicrotask(fn)};
 this.setResult=value=>finish(value,false);this.setException=value=>finish(value,true);
 }
} // Explicit Saltarelle task double, no Promise/DTO proxy conversion.

 const packageProxy={},storage={},user={},support={};
 const StreamPersist={guid:'stream-persist'};
 const session={$M:{GetDynamicData(){const request={Release(){},set_StaticDataSize(){},InitializeMethodCallMessage(w,o,m){request.method=m;},set_Signature(){},set_MessageType(){},set_ObjectOwnerID(w){request.owner=w;},set_ObjectID(o){request.object=o;},set_MethodID(m){request.method=m;},WriteParameter$8(_,g){request.guid=g;}};return request;}},
  $R(w,o,type){assert.equal(type,1291);assert.deepEqual([w,o],[11,73]);return responseMutation?responseMutation(support):support;},
  DispatchMessageAsync(request){
   calls.push(request.method);const id=++sequence;let result;
   const task={continueWith(fn){waiting.set(id,{fn,task});ipc.port1.postMessage({id,method:request.method,guid:request.guid});},
    getAwaitedResult(){if(hasError)throw error;return result;},
    deliver(){result={Release(){},set_StaticDataSize(){},ReadParameterInt32(offset){return offset===0?11:offset===4?73:0;},
      ReadParameterBoolean(){return request.method===907?connected:ownership;},ReadString(){return request.method===909?currentDirectory:root;}};}}
   return task;
  }};
 ipc.port2.on('message',m=>{if(!hold)ipc.port2.postMessage(m);});
 ipc.port1.on('message',m=>{const w=waiting.get(m.id);if(w){waiting.delete(m.id);w.task.deliver();w.fn();}});
 const context={ss:{TaskCompletionSource,mkdel:(o,f)=>f.bind(o),Exception:class extends Error{static wrap(e){return e;}},referenceEquals:(a,b)=>a===b,getTypeFullName:()=>'',formatString:s=>s},
  $rpc_GuidHelper:{GetGuid(type){assert.equal(type,StreamPersist);return type.guid;}},
  $rpc_TBGMessageDynamicData:{GetRemoteInterface:()=>({get_Guid:()=> 'package'}),BGRemoteMessageSignature:1,QueryInterface_MethodID:0,GetRemoteInterfaceID$2:()=>1291,FindRemoteInterfaceID$2:()=>1291},
  $rpc_TBGObjectProxy:{IID_NULL:'null',$CustomExternalInterfaceRegistered:()=>false},$rpc_HResult:{E_InvalidArg:-1}};
 const queryFn=vm.runInNewContext('('+query+')',context);
 const storageProto=Object.fromEntries(Object.entries(methods).filter(([k])=>k!=='SaveToStream').map(([k,v])=>[k,vm.runInNewContext('('+v+')',context)]));
 const persistProto={SaveToStream:vm.runInNewContext('('+methods.SaveToStream+')',context)};
 Object.setPrototypeOf(packageProxy,{QueryInterface:queryFn});Object.setPrototypeOf(storage,storageProto);Object.setPrototypeOf(support,persistProto);
 for(const [p,id]of [[packageProxy,73],[storage,74],[user,75],[support,73]])Object.assign(p,{$:{$OW:11,$O:id},$S:session,CreateDisconnectedProxyError:()=>Error('disconnected')});
 packageProxy.$II=()=>893;packageProxy.$GetProxyMetaClass=()=>({get___CustomExternalInterface:()=>null});
 const definitions={ObjectProxyPrototype:Object.getPrototypeOf(packageProxy),FileStoragePrototype:storageProto,StreamPersistPrototype:persistProto,StreamPersist};
 const abort=new AbortController();const original=Object.fromEntries(['owner','run','lease','chat','document','account','session','page','context','packageNode','tab','operation','gate'].map(k=>[k,{}]));
 Object.assign(original,{generation:7,packageProxy,currentUser:user,fileStorage:storage,nativeSession:session,signal:abort.signal,deadline:1000,refusal:Error('original unsaved refusal',{cause:0})});
 const current={...original,pending:false,running:false,unknown:false,writerPending:false,dirty:false,targetSelected:false};let clock=0,writes=0,writeRefusal;
 const build=()=>retainTerminalOriginalInterfaces({original,current:()=>current,definitions,sourceInputs:inputs,signal:abort.signal,deadline:1000,now:()=>clock,
  record:async facts=>{writes++;if(writeRefusal)throw writeRefusal.value;const f=await open(join(dir,'facts.json'),'w',0o600);try{await f.writeFile(JSON.stringify(facts));await f.sync();}finally{await f.close();}return JSON.parse(await readFile(join(dir,'facts.json'),'utf8'));}});
 const scope=build();
 return {scope,build,current,original,definitions,calls,abort,dir,packageProxy,storage,support,closureContext:context,inputs,session,completionTasks,
  writes:()=>writes,clock:v=>clock=v,own:v=>ownership=v,connected:v=>connected=v,root:v=>root=v,
  queryReply:f=>responseMutation=f,fail:v=>{hasError=true;error=v;},writeFail:v=>writeRefusal=v,
  hold(){hold=true;},async drain(){hold=false;for(const [id,w]of waiting){waiting.delete(id);w.task.deliver();w.fn();}await Promise.resolve();},
  cleanup:async()=>{ipc.port1.close();ipc.port2.close();await rm(dir,{recursive:true});}};
}
async function control(fn){const f=await fixture();try{await fn(f);}finally{await f.cleanup();}}

export {fixture};
