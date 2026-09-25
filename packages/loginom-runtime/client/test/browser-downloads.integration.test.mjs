import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import {createSession} from '../lib/session.mjs';
import {loginBrowser} from '../../src/connection-check.mjs';

// No synthetic download event: the fixture uses a native Blob/anchor download
// and real file inputs inside the same Page that MCP owns.
const html = `<!doctype html><html><body>
<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div>
<input id="upload" type="file" hidden><input id="chooser" type="file">
<button id="save">Download</button>
<script>
window.initialPicker = typeof showSaveFilePicker;
window.bg = {app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}}}}}}};
document.querySelector('#save').onclick = async () => {
  if (window.initialPicker !== 'undefined') {
    await showSaveFilePicker({suggestedName:'sales.csv'});
    return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['group;qty\\nA;1\\n']));
  link.download = 'sales.csv';
  link.click();
};
</script></body></html>`;

for (const owner of ['mcp', 'managed']) {
  test(`${owner} browser selects downloads before the first page script and retains uploads`, {
    skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
    timeout: 90000,
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dock-browser-downloads-'));
    const http = createServer((request, response) => {
      response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      response.end(html);
    });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${http.address().port}/app/`;
    const client = new Client({name:'download-regression', version:'1'});
    const handles = {};
    try {
      const headless = process.env.LOGINOM_DOCK_TEST_HEADED !== '1';
      const session = await createSession({stateDir: directory, mode:'executor-replay', agent:'codex', adapterRevision:'test', loginomUrl:url}, {
        headless, managed:{directory:join(directory,'session'), browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER, browserRoot:dirname(process.env.LOGINOM_DOCK_TEST_BROWSER)},
      });
      const config = JSON.parse(await readFile(session.browserConfig, 'utf8'));
      await writeFile(join(session.metadata.artifacts, 'input.csv'), 'value\n42\n');
      if (owner === 'managed') {
        const authenticated = await loginBrowser({browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER, profile:join(directory,'authenticated'),
          candidate:{url, username:'user', password:''}, headless, keepOpen:true});
        handles.context = authenticated.context;
        // This assertion intentionally precedes MCP: its init script cannot fix
        // a capability decision already made by an authenticated application.
        assert.equal(await handles.context.pages()[0].evaluate(() => window.initialPicker), 'undefined');
      }
      handles.server = await createConnection(config, owner === 'managed' ? async () => handles.context : undefined);
      const [local, remote] = InMemoryTransport.createLinkedPair();
      await handles.server.connect(remote);
      await client.connect(local);
      handles.connected = true;
      const code = async source => {
        const reply = await client.callTool({name:'browser_run_code_unsafe', arguments:{code:source}}, undefined, {timeout:30000});
        const text = reply.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        assert.equal(reply.isError ?? false, false, text);
        const result = text.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
        assert.ok(result, text);
        return JSON.parse(result[1]);
      };
      assert.equal(await code(`async page => {
        ${owner === 'mcp' ? `await page.goto(${JSON.stringify(url)});` : ''}
        return await page.evaluate(() => window.initialPicker);
      }`), 'undefined');
      const geometry=await code('async page => ({viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio)})');
      assert.equal(geometry.dpr,1,'agent browser normalizes OS scale at default page zoom');
      assert.deepEqual(geometry.viewport,headless?{width:1280,height:800}:null);
      const downloaded = await code(`async page => {
        const event = page.waitForEvent('download', {timeout:5000});
        await page.locator('#save').click();
        const file = await event;
        await file.saveAs(${JSON.stringify(join(session.metadata.artifacts, 'sales.csv'))});
        await page.locator('#upload').setInputFiles(${JSON.stringify(join(session.metadata.artifacts, 'input.csv'))});
        return {name:file.suggestedFilename(), failure:await file.failure(), listeners:page.listenerCount('filechooser'),
          uploaded:await page.locator('#upload').evaluate(async input => await input.files[0].text())};
      }`);
      assert.equal(downloaded.name, 'sales.csv');
      assert.equal(downloaded.failure, null);
      assert.ok(downloaded.listeners > 0);
      assert.equal(downloaded.uploaded, 'value\n42\n');
      assert.equal(await readFile(join(session.metadata.artifacts, 'sales.csv'), 'utf8'), 'group;qty\nA;1\n');
      const navigation = await code(`async page => {
        await page.reload();
        const reloaded = await page.evaluate(() => window.initialPicker);
        const tab = await page.context().newPage();
        try {
          await tab.goto(${JSON.stringify(url)});
          const fresh = await tab.evaluate(() => window.initialPicker);
          await tab.goto(${JSON.stringify(url.replace('127.0.0.1', 'localhost'))});
          return {reloaded, fresh, other:await tab.evaluate(() => window.initialPicker)};
        } finally { await tab.close(); }
      }`);
      assert.deepEqual(navigation, {reloaded:'undefined', fresh:'undefined', other:'function'});
      // Leave the chooser to MCP's public upload tool, preserving its modal lifecycle.
      const opened = await client.callTool({name:'browser_run_code_unsafe', arguments:{code:`async page => {
        await page.locator('#chooser').click();
      }`}});
      assert.equal(opened.isError ?? false, false);
      const uploaded = await client.callTool({name:'browser_file_upload', arguments:{paths:[join(session.metadata.artifacts,'sales.csv')]}});
      assert.equal(uploaded.isError ?? false, false, JSON.stringify(uploaded));
      assert.equal(await code('async page => await page.locator("#chooser").evaluate(async input => await input.files[0].text())'), 'group;qty\nA;1\n');
    } finally {
      if (handles.connected) await client.callTool({name:'browser_close', arguments:{}});
      await client.close();
      await handles.server?.close();
      await handles.context?.close();
      await new Promise(resolve => http.close(resolve));
      await rm(directory, {recursive:true, force:true, maxRetries:5});
    }
  });
}
