// Original before-assignment modifier reads and post-capture guards. Real Chromium/DOM/SRI/request/frame/fulfill.
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
for(const mode of ['alias-native','alias-accessor','alias-flags','alias-replacement','alias-original-prototype','alias-init-original-prototype','alias-init-flags','alias-missing-read','alias-stale-setter'])test('modifier-read '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:mode==='alias-missing-read'?html.replace('await bg.AddScriptAsync(url,false)','await bg.AddScriptAsync(url,false);if(url.endsWith("/mscorlib.js")){globalThis.modifierGate=true;await new Promise(()=>{})}'):mode==='alias-stale-setter'?html.replace('await bg.AddScriptAsync(url,false)','await bg.AddScriptAsync(url,false);if(url.endsWith("/mscorlib.js"))globalThis.savedShallowSetter=Object.getOwnPropertyDescriptor(ss,"shallowCopy").set'):html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
  const nativeRoute=page.route,frame=page.mainFrame();let selectedDone;const selectedTask=new Promise(resolve=>selectedDone=resolve);
  const routed=function(pattern,handler){return Reflect.apply(nativeRoute,page,[pattern,async route=>{
   // Native original request/frame and actual fulfill task, fixed offline fetch/body adapter.
   const request=route.request(),url=request.url();assert.equal(request.frame(),frame);requests++;
   const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript; charset=utf-8'}),body:()=>Promise.resolve(bodies.get(url))};
   const adapter={request:()=>request,fetch:()=>Promise.resolve(response),fulfill(options){fulfills++;const{response:ignored,...rest}=options;return route.fulfill(rest)},abort:reason=>route.abort(reason)};
   await handler(adapter);if(requests===responsePins.length&&fulfills===responsePins.length)selectedDone();
  }])};
  Object.defineProperty(page,'route',{value:routed,writable:true,configurable:true});
  let owner;
  const selectedPage=page;
  const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};
  api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state);owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');owner.context=context;load.bindContext(context);owner.page=selectedPage;load.bindPage(selectedPage);
  await api.prepareTerminalSourceResponses(owner);
  const init=load.init((terminalSourceIntegrityScript()+'\n')+terminalUserPublisherScript(candidate.url)+';\nglobalThis.__loginomStartupV1={document,id:"original",account:"account"}');actualInitCount++;await load.observed(init);load.admitPage(selectedPage,candidate);await page.goto(address,{waitUntil:'load'});
  if(mode==='alias-missing-read'){
   await page.waitForFunction(()=>globalThis.modifierGate===true);
   const text=bodies.get(urls.find(u=>u.endsWith('/bg.mscorlib.js'))).toString().replace(/\r\n/g,'\n');
   const fixed=text.slice(text.indexOf('function bg$shallowCopy'),text.indexOf('};',text.indexOf('function bg$shallowCopy'))+1);
   await page.evaluate(text=>{ss.shallowCopy=(0,eval)('('+text+')')},fixed); // Negative fixture only; production never evals.

   await assert.rejects(page.evaluate(()=>__loginomOriginalUserPublisherV1.inspect()),/PUBLISHER_UNAVAILABLE/);return;
  }
  await page.evaluate(()=>loaderTask);await selectedTask;load.guard();
  await page.evaluate(()=>{globalThis.aliasGetters=0});
  if(mode==='alias-stale-setter'){
   const unchanged=await page.evaluate(()=>{const original=ss.shallowCopy,foreign=function foreign(){};savedShallowSetter(foreign);return ss.shallowCopy===original});
   assert.equal(unchanged,true);await assert.rejects(page.evaluate(()=>__loginomOriginalUserPublisherV1.inspect()),/PUBLISHER_UNAVAILABLE/);return;
  }

  if(['alias-accessor','alias-flags','alias-replacement'].includes(mode)){
   await page.evaluate(mode=>{const d=Object.getOwnPropertyDescriptor(ss,'shallowCopy');
    if(mode==='alias-accessor')Object.defineProperty(ss,'shallowCopy',{get(){aliasGetters++;throw Error('foreign alias getter')},configurable:true});
    else if(mode==='alias-flags')Object.defineProperty(ss,'shallowCopy',{...d,writable:!d.writable});
    else ss.shallowCopy=function bg$shallowCopy(source,target){return source};
   },mode);
   await assert.rejects(page.evaluate(()=>__loginomOriginalUserPublisherV1.inspect()),/TERMINAL_(USER_PUBLISHER|SOURCE_INTEGRITY)_UNAVAILABLE/);
   assert.equal(await page.evaluate(()=>aliasGetters),0);return;
  }
  await page.evaluate(async()=>{let selectors=0;rpc.TBGSession.SelectPropertyDescs=()=>{selectors++;return []};rpc.TBGSession.GetPropertyValues=()=>[];const user=Object.create(rpc.TBGObjectProxy.prototype);user.$S={};user.$={$OW:1,$O:2};Object.assign(user,{Name:'account',IsAdmin:false,IsViewer:false,IsDesigner:true,Blocked:false,AllowPublish:false,SchedulerFullAccess:false,MustChangePassword:false,AuthMode:0});const connection=Object.create(bg.app.ServerConnection.prototype);connection.FSession={CurrentUser:user,$S:user.$S};const get=connection.GetCurrentUser();const set=bg.app.CurrentUser.Set(await get);await set;globalThis.fixtureGet=get;globalThis.fixtureSet=set;let ready=false,last;for(let n=0;n<100;n++){try{__loginomOriginalUserPublisherV1.inspect();ready=true;break}catch(e){last=e}await new Promise(r=>setTimeout(r,1))}if(!ready)throw last;globalThis.fixtureSelectorCount=selectors});
  const aliases=await page.evaluate(()=>{
   const sample=__loginomOriginalUserPublisherV1.inspect(),i=sample.acquisition.loadedDefinitions.initializers;
   const a=i.modifierReads.shallowCopy,b=i.modifierReads.initClass;
   return {frozen:Object.isFrozen(i.modifierReads)&&Object.isFrozen(a)&&Object.isFrozen(b)&&Object.isFrozen(a.read)&&Object.isFrozen(b.read),
    names:Object.keys(i.modifierReads),before:a.read.beforeAssignment&&b.read.beforeAssignment,
    sameNode:a.read.execution.script===a.execution.script&&a.execution.script===b.execution.script&&b.read.execution.script===i.modifierScript.script,
    sameReceipt:a.read.execution.integrityReceipt===a.execution.integrityReceipt&&a.execution.integrityReceipt===b.execution.integrityReceipt,
    originalBase:i.records.every(r=>r.dependencies.initialBase===b.read.original),
    originalDifferent:a.read.original!==a.replacement&&b.read.original!==b.replacement,
    final:a.replacement===ss.shallowCopy&&b.replacement===ss.initClass,
    receivers:a.read.receiver===ss&&b.read.receiver===ss,
    unqualified:a.closureIdentityQualified===false&&b.closureIdentityQualified===false&&i.closureIdentityQualified===false};
  });
  assert.deepEqual(aliases.names.sort(),['initClass','shallowCopy']);
  for(const [key,value]of Object.entries(aliases))if(key!=='names')assert.equal(value,true,key);
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);
  const bound=await api.bindTerminalScriptWitness(owner);
  assert.equal(bound.selectedInitialExecutionJoined,true);assert.equal(bound.supportedInitialLoadJoined,true);
  assert.equal(bound.page,page);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.originalInitTask,init);
  assert.equal(await bound.recheck(),bound);
  if(mode!=='alias-native'){
   await page.evaluate(mode=>{
    const i=__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions.initializers;
    if(mode==='alias-init-flags'){const d=Object.getOwnPropertyDescriptor(ss,'initClass');Object.defineProperty(ss,'initClass',{...d,writable:!d.writable})}
    else {const name=mode==='alias-original-prototype'?'shallowCopy':'initClass';const original=i.modifierReads[name].read.original;Object.setPrototypeOf(original,Object.create(Object.getPrototypeOf(original)))}
   },mode);
   const failed=bound.recheck();await assert.rejects(failed,/TERMINAL_(USER_PUBLISHER|SOURCE_INTEGRITY)_UNAVAILABLE/);assert.equal(bound.recheck(),failed);
  }
  for(const k of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[k],false);
  for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','sourceBytesVerified'])assert.equal(load.facts[k],false);
  assert.equal(requests,20);assert.equal(fulfills,20);assert.equal(unexpected,0);assert.equal(await page.evaluate(()=>fixtureSelectorCount),1);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({mode,requests,fulfills,realRequestFrameAndFulfill:true,fetchBodyAndRootSessionDoubles:true,supportedInitialLoadJoined:bound?.supportedInitialLoadJoined??false,actualInitCount,allAuthoritiesFalse:true}));
 }finally{await context.close()}
});
}finally{test.after(()=>browser.close())}
