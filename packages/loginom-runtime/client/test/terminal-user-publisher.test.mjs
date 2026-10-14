import test from 'node:test';import assert from 'node:assert/strict';
import{createContext,runInContext}from'node:vm';import{readFile}from'node:fs/promises';
import{createHash,webcrypto,randomUUID}from'node:crypto';
import{mkdir,writeFile,mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
const {browserDownloadScript}=await import(new URL('../lib/browser-downloads.mjs',import.meta.url));
const {browserLaunch}=await import(new URL('../lib/browser-launch.mjs',import.meta.url));import{pathToFileURL}from'node:url';
const {terminalUserPublisherScript}=await import(process.env.TERMINAL_USER_PUBLISHER_MODULE??new URL('../lib/terminal-user-publisher.mjs',import.meta.url));
const source=await readFile(process.env.TERMINAL_USER_SOURCE??new URL('../../../../../publisher-source/User.js',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'884660d99890c59fa5a54f2b245255df98b8aff20a5106c1c2fdaa33723888ea');
async function setup({late=false,foreignSource=false,script}={}){
 let resume,reject,selected=0,calls=0;const pending=new Promise((yes,no)=>{resume=yes;reject=no});
 const context=createContext({document:{},location:{origin:'https://app.loginom.ai'},crypto:webcrypto,TextEncoder,
  Debug:{assert:assert.ok},__awaiter(self,unused,ctor,generator){calls++;const it=generator.call(self);return new Promise((resolve,reject)=>{
   const step=(key,value)=>{let next;try{next=it[key](value)}catch(error){reject(error);return}
    if(next.done)resolve(next.value);else Promise.resolve(next.value).then(v=>step('next',v),e=>step('throw',e))};step('next');
  })}});
 const install=()=>runInContext(script??terminalUserPublisherScript('https://app.loginom.ai/app/'),context);
 if(!late)install();
 runInContext(`var bg; (function(bg){bg.app={};bg.selectAsync=function(){return _select()};bg.objectId=function(){return {}};bg.ObjectEquals=function(){return false};})(bg||(bg={}));
 var rpc={TBGObjectProxy:function(){}};`,context);
 context._select=()=>{selected++;return pending.then(()=>callback=>callback({Name:'projection'}))};
 runInContext(source,context);if(late)install();
 if(foreignSource)context.bg.app.CurrentUser.Set=async()=>{};
 const user=runInContext('Object.assign(Object.create(rpc.TBGObjectProxy.prototype),{$S:{},$:{},Name:"original"})',context);
 const receiver=context.bg.app.CurrentUser;
 return {context,user,receiver,resume,reject,calls:()=>calls,selected:()=>selected,
  inspect:()=>context.__loginomOriginalUserPublisherV1.inspect(),invoke:()=>receiver.Set(user)};
}
const settle=async()=>{await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,10))};
test('initial script retains exact Set argument before UI Init; returns original Promise and defining closures',async()=>{
 const f=await setup(),task=f.invoke();assert.equal(f.selected(),1);assert.equal(f.calls(),2);
 assert.notEqual(f.receiver.FCurrentUser,f.user);assert.throws(f.inspect,/UNAVAILABLE/);
 f.resume();await task;await settle();const held=f.inspect();
 assert.equal(held.user,f.user);assert.equal(held.receiver,f.receiver);assert.equal(held.task,task);
 assert.equal(held.bindings.transport,f.user.$S);assert.equal(held.bindings.identity,f.user.$);
 assert.equal(held.originalInit,f.context.bg.app.User.prototype.Init);assert.equal(held.nativeReceiversQualified,false);
 for(const [object,key]of [[f.context,'bg'],[f.context.bg,'app'],[f.context.bg.app,'CurrentUser']]){
  const d=Object.getOwnPropertyDescriptor(object,key);assert('value'in d);assert.equal(d.get,undefined);assert.equal(d.set,undefined);
 }assert.equal(f.selected(),1);
});
for(const error of [false,0,null,undefined,'',Error('original',{cause:0})])test('raw first Init rejection '+String(error)+' wins late drift',async()=>{
 const f=await setup(),task=f.invoke();f.context.bg.app.User.prototype.Init=()=>{};f.reject(error);
 await assert.rejects(task,e=>Object.is(e,error));await settle();let caught,failed=false;try{f.inspect()}catch(e){failed=true;caught=e}
 assert(failed);assert.equal(caught,error);assert.equal(f.selected(),1);
});
for(const key of ['User','CurrentUser','__awaiter','selectAsync'])test('defining dependency '+key+' replacement refuses after await without replay',async()=>{
 const f=await setup(),task=f.invoke();if(key==='__awaiter')f.context[key]=()=>{};
 else if(key==='selectAsync')f.context.bg[key]=()=>{};else f.context.bg.app[key]={};
 f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),1);
});
test('inherited/raw user accessor custody refuses without reading getter',async()=>{
 const f=await setup();let gets=0;Object.defineProperty(f.user,'$S',{get(){gets++;return {}}});
 const task=f.invoke();f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);
});
test('late script cannot recover projected user or invoke Set again',async()=>{
 const f=await setup({late:true});const task=f.invoke();f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),1);
});
test('second original Set refuses terminal reuse but preserves application behavior',async()=>{
 const f=await setup(),task=f.invoke();f.resume();await task;await settle();f.inspect();
 const second=f.invoke();await second;assert.notEqual(second,task);assert.throws(f.inspect,/REENTERED/);
});
test('foreign document refuses held receiver without any new acquisition',async()=>{
 const f=await setup(),task=f.invoke();f.resume();await task;await settle();f.context.document={};assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),1);
});

