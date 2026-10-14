import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createContext,runInContext}from'node:vm';import{webcrypto,createHash}from'node:crypto';
import{parse}from'../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
import{setup}from'./terminal-provider-boundary-fixture.mjs';
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
const {terminalUserPublisherScript}=await import(process.env.TERMINAL_USER_PUBLISHER_MODULE??new URL('../lib/terminal-user-publisher.mjs',import.meta.url));
const model=await readFile(process.env.TERMINAL_MODEL_RPC_SOURCE,'utf8'),server=await readFile(process.env.TERMINAL_SERVER_SOURCE,'utf8'),userSource=await readFile(process.env.TERMINAL_USER_SOURCE,'utf8');
assert.equal(createHash('sha256').update(model).digest('hex'),'53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f');
let start=model.indexOf('\t\tget_CurrentUser: function() {'),end=model.indexOf('\n\t\tget_SessionBackupManager:',start);
const lower=model.slice(start+'\t\tget_CurrentUser: '.length,end).trim().replace(/,$/,'');
assert.equal(createHash('sha256').update(lower).digest('hex'),'e7d959448a2b1a8030f3511caf44768b4ee4e1c918aa9b3791a897022026738a');
let get;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&server.slice(n.left.start,n.left.end)==='ServerConnection.prototype.GetCurrentUser')get=server.slice(n.right.start,n.right.end);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}}walk(parse(server,{ecmaVersion:'latest'}));
export async function fixture({forward=false,realm,initializeSS}={}){
 let deliver,dispatches=0,reads=0,resolvers=0,error,failed=false;const tasks=[],continuations=[];
 class TaskCompletionSource{constructor(){let yes,no;const promise=new Promise((a,b)=>{yes=a;no=b});let done=false,outcome,rejected=false;
  promise.then(v=>{done=true;outcome=v},e=>{done=true;rejected=true;outcome=e});
  this.task={then:promise.then.bind(promise),continueWith(fn){continuations.push(fn);promise.then(()=>fn(),()=>fn())},getAwaitedResult(){if(!done)throw Error('pending');if(rejected)throw outcome;return outcome}};
  tasks.push(this.task);this.setResult=yes;this.setException=no;
 }}
 const c=realm?.page.context??createContext({document:{},location:{origin:'https://app.loginom.ai'},crypto:webcrypto,TextEncoder,Debug:{assert:assert.ok},
  __awaiter(self,a,b,generator){const it=generator.call(self);return new Promise((yes,no)=>{const step=(key,v)=>{let r;try{r=it[key](v)}catch(e){no(e);return}if(r.done)yes(r.value);else Promise.resolve(r.value).then(v=>step('next',v),e=>step('throw',e))};step('next')})},
  ss:{TaskCompletionSource,mkdel:(self,fn)=>fn.bind(self),Exception:{wrap:e=>e}}});
 if(realm)Object.assign(c,{crypto:webcrypto,TextEncoder,Debug:{assert:assert.ok},__awaiter(self,a,b,generator){
  const it=generator.call(self);return new Promise((yes,no)=>{const step=(key,v)=>{let r;try{r=it[key](v)}catch(e){no(e);return}if(r.done)yes(r.value);else Promise.resolve(r.value).then(v=>step('next',v),e=>step('throw',e))};step('next')})}
 });
 if(realm)Object.assign(c.ss,{TaskCompletionSource});
 if(initializeSS){const ss=c.ss;initializeSS(ss,c);delete c.ss;
 runInContext(terminalUserPublisherScript(realm?'http://loginom.example/app':'https://app.loginom.ai/app'),c);
 c.ss=ss;}else {
 runInContext(terminalUserPublisherScript(realm?'http://loginom.example/app':'https://app.loginom.ai/app'),c);
 }
 runInContext('var bg;(function(bg){bg.app=bg.app||{};bg.ObjectEquals=()=>false;bg.objectId=()=>({});bg.selectAsync=async()=>callback=>callback({Name:"projection"});})(bg||(bg={}));var rpc=rpc||{TBGObjectProxy:function(){}};',c);
 runInContext('function Connection(){};Connection.prototype.GetCurrentUser=('+get+');bg.app.ServerConnection=Connection;',c);runInContext(userSource,c);
 const request={set_StaticDataSize(){},InitializeMethodCallMessage(w,o,m){assert.equal(m,1792)},Release(){}};
 const response={set_StaticDataSize(){},ReadParameterInt32(offset){return offset===0?11:75},Release(){}};
 const transport=realm?.native.session??{$M:{GetDynamicData:()=>request},$R(w,o,type){resolvers++;assert.deepEqual([w,o,type],[11,75,703]);return user},
  DispatchMessageAsync(){dispatches++;return dispatchTask}};
 const dispatchTask={continueWith(fn){continuations.push(fn);deliver=()=>fn()},getAwaitedResult(){reads++;if(failed)throw error;return response}};
 const user=realm?.receivers.currentUser??runInContext('Object.create(rpc.TBGObjectProxy.prototype)',c);
 Object.setPrototypeOf(user,c.rpc.TBGObjectProxy.prototype);
 if(realm){const nativeR=transport.$R,nativeDispatch=transport.DispatchMessageAsync;
  transport.$R=function(w,o,type){if(type!==703)return nativeR.call(this,w,o,type);resolvers++;assert.deepEqual([w,o,type],[11,75,703]);return user};
  transport.DispatchMessageAsync=function(request){if(request.method!==1792)return nativeDispatch.call(this,request);dispatches++;return dispatchTask};
 }Object.assign(user,{$S:transport,$:{$OW:11,$O:75}});
 const baseMethod=runInContext('('+lower+')',c);
 const proto={get_CurrentUser:baseMethod};
 if(forward){c.$bg_rpc_TIBGBaseDeductorServerSession_Proxy={prototype:{get_CurrentUser:baseMethod}};
  c.bg.rpc={TIBGBaseDeductorServerSession_Proxy:c.$bg_rpc_TIBGBaseDeductorServerSession_Proxy};
  const a=model.indexOf('\t\tget_CurrentUser: function() {',start+1),b=model.indexOf('\n\t\t},',a);
  proto.get_CurrentUser=runInContext('('+model.slice(a+'\t\tget_CurrentUser: '.length,b+5).trim().replace(/,$/,'')+')',c);
 }
 Object.defineProperty(proto,'CurrentUser',{get(){return this.get_CurrentUser()},configurable:true});
 const session=Object.assign(Object.create(proto),{$S:transport,$:{$OW:11,$O:70},CreateDisconnectedProxyError:()=>Error('disconnected')});
 const receiver=new c.bg.app.ServerConnection();receiver.FSession=session;
 const originalDispatch=transport.DispatchMessageAsync,originalR=transport.$R,originalReader=dispatchTask.getAwaitedResult;
 return{c,user,receiver,session,transport,request,response,dispatchTask,tasks,continuations,
  originalDispatch,originalR,originalReader,invoke:()=>receiver.GetCurrentUser(),deliver:()=>deliver(),
  fail:e=>{failed=true;error=e},counts:()=>[dispatches,reads,resolvers],inspect:()=>c.__loginomOriginalUserPublisherV1.inspect(),
  settle:()=>new Promise(r=>setTimeout(r,30))};
}
test('original method1792 task/response/$R703 retained; same Get/Set user and no reader replay',async()=>{
 const f=await fixture(),task=f.invoke();assert.throws(f.inspect,/UNAVAILABLE/);f.deliver();assert.equal(await task,f.user);
 await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();const held=f.inspect(),r=held.acquisition.lower;
 assert.equal(held.acquisition.rpcCompletionVerified,true);assert.equal(r.task,f.tasks[0]);assert.equal(r.dispatchTask,f.dispatchTask);
 assert.equal(r.response,f.response);assert.equal(r.user,f.user);assert.equal(r.transport,f.transport);assert.equal(r.originalResultReader,f.originalReader);
 assert.deepEqual([r.w,r.o,r.type],[11,75,703]);assert.equal(typeof r.originalContinuation,'function');assert.deepEqual(f.counts(),[1,1,1]);
 assert.equal(f.transport.DispatchMessageAsync,f.originalDispatch);assert.equal(f.transport.$R,f.originalR);assert.equal(f.dispatchTask.getAwaitedResult,f.originalReader);
 f.inspect();assert.deepEqual(f.counts(),[1,1,1]);assert.equal(held.nativeReceiversQualified,false);
});
for(const e of [false,0,null,undefined,'',Error('lower',{cause:0})])test('lower first rejection '+String(e)+' survives receiver drift without next resolver',async()=>{
 const f=await fixture(),task=f.invoke();f.receiver.FSession={};f.fail(e);f.deliver();await assert.rejects(task,v=>Object.is(v,e));await f.settle();
 let failed=false,caught;try{f.inspect()}catch(v){failed=true;caught=v}assert(failed);assert.equal(caught,e);assert.deepEqual(f.counts(),[1,1,0]);
});
test('pending original dispatch reader accessor replacement refuses getter0; original task remains pending',async()=>{
 const f=await fixture(),task=f.invoke();let gets=0,settled=false;task.then(()=>settled=true,()=>settled=true);
 Object.defineProperty(f.dispatchTask,'getAwaitedResult',{configurable:true,get(){gets++;return f.originalReader}});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.equal(settled,false);assert.deepEqual(f.counts(),[1,1,0]);
});
test('pending resolver accessor replacement refuses getter0 without resolver/replay',async()=>{
 const f=await fixture(),task=f.invoke();let gets=0;Object.defineProperty(f.transport,'$R',{get(){gets++;return f.originalR},configurable:true});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.deepEqual(f.counts(),[1,1,0]);
});

