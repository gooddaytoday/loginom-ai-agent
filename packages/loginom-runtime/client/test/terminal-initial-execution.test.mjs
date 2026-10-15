// Real Chromium/Page/JSHandle/DOM/SRI/IIFEs and original request/frame/fulfill.
// Root/admission/account/session/user/selector and fetch/body responses are doubles.
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
for(const mode of ['original','missing-sri','wrong-hash','partial','getter','unobserved','wrong-url','no-handle','post-node-drift','post-metadata-drift','raw-false','raw-cause0'])test('initial-execution '+mode,{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0,requests=0,fulfills=0,handleCreates=0,projections=0,getters=0,actualInitCount=0;
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.route('**/*',async route=>{const u=route.request().url();if(u===address)return route.fulfill({contentType:'text/html',body:html});const b=bodies.get(u);if(!b){unexpected++;return route.abort()}return route.fulfill({contentType:'application/javascript',body:b})});
  const nativeRoute=page.route,nativeHandle=page.evaluateHandle,frame=page.mainFrame();let selectedDone;const selectedTask=new Promise(resolve=>selectedDone=resolve);
  const routed=function(pattern,handler){return Reflect.apply(nativeRoute,page,[pattern,async route=>{
   // Native original request/frame and actual fulfill task, fixed offline fetch/body adapter.
   const request=route.request(),url=request.url();assert.equal(request.frame(),frame);requests++;
   const response={url:()=>url,status:()=>200,headers:()=>({'content-type':'application/javascript; charset=utf-8'}),body:()=>Promise.resolve(bodies.get(url))};
   const adapter={request:()=>request,fetch:()=>Promise.resolve(response),fulfill(options){fulfills++;const{response:ignored,...rest}=options;return route.fulfill(rest)},abort:reason=>route.abort(reason)};
   await handler(adapter);if(requests===responsePins.length&&fulfills===responsePins.length)selectedDone();
  }])};
  Object.defineProperty(page,'route',{value:routed,writable:true,configurable:true});
  let owner;const injected=['wrong-hash','partial','getter','unobserved','wrong-url','post-metadata-drift','raw-false','raw-cause0'].includes(mode);
  const raw=mode==='raw-false'?false:Error('original projection',{cause:0});
  if(injected)Object.defineProperty(page,'evaluateHandle',{value:function(fn,args){handleCreates++;return Reflect.apply(nativeHandle,page,[fn,args]).then(handle=>{
   const originalEvaluate=handle.evaluate;Object.defineProperty(handle,'evaluate',{value:function(project){projections++;return Reflect.apply(originalEvaluate,handle,[project]).then(result=>{
    if(mode==='raw-false'||mode==='raw-cause0'){owner.page={};throw raw}
    if(mode==='wrong-hash'||(mode==='post-metadata-drift'&&projections>1))result.rows[0].integrity='sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    if(mode==='partial')for(const k of ['integrity','armedBeforeSource','initialExecutionObserved'])delete result.rows[4][k];
    if(mode==='getter')Object.defineProperty(result.rows[0],'integrity',{get(){getters++;throw Error('foreign getter')},configurable:true});
    if(mode==='unobserved')result.rows[0].initialExecutionObserved=false;
    if(mode==='wrong-url')result.rows[0].url+='?_dc=foreign';
    return result;
   })},writable:true,configurable:true});return handle})},writable:true,configurable:true});
  const selectedPage=mode==='no-handle'?{route:routed,goto:(...a)=>page.goto(...a),evaluate:(...a)=>page.evaluate(...a),locator:(...a)=>page.locator(...a),mainFrame:()=>frame}:page;
  const capture={revision:1,harness:'sorting-before-close-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account',packagePath:'/account/original.lgp',admission:'original',expires:Date.now()+600000},candidate={username:'account',url:'https://app.loginom.ai/app'},state={},message={id:'start',operation:'start',input:{generation:1,chat:'chat',validation:false,connection:candidate,acceptanceCapture:capture},rootOrigin:{originId:'root',deadline:Date.now()+7200000,parentPid:1,hostPid:2,childPid:3,generation:1,chat:'chat',loadPurpose:{...capture,purpose:'sorting-terminal-source-v1'}}};
  api.receiveManagedRootStart(message,state,2,3);const load=api.retainTerminalSourceStartup(message,state);owner={directory:'/own',generation:1,chat:'chat',id:'original',account:'account',origin:'https://app.loginom.ai'};state.startupOwner=owner;load.bindOwner(owner,'/own/profile');load.admitBrowser(owner,candidate,'/own/profile');owner.context=context;load.bindContext(context);owner.page=selectedPage;load.bindPage(selectedPage);
  await api.prepareTerminalSourceResponses(owner);
  const init=load.init((mode==='missing-sri'?'':terminalSourceIntegrityScript()+'\n')+terminalUserPublisherScript(candidate.url)+';\nglobalThis.__loginomStartupV1={document,id:"original",account:"account"}');actualInitCount++;await load.observed(init);load.admitPage(selectedPage,candidate);await page.goto(address,{waitUntil:'load'});await page.evaluate(()=>loaderTask);await selectedTask;load.guard();
  await page.evaluate(async()=>{let selectors=0;bg.selectAsync=async source=>{selectors++;return accept=>accept(source)};const user=Object.create(rpc.TBGObjectProxy.prototype);user.$S={};user.$={$OW:1,$O:2};Object.assign(user,{Name:'account',IsAdmin:false,IsViewer:false,IsDesigner:true,Blocked:false,AllowPublish:false,SchedulerFullAccess:false,MustChangePassword:false,AuthMode:0});const connection=Object.create(bg.app.ServerConnection.prototype);connection.FSession={CurrentUser:user,$S:user.$S};const get=connection.GetCurrentUser();await bg.app.CurrentUser.Set(await get);let ready=false,last;for(let n=0;n<100;n++){try{__loginomOriginalUserPublisherV1.inspect();ready=true;break}catch(e){last=e}await new Promise(r=>setTimeout(r,1))}if(!ready)throw last;globalThis.fixtureSelectorCount=selectors});
  assert.equal(load.inspect().sourceResponses.responseBytesComplete,true);let bound,caught,refused=false;
  try{bound=await api.bindTerminalScriptWitness(owner)}catch(e){caught=e;refused=true}
  const expectedRefusal=['wrong-hash','partial','getter','unobserved','wrong-url','no-handle','raw-false','raw-cause0'].includes(mode);
  assert.equal(refused,expectedRefusal);assert.equal(getters,0);
  if(mode==='raw-false'||mode==='raw-cause0')assert.equal(caught,raw);
  else if(expectedRefusal)assert.match(String(caught),mode==='getter'?/ORIGINAL_ASSOCIATION_CHANGED/:/ORIGINAL_LOAD_CHANGED/);
  else{
   assert.equal(bound.selectedInitialExecutionJoined,mode!=='missing-sri');assert.equal(bound.initialExecutionReason,mode==='missing-sri'?'ORIGINAL_SRI_RECEIPTS_UNAVAILABLE':undefined);
   assert.equal(bound.page,selectedPage);assert.equal(bound.realmHandle,await bound.realmHandleTask);assert.equal(bound.originalInitTask,init);
   assert.equal(bound.matches[3].responseReceipt,bound.matches[4].responseReceipt);if(mode==='post-metadata-drift'){const failed=bound.recheck();await assert.rejects(failed,/LOAD_CHANGED/);assert.equal(bound.recheck(),failed);assert.equal(projections,2)}else assert.equal(await bound.recheck(),bound);
   if(mode!=='missing-sri')for(const m of bound.matches){assert.equal(m.integrity,'sha256-'+Buffer.from(m.responseReceipt.sha256,'hex').toString('base64'));assert.equal(m.initialExecutionObserved,true);assert.equal(m.armedBeforeSource,true);assert.equal(m.responseReceipt.frame,frame);assert.equal(m.responseReceipt.url,m.url)}
   for(const k of ['sourceExecutionQualified','closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(bound[k],false);
   if(mode==='post-node-drift'){await page.evaluate(()=>__loginomOriginalUserPublisherV1.inspect().acquisition.loadedDefinitions.initializers.records[0].execution.script.remove());await assert.rejects(bound.recheck(),/UNAVAILABLE/)}
  }

  for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','sourceBytesVerified'])assert.equal(load.facts[k],false);
  assert.equal(requests,20);assert.equal(fulfills,20);assert.equal(unexpected,0);assert.equal(await page.evaluate(()=>fixtureSelectorCount),1);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify({mode,requests,fulfills,realRequestFrameAndFulfill:true,fetchBodyAndRootSessionDoubles:true,initialExecutionJoined:bound?.selectedInitialExecutionJoined??false,refused,handleCreates,projections,getters,actualInitCount,allAuthoritiesFalse:true}));
 }finally{await context.close()}
});
}finally{test.after(()=>browser.close())}
