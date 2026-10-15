// Original lower class/member/public getter and native Saltarelle tasks; remote transport/user are offline fixtures. Real Chromium/DOM/SRI/request/frame/fulfill.
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
for(const mode of ['lower-original','post-method-accessor','post-public-reader','post-member-flags','post-constructor','post-base-prototype','post-method-prototype','pending-resolver','pending-method-prototype','pending-public-reader','native-rejection'])test('lower-definition '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
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
  const result=await page.evaluate(async mode=>{
   const select=rpc.TBGSession.SelectPropertyDescs,getValues=rpc.TBGSession.GetPropertyValues;
   const user=Object.create(bg.rpc.TIBGDeductorUser_Proxy.prototype);
   const message=new rpc.TBGBinaryMessage();let dispatches=0,method,selected;
   const transport={$M:message,$R(w,o,type){globalThis.resolverCalls=(globalThis.resolverCalls||0)+1;if(w!==1||o!==2||type!==703)throw Error('foreign outcome');return user},DispatchMessageAsync(request){
    if(request.get_MethodID()===1792){globalThis.lowerDispatches=(globalThis.lowerDispatches||0)+1;
     globalThis.lowerDispatchTask=new ss.TaskCompletionSource();globalThis.lowerRequest=request;
     const response=message.GetDynamicData();response.set_StaticDataSize(16);response.InitializeResponseMessage(request.get_MessageID());response.WriteParameter$a(0,1);response.WriteParameter$a(4,2);globalThis.lowerResponse=response;
     if(mode==='native-rejection'){globalThis.originalWireError=new ss.Exception('wire failure');originalWireError.cause=0;queueMicrotask(()=>lowerDispatchTask.setException(originalWireError))}
     else if(!mode.startsWith('pending-'))queueMicrotask(()=>lowerDispatchTask.setResult(response));return lowerDispatchTask.task;
    }
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
   const connection=Object.create(bg.app.ServerConnection.prototype);const session=Object.create(bg.rpc.TIBGBaseDeductorServerSession_Proxy.prototype);session.$S=transport;session.$={$OW:1,$O:10};
   globalThis.nativeSlot=Object.getOwnPropertyDescriptor(bg.rpc.TIBGBaseDeductorServerSession_Proxy.prototype,'CurrentUser');
   if(!nativeSlot||nativeSlot.get!==bg.rpc.TIBGBaseDeductorServerSession_Proxy.prototype.get_CurrentUser)throw Error('ORIGINAL_PUBLIC_READER_MISSING');
   connection.FSession=session;
   globalThis.propertyGetters=0;
   globalThis.actualLower=bg.rpc.TIBGBaseDeductorServerSession_Proxy.prototype.get_CurrentUser;const get=connection.GetCurrentUser();
   if(mode.startsWith('pending-')){
    let settled=false;get.then(()=>{settled=true},()=>{settled=true});
    globalThis.propertyGetters=0;
    if(mode==='pending-resolver')Object.defineProperty(transport,'$R',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='pending-method-prototype'){
     Object.setPrototypeOf(actualLower,Object.create(Object.getPrototypeOf(actualLower)));
    }
    if(mode==='pending-public-reader')Object.defineProperty(session,'CurrentUser',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    lowerDispatchTask.setResult(lowerResponse);await new Promise(r=>setTimeout(r,10));
    let refused=false;try{__loginomOriginalUserPublisherV1.inspect()}catch{refused=true}
    return {pending:true,refused,settled,getters:propertyGetters,resolverCalls:globalThis.resolverCalls||0,lowerDispatches};
   }
   if(mode==='native-rejection'){
    let actual;try{await get}catch(e){actual=e}
    Object.defineProperty(rpc.TBGSession,'GetPropertyValues',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    let caught;try{__loginomOriginalUserPublisherV1.inspect()}catch(e){caught=e}
    return {rejected:true,sameGet:actual===originalWireError,sameInspect:caught===actual,cause:caught.cause,getters:propertyGetters};
   }
   const set=bg.app.CurrentUser.Set(await get);try{await set}catch(e){throw Error(JSON.stringify({message:e.get_message?.()??e.message,inner:e.get_innerException?.()?.message,original:e.get_innerException?.()?._error?.stack??e._error?.stack,stack:e.get_stack?.()??e.stack,js:e.get_jsError?.()?.stack,own:Object.getOwnPropertyNames(e)}))};
   globalThis.fixtureGet=get;globalThis.fixtureSet=set;
   let ready=false,last;for(let n=0;n<100;n++){try{__loginomOriginalUserPublisherV1.inspect();ready=true;break}catch(e){last=e}await new Promise(r=>setTimeout(r,1))}if(!ready)throw last;
   return {dispatches,method,selected,name:bg.app.CurrentUser.Get().Name,sameUser:__loginomOriginalUserPublisherV1.inspect().user===user,
    methodsUnchanged:rpc.TBGSession.SelectPropertyDescs===select&&rpc.TBGSession.GetPropertyValues===getValues,
    dictionary:user.constructor.__SelectorDict.Name.GetterMethodIndex,
    lower:(()=>{const a=__loginomOriginalUserPublisherV1.inspect().acquisition,d=a.loadedDefinitions.lowerSessionDefinition,l=a.lower;
      return {definition:d.complete,linked:l?.definition===d,method:l?.method===actualLower,table:d.members.get_CurrentUser===actualLower,
       proto:d.prototype===Object.getPrototypeOf(session),receiver:d.receiver===ss,ctor:d.ctor===bg.rpc.TIBGBaseDeductorServerSession_Proxy,
       assembly:d.assembly===d.ctor.__assembly,base:d.basePrototype===d.baseType.prototype,
       sameNode:d.birth.script===d.execution.script,sameReceipt:d.birth.integrityReceipt===d.execution.integrityReceipt,
       completion:a.rpcCompletionVerified,dispatch:l?.dispatchTask===lowerDispatchTask.task,response:l?.response===lowerResponse,
       w:l?.w,o:l?.o,type:l?.type,resolverCalls,lowerDispatches,restored:!Object.hasOwn(session,'CurrentUser')&&Object.getOwnPropertyDescriptor(d.prototype,'CurrentUser').get===nativeSlot.get,virtualAccessorFixture:!nativeSlot,closure:d.closureIdentityQualified};})(),
    operands:(()=>{const d=__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions,p=d.propertyOperands;
      return {complete:p.complete,same:p===d.initialLoad.propertyOperands,frozen:Object.isFrozen(p)&&Object.isFrozen(p.definitions),
       select:p.definitions['rpc.SelectPropertyDescs'].value===select,values:p.definitions['rpc.GetPropertyValues'].value===getValues,
       metadata:p.definitions['IBGBaseDeductorUser.metadata'].value===bg.IBGBaseDeductorUser.__metadata,
       count:Object.keys(p.definitions).length,extra:p.additionalRecords.length,closure:p.closureIdentityQualified,native:p.nativeAuthority};})()};
  },mode);
  if(mode.startsWith('pending-')){assert.deepEqual(result,{pending:true,refused:true,settled:false,getters:0,resolverCalls:0,lowerDispatches:1});return}
  if(mode==='native-rejection'){assert.deepEqual(result,{rejected:true,sameGet:true,sameInspect:true,cause:0,getters:0});return}
  t.diagnostic(JSON.stringify(result));for(const k of ['definition','linked','method','table','proto','receiver','ctor','assembly','base','sameNode','sameReceipt','completion','dispatch','response','restored'])assert.equal(result.lower[k],true,k);assert.equal(result.lower.resolverCalls,1);assert.equal(result.lower.lowerDispatches,1);assert.equal(result.lower.w,1);assert.equal(result.lower.o,2);assert.equal(result.lower.type,703);assert.equal(result.lower.closure,false);assert.equal(result.lower.virtualAccessorFixture,false);assert.equal(result.dispatches,1);assert.equal(result.name,'account');assert.equal(result.methodsUnchanged,true);assert.equal(result.sameUser,true);assert.equal(result.dictionary,1973);assert.deepEqual(result.selected,[5,1973,1978,1979,1980,1981,1985,1983,1987,1976]);assert.equal(result.method,7);
  for(const k of ['complete','same','frozen','select','values','metadata'])assert.equal(result.operands[k],true,k);assert.equal(result.operands.extra,3);assert.equal(result.operands.closure,false);assert.equal(result.operands.native,false);
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);
  const bound=await api.bindTerminalScriptWitness(owner);
  assert.equal(bound.selectedInitialExecutionJoined,true);assert.equal(bound.supportedInitialLoadJoined,true);
  assert.equal(bound.page,page);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.originalInitTask,init);
  assert.equal(await bound.recheck(),bound);
  if(mode.startsWith('post-')){
   await page.evaluate(mode=>{
    const d=__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions.lowerSessionDefinition;
    if(mode==='post-method-accessor')Object.defineProperty(d.prototype,'get_CurrentUser',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='post-public-reader')Object.defineProperty(d.prototype,'CurrentUser',{get(){propertyGetters++;throw Error('foreign')},configurable:true});
    if(mode==='post-member-flags'){const own=Object.getOwnPropertyDescriptor(d.members,'get_CurrentUser');Object.defineProperty(d.members,'get_CurrentUser',{...own,writable:!own.writable})}
    if(mode==='post-constructor')bg.rpc.TIBGBaseDeductorServerSession_Proxy=function foreign(){};
    if(mode==='post-base-prototype')d.baseType.prototype=Object.create(d.basePrototype);
    if(mode==='post-method-prototype')Object.setPrototypeOf(d.method,Object.create(Object.getPrototypeOf(d.method)));
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