test('known loaded forwarding method preserves base continuation without extra dispatch',async()=>{
 const f=await fixture({forward:true}),task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 assert.equal(f.inspect().acquisition.rpcCompletionVerified,true);assert(f.inspect().acquisition.lower.baseMethod);assert.deepEqual(f.counts(),[1,1,1]);
});
test('response accessor refuses getter0 before original resolver',async()=>{
 const f=await fixture(),task=f.invoke();let gets=0;Object.defineProperty(f.response,'ReadParameterInt32',{get(){gets++;return ()=>75},configurable:true});
 f.deliver();await assert.rejects(task,/UNAVAILABLE/);await f.settle();assert.equal(gets,0);assert.deepEqual(f.counts(),[1,1,0]);
});
test('repeated continuation cannot replay the original reader or resolver',async()=>{
 const f=await fixture(),task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 f.deliver();assert.throws(f.inspect,/CONTINUATION_REPLAY/);assert.deepEqual(f.counts(),[1,1,1]);
});

test('production lower→Get→Set→realm→packet→readonly component retains native continuation evidence',async()=>{
 const page=await setup(60000,'retain-only');try{
  const f=await fixture({realm:page}),task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
  const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
  const result=await invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation({custody:page.custody,native:page.receivers,loaded:page.loaded,preparation:page.preparation},input,{signal:page.controller.signal,deadline:page.custody.deadline}));
  const realm=page.preparation.terminalOriginalRealm;assert.equal(realm.userDispatchTask,f.dispatchTask);assert.equal(realm.userResponse,f.response);
  assert.equal(realm.userRpcTask,f.tasks[0]);assert.deepEqual(f.counts(),[1,1,1]);
  for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[k],false);
 }finally{await page.native.drain();await page.native.cleanup()}
});
test('pending loaded TaskCompletionSource replacement stops continuation without resolver',async()=>{
 const f=await fixture(),task=f.invoke();let settled=false;task.then(()=>settled=true,()=>settled=true);
 f.c.ss.TaskCompletionSource=function(){};f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);
 assert.equal(settled,false);assert.deepEqual(f.counts(),[1,1,0]);
});

test('resolver result with foreign identity cannot claim verified completion',async()=>{
 const f=await fixture(),task=f.invoke();f.user.$.$O=99;f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,1]);
});
