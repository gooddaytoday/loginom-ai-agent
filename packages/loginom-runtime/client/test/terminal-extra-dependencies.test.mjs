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
try{
for(const mode of ['joined','query','core-only','missing-host','sri-only','dto-only','hash','full-url','duplicate','accessor','url-object','url-normalized','node-drift','metadata-recheck','bad-bytes'])test('extra3 association '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:mode==='core-only'?html.replace(JSON.stringify(urls),JSON.stringify(urls.filter(u=>!propertyPins.some(p=>p.url===u)))):mode==='query'?html.replace(JSON.stringify(urls),JSON.stringify(urls.map(u=>propertyPins.some(p=>p.url===u)?u+'?_dc=123':u))):html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
  const nativeRoute=page.route,frame=page.mainFrame();let selectedDone;const selectedTask=new Promise(resolve=>selectedDone=resolve);
  const routed=function(pattern,handler){return Reflect.apply(nativeRoute,page,[pattern,async route=>{
   // Native original request/frame and actual fulfill task, fixed offline fetch/body adapter.
   const request=route.request(),url=request.url();assert.equal(request.frame(),frame);
   if(mode==='missing-host'&&url.split('?')[0].endsWith('/Int64.js'))return route.fulfill({contentType:'application/javascript',body:bodies.get(url.split('?')[0])});requests++;
   const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript; charset=utf-8'}),body:()=>Promise.resolve(mode==='bad-bytes'&&url.split('?')[0].endsWith('/Int64.js')?Buffer.from(bodies.get(url.split('?')[0])).fill(32):bodies.get(url.split('?')[0]))};
   const adapter={request:()=>request,fetch:()=>Promise.resolve(response),fulfill(options){fulfills++;const{response:ignored,...rest}=options;return route.fulfill(rest)},abort:reason=>route.abort(reason)};
   await handler(adapter);if(requests===(expectedResponses-(mode==='missing-host'?1:mode==='core-only'?3:0))&&fulfills===requests)selectedDone();
  }])};
  Object.defineProperty(page,'route',{value:routed,writable:true,configurable:true});
  let owner,projections=0,handles=0,getters=0;
  const originalHandle=page.evaluateHandle;
  if(mode!=='dto-only')Object.defineProperty(page,'evaluateHandle',{value:function(fn,args){handles++;return Reflect.apply(originalHandle,page,[fn,args]).then(handle=>{
   const originalEvaluate=handle.evaluate;Object.defineProperty(handle,'evaluate',{value:function(fn){projections++;return Reflect.apply(originalEvaluate,handle,[fn]).then(summary=>{
    const rows=summary.extraDependencies;
    if(mode==='sri-only')delete summary.extraDependencies;
    if(mode==='hash'||mode==='metadata-recheck'&&projections>1)rows[0].integrity='sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    if(mode==='full-url'){const url=new URL(rows[0].url);url.search='?_dc=999';rows[0].url=url.href}
    if(mode==='duplicate')rows[1]={...rows[0]};
    if(mode==='accessor')Object.defineProperty(rows[0],'url',{get(){getters++;throw Error('foreign')},configurable:true});
    if(mode==='url-normalized')rows[0].url=' '+rows[0].url;
    if(mode==='url-object'){const url=rows[0].url;rows[0].url={toString(){getters++;return url}}}
    return summary;
   })},configurable:true});return handle;
  })},configurable:true});
  const selectedPage=mode==='dto-only'?{goto:page.goto.bind(page),evaluate:page.evaluate.bind(page),locator:page.locator.bind(page),route:routed,mainFrame:page.mainFrame.bind(page)}:page;
  const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};
  api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state);owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');owner.context=context;load.bindContext(context);owner.page=selectedPage;load.bindPage(selectedPage);
  await api.prepareTerminalSourceResponses(owner);
  const init=load.init((terminalSourceIntegrityScript()+'\n')+terminalUserPublisherScript(candidate.url)+';\nglobalThis.__loginomStartupV1={document,id:"original",account:"account"}');actualInitCount++;await load.observed(init);load.admitPage(selectedPage,candidate);await page.goto(address,{waitUntil:'load'});
  if(mode==='bad-bytes'){await assert.rejects(page.evaluate(()=>loaderTask));assert.equal(load.inspect().sourceResponses.extraResponseBytesComplete,false);assert.equal(handles,0);return;}
  await page.evaluate(()=>loaderTask);await selectedTask;load.guard();if(mode==='core-only'){assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);assert.equal(load.inspect().sourceResponses.extraResponseBytesComplete,false);assert.equal(requests,20);assert.equal(handles,0);return;}t.diagnostic(JSON.stringify({pageErrors:errors}));
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
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);assert.equal(load.inspect().sourceResponses.extraResponseBytesComplete,mode!=='missing-host');
  if(mode==='missing-host'){await assert.rejects(api.bindTerminalScriptWitness(owner),/LOAD_CHANGED/);assert.equal(handles,1);return}
  if(['dto-only','hash','full-url','duplicate','accessor','url-object','url-normalized'].includes(mode)){
   await assert.rejects(api.bindTerminalScriptWitness(owner),/LOAD_CHANGED|ASSOCIATION_CHANGED/);assert.equal(getters,0);return;
  }
  const bound=await api.bindTerminalScriptWitness(owner);
  assert.equal(bound.selectedInitialExecutionJoined,true);assert.equal(bound.supportedInitialLoadJoined,true);
  assert.equal(bound.extraDependenciesJoined,mode!=='sri-only');assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.page,page);assert.equal(bound.originalInitTask,init);assert.equal(handles,1);
  if(mode==='sri-only'){assert.equal(bound.extraDependenciesReason,'ORIGINAL_EXTRA_DEPENDENCIES_UNAVAILABLE');assert.equal(bound.extraDependencies.length,0);return}
  assert.equal(bound.extraDependencies.length,3);const responses=load.inspect().sourceResponses;
  for(const row of bound.extraDependencies){assert.equal(row.responseReceipt,responses.records.find(r=>r.url===row.url&&r.pinUrl===row.pinUrl));assert.equal(row.integrity,'sha256-'+Buffer.from(row.responseReceipt.sha256,'hex').toString('base64'));}
  if(mode==='node-drift')await page.evaluate(()=>__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions.propertyOperands.additionalRecords[0].node.remove());
  if(['node-drift','metadata-recheck'].includes(mode)){const rejected=bound.recheck();await assert.rejects(rejected,/UNAVAILABLE|LOAD_CHANGED/);assert.equal(bound.recheck(),rejected);assert.equal(handles,1);return;}
  assert.equal(await bound.recheck(),bound);assert.equal(handles,1);
  for(const key of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[key],false);
  assert.equal(load.facts.sourceBytesVerified,false);assert.equal(requests,23);assert.equal(fulfills,23);assert.equal(unexpected,0);assert.deepEqual(errors,[]);assert.equal(getters,0);
  t.diagnostic(JSON.stringify({mode,requests,fulfills,handles,extraDependenciesJoined:bound.extraDependenciesJoined,rootAndNativeSessionDoubles:true,realChromiumDomSriHandle:true}));
 }finally{await context.close()}
});
}finally{test.after(()=>browser.close())}
