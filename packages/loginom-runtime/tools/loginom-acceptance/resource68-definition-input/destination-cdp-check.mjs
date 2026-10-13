import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {retainDestinationLockFixture} from './destination-cdp-fixture.mjs';
const [product,inputs,output]=process.argv.slice(2);
assert(product&&inputs&&output);
const {chromium}=await import(pathToFileURL(join(product,'resources/loginom/runtime/client/node_modules/playwright-core/index.mjs')));
const lock=await readFile(join(inputs,'provider-Lock.js')),dependency=await readFile(join(inputs,'__extends.js'));
let servedLock=lock,servedDependency=dependency;
const server=createServer((req,res)=>{const b=req.url==='/fixed-Lock.js'?servedLock:req.url==='/__extends.js'?servedDependency:Buffer.from('<script src="/__extends.js"></script><script src="/fixed-Lock.js"></script>');res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(b);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
let browser=await chromium.launch({executablePath:join(product,'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),headless:true,args:['--disable-background-networking']});
const results=[];
async function fixture() {
 if(!browser.isConnected())browser=await chromium.launch({executablePath:join(product,'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),headless:true,args:['--disable-background-networking']});
 const fixtureBrowser=browser;
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const page=await context.newPage(),controller=new AbortController();
 const newSession=context.newCDPSession.bind(context);let session;context.newCDPSession=async page=>{session=await newSession(page);return session;};
 const owner={page,context,gate:{started:0,pending:false,unknown:false,overlap:false},token:{},run:'fixture-run',lease:{},generation:1,chat:'fixture-chat',operation:'fixture-op',request:'fixture-request',authorization:{},account:{},session:{},target:{},purpose:'resource68-destination-fixture-v1',signal:controller.signal,deadline:Date.now()+60000,destination:base+'/destination.html'};
 return{context,page,owner,controller,scope:undefined,originalSession:()=>session,async close(){
  // Refused pre-bootstrap instrumentation cannot establish Runtime disposal.
  // Finalize only this fixture browser, preserving the original scope UNKNOWN.
  if(session&&this.scope?.facts().armResumeState==='not_started'&&this.scope?.facts().navigation==='unknown') {
   await fixtureBrowser.close();if(this.scope.facts().pending===0)await this.scope.dispose().catch(()=>{});
   assert.equal(this.scope.facts().disposal,'unknown');assert(page.isClosed());return;
  }
  if(session&&this.scope?.facts().boundary!=='confirmed')await session.send('Debugger.disable').catch(()=>{});
  if(this.scope&&this.scope.facts().pending===0&&this.scope.facts().navigation!=='pending'&&this.scope.facts().boundary!=='pending')await this.scope.dispose().catch(()=>{});
  await context.close();assert(page.isClosed());}};

}
async function run(name,body){const f=await fixture();let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;console.log('destination-measurement-timeout',JSON.stringify(f.scope?.facts()));f.controller.abort(Error('fixture measurement timeout'));browser.close().catch(()=>{});},12000);try{await body(f);}finally{try{await f.close();}finally{clearTimeout(timeout);}}assert.equal(timedOut,false,'fixture must complete without timeout finalization');results.push({name,pass:true,facts:f.scope?.facts(),nativeProvider:false});}

try {
 await run('causal first destination script/default context/native primitive/scopes/release',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();const result=await f.scope.acquire();
  assert.notEqual(result.firstContext,result.destinationContext);assert.equal(result.nativeProvider,false);assert.equal(result.openReadAuthority,false);
  assert.deepEqual(result.trace,['instrumentation-install-ack-before-goto','original-first-goto','fixed-bootstrap-entry-breakpoint-ack','destination-native-primitive-before-lock-definition','original-resume-ack','destination-navigation-complete']);
  const disposal=f.scope.dispose();assert.equal(f.scope.dispose(),disposal);await disposal;assert.equal(f.scope.facts().disposal,'confirmed');
 });

 await run('already loaded Page is not an early registration',async f=>{await f.page.goto(f.owner.destination);assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_ORIGINAL_INVALID');});
 await run('preabort0 primary before any IO and joint tuple changes',async f=>{f.scope=retainDestinationLockFixture(f.owner);f.controller.abort(0);f.owner.run='foreign';assert.throws(()=>f.scope.install(),e=>e===0);assert.equal(f.scope.facts().sessionCreation,'not_started');});
 await run('expired original deadline before any IO',async f=>{f.owner.deadline=Date.now()-1;assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_EXPIRED');});
 await run('foreign FP purpose is not Resource admission',async f=>{f.owner.purpose='field-parameters-preservation-v1';assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_ORIGINAL_INVALID');});
 await run('copied signal facade cannot replace raw AbortSignal',async f=>{f.owner.signal={throwIfAborted(){},aborted:false};assert.throws(()=>retainDestinationLockFixture(f.owner));});
 await run('UNKNOWN gate refuses before IO',async f=>{f.owner.gate.unknown=true;assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_UNSETTLED');});
 await run('initial accessor owner field refuses getter0',async f=>{let count=0;Object.defineProperty(f.owner,'request',{get(){count++;return 'fixture-request';}});assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_ORIGINAL_MISSING');assert.equal(count,0);});
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
 await run('one pending install/own original reply; between-await tuple replacement refuses',async f=>{
  const native=f.context.newCDPSession.bind(f.context),gate=deferred(),began=deferred();let calls=0;
  f.context.newCDPSession=async p=>{calls++;const original=await native(p);began.resolve();await gate.promise;return original;};
  f.scope=retainDestinationLockFixture(f.owner);const work=f.scope.install();await began.promise;assert.equal(f.scope.install(),work);
  assert.throws(()=>f.scope.navigate(),e=>e.code==='DESTINATION_INSTALL_REQUIRED');await assert.rejects(f.scope.dispose(),e=>e.code==='DESTINATION_DISPOSAL_PENDING');
  f.owner.lease={};f.owner.generation=2;gate.resolve();await assert.rejects(work,e=>e.code==='DESTINATION_BINDING_CHANGED');assert.equal(f.scope.install(),work);assert.equal(calls,1);
 });
 for(const reason of [Error('lost original',{cause:0}),undefined,null,false,0,'']) await run('unknown original session reply '+String(reason)+' never creates replacement',async f=>{
  let calls=0;f.context.newCDPSession=async()=>{calls++;throw reason;};f.scope=retainDestinationLockFixture(f.owner);
  const work=f.scope.install();await assert.rejects(work,e=>e===reason);assert.equal(f.scope.install(),work);assert.equal(f.scope.facts().first,reason);
  const disposal=f.scope.dispose();await assert.rejects(disposal,e=>e===reason);assert.equal(f.scope.dispose(),disposal);assert.equal(f.scope.facts().disposal,'unknown');assert.equal(calls,1);
 });
 await run('getter export substitution refused without getter invocation',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();
  await f.page.evaluate(()=>{globalThis.fixtureGetterCalls=0;const original=bg.LockDeferred;Object.defineProperty(bg,'LockDeferred',{get(){fixtureGetterCalls++;return original;},configurable:true});});
  const work=f.scope.acquire();await assert.rejects(work,e=>e.code==='DESTINATION_DATA_HANDLE_MISSING');assert.equal(f.scope.acquire(),work);
  const count=await f.originalSession().send('Runtime.evaluate',{expression:'fixtureGetterCalls',returnByValue:true});assert.equal(count.result.value,0);
 });
 await run('retained primitive ignores ambient descriptor getter; own original export unchanged',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();
  await f.page.evaluate(()=>{globalThis.fixtureIntrinsicCalls=0;const original=Object.getOwnPropertyDescriptor;Object.defineProperty(Object,'getOwnPropertyDescriptor',{get(){fixtureIntrinsicCalls++;return original;},configurable:true});});
  const observation=await f.scope.acquire();assert.equal(observation.nativeProvider,false);
  const count=await f.originalSession().send('Runtime.evaluate',{expression:'fixtureIntrinsicCalls',returnByValue:true});assert.equal(count.result.value,0);
 });
 await run('same pinned script foreign export cannot satisfy fixed function location',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();await f.page.evaluate(()=>{bg.LockDeferred=bg.CreateLock;});
  await assert.rejects(f.scope.acquire(),e=>e.code==='DESTINATION_FUNCTION_CHANGED');
 });
 await run('awaited read joint owner/Page substitution has no projection or replay',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();const session=f.originalSession(),send=session.send.bind(session),gate=deferred(),began=deferred();let calls=0;
  session.send=async(method,args)=>{const value=await send(method,args);if(method==='Debugger.getScriptSource'){calls++;began.resolve();await gate.promise;}return value;};
  const work=f.scope.acquire();await began.promise;f.owner.token={};f.owner.page={};f.owner.context={};gate.resolve();await assert.rejects(work,e=>e.code==='DESTINATION_BINDING_CHANGED');assert.equal(f.scope.acquire(),work);assert.equal(calls,1);assert.equal(f.scope.facts().readState,'unknown');
 });
 await run('pending original release holds same Promise and refuses all new admission',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();await f.scope.acquire();const session=f.originalSession(),send=session.send.bind(session),gate=deferred(),began=deferred();let releases=0;
  session.send=async(method,args)=>{const value=await send(method,args);if(method==='Runtime.releaseObjectGroup'){releases++;began.resolve();await gate.promise;}return value;};
  const work=f.scope.dispose();await began.promise;assert.equal(f.scope.dispose(),work);assert.throws(()=>f.scope.acquire(),e=>e.code==='DESTINATION_DISPOSAL_PENDING');assert.throws(()=>f.scope.install(),e=>e.code==='DESTINATION_DISPOSAL_PENDING');assert.throws(()=>f.scope.navigate(),e=>e.code==='DESTINATION_DISPOSAL_PENDING');gate.resolve();await work;assert.equal(releases,1);assert.equal(f.scope.facts().disposal,'confirmed');assert.throws(()=>f.scope.acquire(),e=>e.code==='DESTINATION_RELEASED');
 });
 await run('lost original release reason0 retained without replacement release',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();await f.scope.acquire();const session=f.originalSession(),send=session.send.bind(session);let releases=0;
  session.send=async(method,args)=>{const value=await send(method,args);if(method==='Runtime.releaseObjectGroup'){releases++;throw 0;}return value;};
  const work=f.scope.dispose();await assert.rejects(work,e=>e===0);assert.equal(f.scope.dispose(),work);assert.equal(f.scope.facts().disposal,'unknown');assert.equal(releases,1);assert.equal(f.scope.facts().first,0);
 });

 await run('missing original request refuses before IO',async f=>{delete f.owner.request;assert.throws(()=>retainDestinationLockFixture(f.owner),e=>e.code==='DESTINATION_ORIGINAL_MISSING');});
 await run('wrong bootstrap source refuses the causal boundary',async f=>{
  servedDependency=Buffer.concat([dependency,Buffer.from('\n// wrong fixture pin')]);
  try{f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await assert.rejects(f.scope.navigate(),e=>e.code==='DESTINATION_FIRST_SOURCE_CHANGED');assert.equal(f.scope.facts().readState,'not_started');}finally{servedDependency=dependency;}
 });
 await run('wrong Lock source refuses before result projection',async f=>{
  servedLock=Buffer.concat([lock,Buffer.from('\n// wrong fixture pin')]);
  try{f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();await assert.rejects(f.scope.acquire(),e=>e.code==='DESTINATION_LOCK_SOURCE_CHANGED');}finally{servedLock=lock;}
 });
 await run('original abortfalse wins over secondary request drift after accepted read IO',async f=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();const session=f.originalSession(),send=session.send.bind(session),gate=deferred(),began=deferred();let reads=0;
  session.send=async(method,args)=>{const value=await send(method,args);if(method==='Debugger.getScriptSource'){reads++;began.resolve();await gate.promise;}return value;};
  const work=f.scope.acquire();await began.promise;f.controller.abort(false);f.owner.request='foreign';gate.resolve();await assert.rejects(work,e=>e===false);assert.equal(f.scope.acquire(),work);assert.equal(reads,1);assert.equal(f.scope.facts().first,false);
 });
}finally{await browser.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
await writeFile(output,JSON.stringify({results,controls:results.length,nativeLoginom:false,carrierWired:false,nativeProvider:false},null,2)+'\n');console.log(JSON.stringify({pass:results.length}));