test('actual loginBrowser registers fixed publisher before navigation; no live browser or SDK',async()=>{
 const runtime=process.env.TERMINAL_RUNTIME_ROOT??new URL('../../',import.meta.url).pathname;
 const code=(await readFile(runtime+'/src/connection-check.mjs','utf8')).split('export function browserEnvironment')[1];
 const directory=await mkdtemp(join(tmpdir(),'terminal-user-startup-'));let script,f,task;const events=[];
 const page={async goto(){events.push('goto');assert(script);f=await setup({script});
   task=f.invoke();f.resume();await task;await settle();
   f.context.bg.app.Application={FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'worker'}}}}};},
  async evaluate(fn,arg){f.context.__arg=arg;try{return runInContext('('+fn.toString()+')(__arg)',f.context)}finally{delete f.context.__arg}},
  locator(){return {locator(){return this},or(){return this},first(){return this},async waitFor(){},async isVisible(){return true}}}};
 const context={pages:()=>[page],async addInitScript(input){events.push('init');script=input.content}};
 const require=()=>({chromium:{async launchPersistentContext(){events.push('launch');return context}}});
 const {loginBrowser}=runInContext(('function browserEnvironment'+code).replaceAll('export ','')+';({loginBrowser})',
   createContext({require,mkdir,writeFile,join,randomUUID,URL,process,browserDownloadScript,browserLaunch,terminalUserPublisherScript}));
 try{const owner={directory};const result=await loginBrowser({profile:directory,browserPath:'/fixture',keepOpen:true,owner,
   candidate:{url:'https://app.loginom.ai/app/',username:'worker',password:''}});
  assert.equal(result.context,context);assert.equal(owner.page,page);assert.deepEqual(events,['launch','init','goto']);
  assert.equal(f.inspect().user,f.user);assert.equal(f.inspect().task,task);assert.equal(f.selected(),1);
 }finally{await rm(directory,{recursive:true})}
});

test('foreign document accessor after pending Set refuses without invoking getter',async()=>{
 const f=await setup(),task=f.invoke();let gets=0;Object.defineProperty(f.context,'document',{get(){gets++;return {}}});
 f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.equal(f.selected(),1);
});

test('changed Init source before first invocation cannot claim a qualified publisher',async()=>{
 const f=await setup();f.context.bg.app.User.prototype.Init=async()=>{};
 const task=f.invoke();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),0);
});
test('foreign Set receiver returns its original task but cannot qualify',async()=>{
 const f=await setup(),foreign={},task=Reflect.apply(f.receiver.Set,foreign,[f.user]);
 f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),1);
});
test('foreign raw user prototype cannot be substituted by a UI projection',async()=>{
 const f=await setup();Object.setPrototypeOf(f.user,Object.prototype);const task=f.invoke();
 f.resume();await task;await settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(f.selected(),1);
});
test('preexisting bg accessor refuses during installation without getter calls',()=>{
 let gets=0;const context=createContext({document:{},location:{origin:'https://app.loginom.ai'},crypto:webcrypto,TextEncoder});
 Object.defineProperty(context,'bg',{get(){gets++;return {}}});
 runInContext(terminalUserPublisherScript('https://app.loginom.ai/app/'),context);
 assert.throws(()=>context.__loginomOriginalUserPublisherV1.inspect(),/UNAVAILABLE/);assert.equal(gets,0);
});
