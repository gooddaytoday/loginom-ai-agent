// New original20 native load settlements + defining export capture. Real Chromium/DOM/SRI/request/frame/fulfill.
// Root/account/session/user/fetch/body are doubles; original selectAsync is retained, metadata/RPC service methods doubled.
import test from 'node:test';import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
const runtime=process.env.TERMINAL_JOIN_RUNTIME_ROOT?new URL('file://'+process.env.TERMINAL_JOIN_RUNTIME_ROOT+'/'):new URL('../../',import.meta.url);
const {chromium}=await import(new URL('client/node_modules/playwright/index.mjs',runtime));
const api=await import(new URL('src/terminal-root-association.mjs',runtime));
const {terminalUserPublisherScript}=await import(new URL('client/lib/terminal-user-publisher.mjs',runtime));
const {terminalSourceIntegrityScript}=await import(new URL('client/lib/terminal-source-integrity.mjs',runtime));
const docs=new URL('../../../../docs/testing/loginom-ai-agent/',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,docs),'utf8'));
const responsePins=(await read('terminal-publisher-inputs.json')).records.concat((await read('terminal-initializer-inputs.json')).inputs,await read('terminal-acquisition-inputs.json'));
const iifePins=(await read('terminal-iife-inputs.json')).inputs,input=process.env.TERMINAL_IIFE_INPUT_DIR;assert(input);
const bodies=new Map();for(const p of [...responsePins,...iifePins]){const b=await readFile(input+'/'+p.url.split('/').at(-1));assert.equal(b.length,p.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);bodies.set(p.url,b)}
const order=['__extends.js','__awaiter.js','__helpers.js','mscorlib.js','rtl.imp.js','bg.mscorlib.js','CustomProxyClassBuilder.js','Task.js','rtl.js','rpc.js','bg.rtl.js','bg.rtl.rpc.js','bg.model.js','bg.model.rpc.js','BG_Interfaces.js','__virtual.js','PropertySelector.js','BG_System.js','ServerConnection.js','User.js'];
const urls=order.map(n=>iifePins.find(p=>p.url.endsWith('/'+n)).url),unused=responsePins.filter(p=>!urls.includes(p.url));
const loader=await readFile(input+'/Loader.js','utf8');assert.equal(createHash('sha256').update(loader).digest('hex'),'543fc4c07ef270ab55f1055fcaf97f8f471d308a0877a3b3aef029ac0fa61f3b');
const address='https://app.loginom.ai/app/offline-initial-execution';
const html='<!doctype html><meta charset="utf-8">'+unused.map(p=>'<link rel="preload" as="script" href="'+p.url+'">').join('')+'<script>'+loader+'</script><script>globalThis.Debug=globalThis.debug={assert(){}};globalThis.loaderTask=(async()=>{for(const url of '+JSON.stringify(urls)+'){await bg.AddScriptAsync(url,false)}})();</script>';
const browser=await chromium.launch({headless:true});
try{
for(const mode of ['native','duplicate-load','early-use','pre-get-export','pre-get-accessor','pre-get-flags','pre-get-prototype','synthetic-load','catalog-hash','catalog-url-object','catalog-url-normalized','catalog-partial','catalog-getter','catalog-marker','catalog-app-source','catalog-recheck','event-replay','event-accessor'])test('initial-load '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,handleCreates=0,projections=0,getters=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:mode==='early-use'?html.replace('await bg.AddScriptAsync(url,false)','await bg.AddScriptAsync(url,false);if(url.endsWith("/__extends.js"))globalThis.firstLoadReceipt=__loginomOriginalScriptIntegrityV1.inspectLoad()'):mode==='synthetic-load'?html.replace('globalThis.Debug=', 'const append=document.head.appendChild;document.head.appendChild=function(node){node.dispatchEvent(new Event("load"));return Reflect.apply(append,this,[node])};globalThis.Debug='):html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
  const nativeRoute=page.route,nativeHandle=page.evaluateHandle,frame=page.mainFrame();let selectedDone;const selectedTask=new Promise(resolve=>selectedDone=resolve);
  const routed=function(pattern,handler){return Reflect.apply(nativeRoute,page,[pattern,async route=>{
   // Native original request/frame and actual fulfill task, fixed offline fetch/body adapter.
   const request=route.request(),url=request.url();assert.equal(request.frame(),frame);requests++;
   const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript; charset=utf-8'}),body:()=>Promise.resolve(bodies.get(url))};
   const adapter={request:()=>request,fetch:()=>Promise.resolve(response),fulfill(options){fulfills++;const{response:ignored,...rest}=options;return route.fulfill(rest)},abort:reason=>route.abort(reason)};
   await handler(adapter);if(requests===responsePins.length&&fulfills===responsePins.length)selectedDone();
  }])};
  Object.defineProperty(page,'route',{value:routed,writable:true,configurable:true});
  let owner;const injected=mode.startsWith('catalog-');
  if(injected)Object.defineProperty(page,'evaluateHandle',{value:function(fn,args){handleCreates++;return Reflect.apply(nativeHandle,page,[fn,args]).then(handle=>{
   const originalEvaluate=handle.evaluate;Object.defineProperty(handle,'evaluate',{value:function(project){projections++;return Reflect.apply(originalEvaluate,handle,[project]).then(result=>{
    if(mode==='catalog-hash'||(mode==='catalog-recheck'&&projections>1))result.initialLoad.records[0].integrity='sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    if(mode==='catalog-url-object'){const url=result.initialLoad.records[0].url;result.initialLoad.records[0].url={toString(){getters++;return url}}}
    if(mode==='catalog-url-normalized')result.initialLoad.records[0].url=' '+result.initialLoad.records[0].url;
    if(mode==='catalog-partial')result.initialLoad.records.pop();
    if(mode==='catalog-getter')Object.defineProperty(result.initialLoad,'records',{get(){getters++;throw Error('foreign getter')},configurable:true});
    if(mode==='catalog-app-source')result.initialLoad.applicationSourcesJoined=false;
    if(mode==='catalog-marker')result.initialLoad.definingExportsRetained=false;
    return result;
   })},writable:true,configurable:true});return handle})},writable:true,configurable:true});
  const selectedPage=page;
  const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};
  api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state);owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');owner.context=context;load.bindContext(context);owner.page=selectedPage;load.bindPage(selectedPage);
  await api.prepareTerminalSourceResponses(owner);
  const init=load.init((terminalSourceIntegrityScript()+'\n')+terminalUserPublisherScript(candidate.url)+';\nglobalThis.__loginomStartupV1={document,id:"original",account:"account"}');actualInitCount++;await load.observed(init);load.admitPage(selectedPage,candidate);await page.goto(address,{waitUntil:'load'});if(mode==='synthetic-load'){
   await assert.rejects(page.evaluate(()=>loaderTask),/SOURCE_INTEGRITY_UNAVAILABLE/);
   await assert.rejects(page.evaluate(()=>__loginomOriginalScriptIntegrityV1.inspectLoad()),/SOURCE_INTEGRITY_UNAVAILABLE/);return;
  }
  await page.evaluate(()=>loaderTask);await selectedTask;load.guard();
  if(mode==='duplicate-load'){await assert.rejects(page.evaluate(url=>{const node=document.createElement('script');node.src=url},urls[0]),/SOURCE_INTEGRITY_UNAVAILABLE/);assert.equal(requests,20);await assert.rejects(page.evaluate(()=>__loginomOriginalScriptIntegrityV1.inspectLoad()),/SOURCE_INTEGRITY_UNAVAILABLE/);return;}
  if(mode.startsWith('pre-get-')){
   await page.evaluate(mode=>{globalThis.foreignGets=0;const original=ss.mkdel;if(mode==='pre-get-export')ss.mkdel=function(...args){return Reflect.apply(original,this,args)};else if(mode==='pre-get-flags')Object.defineProperty(ss,'mkdel',{value:original,writable:false});else if(mode==='pre-get-prototype')Object.setPrototypeOf(ss,Object.create(Object.getPrototypeOf(ss)));else Object.defineProperty(ss,'mkdel',{get(){foreignGets++;throw Error('foreign')},configurable:true})},mode);
   await assert.rejects(page.evaluate(()=>__loginomOriginalScriptIntegrityV1.inspectLoad()),/SOURCE_INTEGRITY_UNAVAILABLE/);
   assert.equal(await page.evaluate(()=>foreignGets),0);return;
  }
  await page.evaluate(async()=>{let selectors=0;rpc.TBGSession.SelectPropertyDescs=()=>{selectors++;return []};rpc.TBGSession.GetPropertyValues=()=>[];const user=Object.create(rpc.TBGObjectProxy.prototype);user.$S={};user.$={$OW:1,$O:2};Object.assign(user,{Name:'account',IsAdmin:false,IsViewer:false,IsDesigner:true,Blocked:false,AllowPublish:false,SchedulerFullAccess:false,MustChangePassword:false,AuthMode:0});const connection=Object.create(bg.app.ServerConnection.prototype);connection.FSession={CurrentUser:user,$S:user.$S};const get=connection.GetCurrentUser();const set=bg.app.CurrentUser.Set(await get);await set;globalThis.fixtureGet=get;globalThis.fixtureSet=set;let ready=false,last;for(let n=0;n<100;n++){try{__loginomOriginalUserPublisherV1.inspect();ready=true;break}catch(e){last=e}await new Promise(r=>setTimeout(r,1))}if(!ready)throw last;globalThis.fixtureSelectorCount=selectors});
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);let bound,caught,refused=false;
  try{bound=await api.bindTerminalScriptWitness(owner)}catch(e){caught=e;refused=true}
  const expectedRefusal=['catalog-hash','catalog-url-object','catalog-url-normalized','catalog-partial','catalog-getter','catalog-marker','catalog-app-source'].includes(mode);
  t.diagnostic(JSON.stringify({mode,refused,getters,joined:bound?.supportedInitialLoadJoined??false}));
  assert.equal(refused,expectedRefusal);assert.equal(getters,0);
  if(expectedRefusal)assert.match(String(caught),mode==='catalog-getter'?/ORIGINAL_ASSOCIATION_CHANGED/:/ORIGINAL_LOAD_CHANGED/);
  else{
   assert.equal(bound.selectedInitialExecutionJoined,true);assert.equal(bound.supportedInitialLoadJoined,mode!=='early-use');
   assert.equal(bound.initialLoadReason,mode==='early-use'?'INITIAL_LOAD_INCOMPLETE':undefined);
   if(mode==='event-replay'||mode==='event-accessor'){
    await page.evaluate(mode=>{const r=__loginomOriginalScriptIntegrityV1.inspectLoad().records[0];globalThis.eventGets=0;if(mode==='event-replay')r.node.dispatchEvent(r.event);else Object.defineProperty(r.event,'target',{get(){eventGets++;throw Error('foreign event getter')},configurable:true})},mode);
    if(mode==='event-accessor')await assert.rejects(bound.recheck(),/SOURCE_INTEGRITY_UNAVAILABLE/);else{assert.equal(await bound.recheck(),bound);assert.equal(await page.evaluate(()=>__loginomOriginalScriptIntegrityV1.inspectLoad().records.length),20)}assert.equal(await page.evaluate(()=>eventGets),0);return;
   }
   assert.equal(bound.page,page);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.originalInitTask,init);
   if(mode==='catalog-recheck'){const rejected=bound.recheck();await assert.rejects(rejected,/LOAD_CHANGED/);assert.equal(bound.recheck(),rejected);assert.equal(projections,2)}else assert.equal(await bound.recheck(),bound);
   const loadProof=await page.evaluate(()=>{const p=__loginomOriginalScriptIntegrityV1.inspectLoad(),sample=__loginomOriginalUserPublisherV1.inspect();return {same:p===sample.acquisition.loadedDefinitions.initialLoad,records:p.records.length,keys:Object.keys(p.bindings),sameGet:sample.acquisition.task===fixtureGet,sameSet:sample.task===fixtureSet,selector:p.bindings.selectAsync===bg.selectAsync,applicationSourcesJoined:sample.acquisition.loadedDefinitions.applicationSourcesJoined,events:p.records.every(r=>r.nativeEvent.trusted&&r.nativeEvent.type==='load'&&r.nativeEvent.target===r.node&&r.receipt.node===r.node&&r.node.ownerDocument===document),missing:p.missing,complete:p.complete}});
   assert.equal(loadProof.same,true);assert.equal(loadProof.sameGet,true);assert.equal(loadProof.sameSet,true);assert.equal(loadProof.complete,mode!=='early-use');
   if(mode==='native'){assert.equal(loadProof.records,20);assert.equal(loadProof.selector,true);assert.equal(loadProof.applicationSourcesJoined,true);assert.equal(loadProof.events,true);assert.deepEqual(loadProof.keys.sort(),'awaiter ss taskConstructor task mkdel exceptionWrap shallowCopy prepareProperties rpc ObjectProxy GuidHelper MessageDynamicData HResult sessionConstructor query StreamPersist FileStorage StreamPersistProxy connected currentDirectory ownDirectory rootPath persist selectAsync bg objectEquals'.split(' ').sort());assert.deepEqual(loadProof.missing,[])}
   if(mode==='early-use'){assert.equal(loadProof.records,1);assert.equal(loadProof.missing.length,19)}
   for(const k of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[k],false);
  }
  for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','sourceBytesVerified'])assert.equal(load.facts[k],false);
  assert.equal(requests,20);assert.equal(fulfills,20);assert.equal(unexpected,0);assert.equal(await page.evaluate(()=>fixtureSelectorCount),1);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({mode,requests,fulfills,realRequestFrameAndFulfill:true,fetchBodyAndRootSessionDoubles:true,supportedInitialLoadJoined:bound?.supportedInitialLoadJoined??false,refused,handleCreates,projections,getters,actualInitCount,allAuthoritiesFalse:true}));
 }finally{await context.close()}
});
}finally{test.after(()=>browser.close())}
