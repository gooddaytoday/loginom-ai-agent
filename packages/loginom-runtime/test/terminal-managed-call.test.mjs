import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const root=process.env.MANAGED_CANDIDATE_ROOT?new URL('file://'+process.env.MANAGED_CANDIDATE_ROOT+'/'):new URL('../',import.meta.url);
const rootApi=await import(new URL('src/terminal-root-association.mjs',root));
const helperSource=(await fs.readFile(new URL('src/terminal-managed-call.mjs',root),'utf8')).replaceAll('export function','function').replace(/^import .*$/m,'');
const source=await fs.readFile(new URL('src/managed-entry.mjs',root),'utf8');
function fixture(){const listeners={},sent=[],requests=new Set(),sdk=Promise.withResolvers();let calls=0,token;
 const state={controller:undefined,client:{callTool(input,unused,options){calls++;token=context.custody.terminalManagedCallForBridge(state.bridge);assert.equal(input,token.facts.input);assert.equal(options.signal,token.inspect().controller.signal);return sdk.promise}},bridge:{hasUnsettledWork:()=>false,hasActiveWork:()=>false},session:{}};
 const context={state,requests,process:{on:(name,fn)=>listeners[name]=fn},send:m=>sent.push(m),Error,AbortController,AbortSignal,...rootApi};
 const listener=source.slice(source.indexOf('process.on("message"'),source.indexOf('async function handle(message'));
 const handle=source.slice(source.indexOf('async function handle(message'));
 vm.runInNewContext(helperSource+';'+listener+handle+';globalThis.custody={terminalManagedCallForBridge}',context);
 const message={id:'actual',operation:'call',input:{name:'dock_prepare',arguments:{operation_id:'same'}}};
 return {message,state,sdk,sent,requests,listener:()=>listeners.message(message),token:()=>token,calls:()=>calls};
}
async function flush(){for(let i=0;i<5;i++)await Promise.resolve()}
test('actual listener retains actual handle Promise before SDK; original task/controller/input held',async()=>{
 const f=fixture();f.listener();const original=[...f.requests][0];await flush();const t=f.token();assert(t);assert.equal(t.facts.message,f.message);assert.equal(t.inspect().handleTask,original);assert.equal(t.inspect().sdkTask,f.sdk.promise);assert.equal(t.inspect().controller,f.state.controller);assert.equal(t.facts.parentOriginQualified,false);assert.equal(t.facts.nativeAuthority,false);assert.equal(f.calls(),1);
 f.sdk.resolve({same:true});await original;await flush();assert.equal(f.state.controller,undefined);assert.equal(f.requests.size,0);assert.equal(t.inspect().phase,'settled');assert.equal(f.sent[0].result.result.same,true);
});
for(const drift of ['message','input','client','bridge','session','controller','method','method-getter','input-getter','id-getter','operation-getter','flags','prototype'])test('before-dispatch '+drift+' drift refuses getter0 SDK0',async()=>{
 const f=fixture();let getters=0;f.listener();const original=[...f.requests][0];
 if(drift==='message')f.message.id='foreign';if(drift==='input')f.message.input={...f.message.input};if(drift==='client')f.state.client={...f.state.client};if(drift==='bridge')f.state.bridge={...f.state.bridge};if(drift==='session')f.state.session={};if(drift==='controller')Object.defineProperty(f.state,'controller',{get(){getters++;return undefined}});if(drift==='method')f.state.client.callTool=()=>{};if(drift==='method-getter')Object.defineProperty(f.state.client,'callTool',{get(){getters++;return ()=>{}}});if(drift==='input-getter')Object.defineProperty(f.message,'input',{get(){getters++;return {}}});if(drift==='id-getter')Object.defineProperty(f.message,'id',{get(){getters++;return 'actual'}});if(drift==='operation-getter')Object.defineProperty(f.message,'operation',{get(){getters++;return 'call'}});if(drift==='flags')Object.defineProperty(f.message,'id',{writable:false});if(drift==='prototype')Object.setPrototypeOf(f.message,{});
 await original;await flush();assert.equal(f.calls(),0);assert.equal(getters,0);assert.equal(f.sent[0].error,'LOGINOM_ORIGINAL_CALL_CHANGED');
});
for(const value of [false,0,null,undefined,'',Error('first',{cause:0})])test('raw SDK rejection '+String(value)+' dominates secondary client drift without task replacement',async()=>{
 const f=fixture();f.listener();const original=[...f.requests][0];await flush();const t=f.token(),controller=f.state.controller;f.state.client={};f.sdk.reject(value);await original;assert.equal(t.inspect().primary.value,value);assert.equal(t.inspect().sdkTask,f.sdk.promise);assert.equal(t.inspect().handleTask,original);assert.equal(f.state.controller,controller);assert.equal(t.inspect().phase,'dispatched');assert.equal(f.calls(),1);
});
for(const drift of ['controller','method-getter','session'])test('post-await '+drift+' drift preserves UNKNOWN controller, no replay/cleanup',async()=>{
 const f=fixture();f.listener();const original=[...f.requests][0];await flush();const t=f.token();let getters=0;if(drift==='controller')f.state.controller=new AbortController();if(drift==='method-getter')Object.defineProperty(f.state.client,'callTool',{get(){getters++;return ()=>{}}});if(drift==='session')f.state.session={};const retained=f.state.controller;f.sdk.resolve({});await original;assert.equal(f.state.controller,retained);assert.equal(t.inspect().phase,'dispatched');assert.equal(f.calls(),1);assert.equal(getters,0);assert.equal(f.sent[0].error,'LOGINOM_ORIGINAL_CALL_CHANGED');
});
test('pending SDK retains original Promise and forbids a second managed call',async()=>{const f=fixture();f.listener();await flush();const t=f.token();f.listener();assert.equal(f.calls(),1);assert.equal(t.inspect().sdkTask,f.sdk.promise);assert.equal(f.sent[0].error,'LOGINOM_ORIGINAL_CALL_UNAVAILABLE');f.sdk.resolve({});await Promise.all([...f.requests]);});
test('abort-first precedes foreign method getter and never replays SDK',async()=>{const f=fixture();f.listener();const original=[...f.requests][0];await flush();let getters=0;const t=f.token();t.inspect().controller.abort(false);Object.defineProperty(f.state.client,'callTool',{get(){getters++;return ()=>{}}});let error;try{t.guard()}catch(e){error=e}assert.equal(error,false);assert.equal(getters,0);f.sdk.resolve({});await original;assert.equal(f.calls(),1);});
for(const key of ['id','operation','input','name'])test('initial '+key+' accessor refuses getter0 before handle birth',()=>{const f=fixture();let getters=0;const owner=key==='name'?f.message.input:f.message;Object.defineProperty(owner,key,{get(){getters++;return key==='operation'?'call':{}}});f.listener();assert.equal(getters,0);assert.equal(f.requests.size,0);assert.equal(f.calls(),0);assert.equal(f.sent[0].error,'LOGINOM_ORIGINAL_CALL_CHANGED');});
for(const mode of ['missing','copied','foreign-message'])test('direct handler '+mode+' binding refuses without second SDK dispatch',async()=>{
 const f=fixture();f.listener();const original=[...f.requests][0];await flush();const t=f.token();
 const other={...f.message,input:{...f.message.input}};
 // Invoke the same fixed production body with an unowned token/message pair.
 const handle=vm.runInNewContext(helperSource+';'+source.slice(source.indexOf('async function handle(message'))+';handle',{state:f.state,send:m=>f.sent.push(m),Error,AbortController,AbortSignal,...rootApi});
 await handle(mode==='foreign-message'?other:f.message,mode==='missing'?undefined:mode==='copied'?{...t}:t);
 assert.equal(f.sent.at(-1).error,'LOGINOM_REQUEST_INVALID');assert.equal(f.calls(),1);assert.equal(t.inspect().sdkTask,f.sdk.promise);f.sdk.resolve({});await original;
});
test('inherited original SDK method is retained without ambient late lookup',async()=>{const f=fixture(),callTool=f.state.client.callTool;delete f.state.client.callTool;Object.setPrototypeOf(f.state.client,{callTool});f.listener();const original=[...f.requests][0];await flush();assert.equal(f.calls(),1);assert.equal(f.token().facts.method,callTool);f.sdk.resolve({});await original;});
