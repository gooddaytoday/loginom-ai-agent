import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, combineCatalogs, connectRemote, selectToolGroups } from '../lib/catalog.mjs';

const tool = (name) => ({ name, inputSchema: { type: 'object', properties: {} } });

test('reads all tool pages and detects a non-advancing cursor', async () => {
  const pages = [{ tools: [tool('read')], nextCursor: 'next' }, { tools: [tool('find')] }];
  const calls = [];
  assert.deepEqual((await readCatalog({ listTools: async (args) => { calls.push(args); return pages.shift(); } })).map(t => t.name), ['read', 'find']);
  assert.deepEqual(calls, [{}, { cursor: 'next' }]);
  await assert.rejects(readCatalog({ listTools: async () => ({ tools: [], nextCursor: 'same' }) }), /Repeated/);
});

test('fails explicitly on collisions including different catalog owners', () => {
  assert.throws(() => combineCatalogs({ remote: [tool('read')], browser: [tool('read')] }), /collision: read/);
  assert.throws(() => combineCatalogs({ remote: [tool('read'), tool('read')] }), /collision/);
});

test('preserves tool schemas and isolates the pinned session from later catalog changes', () => {
  const remote = [tool('read')];
  const result = combineCatalogs({ remote, browser: [tool('browser_navigate')] });
  remote[0].inputSchema.properties.changed = { type: 'string' };
  assert.deepEqual(result.tools[0], tool('read'));
  assert.equal(result.routes.get('read'), 'remote');
  assert.equal(result.routes.get('browser_navigate'), 'browser');
  assert.equal(result.sha256.length, 64);
});

test('executor-preview removes every raw browser and clipboard tool while keeping only action entrypoints', () => {
  const groups = selectToolGroups('executor-preview', {
    remoteTools: [tool('read')], browserTools: [tool('browser_click'), tool('browser_run_code_unsafe')],
    commonLocalTools: [tool('dock_diagnostics'), tool('dock_prepare'), tool('dock_clipboard_transfer')],
    executorLocalTools: [tool('dock_diagnostics'), tool('dock_prepare'), tool('dock_action_describe'), tool('dock_action_run')],
  });
  const names = combineCatalogs(groups).tools.map(item => item.name);
  assert.deepEqual(names, ['read', 'dock_diagnostics', 'dock_prepare', 'dock_action_describe', 'dock_action_run']);
  assert.equal(names.some(name => name.startsWith('browser_')), false);
  assert.equal(names.includes('dock_clipboard_transfer'), false);
  assert.deepEqual(selectToolGroups('executor-replay', {
    remoteTools: [tool('read')], browserTools: [tool('browser_click')], commonLocalTools: [tool('dock_clipboard_transfer')],
    executorLocalTools: [tool('dock_action_run')],
  }), { remote: [tool('read')], local: [tool('dock_action_run')] });
  assert.deepEqual(Object.keys(selectToolGroups('research', {
    remoteTools: [], browserTools: [], commonLocalTools: [], executorLocalTools: [],
  })), ['remote', 'browser', 'local']);
});


test('remote initialization retries one transient connection with a fresh client and never retries rejected authentication', async () => {
  for (const failure of [new TypeError('fetch failed'), Object.assign(new Error('bad gateway'), { code: 502 }), Object.assign(new Error('unauthorized'), { code: 401 })]) {
    let attempts = 0, closed = 0;
    const connect = connectRemote(() => {
      const attempt = attempts++;
      return { transport: {}, client: {
        connect: async (_, options) => { assert.equal(options.timeout, 25000); if (!attempt || failure.code === 401) throw failure; },
        close: async () => { closed++; },
      } };
    });
    if (failure.code === 401) { await assert.rejects(connect, /unauthorized/); assert.equal(attempts, 1); }
    else { assert.ok(await connect); assert.equal(attempts, 2); }
    assert.equal(closed, 1);
  }
  let attempts = 0;
  await assert.rejects(connectRemote(() => { attempts++; return { transport: {}, client: { connect: async () => { throw new TypeError('fetch failed'); }, close: async () => {} } }; }), /fetch failed/);
  assert.equal(attempts, 2);
});
