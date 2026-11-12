import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledgeClient, HELP_URI } from '../lib/knowledge-client.mjs';
import { helpFixture } from './support/help-fixture.mjs';

async function client(t, options) {
  const knowledge = await createKnowledgeClient({ helpRoot: await helpFixture(t, options) });
  t.after(() => knowledge.close());
  let n = 0;
  const call = async (name, args) => {
    const result = await knowledge.call({ run: 'run-1', id: `call-${++n}`, name, arguments: args });
    return { text: result.content.map(item => item.text).join('\n'), isError: result.isError === true };
  };
  return { knowledge, call };
}

test('catalog keeps the seven read-only tool names and a stable digest', async t => {
  const { knowledge } = await client(t);
  assert.deepEqual(knowledge.tools.map(tool => tool.name).sort(), ['find', 'glob', 'grep', 'list', 'read', 'search', 'tree']);
  const again = await createKnowledgeClient({ helpRoot: await helpFixture(t) });
  assert.equal(knowledge.catalogSha256, again.catalogSha256);
  await assert.rejects(knowledge.call({ run: 'r', id: 'i', name: 'write', arguments: {} }), /LOGINOM_KNOWLEDGE_TOOL_DENIED/);
  await assert.rejects(knowledge.call({ run: '', id: 'i', name: 'read', arguments: {} }), /LOGINOM_KNOWLEDGE_REQUEST_INVALID/);
});

test('find reaches a Calculator function by a name from another system through build-time synonyms', async t => {
  const { call } = await client(t);
  const found = await call('find', { query: 'функции калькулятор дата DateOf IncDay' });
  assert.equal(found.isError, false);
  assert.match(found.text.split('\n')[0], new RegExp(`^1\\. ${HELP_URI}/data/processors/func/calc-func/datetime\\.md .*> AddDay`));
  assert.match((await call('search', { query: 'Excel LEFT first characters' })).text.split('\n')[0], /string\.md .*> Left/);
  // A page-level synonym points at the page itself, not at the synonym text.
  const rest = await call('find', { query: 'HTTP API call' });
  assert.match(rest.text, /rest-request\.md/);
  assert.doesNotMatch(rest.text, /web request headers/);
});

test('find respects target_uri, read_content and refuses retired sources', async t => {
  const { call } = await client(t);
  const scoped = await call('find', { query: 'дни', target_uri: `${HELP_URI}/data/processors/transformation` });
  assert.doesNotMatch(scoped.text, /datetime\.md/);
  const full = await call('find', { query: 'DaysBetween', read_content: true, limit: 1 });
  assert.match(full.text, /Возвращает полное количество дней между двумя датами/);
  const retired = await call('find', { query: 'link', target_uri: 'viking://resources/loginom-dock/sources/e2e-tests' });
  assert.equal(retired.isError, true);
  assert.match(retired.text, /no longer shipped/);
  assert.equal((await call('find', { query: '' })).isError, true);
});

test('read maps .html links and directories to shipped pages and suggests pages for a wrong path', async t => {
  const { call } = await client(t);
  const html = await call('read', { uris: `${HELP_URI}/data/processors/integration/rest-request.html` });
  assert.match(html.text, new RegExp(`^=== ${HELP_URI}/data/processors/integration/rest-request\\.md ===\\n# REST-запрос`));
  assert.match((await call('read', { uris: 'processors/transformation/calc/' })).text, /# Калькулятор/);
  const both = await call('read', { uris: ['processors/func/calc-func/string.md', 'processors/trees/missing.md'] });
  assert.equal(both.isError, false);
  assert.match(both.text, /# Строковые функции/);
  assert.match(both.text, /File not found/);
  const missing = await call('read', { uris: 'processors/integration/rest.md' });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /Similar pages:\n- .*rest-request\.md — REST-запрос/);
});

test('list, tree, glob and grep browse the shipped tree', async t => {
  const { call } = await client(t);
  assert.match((await call('list', { uri: `${HELP_URI}/data/processors/func/calc-func` })).text, /datetime\.md — Дата\/Время функции/);
  const tree = (await call('tree', {})).text;
  assert.match(tree, /^ {2}data\/$/m);
  assert.match(tree, /^ {6}transformation\/$/m);
  const glob = await call('glob', { pattern: '**/rest-request*' });
  assert.match(glob.text, /rest-request\.md — REST-запрос/);
  const grep = await call('grep', { uri: HELP_URI, pattern: ['AddDay\\(', 'Left\\('], node_limit: 5 });
  assert.match(grep.text, /datetime\.md:5: \*\*AddDay\(Дата, Количество\)\*\*/);
  assert.match(grep.text, /string\.md:5:/);
  assert.equal((await call('grep', { uri: HELP_URI, pattern: '(' })).isError, true);
  assert.equal((await call('list', { uri: `${HELP_URI}/data/README.md` })).isError, true);
});

test('replies stay inside the agent output limit', async t => {
  const big = '# Большая страница\n\n' + 'Строка справки с текстом. '.repeat(1400) + '\n';
  const pages = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`data/big/page-${i}.md`, big]));
  const { call } = await client(t, { pages, aliases: [] });
  const reply = await call('read', { uris: Object.keys(pages) });
  assert.ok(Buffer.byteLength(reply.text) <= 44000, `${Buffer.byteLength(reply.text)} bytes`);
  assert.match(reply.text, /reply limit reached: \d more item/);
});

