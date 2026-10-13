import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,inputs,helper,output]=process.argv.slice(2);
const {retainDestinationLockFixture}=await import(pathToFileURL(helper));
const {chromium}=await import(pathToFileURL(join(product,'resources/loginom/runtime/client/node_modules/playwright-core/index.mjs')));
const lock=await readFile(join(inputs,'provider-Lock.js')),dependency=await readFile(join(inputs,'__extends.js'));
const server=createServer((req,res)=>{
 const body=req.url==='/fixed-Lock.js'?lock:req.url==='/__extends.js'?dependency:Buffer.from('<script src="/__extends.js"></script><script src="/fixed-Lock.js"></script>');
 res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:join(product,'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),headless:true,args:['--disable-background-networking']});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const results=[];
async function run(primary,success=false){
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const page=await context.newPage(),controller=new AbortController(),events=[];
 const create=context.newCDPSession.bind(context);let session,scope,gate;
 context.newCDPSession=async p=>{session=await create(p);session.on('Runtime.executionContextCreated',e=>events.push(e.context));return session;};
 const owner={page,context,gate:{started:0,pending:false,unknown:false,overlap:false},token:{},run:'fixture-run',lease:{},generation:1,chat:'fixture-chat',operation:'fixture-op',request:'fixture-request',authorization:{},account:{},session:{},target:{},purpose:'resource68-destination-fixture-v1',signal:controller.signal,deadline:Date.now()+60000,destination:base+'/destination.html'};
 const item={name:success?'fulfilled original read still refuses after realm loss':'repeat acquire cannot poison pending transport '+String(primary),pass:false,nativeProvider:false};
 try{
  scope=retainDestinationLockFixture(owner);await scope.install();await scope.navigate();
  const send=session.send.bind(session),started=deferred();gate=deferred();let reads=0;
  session.send=async(method,args)=>{const reply=await send(method,args);if(method==='Runtime.callFunctionOn'){reads++;item.atomicMatched=reply.result?.value;started.resolve();await gate.promise;if(!success)throw primary;}return reply;};
  const originalContext=scope.facts().destinationContext,work=scope.acquire(),observed=work.then(value=>({resolved:true,value}),error=>({resolved:false,error}));
  await started.promise;
  await page.goto(owner.destination,{waitUntil:'domcontentloaded'});
  item.originalContext=originalContext;item.liveContext=events.filter(c=>c.auxData?.isDefault).at(-1)?.id;
  assert.notEqual(item.originalContext,item.liveContext);
  assert.equal(scope.facts().realmLost,true);
  item.pendingBeforeRepeat=scope.facts().pending;
  assert(item.pendingBeforeRepeat>0);
  let repeatRefused=false;
  try{const again=scope.acquire();item.samePromise=again===work;}catch(error){repeatRefused=true;item.repeatRefusal=error.code;}
  item.repeatRefused=repeatRefused;
  item.firstBeforeTransportSettles=scope.facts().first?.code;
  gate.resolve();const outcome=await observed;
  item.rawPrimaryPreserved=outcome.error===primary;
  item.originalOutcomeCode=outcome.error?.code;
  item.firstExact=scope.facts().first===primary;
  item.observationPublished=outcome.resolved;
  item.reads=reads;
  assert.equal(reads,1);assert.equal(outcome.resolved,false);
  if(success){assert.equal(item.originalOutcomeCode,'DESTINATION_REALM_LOST');assert.equal(repeatRefused,true);}
  else{assert.equal(outcome.error,primary,'Refused repeat admission must not replace the original pending transport rejection');assert.equal(scope.facts().first,primary);}
  item.pass=true;
 }catch(error){item.assertion={name:error?.name,message:error?.message,actual:error?.actual,expected:error?.expected};}
 finally{
  gate?.resolve();
  if(scope){try{await scope.dispose();}catch(error){item.disposalRejected=true;}item.finalFacts=scope.facts();}
  await context.close();assert(page.isClosed());item.fixtureContextClosed=true;
 }
 results.push(item);
}
try{
 for(const primary of [Error('original pending transport',{cause:0}),undefined,null,false,0,''])await run(primary);
 await run(undefined,true);
}finally{await browser.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
const report={results,pass:results.filter(r=>r.pass).length,fail:results.filter(r=>!r.pass).length,browserClosed:!browser.isConnected(),serverClosed:!server.listening,nativeProvider:false,limits:'Exact published helper; actual Chromium default-realm navigation and CDP replies/handles. Held/rejected replies and logical owner inputs are doubles. Same pending request, no helper read/navigation replay. Fixture close is not original scope/native disposal.'};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,fail:report.fail,browserClosed:report.browserClosed,serverClosed:report.serverClosed}));process.exitCode=report.fail?1:0;
