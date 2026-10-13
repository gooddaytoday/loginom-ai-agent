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
 class TaskCompletionSource {constructor(){this.task=new Promise((a,b)=>{this.setResult=a;this.setException=b;});}}
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
 const current={...original,pending:false,running:false,unknown:false,writerPending:false,dirty:false,targetSelected:false};let clock=0,writes=0,writeRefusal,writeHook=async()=>{};
 const build=()=>retainTerminalOriginalInterfaces({original,current:()=>current,definitions,sourceInputs:inputs,signal:abort.signal,deadline:1000,now:()=>clock,
  record:async facts=>{writes++;await writeHook();if(writeRefusal)throw writeRefusal.value;const f=await open(join(dir,'facts.json'),'w',0o600);try{await f.writeFile(JSON.stringify(facts));await f.sync();}finally{await f.close();}return JSON.parse(await readFile(join(dir,'facts.json'),'utf8'));}});
 const scope=build();
 return {scope,build,current,original,definitions,calls,abort,dir,packageProxy,storage,support,
  writes:()=>writes,clock:v=>clock=v,own:v=>ownership=v,connected:v=>connected=v,root:v=>root=v,
  queryReply:f=>responseMutation=f,fail:v=>{hasError=true;error=v;},writeFail:v=>writeRefusal=v,writeHook:f=>writeHook=f,
  hold(){hold=true;},async drain(){hold=false;for(const [id,w]of waiting){waiting.delete(id);w.task.deliver();w.fn();}await Promise.resolve();},
  cleanup:async()=>{ipc.port1.close();ipc.port2.close();await rm(dir,{recursive:true});}};
}
async function control(fn){const f=await fixture();try{await fn(f);}finally{await f.cleanup();}}
test('unchanged original fixed native methods + real IPC/FS; PARTIAL only',()=>control(async f=>{
 const token=await f.scope.read();assert.deepEqual(f.calls,[907,0,909,910,911]);
 const facts=f.scope.inspect(token);assert.equal(facts.saveAuthority,false);assert.equal(facts.nativeAuthority,false);assert.equal(facts.status,'PARTIAL');
 assert.equal(f.scope.originalRefusal,f.original.refusal);await f.scope.persist();await f.scope.persist();assert.equal(f.writes(),1);
 assert.equal(await f.scope.read(),token);assert.deepEqual(f.calls,[907,0,909,910,911]);
 assert.throws(()=>f.scope.inspect({...token}));f.scope.end();assert.throws(()=>f.scope.read());
}));
for(const key of ['owner','run','lease','generation','chat','document','account','session','page','context','packageNode','tab','packageProxy','currentUser','fileStorage','nativeSession','operation','gate','signal','deadline'])
 test('initial replaced '+key+' refuses before wire IO',()=>control(async f=>{f.current[key]={};assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);}));
for(const key of ['pending','running','unknown','writerPending','dirty','targetSelected'])
 test('initial '+key+' refuses',()=>control(async f=>{f.current[key]=true;assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);}));
test('proxy disconnected refuses before wire IO',()=>control(async f=>{f.packageProxy.$.$OW=-1;assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);}));
test('getter substitution is refused without getter call',()=>control(async f=>{
 let getter=0;Object.defineProperty(f.storage,'get_RootPath',{get(){getter++;return f.definitions.FileStoragePrototype.get_RootPath;}});
 assert.throws(()=>f.scope.read());assert.equal(getter,0);assert.equal(f.calls.length,0);
}));
test('wrong defining pin refuses before native methods',()=>control(async f=>{
 const old=inputs['rpc.js'];try{inputs['rpc.js']=old+' ';const s=f.build();await assert.rejects(s.read());assert.equal(f.calls.length,0);}finally{inputs['rpc.js']=old;}
}));
test('original pending continuation is drained once',()=>control(async f=>{
 f.hold();const a=f.scope.read();while(!f.calls.length)await new Promise(r=>setImmediate(r));
 const b=f.scope.read();assert.equal(a,b);assert.throws(()=>f.scope.end());assert.deepEqual(f.calls,[907]);await f.drain();await a;
 assert.deepEqual(f.calls,[907,0,909,910,911]);
}));
test('Page replacement during original await refuses and retains handles',()=>control(async f=>{
 f.hold();const a=f.scope.read();while(!f.calls.length)await new Promise(r=>setImmediate(r));f.current.page={};await f.drain();await assert.rejects(a);
 assert.throws(()=>f.scope.end());assert.equal(f.calls.length,1);
}));
for(const error of [Error('primary',{cause:0}),undefined,null,false,0,''])
 test('raw '+String(error)+' rejection cached; secondary drift cannot replace it',()=>control(async f=>{
 f.fail(error);const a=f.scope.read();await assert.rejects(a,x=>x===error);assert.equal(f.scope.primary,error);
 f.current.page={};assert.equal(f.scope.read(),a);await assert.rejects(a,x=>x===error);assert.equal(f.scope.secondary.length,1);assert.equal(f.calls.length,1);
}));
for(const value of [false,undefined,null,0,''])
 test('non-personal/falsy ownership '+String(value)+' refuses',()=>control(async f=>{f.own(value);await assert.rejects(f.scope.read());assert.equal(f.calls.at(-1),910);assert.throws(()=>f.scope.end());}));
