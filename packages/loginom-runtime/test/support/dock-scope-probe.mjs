import assert from 'node:assert/strict';
import { createKnowledgeClient } from '../../client/lib/knowledge-client.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const knowledge = await createKnowledgeClient(JSON.parse(input), undefined, { managed: true });
const root = 'viking://resources/loginom-dock';
try {
  const cases = [
    ['find', { query: 'trusted-marker', read_content: true }],
    ['search', { query: 'trusted-marker', mode: 'list', read_content: true }],
    ['read', { uris: [`${root}/trusted-marker.md`] }],
    ['list', { uri: root, recursive: true }],
    ['tree', {}],
    ['grep', { uri: root, pattern: 'trusted-marker' }],
    ['glob', { pattern: '**/*.md' }],
  ];
  for (const [name, args] of cases) {
    const result = await knowledge.call({ run: 'probe', id: name, name, arguments: args });
    assert.notEqual(result.isError, true, `${name}: ${result.isError ? result.content.map(item => item.text).join('\n') : 'must succeed'}`);
    assert.doesNotMatch(JSON.stringify(result), /hostile-marker|viking:\/\/agent\/skills/);
    if (name === 'read') {
      assert.match(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'), /^trusted-marker(?: republished)?$/);
    }
  }
  await assert.rejects(knowledge.call({
    run: 'probe', id: 'mixed', name: 'read',
    arguments: { uris: [`${root}/trusted-marker.md`, 'viking://resources/hostile-marker.md'] },
  }), /LOGINOM_KNOWLEDGE_SCOPE_DENIED/);
  process.stdout.write(JSON.stringify({ ok: true, tools: 7 }) + '\n');
} finally {
  await knowledge.close();
}
