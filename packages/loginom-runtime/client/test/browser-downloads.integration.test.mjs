import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createConnection} from '@playwright/mcp';
import {createSession} from '../lib/session.mjs';
import {loginBrowser} from '../../src/connection-check.mjs';
import {browserProcessEnvironment} from '../lib/bridge.mjs';
import {browserServerDownloadProgress} from '../lib/executor.mjs';
import {chromium} from 'playwright-core';

test('Chromium progress tracks only the owned page transfer before saveAs completes',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER,timeout:30000,
},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'server-byte-progress-'));
 const responses=[];
 const http=createServer((request,response)=>{
  if(request.url==='/file'){
   response.writeHead(200,{'Content-Disposition':'attachment; filename="source.csv"','Content-Length':1048576});
   response.write(Buffer.alloc(524288,'a'));responses.push(response);return;
  }
  response.end('<a href="/file">download</a>');
 });
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${http.address().port}`;
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,
  chromiumSandbox:true,downloadsPath:directory});
 t.after(async()=>{await browser.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));await rm(directory,{recursive:true,force:true});});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),foreign=await context.newPage();
 await page.goto(origin);await foreign.goto(origin);
 const progress=await browserServerDownloadProgress(page,{artifact:{name:'source.csv'},expected_origin:origin,
  server_source_binding:{bytes:1048576},browser_downloads_path:directory});
 const other=foreign.waitForEvent('download');await foreign.locator('a').click();
 const otherDownload=await other;responses[0].end(Buffer.alloc(524288,'b'));await otherDownload.path();
 assert.equal(progress.guid,null);assert.equal(progress.bytes,0);
 const event=page.waitForEvent('download');await page.locator('a').click();const download=await event;
 const copy=download.saveAs(join(directory,'copy.csv'));
 const until=Date.now()+10000;
 while(progress.bytes===0&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,50));
 assert.ok(progress.bytes>0&&progress.bytes<1048576,JSON.stringify(progress));
 assert.equal(progress.failed,false);assert.equal(progress.url,download.url());
 responses[1].end(Buffer.alloc(524288,'b'));await copy;
 assert.equal(progress.bytes,1048576);assert.equal((await readFile(join(directory,'copy.csv'))).length,1048576);
 await progress.close();
});

// No synthetic download event: a trusted click follows the native Blob link
// selected by the first page script, inside the same Page that MCP owns.
const html = `<!doctype html><html><body>
<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div>
<input id="upload" type="file" hidden><input id="chooser" type="file">
<a id="save" download="sales.csv">Download</a>
<script>
window.initialPicker = typeof showSaveFilePicker;
window.bg = {app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}}}}}}};
window.downloadClicks = 0;
document.querySelector('#save').addEventListener('click', () => window.downloadClicks++);
window.downloadMode = window.initialPicker === 'undefined' ? 'blob' : 'picker';
if (window.downloadMode === 'blob') {
  document.querySelector('#save').href = URL.createObjectURL(new Blob(['group;qty\\nA;1\\n']));
} else {
  document.querySelector('#save').onclick = async event => {
    event.preventDefault();
    await showSaveFilePicker({suggestedName:'sales.csv'});
  };
}
</script></body></html>`;

for (const owner of ['mcp', 'managed']) {
  test(`${owner} browser selects downloads before the first page script and retains uploads`, {
    skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
    timeout: 90000,
  }, async t => {
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
        assert.equal(await handles.context.pages()[0].evaluate(() => window.downloadMode), 'blob');
      }
      if (owner === 'managed') {
        handles.server = await createConnection(config, async () => handles.context);
        const [local, remote] = InMemoryTransport.createLinkedPair();
        await handles.server.connect(remote);
        await client.connect(local);
      } else {
        // Match the product's MCP-owned CLI path. The upstream in-process API
        // does not own browser disposal; managed callers close their context.
        handles.transport = new StdioClientTransport({command:process.execPath,
          args:[session.browserCli, '--config', session.browserConfig],
          env:browserProcessEnvironment(session.browserRoot), cwd:session.directory, stderr:'pipe'});
        handles.transport.stderr?.on('data', () => {});
        handles.transport.onclose = () => { handles.transportClosed = true; };
        await client.connect(handles.transport);
      }
      handles.connected = true;
      const code = async source => {
        const reply = await client.callTool({name:'browser_run_code_unsafe', arguments:{code:source}}, undefined, {timeout:30000});
        const text = reply.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        assert.equal(reply.isError ?? false, false, text);
        const result = text.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
        assert.ok(result, text);
        return JSON.parse(result[1]);
      };
      assert.deepEqual(await code(`async page => {
        ${owner === 'mcp' ? `await page.goto(${JSON.stringify(url)});` : ''}
        return await page.evaluate(() => ({picker:window.initialPicker, mode:window.downloadMode}));
      }`), {picker:'undefined', mode:'blob'});
      const geometry=await code('async page => ({viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio)})');
      assert.equal(geometry.dpr,1,'agent browser normalizes OS scale at default page zoom');
      assert.deepEqual(geometry.viewport,headless?{width:1280,height:800}:null);
      const downloaded = await code(`async page => {
        const started = Date.now();
        const events = [];
        const mark = phase => events.push({phase, ms:Date.now()-started});
        const onPageError = error => events.push({phase:'pageerror', ms:Date.now()-started, message:error.message.slice(0,500)});
        const onCrash = () => mark('crash');
        page.on('pageerror', onPageError);
        page.on('crash', onCrash);
        // Register before the action; retain the cold Chromium budget.
        const event = page.waitForEvent('download', {timeout:20000});
        event.then(() => mark('download'), () => mark('download_failed'));
        try {
          mark('click_start');
          const [file] = await Promise.all([event, page.locator('#save').click({timeout:20000})]);
          mark('click_done');
          const download_ms = Date.now() - started;
          await file.saveAs(${JSON.stringify(join(session.metadata.artifacts, 'sales.csv'))});
          await page.locator('#upload').setInputFiles(${JSON.stringify(join(session.metadata.artifacts, 'input.csv'))});
          return {download_ms, clicks:await page.evaluate(() => window.downloadClicks), url:file.url(),
            name:file.suggestedFilename(), failure:await file.failure(), listeners:page.listenerCount('filechooser'),
            uploaded:await page.locator('#upload').evaluate(async input => await input.files[0].text())};
        } catch (error) {
          const state = await page.locator('#save').evaluate(link => ({picker:window.initialPicker,
            mode:window.downloadMode, clicks:window.downloadClicks, href:link.href,
            ready:document.readyState, visibility:document.visibilityState})).catch(() => ({unavailable:true}));
          throw new Error(String(error) + '\\nDownload diagnostics: ' + JSON.stringify({closed:page.isClosed(), events, fixture:state}), {cause:error});
        } finally {
          page.off('pageerror', onPageError);
          page.off('crash', onCrash);
        }
      }`);
      assert.equal(downloaded.name, 'sales.csv');
      assert.equal(downloaded.clicks, 1, 'one trusted click without replay');
      assert.ok(downloaded.url.startsWith('blob:' + new URL(url).origin + '/'));
      t.diagnostic(`${owner} native Blob download ${downloaded.download_ms.toFixed(1)}ms`);
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
      try {
        if (handles.connected) {
          const closed = await client.callTool({name:'browser_close', arguments:{}}, undefined, {timeout:15000});
          assert.equal(closed.isError ?? false, false, JSON.stringify(closed));
        }
      } finally {
        try { await client.close(); }
        finally {
          try { await handles.server?.close(); }
          finally {
            try { await handles.context?.close(); }
            finally {
              await new Promise(resolve => http.close(resolve));
              await rm(directory, {recursive:true, force:true, maxRetries:5});
            }
          }
        }
      }
      if (handles.transport) assert.equal(handles.transportClosed, true, 'MCP child transport must close');
    }
  });
}