test('server disconnected reply prevents QueryInterface',()=>control(async f=>{f.connected(false);await assert.rejects(f.scope.read());assert.deepEqual(f.calls,[907]);}));
test('unknown root refuses',()=>control(async f=>{f.root('');await assert.rejects(f.scope.read());assert.throws(()=>f.scope.end());}));
test('foreign returned support proxy refuses',()=>control(async f=>{f.queryReply(p=>({...p,$S:{}}));await assert.rejects(f.scope.read());assert.deepEqual(f.calls,[907,0]);}));
test('missing/copy-only dynamic interface reply refuses',()=>control(async f=>{f.queryReply(()=>null);await assert.rejects(f.scope.read());assert.deepEqual(f.calls,[907,0]);}));
test('storage refusal repair never repeats native reader',()=>control(async f=>{
 const token=await f.scope.read();const err=Error('fsync',{cause:false});f.writeFail({value:err});await assert.rejects(f.scope.persist(),x=>x===err);
 assert.equal(f.scope.secondary[0],err);assert.equal(f.scope.originalRefusal,f.original.refusal);assert.throws(()=>f.scope.end());
 const own=f.current.page;f.current.page={};assert.throws(()=>f.scope.persist());f.current.page=own;f.writeFail(null);await f.scope.persist();
 assert.equal(f.writes(),2);assert.deepEqual(f.calls,[907,0,909,910,911]);assert.equal(f.scope.inspect(token).closeAuthority,false);
}));
test('original abort and absolute deadline are preserved',()=>control(async f=>{
 const err=Error('original abort',{cause:0});f.abort.abort(err);assert.throws(()=>f.scope.read(),x=>x===err);assert.equal(f.calls.length,0);
}));
test('original absolute deadline expiry refuses',()=>control(async f=>{f.clock(1000);assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);}));
test('expiry during original native await blocks later dispatch',()=>control(async f=>{
 f.hold();const p=f.scope.read();while(!f.calls.length)await new Promise(r=>setImmediate(r));f.clock(1000);await f.drain();await assert.rejects(p);assert.deepEqual(f.calls,[907]);
}));
test('original abort during native await preserves exact reason',()=>control(async f=>{
 f.hold();const p=f.scope.read();while(!f.calls.length)await new Promise(r=>setImmediate(r));const e=Error('abort',{cause:0});f.abort.abort(e);await f.drain();await assert.rejects(p,x=>x===e);assert.equal(f.scope.primary,e);
}));
test('native defining prototype copy is refused before wire IO',()=>control(async f=>{
 f.definitions.FileStoragePrototype={...f.definitions.FileStoragePrototype};assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);
}));
test('original native continuation/provider substitution refuses',()=>control(async f=>{
 f.original.nativeSession.DispatchMessageAsync=()=>{};assert.throws(()=>f.scope.read());assert.equal(f.calls.length,0);
}));
for(const value of [undefined,null,false,0,''])
 test('falsy persistence refusal retains original facts without reader replay '+String(value),()=>control(async f=>{
  await f.scope.read();f.writeFail({value});await assert.rejects(f.scope.persist(),x=>x===value);assert.equal(f.scope.secondary[0],value);
  f.writeFail(null);await f.scope.persist();assert.deepEqual(f.calls,[907,0,909,910,911]);assert.equal(f.writes(),2);
 }));

test('returned method drift after durable record refuses inspect/persist/end without replay',()=>control(async f=>{
 const token=await f.scope.read();await f.scope.persist();let foreignCalls=0;
 Object.defineProperty(f.support,'SaveToStream',{value(){foreignCalls++;},configurable:true});
 assert.throws(()=>f.scope.inspect(token));assert.throws(()=>f.scope.persist());assert.throws(()=>f.scope.end());
 assert.equal(f.scope.state.ended,false);assert.equal(foreignCalls,0);assert.equal(f.writes(),1);
 assert.deepEqual(f.calls,[907,0,909,910,911]);
 delete f.support.SaveToStream;assert.equal(f.scope.inspect(token).saveAuthority,false);f.scope.end();
}));
test('returned accessor refuses after writer refusal; original restoration repairs only storage',()=>control(async f=>{
 const token=await f.scope.read(), first=Error('fsync refusal',{cause:0});f.writeFail({value:first});
 await assert.rejects(f.scope.persist(),x=>x===first);let getterCalls=0;
 Object.defineProperty(f.support,'SaveToStream',{get(){getterCalls++;return f.definitions.StreamPersistPrototype.SaveToStream;},configurable:true});
 assert.throws(()=>f.scope.persist());assert.throws(()=>f.scope.inspect(token));assert.throws(()=>f.scope.end());
 assert.equal(getterCalls,0);assert.equal(f.scope.secondary[0],first);assert.equal(f.writes(),1);
 delete f.support.SaveToStream;f.writeFail(null);await f.scope.persist();
 assert.equal(f.writes(),2);assert.deepEqual(f.calls,[907,0,909,910,911]);assert.equal(f.scope.inspect(token).closeAuthority,false);
}));
test('returned method drift during writer await cannot confirm publication; repair no reader replay',()=>control(async f=>{
 await f.scope.read();const d=deferred(),started=deferred();f.writeHook(async()=>{started.resolve();return d.promise;});
 const work=f.scope.persist();await started.promise;Object.defineProperty(f.support,'SaveToStream',{value(){},configurable:true});
 d.resolve();await assert.rejects(work);assert.equal(f.scope.state.write,'refused');assert.throws(()=>f.scope.end());
 delete f.support.SaveToStream;f.writeHook(async()=>{});await f.scope.persist();assert.equal(f.writes(),2);
 assert.deepEqual(f.calls,[907,0,909,910,911]);
}));
test('original abort remains primary before returned accessor guard',()=>control(async f=>{
 const token=await f.scope.read();let getterCalls=0;
 Object.defineProperty(f.support,'SaveToStream',{get(){getterCalls++;return f.definitions.StreamPersistPrototype.SaveToStream;}});
 f.abort.abort(false);assert.throws(()=>f.scope.inspect(token),x=>x===false);assert.equal(getterCalls,0);assert.equal(f.writes(),0);
}));