test('a changed Help file refuses startup instead of serving unverified text', async t => {
  const helpRoot = await helpFixture(t, { tamper: 'data/README.md' });
  await assert.rejects(createKnowledgeClient({ helpRoot }), /LOGINOM_KNOWLEDGE_UNAVAILABLE/);
  await assert.rejects(createKnowledgeClient({ helpRoot: 'relative/help' }), /LOGINOM_CONFIG_REQUIRED/);
});

// The shipped corpus: every Calculator function is found by its exact name.
const shipped = fileURLToPath(new URL('../../../product/help', import.meta.url));
test('shipped Help finds each Calculator function by name', { skip: !existsSync(join(shipped, 'help-manifest.json')) }, async () => {
  const knowledge = await createKnowledgeClient({ helpRoot: shipped });
  const manifest = JSON.parse(await readFile(join(shipped, 'help-manifest.json'), 'utf8'));
  const names = [];
  for (const file of manifest.files.filter(item => item.path.startsWith('data/processors/func/calc-func/'))) {
    const text = await readFile(join(shipped, 'loginom-help', file.path), 'utf8');
    for (const [, name] of text.matchAll(/^#{2,4}\s+([A-Z][A-Za-z0-9]+)\s*$/gm)) names.push([name, file.path]);
  }
  assert.ok(names.length > 100, `${names.length} functions`);
  // Every function carries build-time synonyms; scripts/loginom-help/aliases.py lists missing ones.
  const aliases = (await readFile(join(shipped, 'aliases.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.deepEqual(names.filter(([name, path]) => !aliases.some(item => item.path === path && item.fn === name)).map(([name]) => name), []);
  const missed = [];
  for (const [name, path] of names) {
    const result = await knowledge.call({ run: 'r', id: name, name: 'find', arguments: { query: name, limit: 3 } });
    if (!result.content[0].text.split('\n\n').some(block => block.includes(`${path} `) && block.includes(`> ${name} `))) missed.push(name);
  }
  assert.deepEqual(missed, []);
});

test('shipped Help documents the Loginom line the bundled action catalogs target', { skip: !existsSync(join(shipped, 'help-manifest.json')) }, async () => {
  const { loginom_version } = JSON.parse(await readFile(join(shipped, 'help-manifest.json'), 'utf8'));
  const releases = fileURLToPath(new URL('../../executor/catalog-releases/', import.meta.url));
  for (const release of await readdir(releases)) {
    const { compatibility } = JSON.parse(await readFile(join(releases, release, 'manifest.json'), 'utf8'));
    assert.equal(compatibility.loginom_build.split('.').slice(0, 2).join('.'), loginom_version, release);
  }
});

test('every node card help_path opens a shipped Help page', { skip: !existsSync(join(shipped, 'help-manifest.json')) }, async () => {
  const { NODE_TYPES } = await import('../lib/node-contracts.mjs');
  const knowledge = await createKnowledgeClient({ helpRoot: shipped });
  const broken = [];
  for (const node of Object.values(NODE_TYPES)) {
    const uri = `${node.sources.help_root}/${node.sources.help_path}`;
    const result = await knowledge.call({ run: 'r', id: node.type, name: 'read', arguments: { uris: uri } });
    if (result.isError) broken.push(`${node.type}: ${node.sources.help_path}`);
  }
  assert.deepEqual(broken, []);
});
