// Dedicated new initializer-call provenance control. Actual complete IIFEs,
// Page/DOM/SRI/JSHandle; offline root/session/transport response remain doubles.
// New extra3 host receipts on original Page/JSHandle and SRI/load association.
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
const expectedResponses=responsePins.length+propertyPins.length;
const iifePins=(await read('terminal-iife-inputs.json')).inputs,input=process.env.TERMINAL_IIFE_INPUT_DIR;assert(input);
const bodies=new Map();for(const p of [...responsePins,...iifePins,...propertyPins]){const b=await readFile(input+'/'+p.url.split('/').at(-1));assert.equal(b.length,p.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);bodies.set(p.url,b)}
const order=['__extends.js','__awaiter.js','__helpers.js','SysUtils.js','mscorlib.js','Int64.js','rtl.imp.js','bg.mscorlib.js','BitConverter.js','CustomProxyClassBuilder.js','Task.js','rtl.js','rpc.js','bg.rtl.js','bg.rtl.rpc.js','bg.model.js','bg.model.rpc.js','BG_Interfaces.js','__virtual.js','PropertySelector.js','BG_System.js','ServerConnection.js','User.js'];
const urls=order.map(n=>[...iifePins,...propertyPins].find(p=>p.url.endsWith('/'+n)).url),unused=responsePins.filter(p=>!urls.includes(p.url));
const loader=await readFile(input+'/Loader.js','utf8');assert.equal(createHash('sha256').update(loader).digest('hex'),'543fc4c07ef270ab55f1055fcaf97f8f471d308a0877a3b3aef029ac0fa61f3b');
const address='https://app.loginom.ai/app/offline-initial-execution';
const html='<!doctype html><meta charset="utf-8">'+unused.map(p=>'<link rel="preload" as="script" href="'+p.url+'">').join('')+'<script>'+loader+'</script><script>globalThis.Debug=globalThis.debug={assert(){}};globalThis.loaderTask=(async()=>{for(const url of '+JSON.stringify(urls)+'){await bg.AddScriptAsync(url,false)}})();</script>';


const browser=await chromium.launch({headless:true});
test('initializer call browser original three IIFE calls retain same pre-call operands and completion',async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let requests=0,fulfills=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',route=>{const url=route.request().url();if(url===address)return route.fulfill({contentType:'text/html',body:html});const body=bodies.get(url);assert(body);return route.fulfill({contentType:'application/javascript',body})});
  const nativeRoute=page.route,frame=page.mainFrame();let selectedDone;const selectedTask=new Promise(resolve=>selectedDone=resolve);
  Object.defineProperty(page,'route',{value:function(pattern,handler){return Reflect.apply(nativeRoute,page,[pattern,async route=>{
   const request=route.request(),url=request.url();requests++;
   const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript'}),body:()=>Promise.resolve(bodies.get(url.split('?')[0]))};
   await handler({request:()=>request,fetch:()=>Promise.resolve(response),fulfill(options){fulfills++;const {response:ignored,...rest}=options;return route.fulfill(rest)},abort:reason=>route.abort(reason)});
   if(requests===23&&fulfills===23)selectedDone();
  }])},configurable:true});
  let owner;const selectedPage=page;
  const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};
  api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state);owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');owner.context=context;load.bindContext(context);owner.page=selectedPage;load.bindPage(selectedPage);
  await api.prepareTerminalSourceResponses(owner);
  const init=load.init((terminalSourceIntegrityScript()+'\n')+terminalUserPublisherScript(candidate.url)+';\nglobalThis.__loginomStartupV1={document,id:"original",account:"account"}');actualInitCount++;await load.observed(init);load.admitPage(selectedPage,candidate);await page.goto(address,{waitUntil:'load'});

  await page.evaluate(()=>loaderTask);await selectedTask;load.guard();
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
  },'original-property');
  t.diagnostic(JSON.stringify(result));assert.equal(result.dispatches,1);assert.equal(result.name,'account');assert.equal(result.methodsUnchanged,true);assert.equal(result.sameUser,true);assert.equal(result.dictionary,1973);assert.deepEqual(result.selected,[5,1973,1978,1979,1980,1981,1985,1983,1987,1976]);assert.equal(result.method,7);
  for(const k of ['complete','same','frozen','select','values','metadata'])assert.equal(result.operands[k],true,k);assert.equal(result.operands.extra,3);assert.equal(result.operands.closure,false);assert.equal(result.operands.native,false);

  const proof=await page.evaluate(()=>{
   const records=__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions.initializers.records;
   return records.map((r,i)=>({kind:r.kind,ordinal:r.call.ordinal,before:r.call.beforeOriginalCall,
    sameInitializer:r.call.initializer===r.initializer,sameCtor:r.call.ctor===r.ctor,sameAssembly:r.call.assembly===r.assembly,sameMembers:r.call.members===r.members,
    sameReceiver:r.call.receiver===ss,sameArguments:r.call.arguments[0]===r.ctor&&r.call.arguments[1]===r.assembly&&r.call.arguments[2]===r.members,
    sameValues:r.call.values[0]===r.ctor&&r.call.values[1]===r.assembly&&r.call.values[2]===r.members,
    completion:r.completion.call===r.call&&r.completion.originalReturned&&r.completion.returned===undefined,
    frozen:Object.isFrozen(r.call)&&Object.isFrozen(r.completion),url:r.execution.url,
    closure:r.call.closureIdentityQualified,native:r.call.nativeReceiversQualified}));
  });
  assert.deepEqual(proof.map(r=>r.kind),['ObjectProxy','FileStorage','StreamPersist']);
  for(let i=0;i<3;i++){const r=proof[i];assert.equal(r.ordinal,i);for(const key of ['before','sameInitializer','sameCtor','sameAssembly','sameMembers','sameReceiver','sameArguments','sameValues','completion','frozen'])assert.equal(r[key],true,key);assert.equal(r.closure,false);assert.equal(r.native,false);assert(r.url.endsWith(i===0?'/rpc.js':'/bg.rtl.rpc.js'))}
  const bound=await api.bindTerminalScriptWitness(owner);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(await bound.recheck(),bound);
  for(const key of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[key],false);
  assert.equal(requests,23);assert.equal(fulfills,23);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({proof,requests,fulfills,actualInitCount,realIifesAndHandle:true,offlineNativeResponse:true}));
 }finally{await context.close()}
});
test.after(()=>browser.close());
