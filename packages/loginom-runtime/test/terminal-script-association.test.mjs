// Real Node/WebCrypto/FS/Promise; Page/route/request/APIResponse/PID/native are doubles.
import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{runInContext,runInThisContext}from'node:vm';import{parse}from'../../loginom-host/node_modules/acorn/dist/acorn.mjs';import{fresh}from'../client/test/terminal-initializers.test.mjs';
const root=process.env.ROOT_RUNTIME_ROOT?new URL('file://'+process.env.ROOT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url),api=await import(new URL('src/terminal-root-association.mjs',root));
const inputs=process.env.TERMINAL_SOURCE_INPUT_DIR?new URL('file://'+process.env.TERMINAL_SOURCE_INPUT_DIR+'/'):new URL('../../../../publisher-source/',import.meta.url);
const pins=JSON.parse(await readFile(new URL('../../../docs/testing/loginom-ai-agent/terminal-publisher-inputs.json',import.meta.url),'utf8')).records.concat(JSON.parse(await readFile(new URL('../../../docs/testing/loginom-ai-agent/terminal-initializer-inputs.json',import.meta.url),'utf8')).inputs,JSON.parse(await readFile(new URL('../../../docs/testing/loginom-ai-agent/terminal-acquisition-inputs.json',import.meta.url),'utf8')));
function fixture(evaluate=()=>{}){const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state),owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'},frame={};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');let handler,pattern;const page={goto(){},evaluate,locator(){},mainFrame(){return frame},route(p,h){pattern=p;handler=h;return Promise.resolve()}},context={pages(){return[page]},newPage(){},addInitScript(){return Promise.resolve()}};owner.context=context;load.bindContext(context);owner.page=page;load.bindPage(page);return{load,owner,state,message,candidate,page,frame,get handler(){return handler},get pattern(){return pattern}}}
async function resource(f,pin=pins.find(p=>p.url.endsWith('/app.js'))){let calls={fetch:0,body:0,fulfill:0,abort:0},sent;const originalBody=Buffer.from(await readFile(new URL(pin.url.split('/').at(-1),inputs))),request={url:()=>pin.url,method:()=> 'GET',resourceType:()=> 'script',frame:()=>f.frame},response={url:()=>pin.url,status:()=>200,headers:()=>({'content-type':'application/javascript; charset=utf-8','content-encoding':'gzip','content-length':'fake','x-original':'retained'}),body(){calls.body++;return Promise.resolve(originalBody)}},route={request:()=>request,fetch(options){calls.fetch++;assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,0);assert(options.timeout>0&&options.timeout<=60000);return Promise.resolve(response)},fulfill(options){calls.fulfill++;sent=options;return Promise.resolve()},abort(){calls.abort++;return Promise.resolve()}};return{calls,route,response,request,originalBody,get sent(){return sent}}}

