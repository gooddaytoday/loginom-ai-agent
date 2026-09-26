import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createConnection} from '@playwright/mcp';
import {createSession} from '../lib/session.mjs';
import {readCatalog, selectToolGroups, combineCatalogs} from '../lib/catalog.mjs';

// Exercise the installed MCP/SDK protocol without creating a browser or Page.
test('pinned MCP lists the internal execution tool without expanding the executor catalog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'loginom-mcp-contract-'));
  const client = new Client({name:'runtime-contract', version:'1'});
  let server;
  try {
    const session = await createSession({stateDir:directory, mode:'executor-replay', agent:'loginom-ai-agent', adapterRevision:'1', loginomUrl:'https://loginom.test/app/'}, {
      headless:true,
      managed:{directory:join(directory,'session'), browserPath:process.execPath, browserRoot:directory},
    });
    const config = JSON.parse(await readFile(session.browserConfig, 'utf8'));
    assert.equal(config.webmcp, false);
    assert.equal(config.browser.launchOptions.chromiumSandbox, true);
    assert.equal(config.timeouts.settle, 0);
    const release = JSON.parse(await readFile(new URL('../../../product/loginom-release.json', import.meta.url), 'utf8'));
    assert.equal(session.metadata.playwrightMcp, release.playwrightMcp);
    assert.equal(session.metadata.playwright, release.playwright);
    assert.equal(session.metadata.chromiumRevision, release.chromiumRevision);
    const lock = await readFile(new URL('../package-lock.json', import.meta.url));
    assert.equal(createHash('sha256').update(lock.toString().replace(/\r\n/g, '\n')).digest('hex'), release.runtimeLockSha256);
    server = await createConnection(config, async () => {
      assert.fail('Catalog negotiation must not request a browser context');
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const browserTools = await readCatalog(client);
    const execution = browserTools.find(tool => tool.name === 'browser_run_code_unsafe');
    assert.ok(execution);
    assert.equal(execution.inputSchema.properties.code.type, 'string');
    assert.equal(browserTools.some(tool => /^(webmcp_|browser_webmcp_)/.test(tool.name)), false);
    assert.deepEqual(await readCatalog(client), browserTools);
    const remoteTools = [{name:'read', inputSchema:{type:'object'}}];
    const executorLocalTools = [{name:'dock_prepare', inputSchema:{type:'object'}}];
    for (const mode of ['executor-preview', 'executor-replay']) {
      const catalog = combineCatalogs(selectToolGroups(mode, {remoteTools, browserTools, commonLocalTools:[], executorLocalTools}));
      assert.deepEqual(catalog.tools, [...remoteTools, ...executorLocalTools]);
    }
  } finally {
    await client.close();
    await server?.close();
    await rm(directory, {recursive:true, force:true});
  }
});
