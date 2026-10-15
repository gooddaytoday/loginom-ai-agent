// Real Node/Promise/AbortController; Page/native/SDK/startup/PID are doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.ROOT_RUNTIME_ROOT?new URL('file://'+process.env.ROOT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const roots=await import(new URL('src/terminal-root-association.mjs',root));
const {beginTerminalManagedCall}=await import(new URL('src/terminal-managed-call.mjs',root));
const {retainOriginalPrepareStartup,requireTerminalPrepareProvider}=await import(new URL('src/original-prepare-lender.mjs',root));
function fixture({handleEvaluate,deadline=Date.now()+60000}={}){
 const controller=new AbortController();
 const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:deadline};
 const wire={originId:'root',deadline,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}};
 const connection={username:'account',url:'https://app.loginom.ai/app'},state={controller:undefined};
 const start={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection,acceptanceCapture:capture},rootOrigin:wire};
 roots.receiveManagedRootStart(start,state,2,3);const load=roots.retainTerminalSourceStartup(start,state);
 let routeHandler;const frame={};
 const page={isClosed:()=>false,goto(){},evaluate(){throw Error('NO_EVALUATE')},locator(){},mainFrame:()=>frame,route(pattern,handler){routeHandler=handler;return Promise.resolve()}};
 if(handleEvaluate)page.evaluateHandle=()=>Promise.resolve({evaluate:handleEvaluate});
 const context={pages:()=>[page],newPage(){throw Error('NO_NEW_PAGE')},addInitScript(){return Promise.resolve()}};
 const owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai',signal:controller.signal,deadline};
 state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,connection,'/own/profile');owner.context=context;load.bindContext(context);owner.page=page;load.bindPage(page);
 const session={metadata:{sessionId:'session'},directory:'/own'},bridge={},startup=Object.freeze({...owner,owner});
 const lender=retainOriginalPrepareStartup(session,{startup,owner,readiness:{documentId:'document',account:'account',loginomBuild:'7.4.2'},assertStartup(){}});lender.bind(bridge);
 state.bridge=bridge;state.session=session;state.client={callTool(){throw Error('NO_DISPATCH')}};
 return{wire,state,start,load,owner,page,context,session,bridge,lender,controller,frame,get routeHandler(){return routeHandler}};
}
function call(f,{otherState,associated=true}={}){
 const message={id:'call',operation:'call',input:{name:'dock_prepare',arguments:{intent:'new_draft',operation_id:'original'}}};
 if(associated){message.rootOrigin={...f.wire,requestId:'call',parentRequestId:'parent-call'};roots.receiveManagedRootCall(message,otherState??f.state)}
 const token=beginTerminalManagedCall(message,f.state);token.bindTask(Promise.resolve());
 return{message,token,async ready(){await token.beforeDispatch();f.state.controller=new AbortController();token.bindController(f.state.controller)}};
}
test('H0 original call/startup/root/Page association reaches explicit missing initial-load predicate, same Promise/no creation',async()=>{
 const f=fixture(),c=call(f);await c.ready();
 assert.equal(roots.terminalSourceForManagedCall(f.owner,c.message),f.load);
 const work=requireTerminalPrepareProvider(f.bridge);assert.equal(requireTerminalPrepareProvider(f.bridge),work);
 await assert.rejects(work,e=>e.message==='LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE'&&e.cause==='ORIGINAL_INITIAL_LOAD_NOT_BOUND');
 assert.equal(requireTerminalPrepareProvider(f.bridge),work);assert.equal(f.load.inspect().page,f.page);assert.equal(f.load.facts.deadline,f.wire.deadline);
 for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(f.load.facts[key],false);
});
test('same wire values from a different startup peer cannot bind owner to call',async()=>{
 const f=fixture(),other=fixture({deadline:f.wire.deadline}),c=call(f,{otherState:other.state});await c.ready();
 assert.throws(()=>requireTerminalPrepareProvider(f.bridge),/INVOCATION_UNAVAILABLE/);
 assert.throws(()=>roots.terminalSourceForManagedCall({...f.owner},c.message),/INVOCATION_UNAVAILABLE/);
 assert.throws(()=>roots.terminalSourceForManagedCall(f.owner,{...c.message}),/INVOCATION_UNAVAILABLE/);
});
test('unassociated managed call and copied bridge have no provider',async()=>{
 const f=fixture(),c=call(f,{associated:false});await c.ready();
 assert.throws(()=>requireTerminalPrepareProvider(f.bridge),/INVOCATION_UNAVAILABLE/);
 assert.throws(()=>requireTerminalPrepareProvider({...f.bridge}),/INVOCATION_UNAVAILABLE/);
});
test('original typed request drift during initial microtask refuses getter0 before realm use',async()=>{
 const f=fixture(),c=call(f);await c.ready();const work=requireTerminalPrepareProvider(f.bridge);let gets=0;
 Object.defineProperty(c.message.input.arguments,'intent',{get(){gets++;return 'new_draft'}});
 await assert.rejects(work,/ASSOCIATION_CHANGED/);assert.equal(gets,0);
});
test('owner Page substitution during initial microtask refuses without new lookup/evaluate',async()=>{
 const f=fixture(),c=call(f);await c.ready();const work=requireTerminalPrepareProvider(f.bridge);f.owner.page={};
 await assert.rejects(work,/OWNER_CHANGED|LOAD_CHANGED/);assert.equal(f.load.inspect().page,f.page);
});
for(const pending of [false,true])test('H0 foreign owner Page accessor getter0 '+(pending?'after':'before')+' initial await',async()=>{
 const f=fixture(),c=call(f);await c.ready();let gets=0;
 const work=pending?requireTerminalPrepareProvider(f.bridge):undefined;
 Object.defineProperty(f.owner,'page',{get(){gets++;throw Error('SECONDARY')}});
 if(pending)await assert.rejects(work,/LOAD_CHANGED/);
 else assert.throws(()=>requireTerminalPrepareProvider(f.bridge),/LOAD_CHANGED/);
 assert.equal(gets,0);
});
for(const reason of [false,0,null,'',undefined,Error('first',{cause:0})])test('original child abort '+String(reason)+' precedes foreign owner accessor',async()=>{
 const f=fixture(),c=call(f);await c.ready();let gets=0;f.state.controller.abort(reason);
 Object.defineProperty(f.owner,'page',{get(){gets++;throw Error('SECONDARY')}});
 assert.throws(()=>requireTerminalPrepareProvider(f.bridge),e=>e===f.state.controller.signal.reason);assert.equal(gets,0);
});
test('root expiry is original absolute deadline and precedes foreign Page getter',async()=>{
 const f=fixture(),c=call(f);await c.ready();const now=Date.now;let gets=0;
 Object.defineProperty(f.owner,'page',{get(){gets++;throw Error('SECONDARY')}});
 try{Date.now=()=>f.wire.deadline;assert.throws(()=>requireTerminalPrepareProvider(f.bridge),/RUN_EXPIRED/);assert.equal(gets,0)}finally{Date.now=now}
});

