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
const results=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture(){
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const page=await context.newPage(),controller=new AbortController(),events=[];
 const create=context.newCDPSession.bind(context);let session,sessionCalls=0;
 context.newCDPSession=async p=>{sessionCalls++;session=await create(p);session.on('Runtime.executionContextCreated',e=>events.push(e.context));return session;};
 const owner={page,context,gate:{started:0,pending:false,unknown:false,overlap:false},token:{},run:'fixture-run',lease:{},generation:1,chat:'fixture-chat',operation:'fixture-op',request:'fixture-request',authorization:{},account:{},session:{},target:{},purpose:'resource68-destination-fixture-v1',signal:controller.signal,deadline:Date.now()+60000,destination:base+'/destination.html'};
 return{context,page,controller,owner,events,scope:undefined,session:()=>session,sessionCalls:()=>sessionCalls,latestDefault:()=>events.filter(c=>c.auxData?.isDefault).at(-1)?.id};
}
async function run(name,body){
 const f=await fixture(),item={name,pass:false,nativeProvider:false};
 try{await body(f,item);item.pass=true;}
 catch(error){item.assertion={name:error.name,message:error.message,actual:error.actual,expected:error.expected};}
 finally{
  if(f.scope){try{await f.scope.dispose();}catch(error){item.disposalRejected=true;}item.finalFacts=f.scope.facts();}
  await f.context.close();assert(f.page.isClosed());item.fixtureContextClosed=true;
 }
 results.push(item);
}
try{
 await run('cached read refuses after same-Page real destination realm replacement',async(f,item)=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();const originalRead=f.scope.acquire(),original=await originalRead;
  await f.page.goto(f.owner.destination,{waitUntil:'domcontentloaded'});
  item.oldContext=original.destinationContext;item.liveContext=f.latestDefault();item.samePage=f.owner.page===f.page;item.sameBrowserContext=f.owner.context===f.context;
  assert.notEqual(item.oldContext,item.liveContext);
  try{await f.session().send('Runtime.evaluate',{contextId:item.oldContext,expression:'1',returnByValue:true});}catch(error){item.oldContextRejected=error.message;}
  assert(item.oldContextRejected.includes('Cannot find context with specified id'));
  let observation,refused=false;
  try{const repeated=f.scope.acquire();item.sameReadPromise=repeated===originalRead;observation=await repeated;}catch(error){refused=true;item.refusalCode=error.code;}
  item.refused=refused;item.observationPublished=observation!==undefined;
  assert.equal(refused,true,'Destroyed destination realm must refuse cached original observation');assert.equal(observation,undefined);
 });
 await run('post-await guard refuses after actual realm destruction during held original atomic reply',async(f,item)=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();
  const session=f.session(),send=session.send.bind(session),began=deferred(),gate=deferred();let atomicReads=0;
  session.send=async(method,args)=>{const reply=await send(method,args);if(method==='Runtime.callFunctionOn'){atomicReads++;item.originalAtomicMatch=reply.result?.value;began.resolve();await gate.promise;}return reply;};
  const oldContext=f.scope.facts().destinationContext,work=f.scope.acquire();await began.promise;
  await f.page.goto(f.owner.destination,{waitUntil:'domcontentloaded'});item.oldContext=oldContext;item.liveContext=f.latestDefault();assert.notEqual(oldContext,item.liveContext);
  gate.resolve();let observation,refused=false;
  try{observation=await work;}catch(error){refused=true;item.refusalCode=error.code;}
  item.atomicReads=atomicReads;item.refused=refused;item.observationPublished=observation!==undefined;item.samePage=f.owner.page===f.page;item.sameBrowserContext=f.owner.context===f.context;
  assert.equal(atomicReads,1);assert.equal(refused,true,'Final awaited atomic reply cannot publish after its original realm is destroyed');assert.equal(observation,undefined);
 });
 await run('raw preabort0 wins without consulting shadow throwIfAborted getter',async(f,item)=>{
  let getterCalls=0;const secondary=Error('shadow method accessor',{cause:false});
  Object.defineProperty(f.controller.signal,'throwIfAborted',{configurable:true,get(){getterCalls++;throw secondary;}});f.controller.abort(0);
  let rejection;
  try{f.scope=retainDestinationLockFixture(f.owner);}catch(error){rejection=error;}
  item.getterCalls=getterCalls;item.firstWasOriginalAbort0=rejection===0;item.firstWasSecondaryAccessor=rejection===secondary;item.sessionCalls=f.sessionCalls();
  assert.equal(rejection,0,'Native original abort reason must precede a shadow method accessor');assert.equal(getterCalls,0);assert.equal(item.sessionCalls,0);
 });
}finally{await browser.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
const report={results,pass:results.filter(r=>r.pass).length,fail:results.filter(r=>!r.pass).length,browserClosed:!browser.isConnected(),serverClosed:!server.listening,nativeProvider:false,limits:'Same published helper; real Chromium default-realm navigation and CDP handles. Logical owner labels and held atomic reply are fixture doubles. Raw AbortSignal is real. No Loginom/native/model/current Page/replay.'};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,fail:report.fail,browserClosed:report.browserClosed,serverClosed:report.serverClosed}));process.exitCode=report.fail?1:0;
