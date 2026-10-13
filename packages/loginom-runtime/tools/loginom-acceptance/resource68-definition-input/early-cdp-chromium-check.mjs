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
  await test('early causal ack/source/context/lexical/cache/released handles', async () => {
    const f = await fixture();
    try {
      await f.acquisition.install(); await f.load();
      const evidence = await f.acquisition.acquire();
      assert.deepEqual(evidence.trace, ['install-ack-before-loader', 'loader-start-after-ack', 'same-page-scopes-retained']);
      assert.equal(evidence.sourceSha256, LOCK_SHA256);
      assert.equal(evidence.nativeProvider, false);
      assert.equal(await f.page.evaluate(() => typeof globalThis.bg.GetLockDeferredDefault), 'undefined');
      await refuse(f.acquisition.acquire({ copied: evidence }), 'EARLY_CDP_EXTERNAL_HANDLE_FORBIDDEN');
      await f.acquisition.dispose(); assert(f.acquisition.facts().disposed);
      assert.throws(() => f.acquisition.validate(), error => error.code === 'EARLY_CDP_CLOSED');
    } finally { await f.close(); }
  });
  await test('late Debugger.enable emits old scriptParsed but no early authority', async () => {
    const f = await fixture(); let late;
    try {
      f.owner.gate.started = 1;
      await f.page.addScriptTag({ url: base + '/__extends.js' });
      await f.page.addScriptTag({ url: base + '/fixed-Lock.js' });
      late = await f.context.newCDPSession(f.page);
      const scripts = []; late.on('Debugger.scriptParsed', e => scripts.push(e));
      await late.send('Debugger.enable');
      assert(scripts.some(s => s.url.endsWith('/fixed-Lock.js')));
      await refuse(f.acquisition.install(), 'EARLY_CDP_LATE_INSTALL');
    } finally { if (late) await late.detach(); await f.close(); }
  });
  for (const key of ['page', 'context', 'token', 'gate', 'run', 'lease', 'generation', 'target', 'session']) {
    await test(`original ${key} replacement before install`, async () => {
      const f = await fixture(), original = f.owner[key];
      try { f.owner[key] = {}; await refuse(f.acquisition.install(), 'EARLY_CDP_BINDING_CHANGED'); }
      finally { f.owner[key] = original; await f.close(); }
    });
  }
  for (const key of ['pending', 'unknown', 'overlap']) {
    await test(`loader ${key} refusal before read`, async () => {
      const f = await fixture();
      try { await f.acquisition.install(); await f.load(); f.owner.gate[key] = true;
        await refuse(f.acquisition.acquire(), 'EARLY_CDP_UNSETTLED'); }
      finally { f.owner.gate[key] = false; await f.close(); }
    });
  }
  await test('lost loader completion refuses without replay', async () => {
    const f = await fixture();
    try { await f.acquisition.install(); await f.load(); f.owner.gate.completed = false;
      await refuse(f.acquisition.acquire(), 'EARLY_CDP_COMPLETION_REQUIRED'); }
    finally { await f.close(); }
  });
  await test('expired original absolute deadline', async () => {
    const f = await fixture(-1);
    try { await refuse(f.acquisition.install(), 'EARLY_CDP_EXPIRED'); }
    finally { await f.close(); }
  });
  await test('original abort preserves raw cause ahead of binding drift', async () => {
    const f = await fixture(), reason = new Error('original-abort', { cause: 0 });
    try {
      f.controller.abort(reason); f.owner.generation = 2;
      await assert.rejects(f.acquisition.install(), error => error === reason && error.cause === 0);
    } finally { f.owner.generation = 1; await f.close(); }
  });
  await test('first-await owner drift prevents observation', async () => {
    const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
    f.context.newCDPSession = async page => { const s = await original(page); f.owner.generation = 2; return s; };
    try { await refuse(f.acquisition.install(), 'EARLY_CDP_BINDING_CHANGED'); }
    finally { f.owner.generation = 1; await f.close(); }
  });
  await test('loader starts during installation await: no early ack', async () => {
    const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
    f.context.newCDPSession = async page => { const s = await original(page); f.owner.gate.started = 1; return s; };
    try { await refuse(f.acquisition.install(), 'EARLY_CDP_LATE_INSTALL'); }
    finally { await f.close(); }
  });
  await test('wrong exact defining bytes refuse before export', async () => {
    const f = await fixture(); fixedBytes = helper;
    try { await f.acquisition.install(); await f.load(); await refuse(f.acquisition.acquire(), 'EARLY_CDP_WRONG_SOURCE'); }
    finally { fixedBytes = lock; await f.close(); }
  });
  await test('missing original export refuses', async () => {
    const f = await fixture();
    try { await f.acquisition.install(); await f.load();
      await f.page.evaluate(() => { globalThis.bg.LockDeferred = undefined; });
      await refuse(f.acquisition.acquire(), 'EARLY_CDP_MISSING_EXPORT'); }
    finally { await f.close(); }
  });
  await test('fixed source in foreign iframe context refuses', async () => {
    const f = await fixture();
    try {
      await f.acquisition.install(); f.acquisition.beginFixedLoad();
      await f.page.evaluate(url => new Promise(resolve => {
        const frame = document.createElement('iframe'); frame.onload = resolve; frame.src = url; document.body.append(frame);
      }), base + '/child.html');
      f.owner.gate.completed = true;
      await refuse(f.acquisition.acquire(), 'EARLY_CDP_FOREIGN_CONTEXT');
    } finally { await f.close(); }
  });
  await test('duplicate fixed script refuses', async () => {
    const f = await fixture();
    try { await f.acquisition.install(); await f.load(); await f.page.addScriptTag({ url: base + '/fixed-Lock.js' });
      await refuse(f.acquisition.acquire(), 'EARLY_CDP_MISSING_OR_DUPLICATE_SCRIPT'); }
    finally { await f.close(); }
  });
  await test('binding drift after actual awaited source read refuses projection', async () => {
    const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
    f.context.newCDPSession = async page => {
      const s = await original(page), send = s.send.bind(s);
      s.send = async (method, params) => { const response = await send(method, params);
        if (method === 'Debugger.getScriptSource') f.owner.generation = 2;
        return response; }; return s;
    };
    try { await f.acquisition.install(); await f.load(); await refuse(f.acquisition.acquire(), 'EARLY_CDP_BINDING_CHANGED'); }
    finally { f.owner.generation = 1; await f.close(); }
  });
  await test('original cancellation after awaited source wins secondary drift', async () => {
    const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
    f.context.newCDPSession = async page => {
      const s = await original(page), send = s.send.bind(s);
      s.send = async (method, params) => { const response = await send(method, params);
        if (method === 'Debugger.getScriptSource') { f.controller.abort(0); f.owner.generation = 2; }
        return response; }; return s;
    };
    try {
      await f.acquisition.install(); await f.load(); let caught = false;
      try { await f.acquisition.acquire(); } catch (error) { caught = true; assert.equal(error, 0); }
      assert(caught); assert.equal(f.acquisition.facts().first, 0);
    } finally { f.owner.generation = 1; await f.close(); }
  });
  await test('original absolute deadline expires during awaited source read', async () => {
    const f = await fixture(2000), original = f.context.newCDPSession.bind(f.context);
    const originalDeadline = f.owner.deadline;
    f.context.newCDPSession = async page => {
      const s = await original(page), send = s.send.bind(s);
      s.send = async (method, params) => {
        const response = await send(method, params);
        if (method === 'Debugger.getScriptSource') {
          await new Promise(resolve => setTimeout(resolve, Math.max(0, originalDeadline - Date.now() + 1)));
        }
        return response;
      }; return s;
    };
    try { await f.acquisition.install(); await f.load(); await refuse(f.acquisition.acquire(), 'EARLY_CDP_EXPIRED');
      assert.equal(f.owner.deadline, originalDeadline); }
    finally { await f.close(); }
  });
  for (const primary of [new Error('transport', { cause: 0 }), undefined, null, false, 0, '']) {
    await test(`raw primary ${primary instanceof Error ? 'Error(cause0)' : String(primary)}`, async () => {
      const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
      f.context.newCDPSession = async page => {
        const s = await original(page), send = s.send.bind(s);
        s.send = async (method, params) => {
          if (method === 'Debugger.getScriptSource') { f.owner.generation = 2; throw primary; }
          return send(method, params);
        }; return s;
      };
      try {
        await f.acquisition.install(); await f.load();
        let caught = false;
        try { await f.acquisition.acquire(); } catch (error) { caught = true; assert.equal(error, primary); }
        assert(caught); assert.equal(f.acquisition.facts().first, primary);
      } finally { f.owner.generation = 1; await f.close(); }
    });
  }
  await test('pending original CDP completion blocks disposal then drains without replay', async () => {
    const f = await fixture(), original = f.context.newCDPSession.bind(f.context);
    let delivered, release; const entered = new Promise(resolve => { delivered = resolve; });
    let reads = 0;
    f.context.newCDPSession = async page => {
      const s = await original(page), send = s.send.bind(s);
      s.send = async (method, params) => {
        const response = await send(method, params);
        if (method === 'Debugger.getScriptSource') {
          reads++; delivered(); await new Promise(resolve => { release = resolve; });
        }
        return response;
      }; return s;
    };
    try {
      await f.acquisition.install(); await f.load(); const pending = f.acquisition.acquire();
      await entered; await refuse(f.acquisition.dispose(), 'EARLY_CDP_PENDING_DISPOSAL');
      release(); await pending; assert.equal(reads, 1);
    } finally { if (release) release(); await f.close(); }
  });
} finally {
  if (browser) { await browser.close(); assert.equal(browser.isConnected(), false); }
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
writeFileSync(output, JSON.stringify({ cases: results, checks: results.length,
  actualChromium: true, fixedLockSha256: hash(lock), extendsSha256: hash(helper),
  scopeRefsSerialized: false, lockDeferredOrLexicalGetterCalls: 0,
  fixtureLoader: true, transportDelayAndRefusalControls: 'explicit doubles around actual CDP',
  nativeLoginomPage: false, nativeProvider: false, browserClosed: true, serverClosed: true }, null, 2) + '\n');
console.log(JSON.stringify({ checks: results.length, pass: true, actualChromium: true, nativeProvider: false }));