const witness=await import(new URL('client/lib/terminal-script-witness.mjs',root));
const scriptFixtureSource=await readFile(new URL('../client/test/terminal-script-load.test.mjs',import.meta.url),'utf8'),scriptAst=parse(scriptFixtureSource,{ecmaVersion:'latest',sourceType:'module'}),scriptNode=scriptAst.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='scripts'),scripts=runInThisContext('('+scriptFixtureSource.slice(scriptNode.start,scriptNode.end)+')');
async function originalRealm(nodeCacheBust=false){const s=scripts();if(nodeCacheBust){const install=s.install,select=s.select;const mark=node=>{const state=s.state(node);if(!state.src.includes('?'))state.src+='?_dc=1234';return node};s.install=c=>{install(c);mark(s.node('bg/js/mscorlib.js'))};s.select=path=>mark(select(path))}const r=await fresh({scriptContext:s});for(const kind of['ObjectProxy','FileStorage','StreamPersist'])r.init(kind);const task=r.invoke();r.deliver();await task;await r.c.bg.app.CurrentUser.Set(r.user);await r.settle();r.c.__loginomStartupV1={document:r.c.document,id:'original',account:'account'};return{r,s}}
async function joined({evaluate,cacheBust=false,nodeCacheBust=false}={}){const realm=await originalRealm(nodeCacheBust);let evaluations=0;const f=fixture((fn,args)=>{evaluations++;if(evaluate)return evaluate({fn,args,...realm});realm.r.c.__witnessArguments=JSON.parse(JSON.stringify(args));return Promise.resolve(JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__witnessArguments)',realm.r.c))))});await api.prepareTerminalSourceResponses(f.owner);for(const pin of pins){const x=await resource(f,pin);if(cacheBust){const url=pin.url+'?_dc=1234';x.request.url=()=>url;x.response.url=()=>url}await f.handler(x.route);f.load.guard()}const task=f.load.init('fixed original content');await f.load.observed(task);f.load.admitPage(f.page,f.candidate);return{f,...realm,get evaluations(){return evaluations}}}
test('nodebind same original five realm script witnesses join20 response receipts; original refs remain realm',async()=>{const x=await joined(),result=await api.bindTerminalScriptWitness(x.f.owner);assert.equal(result.complete,true);assert.equal(result.projectionOnly,true);assert.equal(result.witnessSummaryCompared,true);assert.equal(result.matches.length,5);assert.equal(result.page,x.f.page);assert.equal(result.originalInitTask,x.f.load.inspect().initTask);assert.equal(x.evaluations,1);assert.equal(result.matches[3].responseReceipt,result.matches[4].responseReceipt);assert.equal(x.r.inspect().acquisition.loadedDefinitions.initializers.initialScript.script,x.s.node('bg/js/mscorlib.js'));assert.deepEqual(x.r.counts(),[1,1,1]);for(const k of['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result[k],false);assert.equal(x.f.load.facts.sourceBytesVerified,false);await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/LOAD_CHANGED/);assert.equal(x.evaluations,1)});
test('nodebind supported cache-busting preserves exact request URL, same SHA and one canonical consumption',async()=>{const f=fixture();await api.prepareTerminalSourceResponses(f.owner);const pin=pins.find(p=>p.url.endsWith('/rpc.js')),x=await resource(f,pin),url=pin.url+'?_dc=1234';x.request.url=()=>url;x.response.url=()=>url;await f.handler(x.route);f.load.guard();assert.equal(f.load.inspect().sourceResponses.records[0].url,url);assert.equal(f.load.inspect().sourceResponses.records[0].pinUrl,pin.url);const duplicate=await resource(f,pin);await f.handler(duplicate.route);assert.equal(duplicate.calls.fetch,0);assert.throws(()=>f.load.guard(),/LOAD_CHANGED/)});
for(const query of['?_dc=x','?_dc=1&other=2','?_dc=1&_dc=2','?copy','#copy'])test('nodebind unsupported URL suffix '+query+' refuses before fetch',async()=>{const f=fixture();await api.prepareTerminalSourceResponses(f.owner);const x=await resource(f);x.request.url=()=>pins.find(p=>p.url.endsWith('/app.js')).url+query;await f.handler(x.route);assert.equal(x.calls.fetch,0);assert.throws(()=>f.load.guard(),/LOAD_CHANGED/)});
test('nodebind matching _dc response with plain realm witness refuses rather than canonical reconstruction',async()=>{const x=await joined({cacheBust:true});await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/LOAD_CHANGED/);assert.equal(x.evaluations,1)});
test('nodebind partial selected responses retains explicit missing predicate without evaluate or authority',async()=>{let calls=0;const f=fixture(()=>{calls++});await api.prepareTerminalSourceResponses(f.owner);const r=await api.bindTerminalScriptWitness(f.owner);assert.equal(r.complete,false);assert.equal(r.reason,'SELECTED_RESPONSES_INCOMPLETE');assert.equal(calls,0);assert.equal(f.load.inspect().scriptWitness,r)});
for(const kind of['owner','account','document','method','node','dependency'])test('nodebind original realm '+kind+' drift refuses without new RPC reader',async()=>{const x=await joined();if(kind==='owner')x.r.c.__loginomStartupV1.id='foreign';if(kind==='account')x.r.c.__loginomStartupV1.account='foreign';if(kind==='document')x.r.c.__loginomStartupV1.document={};if(kind==='method')x.r.constructors.FileStorage.prototype.get_Connected=()=>true;if(kind==='node')x.s.state(x.s.node('bg/js/rpc.js')).connected=false;if(kind==='dependency')x.r.ss.shallowCopy=()=>{};await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/UNAVAILABLE/);assert.deepEqual(x.r.counts(),[1,1,1])});
for(const value of[undefined,null,false,0,'',Error('first',{cause:0})])test('nodebind original evaluate raw '+String(value)+' wins secondary owner drift',async()=>{let x;x=await joined({evaluate(){x.f.owner.page={};return Promise.reject(value)}});let failed=false,caught;try{await api.bindTerminalScriptWitness(x.f.owner)}catch(e){failed=true;caught=e}assert(failed);assert.equal(caught,value);assert.equal(x.evaluations,1);assert.deepEqual(x.r.counts(),[1,1,1])});
test('nodebind pending evaluate retains original task; drift refuses and second bind cannot replay',async()=>{let settle,entered;const task=new Promise(resolve=>settle=resolve),started=new Promise(resolve=>entered=resolve);const x=await joined({evaluate:()=>{entered();return task}}),work=api.bindTerminalScriptWitness(x.f.owner);await started;assert.equal(x.f.load.inspect().scriptWitness.evaluateTask,task);await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/LOAD_CHANGED/);Object.defineProperty(x.f.page,'evaluate',{get(){throw Error('foreign getter')}});settle({});await assert.rejects(work,/LOAD_CHANGED/);assert.equal(x.evaluations,1)});

test('nodebind genuine Loader cache-busted node URLs join the exact same full request URLs',async()=>{const x=await joined({cacheBust:true,nodeCacheBust:true}),result=await api.bindTerminalScriptWitness(x.f.owner);assert.equal(result.complete,true);assert(result.matches.every(r=>r.url.endsWith('?_dc=1234')));assert.equal(result.matches[3].responseReceipt,result.matches[4].responseReceipt);assert.deepEqual(x.r.counts(),[1,1,1])});
for(const kind of['summaryGetter','summaryFlags','summaryUrl','summaryOwner'])test('nodebind foreign '+kind+' never mints authority',async()=>{const x=await joined({evaluate({fn,args,r}){r.c.__witnessArguments=JSON.parse(JSON.stringify(args));const summary=JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__witnessArguments)',r.c)));if(kind==='summaryGetter')Object.defineProperty(summary,'rows',{get(){throw Error('must not invoke summary getter')}});if(kind==='summaryFlags')summary.sourceExecutionQualified=true;if(kind==='summaryUrl')summary.rows[0].url='https://foreign';if(kind==='summaryOwner')summary.id='foreign';return Promise.resolve(summary)}});await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/CHANGED/);assert.equal(x.evaluations,1);assert.deepEqual(x.r.counts(),[1,1,1])});

// Original JSHandle is a labelled double here; it retains the same real VM object.
function originalHandle(x,{evaluate}={}){
 let capsule,calls=0,handleCalls=0;
 const handle={evaluate(fn){calls++;if(evaluate)return evaluate({fn,capsule,x});x.r.c.__retainedCapsule=capsule;return Promise.resolve(JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__retainedCapsule)',x.r.c))))}};
 x.f.page.evaluateHandle=function(fn,args){handleCalls++;x.r.c.__witnessArguments=JSON.parse(JSON.stringify(args));capsule=runInContext('('+fn.toString()+')(__witnessArguments)',x.r.c);return Promise.resolve(handle)};
 return{handle,get calls(){return calls},get handleCalls(){return handleCalls},get capsule(){return capsule}};
}
test('loadbind original handle retains realm capsule and exact response receipts; recheck never reacquires',async()=>{
 const x=await joined(),h=originalHandle(x),r=await api.bindTerminalScriptWitness(x.f.owner);
 assert.equal(r.realmOriginalAssociation,true);assert.equal(r.realmHandle,h.handle);assert.equal(await r.realmHandleTask,h.handle);assert.equal(x.evaluations,0);assert.equal(h.handleCalls,1);assert.equal(h.calls,1);
 assert.equal(r.matches[3].responseReceipt,r.matches[4].responseReceipt);assert.equal(await r.recheck(),r);assert.equal(h.calls,2);assert.equal(h.handleCalls,1);assert.deepEqual(x.r.counts(),[1,1,1]);
 assert.equal(r.sourceExecutionQualified,false);assert.equal(r.closureIdentityQualified,false);assert.equal(r.nativeAuthority,false);
});
test('loadbind serialized or copied capsule cannot replace original receiver',async()=>{
 const x=await joined(),h=originalHandle(x);await api.bindTerminalScriptWitness(x.f.owner);
 const dto=JSON.parse(JSON.stringify(h.capsule));x.r.c.__copy=dto;
 assert.throws(()=>runInContext('('+witness.projectTerminalScriptWitness.toString()+')(__copy)',x.r.c),/UNAVAILABLE/);
 const copy=Object.create(Object.getPrototypeOf(h.capsule),Object.getOwnPropertyDescriptors(h.capsule));Object.freeze(copy);x.r.c.__copy=copy;
 assert.throws(()=>runInContext('('+witness.projectTerminalScriptWitness.toString()+')(__copy)',x.r.c),/UNAVAILABLE/);assert.equal(h.handleCalls,1);
});
for(const drift of ['method','node','account'])test('loadbind retained realm '+drift+' drift refuses next recheck with no reacquire/reader replay',async()=>{
 const x=await joined(),h=originalHandle(x),r=await api.bindTerminalScriptWitness(x.f.owner);
 if(drift==='method')x.r.constructors.FileStorage.prototype.get_Connected=()=>true;
 if(drift==='node')x.s.state(x.s.node('bg/js/rpc.js')).connected=false;
 if(drift==='account')x.r.c.__loginomStartupV1.account='foreign';
 await assert.rejects(r.recheck(),/UNAVAILABLE/);await assert.rejects(r.recheck(),/UNAVAILABLE/);assert.equal(h.handleCalls,1);assert.equal(h.calls,2);assert.deepEqual(x.r.counts(),[1,1,1]);
});
for(const target of ['page','handle'])test('loadbind '+target+' accessor substitution refuses getter0',async()=>{
 const x=await joined(),h=originalHandle(x);let gets=0;
 if(target==='page'){Object.defineProperty(x.f.page,'evaluateHandle',{get(){gets++;return ()=>h.handle},configurable:true});await assert.rejects(api.bindTerminalScriptWitness(x.f.owner),/LOAD_CHANGED/);assert.equal(h.handleCalls,0)}
 else{const r=await api.bindTerminalScriptWitness(x.f.owner);Object.defineProperty(h.handle,'evaluate',{get(){gets++;return ()=>({})},configurable:true});await assert.rejects(r.recheck(),/LOAD_CHANGED/);assert.equal(h.calls,1)}
 assert.equal(gets,0);assert.deepEqual(x.r.counts(),[1,1,1]);
});
for(const reason of [undefined,null,false,0,'',Error('original handle rejection',{cause:0})])test('loadbind raw handle failure '+String(reason)+' wins secondary owner drift',async()=>{
 const x=await joined();x.f.page.evaluateHandle=()=>{x.f.owner.page={};return Promise.reject(reason)};
 let failed=false,error;try{await api.bindTerminalScriptWitness(x.f.owner)}catch(e){failed=true;error=e}assert(failed);assert.equal(error,reason);assert.deepEqual(x.r.counts(),[1,1,1]);
});
test('loadbind pending recheck shares one task, then raw failure defeats drift without another evaluate',async()=>{
 const x=await joined(),h=originalHandle(x),r=await api.bindTerminalScriptWitness(x.f.owner);let reject,calls=0;const task=new Promise((_,no)=>reject=no);
 // The retained method remains identical; only this test-double settlement changes.
 const y=await joined();let pending=false;const second=originalHandle(y,{evaluate({fn,capsule,x}){calls++;if(pending)return task;x.r.c.__retainedCapsule=capsule;return Promise.resolve(JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__retainedCapsule)',x.r.c))))}});
 const bound=await api.bindTerminalScriptWitness(y.f.owner);pending=true;const a=bound.recheck(),b=bound.recheck();assert.equal(a,b);assert.equal(calls,2);const raw=Error('primary',{cause:0});y.f.owner.page={};reject(raw);let caught;try{await a}catch(e){caught=e}assert.equal(caught,raw);assert.equal(bound.recheck(),a);assert.equal(second.handleCalls,1);assert.equal(h.handleCalls,1);assert.equal(await r.recheck(),r);
});

for(const mode of ['abort','expiry'])test('loadbind '+mode+' priority beats foreign Page getter before recheck dispatch',async()=>{
 const x=await joined(),h=originalHandle(x),r=await api.bindTerminalScriptWitness(x.f.owner);let getterCalls=0;
 Object.defineProperty(x.f.owner,'page',{get(){getterCalls++;throw Error('foreign Page getter')},configurable:true});
 const now=Date.now;
 try{
  if(mode==='abort')api.receiveManagedRootCall({id:'interrupt',operation:'interrupt',input:{},rootOrigin:{...x.f.message.rootOrigin,requestId:'interrupt',parentRequestId:'parent:interrupt',aborted:true,rejection:{kind:'value',value:false}}},x.f.state);
  else Date.now=()=>x.f.message.rootOrigin.deadline+1;
  let failed=false,error;try{await r.recheck()}catch(e){failed=true;error=e}assert(failed);
  if(mode==='abort')assert.equal(error,false);else assert.equal(error.message,'LOGINOM_ORIGINAL_RUN_EXPIRED');
  assert.equal(getterCalls,0);assert.equal(h.calls,1);assert.equal(h.handleCalls,1);
 }finally{Date.now=now}
});
test('loadbind pending initial handle preserves its exact task and rejects post-await owner drift',async()=>{
 const x=await joined(),h=originalHandle(x),original=x.f.page.evaluateHandle;let resolve,entered;
 const task=new Promise(yes=>resolve=yes),started=new Promise(yes=>entered=yes);
 x.f.page.evaluateHandle=function(fn,args){original.call(this,fn,args);entered();return task};
 const work=api.bindTerminalScriptWitness(x.f.owner);await started;
 assert.equal(x.f.load.inspect().scriptWitness.realmHandleTask,task);x.f.owner.page={};resolve(h.handle);
 await assert.rejects(work,/LOAD_CHANGED/);assert.equal(h.handleCalls,1);assert.equal(h.calls,0);assert.deepEqual(x.r.counts(),[1,1,1]);
});
test('loadbind recheck foreign serialized result refuses without toJSON/accessor invocation',async()=>{
 const x=await joined();let next=false,gets=0;
 originalHandle(x,{evaluate({fn,capsule,x}){if(next){const foreign={};Object.defineProperty(foreign,'id',{get(){gets++;return 'original'}});return Promise.resolve(foreign)}x.r.c.__retainedCapsule=capsule;return Promise.resolve(JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__retainedCapsule)',x.r.c))))}});
 const r=await api.bindTerminalScriptWitness(x.f.owner);next=true;await assert.rejects(r.recheck(),/ASSOCIATION_CHANGED/);assert.equal(gets,0);
});

for(const initial of ['present','missing'])test('loadbind '+initial+' Page handle method cannot be replaced/published during first import await',async()=>{
 const x=await joined();const h=initial==='present'?originalHandle(x):undefined;let calls=0;
 const work=api.bindTerminalScriptWitness(x.f.owner);
 x.f.page.evaluateHandle=()=>{calls++;return h?.handle};
 await assert.rejects(work,/LOAD_CHANGED/);assert.equal(calls,0);if(h)assert.equal(h.handleCalls,0);assert.equal(x.evaluations,0);
});

test('loadbind initial handle accessor refusal is sticky, not repaired by later data method',async()=>{
 const x=await joined(),h=originalHandle(x),original=x.f.page.evaluateHandle;let getters=0;
 Object.defineProperty(x.f.page,'evaluateHandle',{get(){getters++;return original},configurable:true});
 let first;try{await api.bindTerminalScriptWitness(x.f.owner)}catch(e){first=e}assert.equal(first.message,'LOGINOM_ORIGINAL_LOAD_CHANGED');
 Object.defineProperty(x.f.page,'evaluateHandle',{value:original,writable:true,configurable:true});let next;try{await api.bindTerminalScriptWitness(x.f.owner)}catch(e){next=e}
 assert.equal(next,first);assert.equal(getters,0);assert.equal(h.handleCalls,0);
});
test('loadbind foreign projection descriptor flags refuse even with equal data',async()=>{
 const x=await joined();let next=false;
 originalHandle(x,{evaluate({fn,capsule,x}){x.r.c.__retainedCapsule=capsule;const value=JSON.parse(JSON.stringify(runInContext('('+fn.toString()+')(__retainedCapsule)',x.r.c)));if(next)Object.defineProperty(value,'id',{writable:false});return Promise.resolve(value)}});
 const r=await api.bindTerminalScriptWitness(x.f.owner);next=true;await assert.rejects(r.recheck(),/LOAD_CHANGED/);
});
