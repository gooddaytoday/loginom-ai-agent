import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{createContext,runInContext}from'node:vm';import{webcrypto,createHash}from'node:crypto';
import{parse}from'../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
const {terminalUserPublisherScript}=await import(process.env.TERMINAL_USER_PUBLISHER_MODULE??new URL('../lib/terminal-user-publisher.mjs',import.meta.url));
const userSource=await readFile(process.env.TERMINAL_USER_SOURCE,'utf8'),serverSource=await readFile(process.env.TERMINAL_SERVER_SOURCE,'utf8');
assert.equal(createHash('sha256').update(userSource).digest('hex'),'884660d99890c59fa5a54f2b245255df98b8aff20a5106c1c2fdaa33723888ea');
assert.equal(createHash('sha256').update(serverSource).digest('hex'),'4c8203aa04050c45f55f2dfec76ef65d93b056a9cbe092419a9bbea821e0c5a6');
let getSource;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&serverSource.slice(n.left.start,n.left.end)==='ServerConnection.prototype.GetCurrentUser')getSource=serverSource.slice(n.right.start,n.right.end);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}}walk(parse(serverSource,{ecmaVersion:'latest'}));
async function fixture(){
 let resolve,reject,count=0;const pending=new Promise((yes,no)=>{resolve=yes;reject=no});const promises=[];
 const c=createContext({document:{},location:{origin:'https://app.loginom.ai'},crypto:webcrypto,TextEncoder,Debug:{assert:assert.ok},
  __awaiter(self,a,b,generator){const it=generator.call(self);const promise=new Promise((yes,no)=>{const step=(key,value)=>{let r;try{r=it[key](value)}catch(e){no(e);return}if(r.done)yes(r.value);else Promise.resolve(r.value).then(v=>step('next',v),e=>step('throw',e))};step('next')});promises.push(promise);return promise}});
 runInContext(terminalUserPublisherScript('https://app.loginom.ai/app'),c);
 runInContext('var bg; (function(bg){bg.app={};bg.ObjectEquals=()=>false;bg.objectId=()=>({});bg.selectAsync=async()=>callback=>callback({Name:"projection"});})(bg||(bg={}));var rpc={TBGObjectProxy:function(){}};',c);
 runInContext('function Connection(){};Connection.prototype.GetCurrentUser=('+getSource+');bg.app.ServerConnection=Connection;',c);
 runInContext(userSource,c);const user=runInContext('Object.assign(Object.create(rpc.TBGObjectProxy.prototype),{$S:{},$:{}})',c);
 const receiver=new c.bg.app.ServerConnection();receiver.FSession={$S:user.$S,CurrentUser:pending};
 const invoke=()=>{count++;return receiver.GetCurrentUser()};const settle=async()=>{await new Promise(r=>setTimeout(r,25))};
 return{c,user,receiver,resolve,reject,invoke,promises,settle,count:()=>count,inspect:()=>c.__loginomOriginalUserPublisherV1.inspect()};
}
test('original GetCurrentUser Promise/result retained before original Set, no extra Get',async()=>{
 const f=await fixture(),task=f.invoke();assert.equal(task,f.promises[0]);assert.throws(f.inspect,/UNAVAILABLE/);
 f.resolve(f.user);const user=await task;const set=f.c.bg.app.CurrentUser.Set(user);assert.equal(set,f.promises[2]);await set;await f.settle();
 const r=f.inspect();assert.equal(r.user,f.user);assert.equal(r.task,set);assert.equal(r.acquisition.task,task);
 assert.equal(r.acquisition.receiver,f.receiver);assert.equal(r.acquisition.session,f.receiver.FSession);assert.equal(r.acquisition.user,user);
 assert.equal(r.acquisition.rpcCompletionVerified,false);assert.equal(f.count(),1);
});
for(const error of [false,0,null,undefined,'',Error('acquisition',{cause:0})])test('first Get rejection '+String(error)+' retained without Set or replay',async()=>{
 const f=await fixture(),task=f.invoke();f.receiver.FSession={};f.reject(error);await assert.rejects(task,e=>Object.is(e,error));await f.settle();
 let failed=false,caught;try{f.inspect()}catch(e){failed=true;caught=e}assert(failed);assert.equal(caught,error);assert.equal(f.count(),1);assert.equal(f.promises.length,1);
});
for(const variant of ['session','reader','method-flags'])test('pending Get '+variant+' drift refuses continuation getter0',async()=>{
 const f=await fixture(),task=f.invoke();let gets=0;
 if(variant==='session')f.receiver.FSession={};
 if(variant==='reader')Object.defineProperty(f.receiver.FSession,'CurrentUser',{get(){gets++;return f.user}});
 if(variant==='method-flags')Object.defineProperty(f.c.bg.app.ServerConnection.prototype,'GetCurrentUser',{writable:false});
 f.resolve(f.user);await task;const set=f.c.bg.app.CurrentUser.Set(f.user);await set;await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.equal(f.count(),1);
});
test('foreign Set argument cannot substitute original Get result',async()=>{
 const f=await fixture(),task=f.invoke();f.resolve(f.user);await task;const foreign=Object.assign(Object.create(Object.getPrototypeOf(f.user)),f.user);
 await f.c.bg.app.CurrentUser.Set(foreign);await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.count(),1);
});
test('second Get preserves ordinary Promise but refuses reuse',async()=>{
 const f=await fixture(),task=f.invoke();f.resolve(f.user);await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();f.inspect();
 const second=f.invoke();assert.notEqual(second,task);await second;assert.throws(f.inspect,/REENTERED/);assert.equal(f.count(),2);
});

test('borrowed Get method on foreign receiver cannot qualify the resulting Set',async()=>{
 const f=await fixture(),foreign={FSession:f.receiver.FSession};
 const task=Reflect.apply(f.c.bg.app.ServerConnection.prototype.GetCurrentUser,foreign,[]);f.resolve(f.user);
 await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);
});
