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
  // Independent private-page corruption controls. Real local Chromium/CDP;
  // release-reply delay is an explicit transport double. No Loginom/native IO.
  async function check(name,fn){
    let value;
    try{await fn();value={name,pass:true};}
    catch(error){value={name,pass:false,error:String(error),code:error?.code};}
    results.push(value);
  }
  await check('data export succeeds; diagnostic fields are not provider authority',async()=>{
    const f=await fixture();
    try{
      await f.acquisition.install();await f.load();
      const evidence=await f.acquisition.acquire();
      assert.equal(evidence.nativeProvider,false);
      assert.equal(evidence.sourceSha256,LOCK_SHA256);
    }finally{await f.close();}
  });
  await check('accessor export refuses without invoking getter',async()=>{
    const f=await fixture();
    try{
      await f.acquisition.install();await f.load();
      await f.page.evaluate(()=>{
        const original=globalThis.bg.LockDeferred;globalThis.fixtureGetterCalls=0;
        Object.defineProperty(globalThis.bg,'LockDeferred',{configurable:true,get(){globalThis.fixtureGetterCalls++;return original;}});
      });
      let refusal=false,evidence;
      try{evidence=await f.acquisition.acquire();}catch{refusal=true;}
      const getterCalls=await f.page.evaluate(()=>globalThis.fixtureGetterCalls);
      results.push({name:'accessor observation',refusal,getterCalls,observationPublished:!!evidence,nativeProvider:evidence?.nativeProvider});
      assert.equal(getterCalls,0,'readonly acquisition must not execute substituted export getter');
      assert.equal(refusal,true,'accessor export cannot qualify original function through execution');
    }finally{await f.close();}
  });
  await check('original release pending forbids acquire and publication',async()=>{
    const f=await fixture(),original=f.context.newCDPSession.bind(f.context);
    let entered,release,disposing,withhold=true;
    const hit=new Promise(resolve=>entered=resolve);
    f.context.newCDPSession=async page=>{
      const s=await original(page),send=s.send.bind(s);
      s.send=async(method,params)=>{
        const response=await send(method,params);
        if(method==='Runtime.releaseObjectGroup'&&withhold){
          withhold=false;
          entered();await new Promise(resolve=>release=resolve);
        }
        return response;
      };
      return s;
    };
    try{
      await f.acquisition.install();await f.load();
      disposing=f.acquisition.dispose().then(()=>({ok:true}),error=>({ok:false,error}));
      await hit;
      let refused=false,evidence;
      try{evidence=await f.acquisition.acquire();}catch{refused=true;}
      results.push({name:'pending disposal observation',refused,observationPublished:!!evidence,pending:f.acquisition.facts().pending,disposed:f.acquisition.facts().disposed});
      release();const outcome=await disposing;
      results.push({name:'original disposal outcome',ok:outcome.ok,error:outcome.error?.code});
      // Remove only the labelled delay for orderly fixture-only final disposal.
      f.context.newCDPSession=original;
      assert.equal(refused,true,'pending original disposal must block read admission');
      assert.equal(evidence,undefined,'no diagnostic publication during disposal');
    }finally{
      if(release)release();if(disposing)await disposing;
      // The labelled delay applies once. Fixture-only repair/teardown does not
      // count as successful completion of the refused original disposal.
      await f.close();
    }
  });
}finally{
  if(browser){await browser.close();assert.equal(browser.isConnected(),false);}
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
writeFileSync(output,JSON.stringify({cases:results,reviewer:true,actualChromium:true,nativeProvider:false,browserClosed:true,serverClosed:true},null,2)+'\n');
console.log(JSON.stringify({cases:results,actualChromium:true,nativeProvider:false}));
if(results.some(r=>r.pass===false))process.exitCode=1;
