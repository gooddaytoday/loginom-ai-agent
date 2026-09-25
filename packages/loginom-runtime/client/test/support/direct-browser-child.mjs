import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import {chromium} from 'playwright-core';
import {createSession} from '../../lib/session.mjs';
import {loginBrowser} from '../../../src/connection-check.mjs';

const [owner, directory, url, mode, proxy] = process.argv.slice(2);
const browserPath = process.env.LOGINOM_DOCK_TEST_BROWSER;
const headless = mode === 'headless';
const handles = {};
const client = new Client({name:'direct-browser-regression', version:'1'});
try {
  if (owner.startsWith('control')) {
    handles.context = await chromium.launchPersistentContext(join(directory, 'control'), {
      executablePath:browserPath, headless, chromiumSandbox:true,
      // The default control uses the same native settings/environment as the product.
      ...(proxy ? {args:[`--proxy-server=${proxy}`]} : {}),
    });
    const page = handles.context.pages()[0];
    if (owner === 'control-unavailable') await assert.rejects(page.goto(url, {timeout:15000}), /ERR_PROXY_CONNECTION_FAILED/);
    else {
      await page.goto(url, {timeout:15000});
      assert.equal(await page.textContent('body'), 'PROXY');
    }
  } else {
    const session = await createSession({stateDir:directory, mode:'executor-replay', agent:'codex', adapterRevision:'test', loginomUrl:url}, {
      headless, managed:{directory:join(directory,'session'), browserPath, browserRoot:dirname(browserPath)},
    });
    if (owner === 'managed') {
      const authenticated = await loginBrowser({browserPath, profile:join(directory,'authenticated'),
        candidate:{url, username:'user', password:'test-password'}, headless, keepOpen:true});
      handles.context = authenticated.context;
      await handles.context.pages()[0].evaluate(() => { window.contextToken = 'same-authenticated-page'; });
    }
    handles.server = await createConnection(JSON.parse(await readFile(session.browserConfig, 'utf8')),
      owner === 'managed' ? async () => handles.context : undefined);
    const [local, remote] = InMemoryTransport.createLinkedPair();
    await handles.server.connect(remote);
    await client.connect(local);
    handles.connected = true;
    const reply = await client.callTool({name:'browser_run_code_unsafe', arguments:{code:`async page => {
      // The pinned Playwright omits --enable-automation, which disables
      // Browser.getBrowserCommandLine. Read Chromium's own version page over CDP.
      const version = await page.context().newPage();
      await version.goto('chrome://version');
      const cdp = await page.context().newCDPSession(version);
      const command = await cdp.send('Runtime.evaluate', {expression:'document.querySelector("#command_line").textContent', returnByValue:true});
      await cdp.detach();
      await version.close();
      const token = await page.evaluate(() => window.contextToken ?? null);
      ${owner === 'mcp' ? `
      await page.goto(${JSON.stringify(url)});
      await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill('user');
      await page.locator('[data-tid="LoginForm;Login;edtPassword"] input').fill('test-password');
      await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();` : ''}
      await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();
      const identity = await page.evaluate(() => window.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName);
      await page.goto(${JSON.stringify(new URL('next', url).href)});
      const socket = await page.evaluate(() => new Promise((resolve, reject) => {
        const socket = new WebSocket(location.origin.replace('http:', 'ws:') + '/socket');
        const timer = setTimeout(() => { socket.close(); reject(Error('WebSocket timeout')); }, 10000);
        socket.onmessage = event => { clearTimeout(timer); socket.close(); resolve(event.data); };
        socket.onerror = () => { clearTimeout(timer); reject(Error('WebSocket failed')); };
      }));
      const url = page.url();
      ${process.env.LOGINOM_DOCK_TEST_PUBLIC_APP === '1' ? `
      const publicApp = await page.goto('https://app.loginom.ai/app/?testable=true', {waitUntil:'domcontentloaded', timeout:30000});
      if (!publicApp || publicApp.status() >= 400) throw Error('Public Loginom did not load');
      await page.locator('[data-tid="LoginForm;Login;edtUsername"]').waitFor({timeout:15000});` : ''}
      return {args:command.result.value, token, identity, socket, url};
    }`}}, undefined, {timeout:45000});
    const text = reply.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
    assert.equal(reply.isError ?? false, false, text);
    const result = JSON.parse(text.match(/### Result\n([\s\S]*?)(?:\n###|$)/)[1]);
    assert.match(result.args, /\s--no-proxy-server(?:\s|$)/, 'Chromium must explicitly disable proxy discovery');
    assert.doesNotMatch(result.args, /\s--proxy-(server|pac-url|auto-detect|bypass-list)(=|\s|$)/);
    assert.doesNotMatch(result.args, /\s--no-sandbox(?:\s|$)/);
    assert.equal(result.identity, 'user');
    assert.equal(result.socket, 'DIRECT_WEBSOCKET');
    assert.equal(result.url, new URL('next', url).href);
    assert.equal(result.token, owner === 'managed' ? 'same-authenticated-page' : null);
  }
} finally {
  // Close the owned browser before the MCP transport, including assertion failures.
  if (handles.connected) await client.callTool({name:'browser_close', arguments:{}}, undefined, {timeout:15000});
  await client.close();
  await handles.server?.close();
  await handles.context?.close();
}
