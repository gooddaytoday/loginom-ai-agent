import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, rm} from 'node:fs/promises';
import {networkInterfaces, tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {systemProxyFixture} from './support/system-proxy-fixture.mjs';

const execute = promisify(execFile);
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
  const requests = [];
  const connectivityProbes = [];
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
  const proxy = createServer((request, response) => {
    // WinINET changes trigger OS connectivity probes independently of Chromium.
    // Ignore only these observed NCSI GETs, never arbitrary background traffic:
    // https://techcommunity.microsoft.com/blog/networkingblog/ncsi-change-notification/3866600
    if (process.platform === 'win32' && request.method === 'GET' && [
      'http://www.msftconnecttest.com/connecttest.txt',
      'http://ipv6.msftconnecttest.com/connecttest.txt',
    ].includes(request.url)) {
      connectivityProbes.push(request.url);
      response.end('Microsoft Connect Test');
      return;
    }
    requests.push(request.url); response.end('PROXY');
  });
  const state = {};
  t.after(async () => {
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
  proxy.on('connect', (request, socket) => { requests.push(request.url); socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'); });
  origin.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
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
        const controlBefore = requests.length;
        if (scenario === 'unavailable') await run('control-unavailable');
        else {
          // Native settings are used without proxy switches. Environment-only
          // controls explicitly select the trap: Windows/macOS ignore these vars.
          await run('control', scenario === 'environment' ? [proxyUrl] : []);
          assert.ok(requests.slice(controlBefore).includes(url), 'Positive control must reach the proxy');
          if (scenario === 'pac') assert.ok(pacReads.length > 0, 'Control must load the system PAC');
        }
        const before = requests.length;
        const pacBefore = pacReads.length;
        await run('managed');
        await run('mcp');
        assert.deepEqual(requests.slice(before), [], 'Product navigation must never reach the proxy');
        assert.equal(pacReads.length, pacBefore, 'Product browsers must not load a PAC');
      });
    }
  }
  if (connectivityProbes.length) t.diagnostic(`Separate Windows NCSI probes: ${connectivityProbes.length}`);
});
