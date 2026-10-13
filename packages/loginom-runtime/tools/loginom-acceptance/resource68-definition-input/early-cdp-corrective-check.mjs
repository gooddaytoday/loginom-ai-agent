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
  browser = await playwright.chromium.launch({
    executablePath: join(product, 'resources/loginom/browsers/chromium-1243/chrome-linux64/chrome'),
    headless: true, args: ['--disable-background-networking'],
  });

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

  await test('live accessor installed during final identity await invokes zero getters',async()=>{
    const f=await fixture(),original=f.context.newCDPSession.bind(f.context);let changed=false;
    f.context.newCDPSession=async page=>{const s=await original(page),send=s.send.bind(s);s.send=async(method,params)=>{
      if(method==='Runtime.callFunctionOn'&&!changed){changed=true;await f.page.evaluate(()=>{const fn=globalThis.bg.LockDeferred;globalThis.fixtureGetterCalls=0;Object.defineProperty(globalThis.bg,'LockDeferred',{configurable:true,get(){globalThis.fixtureGetterCalls++;return fn;}});});}
      return send(method,params);};return s;};
    try{await f.acquisition.install();await f.load();await refuse(f.acquisition.acquire(),'EARLY_CDP_EXPORT_REPLACED');assert.equal(await f.page.evaluate(()=>globalThis.fixtureGetterCalls),0);}
    finally{await f.close();}
  });
  await test('pending disposal shares one Promise and blocks load/install without replacing first cause',async()=>{
    const f=await fixture(),original=f.context.newCDPSession.bind(f.context),hit=deferred();let release,releases=0;
    f.context.newCDPSession=async page=>{const s=await original(page),send=s.send.bind(s);s.send=async(method,params)=>{
      const value=await send(method,params);if(method==='Runtime.releaseObjectGroup'){releases++;hit.resolve();await new Promise(r=>release=r);}return value;};return s;};
    let disposing;
    try{await f.acquisition.install();await f.load();await f.acquisition.acquire();disposing=f.acquisition.dispose();await hit.promise;
      assert.equal(f.acquisition.dispose(),disposing);assert.throws(()=>f.acquisition.beginFixedLoad());await assert.rejects(f.acquisition.install());await assert.rejects(f.acquisition.acquire());
      assert.equal(f.acquisition.facts().held,false);assert.equal(f.acquisition.facts().disposalState,'pending');release();await disposing;
      assert.equal(releases,1);assert.equal(f.acquisition.facts().disposalState,'confirmed');assert.equal(f.acquisition.dispose(),disposing);
    }finally{if(release)release();if(disposing)await disposing;await f.close();}
  });
  for(const primary of [new Error('release reply lost',{cause:0}),undefined,null,false,0,'']){
    await test('unknown release '+String(primary)+' caches original Promise and raw cause without replay',async()=>{
      const f=await fixture(),original=f.context.newCDPSession.bind(f.context);let releases=0;
      f.context.newCDPSession=async page=>{const s=await original(page),send=s.send.bind(s);s.send=async(method,params)=>{
        const response=await send(method,params);if(method==='Runtime.releaseObjectGroup'){releases++;throw primary;}return response;};return s;};
      try{await f.acquisition.install();await f.load();await f.acquisition.acquire();const promise=f.acquisition.dispose();
        await assert.rejects(promise,error=>error===primary);assert.equal(f.acquisition.dispose(),promise);await assert.rejects(promise,error=>error===primary);
        assert.equal(f.acquisition.facts().first,primary);assert.equal(f.acquisition.facts().disposalFailure,primary);
        assert.equal(f.acquisition.facts().disposalState,'unknown');assert.equal(f.acquisition.facts().disposed,false);
        await assert.rejects(f.acquisition.acquire(),error=>error===primary);assert.equal(releases,1);
      }finally{
        // Same owner fixture teardown only; never claims confirmed original disposal.
        await f.page.close();await f.context.close();assert.equal(f.page.isClosed(),true);
      }
    });
  }
} finally {
 if(browser){await browser.close();assert.equal(browser.isConnected(),false);}
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
writeFileSync(output,JSON.stringify({checks:results.length,cases:results,actualChromium:true,nativeProvider:false,browserClosed:true,serverClosed:true},null,2)+'\n');
console.log(JSON.stringify({checks:results.length,pass:true,actualChromium:true,nativeProvider:false}));
