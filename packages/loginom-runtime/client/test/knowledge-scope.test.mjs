import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeKnowledgeArguments } from '../lib/knowledge-scope.mjs';

const root = 'viking://resources/loginom-dock';

test('find defaults to the official knowledge base', () => {
  assert.deepEqual(scopeKnowledgeArguments('find', { query: 'Join' }), { query: 'Join', target_uri: root });
});

test('find accepts KB descendants and refuses ambiguous or foreign URIs', () => {
  for (const target_uri of [root, `${root}/`, `${root}/Help/node.md`])
    assert.deepEqual(scopeKnowledgeArguments('find', { query: 'Join', target_uri, limit: 5 }),
      { query: 'Join', target_uri, limit: 5 });
  for (const target_uri of ['', null, 7, `${root}-evil`, `${root}/../private`, `${root}/./file`,
    `${root}/%2e%2e/file`, `${root}/%2fprivate`, `${root}//file`, `${root}\\file`,
    `${root}/file?query`, `${root}/file#fragment`, 'viking://agent/skills', `${root}/file\n`])
    assert.throws(() => scopeKnowledgeArguments('find', { query: 'Join', target_uri }), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});

test('search stays in list mode within the KB', () => {
  assert.deepEqual(scopeKnowledgeArguments('search', { query: 'Join' }),
    { query: 'Join', target_uri: root, mode: 'list' });
  assert.deepEqual(scopeKnowledgeArguments('search', { query: 'Join', mode: 'list', target_uri: `${root}/Help` }),
    { query: 'Join', mode: 'list', target_uri: `${root}/Help` });
  for (const mode of ['context', '', null, 'LIST'])
    assert.throws(() => scopeKnowledgeArguments('search', { query: 'Join', mode, target_uri: root }),
      /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});

test('read checks every URI and preserves the supported string or array form', () => {
  for (const uris of [`${root}/Help/node.md`, [root, `${root}/Help/node.md`]])
    assert.deepEqual(scopeKnowledgeArguments('read', { uris }), { uris });
  for (const uris of [undefined, null, '', [], [root, 'viking://agent/skills/x'], [root, 1]])
    assert.throws(() => scopeKnowledgeArguments('read', { uris }), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});

test('list tree grep and glob only use their scoped URI field', () => {
  for (const name of ['list', 'tree', 'grep', 'glob']) {
    const args = { uri: `${root}/Help`, pattern: '**/*.md' };
    assert.deepEqual(scopeKnowledgeArguments(name, args), args);
    assert.throws(() => scopeKnowledgeArguments(name, { ...args, uri: 'viking://resources/private' }),
      /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
  }
  for (const name of ['tree', 'glob'])
    assert.deepEqual(scopeKnowledgeArguments(name, { pattern: '**/*.md' }), { pattern: '**/*.md', uri: root });
  for (const name of ['list', 'grep'])
    assert.throws(() => scopeKnowledgeArguments(name, {}), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});

test('glob accepts relative wildcards and refuses traversal and absolute patterns', () => {
  for (const pattern of ['**/*.md', 'Help/*.md', 'file?.md', '[ab]*.md'])
    assert.equal(scopeKnowledgeArguments('glob', { pattern }).pattern, pattern);
  for (const pattern of [undefined, null, '', '../secret', 'Help/../secret', '/secret', 'C:/secret',
    'viking://agent/skills/*', '**\\*.md', '%2e%2e/*', 'Help//*.md', './Help/*'])
    assert.throws(() => scopeKnowledgeArguments('glob', { pattern }), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});

test('unknown tools and malformed arguments are refused at the scope boundary', () => {
  for (const name of ['write', 'READ', 'dock_prepare'])
    assert.throws(() => scopeKnowledgeArguments(name, {}), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
  for (const args of [undefined, null, [], 'query'])
    assert.throws(() => scopeKnowledgeArguments('find', args), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
});
