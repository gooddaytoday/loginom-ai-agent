import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { retainEarlyLockFixture, LOCK_SHA256 } from './early-cdp-fixture.mjs';

const [product, inputs, output] = process.argv.slice(2);
assert(product && inputs && output, 'usage: node checker.mjs <verified-product> <inputs> <result.json>');
const playwright = await import(pathToFileURL(join(product, 'resources/loginom/runtime/client/node_modules/playwright-core/index.mjs')));
const lock = readFileSync(join(inputs, 'provider-Lock.js'));
const helper = readFileSync(join(inputs, '__extends.js'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(lock), LOCK_SHA256);
assert.equal(hash(helper), '276d947e3958f6fb973e74eaeb76610fc50028fbae79e14feab8fea00052be8c');
let fixedBytes = lock;
const server = createServer((request, response) => {
  const bytes = request.url === '/fixed-Lock.js' ? fixedBytes : request.url === '/__extends.js' ? helper :
    request.url === '/child.html' ? Buffer.from('<script src="/__extends.js"></script><script src="/fixed-Lock.js"></script>') : null;
  response.writeHead(bytes ? 200 : 404, { 'Content-Type': request.url === '/child.html' ? 'text/html' : 'application/javascript' });
  response.end(bytes || '');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
async function fixture(deadlineOffset = 60000) {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  const controller = new AbortController();
  const owner = { page, context, gate: { started: 0, completed: false }, token: {},
    run: crypto.randomUUID(), lease: {}, generation: 1, session: {}, account: {},
    chat: {}, document: {}, target: {}, signal: controller.signal, deadline: Date.now() + deadlineOffset };
  // Capture synchronously at actual fixture Page creation, before any loader.
  const acquisition = retainEarlyLockFixture(owner);
  return { context, page, owner, controller, acquisition,
    async load() {
      acquisition.beginFixedLoad();
      await page.addScriptTag({ url: base + '/__extends.js' });
      await page.addScriptTag({ url: base + '/fixed-Lock.js' });
      owner.gate.completed = true;
    },
    async close() { await acquisition.dispose(); await page.close(); await context.close(); assert(page.isClosed()); },
  };
}
async function test(name, fn) { await fn(); results.push({ name, pass: true }); }
async function refuse(promise, code) {
  let caught = false;
  try { await promise; } catch (error) { caught = true; assert.equal(error?.code, code); }
  assert(caught, code);
}
try {
 browser=await playwright.chromium.launch({executablePath:join(product,'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),headless:true,args:['--disable-background-networking']});
 async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:String(error),code:error?.code});}}
 for(const mode of ['matching','descriptor-accessor','forged-descriptor']) {
  await check('atomic comparison uses original descriptor primitive '+mode,async()=>{
   const f=await fixture(),create=f.context.newCDPSession.bind(f.context);let changed=false;
   f.context.newCDPSession=async page=>{
    const session=await create(page),send=session.send.bind(session);
    session.send=async(method,params)=>{
     if(method==='Runtime.callFunctionOn'&&!changed&&mode!=='matching') {
      changed=true;
      await f.page.evaluate(mode=>{
       const descriptor=Object.getOwnPropertyDescriptor;
       globalThis.fixtureIntrinsicGets=0;globalThis.fixtureDescriptorCalls=0;
       if(mode==='descriptor-accessor') {
        Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,get(){globalThis.fixtureIntrinsicGets++;return descriptor;}});
       } else {
        const original=globalThis.bg.LockDeferred;
        globalThis.bg.LockDeferred=function foreignExport(){};
        Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,value:function(object,key){
         globalThis.fixtureDescriptorCalls++;
         if(object===globalThis.bg&&key==='LockDeferred')return {value:original,enumerable:true,configurable:true,writable:true};
         return descriptor(object,key);
        }});
        globalThis.fixtureExportChanged=globalThis.bg.LockDeferred!==original;
       }
      },mode);
     }
     return send(method,params);
    };return session;
   };
   try {
    await f.acquisition.install();await f.load();let evidence,refused=false;
    try{evidence=await f.acquisition.acquire();}catch{refused=true;}
    const counts=await f.page.evaluate(()=>({getterCalls:globalThis.fixtureIntrinsicGets||0,descriptorCalls:globalThis.fixtureDescriptorCalls||0,exportChanged:globalThis.fixtureExportChanged===true}));
    results.push({name:'intrinsic observation '+mode,refused,observationPublished:!!evidence,nativeProvider:evidence?.nativeProvider,...counts});
    if(mode==='matching'){assert.equal(refused,false);assert.equal(evidence.nativeProvider,false);return;}
    assert.equal(counts.getterCalls,0,'descriptor acquisition/comparison must not invoke substituted property getter');
    // A retained trusted primitive may safely validate the unchanged export;
    // refusing the corrupted ambient primitive is also an acceptable outcome.
    if(mode==='descriptor-accessor'){if(evidence)assert.equal(evidence.nativeProvider,false);return;}
    assert.equal(refused,true,'unqualified realm descriptor primitive cannot qualify current export identity');
    assert.equal(evidence,undefined,'changed export must not publish an observation using a forged descriptor');
   }finally{await f.close();}
  });
 }
}finally{
 if(browser){await browser.close();assert.equal(browser.isConnected(),false);}
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
writeFileSync(output,JSON.stringify({cases:results,actualChromium:true,nativeProvider:false,browserClosed:true,serverClosed:true},null,2)+'\n');
console.log(JSON.stringify({cases:results,actualChromium:true,nativeProvider:false}));
if(results.some(r=>r.pass===false))process.exitCode=1;
