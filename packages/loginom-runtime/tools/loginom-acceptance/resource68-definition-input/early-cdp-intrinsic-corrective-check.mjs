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
 for(const mode of ['prime-accessor','prime-js','prime-bound-js','both-ambient-forged']) {
  const f=await fixture();
  try {
   if(mode.startsWith('prime'))await f.page.evaluate(mode=>{
    const original=Object.getOwnPropertyDescriptor;globalThis.fixtureIntrinsicGets=0;globalThis.fixtureDescriptorCalls=0;
    if(mode==='prime-accessor')Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,get(){globalThis.fixtureIntrinsicGets++;return original;}});
    else {
     let fake=function getOwnPropertyDescriptor(object,key){globalThis.fixtureDescriptorCalls++;return original(object,key);};
     if(mode==='prime-bound-js'){fake=fake.bind(null);Object.defineProperty(fake,'name',{value:'getOwnPropertyDescriptor'});}
     Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,value:fake});
    }
   },mode);
   let refused=false,evidence;
   try {
    await f.acquisition.install();await f.load();
    if(mode==='both-ambient-forged')await f.page.evaluate(()=>{
     const original=globalThis.bg.LockDeferred;globalThis.fixtureIntrinsicGets=0;globalThis.fixtureDescriptorCalls=0;
     globalThis.bg.LockDeferred=function foreignExport(){};
     const fake=function(){globalThis.fixtureDescriptorCalls++;return {value:original};};
     Object.defineProperty(Object,'getOwnPropertyDescriptor',{configurable:true,value:fake});
     Object.defineProperty(Reflect,'getOwnPropertyDescriptor',{configurable:true,get(){globalThis.fixtureIntrinsicGets++;return fake;}});
    });
    evidence=await f.acquisition.acquire();
   }catch{refused=true;}
   const counts=await f.page.evaluate(()=>({getterCalls:globalThis.fixtureIntrinsicGets||0,descriptorCalls:globalThis.fixtureDescriptorCalls||0}));
   assert.equal(refused,true);assert.equal(evidence,undefined);assert.equal(counts.getterCalls,0);assert.equal(counts.descriptorCalls,0);
   if(mode.startsWith('prime'))assert.equal(f.owner.gate.started,0,'unqualified primitive refuses before loader');
   results.push({name:mode,pass:true,refused,observationPublished:false,...counts,nativeProvider:false});
  }finally{await f.close();}
 }
}finally{
 if(browser){await browser.close();assert.equal(browser.isConnected(),false);}
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
writeFileSync(output,JSON.stringify({cases:results,actualChromium:true,nativeProvider:false,browserClosed:true,serverClosed:true},null,2)+'\n');
console.log(JSON.stringify({cases:results,actualChromium:true,nativeProvider:false}));
