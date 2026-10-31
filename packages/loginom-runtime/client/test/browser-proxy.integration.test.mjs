import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {EventEmitter, errorMonitor, once} from 'node:events';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, rm} from 'node:fs/promises';
import {networkInterfaces, tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {systemProxyFixture} from './support/system-proxy-fixture.mjs';
import {isWindowsSystemOwner, observeWindowsCryptSvc} from './support/windows-crypto-probe.mjs';

const execute = promisify(execFile);
function trackSocket(socket, sockets) {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  // HTTP hands CONNECT/upgrade sockets to the fixture. Browser shutdown may
  // reset them; other transport errors must still fail the test.
  socket.on('error', error => { if (error.code !== 'ECONNRESET') throw error; });
}

test('HTTP upgrade and CONNECT fixture sockets survive a peer reset', {timeout:10000}, async t => {
  for (const event of ['upgrade', 'connect']) {
    await t.test(event, async t => {
      const sockets = new Set();
      const server = createServer();
      let reset;
      let closed;
      server.on(event, (request, socket) => {
        trackSocket(socket, sockets);
        // Observe without handling the error: removing trackSocket's listener
        // must reproduce the uncaught ECONNRESET rather than silently pass.
        reset = new Promise(resolve => socket.once(errorMonitor, resolve));
        closed = new Promise(resolve => socket.once('close', resolve));
        socket.write(event === 'upgrade'
          ? 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
          : 'HTTP/1.1 200 Connection Established\r\n\r\n');
      });
      t.after(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const client = createConnection(server.address().port, '127.0.0.1');
      t.after(() => client.destroy());
      await once(client, 'connect');
      const response = once(client, 'data');
      client.write(event === 'upgrade'
        ? 'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
        : 'CONNECT localhost:443 HTTP/1.1\r\nHost: localhost\r\n\r\n');
      await response;
      assert.equal(sockets.size, 1);
      client.resetAndDestroy();
      assert.equal((await reset).code, 'ECONNRESET');
      await closed;
      assert.equal(sockets.size, 0);
    });
  }
});

// The same handlers serve native acceptance and the deterministic phase regression.
function createProxyFixture({observe = observeWindowsCryptSvc, platform = process.platform, systemRoot = process.env.SystemRoot, sockets = new Set()} = {}) {
  const requests = [];
  const observations = new Set();
  const fixture = {requests, phase:'setup', async settle() {
    // New requests can arrive while earlier TCP owners are being inspected.
    while (observations.size) await Promise.all([...observations]);
  }};
  function record(request, socket, respond) {
    // Admission and phase must never depend on an asynchronous PID lookup.
    const entry = {phase:fixture.phase, method:request.method, url:request.url};
    requests.push(entry);
    if (platform !== 'win32') { respond(); return; }
    const observation = (async () => {
      try {
        entry.owner = await observe(socket);
        entry.system = isWindowsSystemOwner(entry.owner, systemRoot);
      } catch (error) {
        entry.error = {message:error.message, code:error.code, stderr:error.stderr};
      } finally {
        // Retain HTTP and CONNECT endpoints until attribution has completed.
        respond();
      }
    })();
    observations.add(observation);
    observation.finally(() => observations.delete(observation));
  }
  fixture.proxy = createServer((request, response) => {
    record(request, request.socket, () => response.end(
      request.method === 'GET' && [
        'http://www.msftconnecttest.com/connecttest.txt',
        'http://ipv6.msftconnecttest.com/connecttest.txt',
      ].includes(request.url) ? 'Microsoft Connect Test' : 'PROXY')); // Response content never exempts traffic.
  });
  fixture.proxy.on('connect', (request, socket) => {
    trackSocket(socket, sockets);
    record(request, socket, () => socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
  });
  return fixture;
}

test('delayed control attribution is recorded before the product boundary', async t => {
  for (const method of ['GET', 'CONNECT']) await t.test(method, async () => {
    let release;
    let responded = false;
    let settled = false;
    const fixture = createProxyFixture({platform:'win32', observe:() => new Promise(resolve => { release = resolve; })});
    const socket = new EventEmitter();
    socket.end = () => { responded = true; };
    const request = {method, url:method === 'GET'
      ? 'http://crl.microsoft.com/pki/crl/products/MicRooCerAut2011_2011_03_22.crl' : 'login.live.com:443', socket, headers:{'user-agent':'Microsoft-CryptoAPI/10.0'}};
    fixture.phase = 'control';
    fixture.proxy.emit(method === 'GET' ? 'request' : 'connect', request, method === 'GET' ? {end:socket.end} : socket);
    const before = fixture.requests.length;
    const boundary = fixture.settle().then(() => { settled = true; fixture.phase = 'product'; });
    await Promise.resolve();
    assert.equal(responded, false, 'Keep the TCP endpoint alive during attribution');
    assert.equal(settled, false, 'Product boundary must wait for control attribution');
    release(undefined);
    await boundary;
    assert.equal(responded, true);
    assert.equal(before, 1, 'Record the request synchronously');
    assert.equal(fixture.requests[0].phase, 'control');
    assert.deepEqual(fixture.requests.slice(before), [], 'Late control attribution must not become product traffic');
  });
});

test('proxy attribution exempts only a proven Windows service owner', async t => {
  const owner = {pid:3248, name:'svchost.exe', path:'C:\\Windows\\System32\\svchost.exe',
    parentName:'services.exe', parentPath:'C:\\Windows\\System32\\services.exe',
    services:[{pid:3248, name:'CryptSvc', state:'Running'}]};
  for (const method of ['GET', 'CONNECT']) for (const [label, observed] of [
    ['service', owner], ['unknown', undefined], ['PID 0', {...owner, pid:0}],
    ['Chromium', {...owner, name:'chrome.exe', path:'C:\\Chromium\\chrome.exe'}],
    ['lookup error', Error('TCP owner lookup failed')],
  ]) await t.test(`${method}: ${label}`, async () => {
    let responded = false;
    const fixture = createProxyFixture({platform:'win32', systemRoot:'C:\\Windows', observe:async () => {
      if (observed instanceof Error) throw observed;
      return observed;
    }});
    const socket = new EventEmitter();
    socket.end = () => { responded = true; };
    fixture.phase = 'product';
    // Include previously allowlisted NCSI: a URL must never prove ownership.
    const request = {method, url:method === 'GET' ? 'http://www.msftconnecttest.com/connecttest.txt' : 'login.live.com:443', socket, headers:{'user-agent':'Microsoft-CryptoAPI/10.0'}};
    fixture.proxy.emit(method === 'GET' ? 'request' : 'connect', request, method === 'GET' ? {end:socket.end} : socket);
    assert.equal(fixture.requests.length, 1);
    assert.equal(responded, false);
    await fixture.settle();
    assert.equal(responded, true);
    const traffic = fixture.requests.filter(entry => !entry.system);
    assert.equal(traffic.length, label === 'service' ? 0 : 1);
    if (traffic.length) assert.throws(() => assert.deepEqual(traffic, [], 'Product navigation must never reach the proxy'));
    if (label === 'lookup error') assert.equal(traffic[0].error.message, observed.message);
    else assert.equal(fixture.requests[0].owner, observed);
  });
});

const html = `<!doctype html><body>
<div data-tid="LoginForm;Login;edtUsername"><input></div>
<div data-tid="LoginForm;Login;edtPassword"><input type="password"></div>
<button data-tid="LoginForm;Login;btnLogin">Login</button>
<script>
function authenticated() {
  window.bg = {app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}}}}}}};
  document.body.insertAdjacentHTML('beforeend', '<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div>');
}
if (sessionStorage.account === 'user') authenticated();
document.querySelector('button').onclick = () => {
  const inputs = document.querySelectorAll('input');
  if (inputs[0].value !== 'user' || inputs[1].value !== 'test-password') return;
  sessionStorage.account = 'user'; authenticated();
};
</script>`;

test('Loginom Chromium connects directly with a configured proxy', {
  skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && !process.env.CI && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
  timeout:900000,
}, async t => {
  assert.ok(process.env.LOGINOM_DOCK_TEST_BROWSER, 'Pinned Chromium is required in CI');
  const address = Object.values(networkInterfaces()).flat().find(item => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))?.address;
  assert.ok(address, 'A non-loopback interface is required: localhost would falsely pass via implicit proxy bypass');
  const directory = await mkdtemp(join(tmpdir(), 'direct-browser-'));
  const pacReads = [];
  const sockets = new Set();
  const origin = createServer((request, response) => {
    if (request.url === '/proxy.pac') {
      pacReads.push(request.url);
      response.setHeader('Content-Type', 'application/x-ns-proxy-autoconfig');
      response.end(`function FindProxyForURL(url, host) { return "PROXY ${address}:${proxy.address().port}"; }`);
      return;
    }
    response.setHeader('Content-Type', 'text/html'); response.end(html);
  });
  const fixture = createProxyFixture({sockets});
  const {proxy, requests} = fixture;
  const state = {};
  t.after(async () => {
    await fixture.settle();
    try { await state.native?.restore(); }
    finally {
      for (const socket of sockets) socket.destroy();
      for (const server of [origin, proxy]) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
      await rm(directory, {recursive:true, force:true, maxRetries:5});
    }
  });
  origin.on('upgrade', (request, socket) => {
    trackSocket(socket, sockets);
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(Buffer.concat([Buffer.from([0x81, 16]), Buffer.from('DIRECT_WEBSOCKET')]));
    // The test only receives one text frame; do not leave upgraded sockets alive.
    socket.on('data', () => socket.end());
  });
  for (const server of [origin, proxy]) {
    await new Promise(resolve => server.listen(0, address, resolve));
  }
  const url = `http://${address}:${origin.address().port}/app/`;
  const proxyUrl = `http://${address}:${proxy.address().port}`;
  const pacUrl = `http://${address}:${origin.address().port}/proxy.pac`;
  const unavailable = createServer();
  await new Promise(resolve => unavailable.listen(0, address, resolve));
  const unavailableProxy = `http://${address}:${unavailable.address().port}`;
  await new Promise(resolve => unavailable.close(resolve));
  const native = process.env.LOGINOM_DOCK_TEST_SYSTEM_PROXY === '1' ? await systemProxyFixture(directory) : null;
  state.native = native;
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(http|https|all|no)_proxy$/i.test(key)));
  const modes = process.env.LOGINOM_DOCK_TEST_HEADED === '1' ? ['headless', 'headed'] : ['headless'];
  for (const scenario of native ? ['manual', 'pac', 'environment', 'unavailable'] : ['environment']) {
    await native?.apply(scenario === 'environment' ? 'none' : scenario === 'pac' ? 'pac' : 'manual',
      scenario === 'unavailable' ? unavailableProxy : proxyUrl, pacUrl);
    for (const mode of modes) {
      await t.test(`${scenario}, ${mode}`, async () => {
        const run = async (owner, extra = []) => execute(process.execPath,
          [fileURLToPath(new URL('./support/direct-browser-child.mjs', import.meta.url)),
            owner, join(directory, `${scenario}-${mode}-${owner}`), url, mode, ...extra], {
            env:{...environment,
              ...(scenario === 'environment' ? {HTTP_PROXY:proxyUrl, HTTPS_PROXY:proxyUrl, ALL_PROXY:proxyUrl,
                http_proxy:proxyUrl, https_proxy:proxyUrl, all_proxy:proxyUrl, NO_PROXY:'', no_proxy:''} : {}),
              LOGINOM_DOCK_TEST_PUBLIC_APP:process.env.LOGINOM_DOCK_TEST_PUBLIC_APP === '1' && scenario === 'manual' && mode === 'headless' && owner === 'managed' ? '1' : '0'},
            timeout:90000, maxBuffer:1024*1024,
          });
        fixture.phase = `${scenario}-${mode}:control`;
        const controlBefore = requests.length;
        if (scenario === 'unavailable') await run('control-unavailable');
        else {
          // Native settings are used without proxy switches. Environment-only
          // controls explicitly select the trap: Windows/macOS ignore these vars.
          await run('control', scenario === 'environment' ? [proxyUrl] : []);
          await fixture.settle();
          assert.ok(requests.slice(controlBefore).some(entry => entry.url === url && !entry.system), 'Positive control must reach the proxy');
          if (scenario === 'pac') assert.ok(pacReads.length > 0, 'Control must load the system PAC');
        }
        await fixture.settle();
        fixture.phase = `${scenario}-${mode}:product`;
        const before = requests.length;
        const pacBefore = pacReads.length;
        await run('managed');
        await run('mcp');
        await fixture.settle();
        assert.deepEqual(requests.slice(before).filter(entry => !entry.system), [], 'Product navigation must never reach the proxy');
        assert.equal(pacReads.length, pacBefore, 'Product browsers must not load a PAC');
      });
    }
  }
  const systemProbes = requests.filter(entry => entry.system);
  if (systemProbes.length) t.diagnostic(`Separate Windows service probes: ${JSON.stringify(systemProbes)}`);
});
