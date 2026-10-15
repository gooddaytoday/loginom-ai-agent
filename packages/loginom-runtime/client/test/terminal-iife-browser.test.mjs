// Real local Chromium/DOM/script execution, production publisher and full pinned IIFEs.
// Document loader/transport/session/cached-user/selector are offline doubles. No Loginom login/native.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const runtime=process.env.TERMINAL_IIFE_RUNTIME_ROOT?new URL('file://'+process.env.TERMINAL_IIFE_RUNTIME_ROOT+'/'):new URL('../../',import.meta.url);
const {chromium}=await import(new URL('client/node_modules/playwright/index.mjs',runtime));
const witness=await import(new URL('client/lib/terminal-script-witness.mjs',runtime));
const {terminalUserPublisherScript}=await import(new URL('client/lib/terminal-user-publisher.mjs',runtime));
const pins=JSON.parse(await readFile(new URL('../../../../docs/testing/loginom-ai-agent/terminal-iife-inputs.json',import.meta.url),'utf8')).inputs;
const input=process.env.TERMINAL_IIFE_INPUT_DIR;
assert(input,'TERMINAL_IIFE_INPUT_DIR must name the preserved pinned inputs');
const contents=new Map();
for(const pin of pins){const body=await readFile(input+'/'+pin.url.split('/').at(-1));assert.equal(body.length,pin.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),pin.sha256);contents.set(pin.url,body)}
const order=['__extends.js','__awaiter.js','__helpers.js','mscorlib.js','rtl.imp.js','bg.mscorlib.js','CustomProxyClassBuilder.js','Task.js','rtl.js','rpc.js','bg.rtl.js','bg.rtl.rpc.js','bg.model.js','bg.model.rpc.js','BG_Interfaces.js','__virtual.js','PropertySelector.js','BG_System.js','ServerConnection.js','User.js'];
const html='<!doctype html><meta charset="utf-8"><script>globalThis.Debug=globalThis.debug={assert(){}}</script>'+order.map(name=>'<script src="'+pins.find(p=>p.url.endsWith('/'+name)).url+'"></script>').join('');
const browser=await chromium.launch({headless:true});
try{
for(const mode of ['genuine','method-drift','script-drift','missing-body','loadbind'])test((mode==='loadbind'?'loadbind real browser original capsule':'full-IIFE local browser '+mode),{concurrency:false},async t=>{
 const context=await browser.newContext({serviceWorkers:'block'});let unexpected=0;const delivered=[],errors=[];
 try{
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',async route=>{const request=route.request(),url=request.url();
   if(url==='https://app.loginom.ai/app/offline-terminal-iife'){await route.fulfill({contentType:'text/html',body:html});return}
   const bytes=contents.get(url);if(!bytes||request.method()!=='GET'||request.resourceType()!=='script'){unexpected++;await route.abort();return}
   delivered.push(url);await route.fulfill({contentType:'application/javascript; charset=utf-8',body:mode==='missing-body'&&url.endsWith('/rpc.js')?'':bytes});
  });
  await page.addInitScript({content:terminalUserPublisherScript('https://app.loginom.ai/app')});
  await page.goto('https://app.loginom.ai/app/offline-terminal-iife',{waitUntil:'load'});
  const result=await page.evaluate(async mode=>{
   // Only this UI projection selector is doubled; the actual original Get/Set/Init
   // and every defining IIFE constructor/member/dependency run unmodified.
   let selectorCalls=0;bg.selectAsync=async function(source){selectorCalls++;return accept=>accept(source)};
   const transport={},user=Object.create(rpc.TBGObjectProxy.prototype);user.$S=transport;user.$={$OW:1,$O:2};
   Object.assign(user,{Name:'offline-account',IsAdmin:false,IsViewer:false,IsDesigner:true,Blocked:false,AllowPublish:false,SchedulerFullAccess:false,MustChangePassword:false,AuthMode:0});
   const connection=Object.create(bg.app.ServerConnection.prototype);connection.FSession={CurrentUser:user,$S:transport};
   const getTask=connection.GetCurrentUser();const acquired=await getTask;const setTask=bg.app.CurrentUser.Set(acquired);await setTask;
   // WebCrypto qualification is already armed by the original wrappers. Wait on
   // its actual work through browser tasks, without replaying Get/Set or readers.
   let sample;for(let i=0;i<100;i++){try{sample=__loginomOriginalUserPublisherV1.inspect();break}catch{}await new Promise(r=>setTimeout(r,1))}
   if(!sample)throw Error('publisher did not qualify original application functions');
   if(mode==='loadbind')globalThis.__loginomStartupV1={document,id:'original',account:'account'};
   const defs=sample.acquisition.loadedDefinitions,initial=defs.initializers;
   const before={complete:defs.complete,initializerComplete:initial.complete,scriptComplete:initial.scriptIdentityComplete,
    sameUser:sample.user===user&&sample.acquisition.user===user,sameGet:sample.acquisition.task===getTask,sameSet:sample.task===setTask,
    projectionDifferent:bg.app.CurrentUser.FCurrentUser!==user,selectorCalls,
    constructors:initial.records.map(r=>r.ctor===defs.bindings[r.kind==='StreamPersist'?'StreamPersistProxy':r.kind]),
    methods:initial.records.every(r=>Reflect.ownKeys(r.methods).every(k=>r.methods[k]===r.members[k]&&r.methods[k]===r.ctor.prototype[k])),
    sameStorageNode:initial.records[1].execution.script===initial.records[2].execution.script,
    nodes:initial.records.map(r=>({kind:r.kind,url:r.execution.url,tag:r.execution.script.tagName,document:r.execution.document===document})),
    dependencies:initial.records.every(r=>r.dependencies.shallowCopy===ss.shallowCopy&&r.dependencies.prepareProperties===ss.prepareProperties),
    closureIdentityQualified:defs.closureIdentityQualified,sourceExecutionQualified:initial.sourceExecutionQualified,nativeReceiversQualified:sample.nativeReceiversQualified,rpcCompletionVerified:sample.acquisition.rpcCompletionVerified};
   let refused=false,getterCalls=0;
   if(mode==='method-drift')Object.defineProperty(rpc.TBGObjectProxy.prototype,'QueryInterface',{get(){getterCalls++;throw Error('foreign getter')},configurable:true});
   if(mode==='script-drift')initial.records[0].execution.script.remove();
   if(mode!=='genuine'&&mode!=='loadbind'){try{__loginomOriginalUserPublisherV1.inspect()}catch{refused=true}}
   return {before,refused,getterCalls};
  },mode).catch(error=>({error:String(error)}));
  t.diagnostic(JSON.stringify({browser:browser.version(),mode,delivered:delivered.length,unexpected,errors,result}));
  assert.equal(unexpected,0);assert.equal(delivered.length,order.length);
  if(mode==='missing-body'){assert(result.error);assert(errors.length>0);return}
  assert.deepEqual(errors,[]);assert(!result.error,result.error);const b=result.before;
  for(const key of ['complete','initializerComplete','scriptComplete','sameUser','sameGet','sameSet','projectionDifferent','methods','sameStorageNode','dependencies'])assert.equal(b[key],true,key);
  assert.equal(b.selectorCalls,1);assert.deepEqual(b.constructors,[true,true,true]);
  assert.deepEqual(b.nodes.map(n=>n.kind),['ObjectProxy','FileStorage','StreamPersist']);assert(b.nodes.every(n=>n.tag==='SCRIPT'&&n.document));
  for(const key of ['closureIdentityQualified','sourceExecutionQualified','nativeReceiversQualified','rpcCompletionVerified'])assert.equal(b[key],false,key);
  assert.equal(result.getterCalls,0);assert.equal(result.refused,mode!=='genuine'&&mode!=='loadbind');
  if(mode==='loadbind'){
   const handle=await page.evaluateHandle(witness.collectTerminalScriptWitness,witness.terminalScriptWitnessArguments('original','account'));
   try{
    const summary=await handle.evaluate(witness.projectTerminalScriptWitness);assert.equal(summary.rows.length,5);assert.equal(summary.sourceExecutionQualified,false);
    const dto=await handle.jsonValue();assert.equal(Object.hasOwn(dto,'checkOriginal'),false);
    await assert.rejects(page.evaluate(witness.projectTerminalScriptWitness,dto),/UNAVAILABLE/);
    await handle.evaluate(capsule=>{globalThis.__loginomStartupV1.account='foreign'});
    await assert.rejects(handle.evaluate(witness.projectTerminalScriptWitness),/UNAVAILABLE/);
   }finally{await handle.dispose()}
  }
 }finally{await context.close()}
});
}finally{test.after(async()=>{await browser.close()})}
