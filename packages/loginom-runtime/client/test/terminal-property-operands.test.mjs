// Original TBGSession methods + native metadata/property parsing with an explicit offline transport fixture. Real Chromium/DOM/SRI/request/frame/fulfill.
// Root/account/session/user/fetch/body and the remote response are doubles; vendor methods and metadata are unchanged.
import test from 'node:test';import assert from 'node:assert/strict';
import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
const runtime=process.env.TERMINAL_JOIN_RUNTIME_ROOT?new URL('file://'+process.env.TERMINAL_JOIN_RUNTIME_ROOT+'/'):new URL('../../',import.meta.url);
const {chromium}=await import(new URL('client/node_modules/playwright/index.mjs',runtime));
const api=await import(new URL('src/terminal-root-association.mjs',runtime));
const {terminalUserPublisherScript}=await import(new URL('client/lib/terminal-user-publisher.mjs',runtime));
const {terminalSourceIntegrityScript}=await import(new URL('client/lib/terminal-source-integrity.mjs',runtime));
const docs=new URL('../../../../docs/testing/loginom-ai-agent/',import.meta.url),read=async name=>JSON.parse(await readFile(new URL(name,docs),'utf8'));
const responsePins=(await read('terminal-publisher-inputs.json')).records.concat((await read('terminal-initializer-inputs.json')).inputs,await read('terminal-acquisition-inputs.json'));
const propertyPins=(await read('terminal-property-inputs.json')).inputs;
const iifePins=(await read('terminal-iife-inputs.json')).inputs,input=process.env.TERMINAL_IIFE_INPUT_DIR;assert(input);
const bodies=new Map();for(const p of [...responsePins,...iifePins,...propertyPins]){const b=await readFile(input+'/'+p.url.split('/').at(-1));assert.equal(b.length,p.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);bodies.set(p.url,b)}
const order=['__extends.js','__awaiter.js','__helpers.js','SysUtils.js','mscorlib.js','Int64.js','rtl.imp.js','bg.mscorlib.js','BitConverter.js','CustomProxyClassBuilder.js','Task.js','rtl.js','rpc.js','bg.rtl.js','bg.rtl.rpc.js','bg.model.js','bg.model.rpc.js','BG_Interfaces.js','__virtual.js','PropertySelector.js','BG_System.js','ServerConnection.js','User.js'];
const urls=order.map(n=>[...iifePins,...propertyPins].find(p=>p.url.endsWith('/'+n)).url),unused=responsePins.filter(p=>!urls.includes(p.url));
const loader=await readFile(input+'/Loader.js','utf8');assert.equal(createHash('sha256').update(loader).digest('hex'),'543fc4c07ef270ab55f1055fcaf97f8f471d308a0877a3b3aef029ac0fa61f3b');
const address='https://app.loginom.ai/app/offline-initial-execution';
const html='<!doctype html><meta charset="utf-8">'+unused.map(p=>'<link rel="preload" as="script" href="'+p.url+'">').join('')+'<script>'+loader+'</script><script>globalThis.Debug=globalThis.debug={assert(){}};globalThis.loaderTask=(async()=>{for(const url of '+JSON.stringify(urls)+'){await bg.AddScriptAsync(url,false)}})();</script>';
const browser=await chromium.launch({headless:true});
try{
for(const mode of ['original-property','pre-method-accessor','pre-method-flags','pre-metadata-accessor','pre-metadata-value','pre-reader-replacement','post-method-accessor','post-helper-prototype','post-metadata-flags','missing-dependency'])test('property-operands '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:mode==='missing-dependency'?html.replace(JSON.stringify(urls),JSON.stringify(urls.filter(u=>!propertyPins.some(p=>p.url===u)))):html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
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
  await page.evaluate(()=>loaderTask);await selectedTask;load.guard();t.diagnostic(JSON.stringify({pageErrors:errors}));
  if(mode==='missing-dependency'){
   const facts=await page.evaluate(()=>{const p=__loginomOriginalScriptIntegrityV1.inspectLoad();return {core:p.complete,property:p.propertyOperands.complete,additional:p.propertyOperands.additionalRecords.length}});
   assert.deepEqual(facts,{core:true,property:false,additional:0});return;
  }
  const result=await page.evaluate(async mode=>{
   const select=rpc.TBGSession.SelectPropertyDescs,getValues=rpc.TBGSession.GetPropertyValues;
   const user=Object.create(bg.rpc.TIBGDeductorUser_Proxy.prototype);
   const message=new rpc.TBGBinaryMessage();let dispatches=0,method,selected;
   const transport={$M:message,DispatchMessageAsync(request){
    dispatches++;method=request.get_MethodID();
    const pos={$:0},count=request.ReadInt32(pos);selected=[];for(let i=0;i<count;i++)selected.push(request.ReadInt32(pos));
    const response=message.GetDynamicData();response.set_StaticDataSize(8);response.InitializeResponseMessage(request.get_MessageID());
    const part=(size,write)=>{const p=message.GetDynamicData();p.set_StaticDataSize(8+size);p.InitializeResponseMessage(request.get_MessageID());write(p);const data={};const length=p.GetData(data);const bytes=data.$.slice(8,length);response.WriteValue$a(bytes.length);response.WriteValue$4(bytes);p.Release()};
    part(4,p=>p.WriteParameter$a(0,count));
    for(const id of selected){
     if(id===5)part(25,p=>{p.WriteParameter$8(0,'00000000-0000-0000-0000-000000000000');p.WriteParameter$g(16,2);p.WriteParameter$2(24,true)});
     else if(id===1973)part(4,p=>{p.WriteParameter$a(0,0);p.WriteString('account')});
     else if(id===1976)part(1,p=>p.WriteParameter$3(0,0));
     else part(1,p=>p.WriteParameter$2(0,id===1980));
    }
    const tcs=new ss.TaskCompletionSource();queueMicrotask(()=>tcs.setResult(response));return tcs.task;
   }};
   user.$S=transport;user.$={$OW:1,$O:2};
   const connection=Object.create(bg.app.ServerConnection.prototype);connection.FSession={CurrentUser:user,$S:transport};
   globalThis.propertyGetters=0;
   if(mode.startsWith('pre-')){
    if(mode==='pre-method-accessor')Object.defineProperty(rpc.TBGSession,'SelectPropertyDescs',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='pre-method-flags'){const d=Object.getOwnPropertyDescriptor(rpc.TBGSession,'GetPropertyValues');Object.defineProperty(rpc.TBGSession,'GetPropertyValues',{...d,writable:!d.writable})}
    const meta=bg.IBGBaseDeductorUser.__metadata.members.find(m=>m.name==='GetName').attr[0];
    if(mode==='pre-metadata-accessor')Object.defineProperty(meta,'MethodIndex',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='pre-metadata-value')meta.MethodIndex=9999;
    if(mode==='pre-reader-replacement')rpc.TBGMessageDynamicData.$FRegisteredPropertyValueReaders[1973]=()=>'';
    const get=connection.GetCurrentUser();await get;let refused=false;try{__loginomOriginalUserPublisherV1.inspect()}catch{refused=true}
    return {pre:true,refused,getters:propertyGetters,dispatches};
   }
   const get=connection.GetCurrentUser();const set=bg.app.CurrentUser.Set(await get);try{await set}catch(e){throw Error(JSON.stringify({message:e.get_message?.()??e.message,inner:e.get_innerException?.()?.message,original:e.get_innerException?.()?._error?.stack??e._error?.stack,stack:e.get_stack?.()??e.stack,js:e.get_jsError?.()?.stack,own:Object.getOwnPropertyNames(e)}))};
   globalThis.fixtureGet=get;globalThis.fixtureSet=set;
   let ready=false,last;for(let n=0;n<100;n++){try{__loginomOriginalUserPublisherV1.inspect();ready=true;break}catch(e){last=e}await new Promise(r=>setTimeout(r,1))}if(!ready)throw last;
   return {dispatches,method,selected,name:bg.app.CurrentUser.Get().Name,sameUser:__loginomOriginalUserPublisherV1.inspect().user===user,
    methodsUnchanged:rpc.TBGSession.SelectPropertyDescs===select&&rpc.TBGSession.GetPropertyValues===getValues,
    dictionary:user.constructor.__SelectorDict.Name.GetterMethodIndex,
    operands:(()=>{const d=__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions,p=d.propertyOperands;
      return {complete:p.complete,same:p===d.initialLoad.propertyOperands,frozen:Object.isFrozen(p)&&Object.isFrozen(p.definitions),
       select:p.definitions['rpc.SelectPropertyDescs'].value===select,values:p.definitions['rpc.GetPropertyValues'].value===getValues,
       metadata:p.definitions['IBGBaseDeductorUser.metadata'].value===bg.IBGBaseDeductorUser.__metadata,
       count:Object.keys(p.definitions).length,extra:p.additionalRecords.length,closure:p.closureIdentityQualified,native:p.nativeAuthority};})()};
  },mode);
  if(mode.startsWith('pre-')){assert.deepEqual(result,{pre:true,refused:true,getters:0,dispatches:0});return}
  t.diagnostic(JSON.stringify(result));assert.equal(result.dispatches,1);assert.equal(result.name,'account');assert.equal(result.methodsUnchanged,true);assert.equal(result.sameUser,true);assert.equal(result.dictionary,1973);assert.deepEqual(result.selected,[5,1973,1978,1979,1980,1981,1985,1983,1987,1976]);assert.equal(result.method,7);
  for(const k of ['complete','same','frozen','select','values','metadata'])assert.equal(result.operands[k],true,k);assert.equal(result.operands.extra,3);assert.equal(result.operands.closure,false);assert.equal(result.operands.native,false);
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);
  const bound=await api.bindTerminalScriptWitness(owner);
  assert.equal(bound.selectedInitialExecutionJoined,true);assert.equal(bound.supportedInitialLoadJoined,true);
  assert.equal(bound.page,page);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.originalInitTask,init);
  assert.equal(await bound.recheck(),bound);
  if(mode.startsWith('post-')){
   await page.evaluate(mode=>{
    if(mode==='post-method-accessor')Object.defineProperty(rpc.TBGSession,'GetPropertyValues',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='post-helper-prototype')Object.setPrototypeOf(rtl.RemoteMetaHelper,Object.create(Object.getPrototypeOf(rtl.RemoteMetaHelper)));
    if(mode==='post-metadata-flags'){const m=bg.IBGBaseDeductorUser.__metadata.members[0].attr[0],d=Object.getOwnPropertyDescriptor(m,'MethodIndex');Object.defineProperty(m,'MethodIndex',{...d,writable:!d.writable})}
   },mode);
   const failed=bound.recheck();await assert.rejects(failed,/UNAVAILABLE/);assert.equal(bound.recheck(),failed);assert.equal(await page.evaluate(()=>propertyGetters),0);
  }

  for(const k of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[k],false);
  for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','sourceBytesVerified'])assert.equal(load.facts[k],false);
  assert.equal(requests,20);assert.equal(fulfills,20);assert.equal(unexpected,0);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({mode,requests,fulfills,realRequestFrameAndFulfill:true,fetchBodyAndRootSessionDoubles:true,supportedInitialLoadJoined:bound?.supportedInitialLoadJoined??false,actualInitCount,allAuthoritiesFalse:true}));
 }finally{await context.close()}
});
}finally{test.after(()=>browser.close())}
