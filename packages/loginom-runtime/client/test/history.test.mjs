import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { codexHistory, hermesHistory, hermesLineage } from '../lib/history.mjs';

test('Codex starts at the triggering user, deduplicates MCP transport and excludes hidden channels', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dock-history-')); t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'rollout.jsonl');
  const message = (role, text, channel) => ({ type: 'response_item', payload: { type: 'message', role, channel, content: [{ type: 'text', text }] } });
  const rows = [message('user', 'unrelated earlier chat'),
    { type: 'turn_context', payload: { turn_id: 'turn-2' } },
    message('user', 'build Loginom scenario'), message('system', 'hidden system'),
    message('assistant', 'hidden analysis', 'analysis'), message('assistant', 'visible progress', 'commentary'),
    { type: 'response_item', payload: { type: 'function_call', call_id: 'prepare-1', name: 'dock_prepare', arguments: '{}' } },
    { type: 'event_msg', payload: { type: 'mcp_tool_call_end', call_id: 'prepare-1', invocation: { tool: 'dock_prepare', arguments: {} }, result: { Ok: { content: [{ type: 'text', text: 'prepared' }] } } } },
    message('assistant', 'finished', 'final')];
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const result = await codexHistory(file, 'turn-2', { triggerCall: 'prepare-1' });
  assert.equal(result.startLine, 2);
  assert.equal(result.events.length, 5);
  assert.equal(result.events.filter(row => row.event.startsWith('call-')).length, 1);
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.ok(!JSON.stringify(result).includes('earlier'));
  assert.equal((await codexHistory(file, 'turn-2', { startLine: result.startLine })).events.length, 5);
});

test('Hermes reads compacted originals through compression lineage, without system or unrelated rows', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dock-hermes-history-')); t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'state.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE sessions(id TEXT,parent_session_id TEXT,end_reason TEXT,model_config TEXT);
    CREATE TABLE messages(id INTEGER PRIMARY KEY,session_id TEXT,role TEXT,content TEXT,tool_call_id TEXT,tool_calls TEXT,tool_name TEXT,timestamp REAL,_compressed_summary INTEGER,reasoning TEXT);
    INSERT INTO sessions VALUES ('first',NULL,'compression','{}'),('second','first',NULL,'{}'),('other',NULL,NULL,'{}'),('branch','first',NULL,'{"_branched_from":"first"}');`);
  const insert = db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?)');
  insert.run(1, 'first', 'user', 'earlier', null, null, null, 1, 0, 'hidden');
  insert.run(2, 'first', 'user', 'Loginom task', null, null, null, 2, 0, 'hidden');
  insert.run(3, 'first', 'assistant', '', null, JSON.stringify([{ id: 'prepare-2', function: { name: 'dock_prepare', arguments: '{}' } }]), null, 3, 0, 'hidden');
  insert.run(4, 'first', 'tool', 'prepared', 'prepare-2', null, 'dock_prepare', 4, 0, 'hidden');
  insert.run(5, 'second', 'user', 'generated summary', null, null, null, 5, 1, 'hidden');
  insert.run(6, 'second', 'assistant', 'completed task', null, null, null, 6, 0, 'hidden');
  insert.run(7, 'other', 'user', 'unrelated', null, null, null, 7, 0, 'hidden');
  insert.run(8, 'second', 'system', 'hidden system prompt', null, null, null, 8, 0, 'hidden');
  insert.run(9, 'second', 'assistant', '42', null, null, null, 9, 0, 'hidden');
  db.close();
  assert.deepEqual(hermesLineage(file, 'second'), ['first', 'second']);
  assert.deepEqual(hermesLineage(file, 'branch'), ['branch']);
  const result = hermesHistory(file, ['first', 'second'], { triggerCall: 'prepare-2' });
  assert.equal(result.startRow, 2);
  assert.equal(result.events.length, 5);
  assert.equal(result.events.at(-1).parts[0].text, '42');
  const content = JSON.stringify(result);
  for (const text of ['hidden', 'earlier', 'unrelated', 'generated summary']) assert.ok(!content.includes(text));
  assert.ok(content.includes('completed task'));
});
