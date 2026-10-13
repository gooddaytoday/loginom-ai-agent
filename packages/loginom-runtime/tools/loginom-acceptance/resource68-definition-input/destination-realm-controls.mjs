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
 await run('non-aborted shadow method getter never invoked',async(f,item)=>{
  let calls=0;Object.defineProperty(f.controller.signal,'throwIfAborted',{get(){calls++;throw Error('shadow');}});
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();const result=await f.scope.acquire();
  assert.equal(calls,0);assert.equal(result.nativeProvider,false);item.getterCalls=calls;
 });
 for(const primary of [Error('original pending transport',{cause:0}),undefined,null,false,0,''])
 await run('original pending transport primary precedes realm loss '+String(primary),async(f,item)=>{
  f.scope=retainDestinationLockFixture(f.owner);await f.scope.install();await f.scope.navigate();
  const session=f.session(),send=session.send.bind(session),started=deferred(),gate=deferred();let reads=0;
  session.send=async(method,args)=>{const reply=await send(method,args);if(method==='Runtime.callFunctionOn'){reads++;item.originalMatch=reply.result?.value;started.resolve();await gate.promise;throw primary;}return reply;};
  const work=f.scope.acquire(),observed=work.then(value=>({value}),error=>({error}));await started.promise;
  await f.page.goto(f.owner.destination,{waitUntil:'domcontentloaded'});gate.resolve();const outcome=await observed;
  assert.equal(outcome.error,primary);assert.equal(outcome.value,undefined);assert.equal(f.scope.facts().first,primary);assert.equal(f.scope.facts().realmLost,true);
  let repeated;try{f.scope.acquire();}catch(error){repeated={error};}assert(repeated);assert.equal(repeated.error,primary);assert.equal(reads,1);
  item.firstExact=true;item.reads=reads;item.realmLost=true;
 });
}finally{await browser.close();await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
const report={results,pass:results.filter(r=>r.pass).length,fail:results.filter(r=>!r.pass).length,browserClosed:!browser.isConnected(),serverClosed:!server.listening,nativeProvider:false,limits:'Same published helper; real Chromium default-realm navigation and CDP handles. Logical owner labels and held atomic reply are fixture doubles. Raw AbortSignal is real. No Loginom/native/model/current Page/replay.'};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,fail:report.fail,browserClosed:report.browserClosed,serverClosed:report.serverClosed}));process.exitCode=report.fail?1:0;
