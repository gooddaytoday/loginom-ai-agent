// Selected production creation-path input qualification; not provider wiring.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import * as moduleAPI from 'node:module';
const [product, source, primitive, inputs, output] = process.argv.slice(2);
assert(product && source && primitive && inputs && output);
const playwright = await import(pathToFileURL(join(product,'resources/loginom/runtime/client/node_modules/playwright-core/index.mjs')));
const {retainEarlyLockFixture,LOCK_SHA256}=await import(pathToFileURL(primitive));
const lock=await readFile(join(inputs,'provider-Lock.js'));
const dependency=await readFile(join(inputs,'__extends.js'));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(lock),LOCK_SHA256);
assert.equal(hash(dependency),'276d947e3958f6fb973e74eaeb76610fc50028fbae79e14feab8fea00052be8c');
const records=[];
const server=createServer((req,res)=>{
 const body=req.url==='/fixed-Lock.js'?lock:req.url==='/__extends.js'?dependency:Buffer.from('<script src="/__extends.js"></script><script src="/fixed-Lock.js"></script><script>bg.app={Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:"fixture-user"}}}}}};</script><div style="height:20px;width:20px" data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">fixture</div>');
 res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'application/javascript':'text/html'});res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/fixture.html`;
const contexts=[];
try {
 for(const scenario of ['stock','ignored-caller','before-goto-primitive']) {
  const profile=await mkdtemp(join(tmpdir(),'resource68-lifecycle-'));
  const caller=new AbortController();
  if(scenario==='ignored-caller')caller.abort(0);
  const absoluteDeadline=scenario==='ignored-caller'?Date.now()-1000:Date.now()+60000;
  const owner={generation:1,chat:'fixture-chat',directory:profile,artifacts:{fixture:true}};
  const trace=[];let context,acquisition,fixtureScope,atGoto;
  const wrappedChromium={async launchPersistentContext(dir,options){
   trace.push('launch');
   context=await playwright.chromium.launchPersistentContext(dir,{...options,chromiumSandbox:false,args:[...options.args,'--no-sandbox']});
   contexts.push(context);
   await context.route('**/*',route=>route.request().url().startsWith(new URL(url).origin+'/')?route.continue():route.abort());
   const add=context.addInitScript.bind(context);
   context.addInitScript=async(...args)=>{
    trace.push('page-retained-before-init');assert.equal(owner.context,context);assert.equal(owner.page.context(),context);assert.equal(owner.page.url(),'about:blank');
    if(scenario==='before-goto-primitive') {
     // Explicit acquisition double at this private boundary, NOT stock caller authority.
     fixtureScope={page:owner.page,context,gate:{started:0,completed:false},token:{},run:'fixture-run',lease:{},generation:1,session:{},account:{},chat:{},document:{},target:{},signal:caller.signal,deadline:absoluteDeadline};
     acquisition=retainEarlyLockFixture(fixtureScope);await acquisition.install();trace.push('primitive-install-ack');
    }
    const goto=owner.page.goto.bind(owner.page);
    owner.page.goto=async(...args)=>{
     atGoto={deadline:owner.deadline,hasSignal:owner.signal!==undefined,hasRun:owner.run!==undefined,hasLease:owner.lease!==undefined,hasOperation:owner.operation!==undefined,hasRequest:owner.request!==undefined,page:owner.page,context:owner.context};
     assert.equal(owner.page.url(),'about:blank');trace.push('first-goto');
     if(acquisition)acquisition.beginFixedLoad();
     const result=await goto(...args);if(acquisition)fixtureScope.gate.completed=true;return result;
    };
    return add(...args);
   };
   return context;
  }};
  const productionRequire=moduleAPI.createRequire(pathToFileURL(join(product,'resources/loginom/runtime/client/package.json')));
  const body=await readFile(source,'utf8');
  const mod=new vm.SourceTextModule(body,{identifier:pathToFileURL(source).href,initializeImportMeta(meta){meta.url=pathToFileURL(source).href;}});
  const dependencies=new Map();
  await mod.link(async spec=>{
   if(dependencies.has(spec))return dependencies.get(spec);
   const values=spec==='node:module'?{...moduleAPI,createRequire:()=>name=>name==='playwright-core'?{chromium:wrappedChromium}:productionRequire(name)}:await import(spec.startsWith('.')?new URL(spec,pathToFileURL(source)):spec);
   const child=new vm.SyntheticModule(Object.keys(values),function(){for(const k of Object.keys(values))this.setExport(k,values[k]);});dependencies.set(spec,child);return child;
  });
  await mod.evaluate();
  try {
   const result=await mod.namespace.loginBrowser({browserPath:join(product,'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),profile,candidate:{url,username:'fixture-user',password:''},headless:true,keepOpen:true,owner,signal:caller.signal,deadline:absoluteDeadline});
   assert.equal(result.context,context);assert.equal(result.authenticated,true);
   assert.equal(atGoto.deadline,null);
   for(const k of ['hasSignal','hasRun','hasLease','hasOperation','hasRequest'])assert.equal(atGoto[k],false);
   assert.equal(atGoto.page,owner.page);assert.equal(atGoto.context,owner.context);
   assert.deepEqual(trace.slice(0,2),['launch','page-retained-before-init']);
   if(acquisition) {
    assert(trace.indexOf('primitive-install-ack')<trace.indexOf('first-goto'));
    let first;await assert.rejects(acquisition.acquire(),e=>{first=e;return e.code==='EARLY_CDP_FOREIGN_CONTEXT';});
    assert.equal(acquisition.facts().nativeProvider,false);
    const dispose=acquisition.dispose();assert.equal(acquisition.dispose(),dispose);await assert.rejects(dispose,e=>e===first);
    assert.equal(acquisition.facts().disposed,false);assert.equal(acquisition.facts().disposalState,'unknown');assert.equal(acquisition.facts().pending,0);
   }
   records.push({scenario,pass:true,productionSourceSha256:hash(body),trace,callerAborted:caller.signal.aborted,originalCallerRetained:false,deadline:atGoto.deadline,nativeProvider:false,openReadAuthority:false,navigationRealmRefused:!!acquisition,originalDisposalConfirmed:acquisition?.facts().disposed??null,disposalState:acquisition?.facts().disposalState??null});
  } finally {if(acquisition&&!acquisition.facts().disposed)await acquisition.dispose().catch(()=>{});await context?.close();await rm(profile,{recursive:true,force:true});}
 }
} finally {for(const c of contexts)await c.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
await (await import('node:fs/promises')).writeFile(output,JSON.stringify({controls:records.length,records,nativeLoginomCalls:0,productionChanged:false,providerWired:false,limits:'Production loginBrowser/Chromium/Page/goto real; require launch sandbox policy, local auth/native representation and acquisition scope labels are fixture doubles. No Close/Save/native cleanup.'},null,2)+'\n');
console.log(JSON.stringify({pass:records.length,providerWired:false}));