// The retained handle below deliberately returns a labelled summary double.
// It tests the production consumer and original route receipts, not realm proof.
async function joined({afterFirst}={}){
 const {terminalScriptWitnessArguments}=await import(new URL('client/lib/terminal-script-witness.mjs',root));
 const pins=terminalScriptWitnessArguments('original','account').initialLoadPins;
 const paths=['bg/js/mscorlib.js','bg/js/bg.mscorlib.js','bg/js/rpc.js','bg/js/bg.rtl.rpc.js','bg/js/bg.rtl.rpc.js'];
 const kinds=['initial','modifier','ObjectProxy','FileStorage','StreamPersist'];
 const summary={id:'original',account:'account',projectionOnly:true,sourceExecutionQualified:false,closureIdentityQualified:false,
  initialLoad:{records:pins.map(([url,integrity])=>({url,integrity,loaded:true})),definingExportsRetained:true,applicationSourcesJoined:true},
  rows:paths.map((p,i)=>{const url='https://app.loginom.ai/app/'+p;return{kind:kinds[i],url,integrity:pins.find(([u])=>u===url)[1],armedBeforeSource:true,initialExecutionObserved:true}})};
 let calls=0;const f=fixture({handleEvaluate(){calls++;if(calls>1&&afterFirst)return afterFirst(f);return Promise.resolve(structuredClone(summary))}});
 await roots.prepareTerminalSourceResponses(f.owner);
 const inputs=process.env.TERMINAL_SOURCE_INPUT_DIR?new URL('file://'+process.env.TERMINAL_SOURCE_INPUT_DIR+'/'):new URL('../../../../publisher-source/',import.meta.url);
 const docs=new URL('../../../docs/testing/loginom-ai-agent/',import.meta.url);
 const routePins=JSON.parse(await readFile(new URL('terminal-publisher-inputs.json',docs),'utf8')).records.concat(JSON.parse(await readFile(new URL('terminal-initializer-inputs.json',docs),'utf8')).inputs,JSON.parse(await readFile(new URL('terminal-acquisition-inputs.json',docs),'utf8')));
 for(const{url}of routePins){const body=await readFile(new URL(url.split('/').at(-1),inputs));
  const request={url:()=>url,method:()=> 'GET',resourceType:()=> 'script',frame:()=>f.frame};
  const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript'}),body:()=>Promise.resolve(body)};
  await f.routeHandler({request:()=>request,fetch:()=>Promise.resolve(response),fulfill:()=>Promise.resolve(),abort:()=>{throw Error('NO_ABORT')}});f.load.guard();
 }
 const init=f.load.init('labelled initial script');await f.load.observed(init);f.load.admitPage(f.page,f.start.input.connection);
 const witness=await roots.bindTerminalScriptWitness(f.owner),c=call(f);await c.ready();
 return{f,c,witness,get calls(){return calls}};
}
test('fixed H0 rechecks same original handle once then refuses exact unbound native provider; no synthetic positive',async()=>{
 const x=await joined();assert.equal(x.witness.supportedInitialLoadJoined,true);
 const work=requireTerminalPrepareProvider(x.f.bridge);assert.equal(requireTerminalPrepareProvider(x.f.bridge),work);
 await assert.rejects(work,e=>e.message==='LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE'&&e.cause==='LOADED_NATIVE_PROVIDER_NOT_BOUND');
 assert.equal(x.calls,2);assert.equal(requireTerminalPrepareProvider(x.f.bridge),work);assert.equal(x.calls,2);
 for(const k of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(x.witness[k],false);
});
for(const reason of [false,0,null,undefined,'',Error('first recheck',{cause:0})])test('H0 awaited original recheck raw '+String(reason)+' survives secondary owner drift',async()=>{
 let no,entered;const task=new Promise((_,reject)=>no=reject),started=new Promise(resolve=>entered=resolve);
 const x=await joined({afterFirst(){entered();return task}}),work=requireTerminalPrepareProvider(x.f.bridge);
 await started;x.f.owner.page={};no(reason);let caught,failed=false;try{await work}catch(e){failed=true;caught=e}
 assert(failed);assert.equal(caught,reason);assert.equal(x.calls,2);assert.equal(x.witness.realmHandleTask instanceof Promise,true);
});
