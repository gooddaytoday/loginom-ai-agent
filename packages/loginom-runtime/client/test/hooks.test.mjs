import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { handleHook } from '../lib/hooks.mjs';
import { openArchive } from '../lib/archive.mjs';

test('native hook activates only verified prepare, captures triggering turn, redacts before disk and resumes once', async t => {
  const stateDir = await mkdtemp(join(tmpdir(), 'dock-hooks-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const config = { stateDir, apiKey: 'hook-control-secret', endpoint: 'https://dock.example/mcp', agent: 'codex', adapterRevision: 'test' };
  const sessionId = randomUUID(), skillRevision = 'a'.repeat(64);
  const directory = join(stateDir, 'sessions', sessionId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'session.json'), JSON.stringify({ sessionId, skillRevision, agent: 'codex', adapterRevision: 'test' }), { mode: 0o600 });
  const transcript = join(stateDir, 'rollout.jsonl');
  const message = (role, text, channel) => ({ type: 'response_item', payload: { type: 'message', role, channel, content: [{ type: 'text', text }] } });
  const rows = [message('user', 'unrelated-before-activation'),
    { type: 'turn_context', payload: { turn_id: 'turn-1' } }, message('user', 'Loginom hook-control-secret'),
    message('assistant', 'hidden-reasoning', 'analysis'),
    { type: 'response_item', payload: { type: 'function_call', call_id: 'call-1', name: 'mcp__loginom-dock__dock_prepare', arguments: '{}' } },
    message('assistant', 'visible-result', 'final')];
  await writeFile(transcript, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const input = { session_id: 'chat-1', turn_id: 'turn-1', transcript_path: transcript,
    hook_event_name: 'PostToolUse', tool_name: 'mcp__loginom-dock__dock_prepare', tool_use_id: 'call-1',
    tool_response: { content: [{ type: 'text', text: JSON.stringify({ prepared: true, sessionId, skillRevision }) }] } };
  assert.equal((await handleHook(config, { ...input, tool_response: { isError: true, ...input.tool_response } })).active, false);
  assert.equal((await handleHook(config, { ...input, tool_name: 'mcp__unrelated__dock_prepare' })).active, false);
  await assert.rejects(() => handleHook({ ...config, adapterRevision: 'wrong' }, input));
  const first = await handleHook(config, input);
  assert.equal(first.active, true);
  assert.equal(first.pending, 3);
  assert.equal((await handleHook(config, input)).pending, 3);
  const flattened = { ...input, tool_response: '<untrusted_tool_result source="mcp__loginom_dock__dock_prepare">\nRuntime data boundary.\n\n'
    + JSON.stringify({ result: input.tool_response.content[0].text + '\n# Full skill instructions' }) + '\n</untrusted_tool_result>' };
  assert.equal((await handleHook(config, { ...flattened, session_id: 'chat-flattened' })).active, true);
  await handleHook(config, { ...input, hook_event_name: 'Stop', tool_name: undefined });
  const queue = await openArchive(config);
  assert.equal(queue.pendingCount(), 7);
  assert.equal(queue.workRemaining(), 8);
  const payload = JSON.stringify(queue.pending());
  for (const value of ['hook-control-secret', 'hidden-reasoning', 'unrelated-before-activation']) assert.ok(!payload.includes(value));
  assert.ok(payload.includes('visible-result'));
  queue.close();
  for (const file of ['queue.sqlite', 'queue.sqlite-wal']) {
    const bytes = await readFile(join(stateDir, 'archive', file)).catch(() => Buffer.alloc(0));
    assert.ok(!bytes.includes(Buffer.from(config.apiKey)));
  }
  const missing = await handleHook(config, { session_id: 'chat-1', hook_event_name: 'SessionStart', transcript_path: join(stateDir, 'missing') });
  assert.match(missing.status, /incomplete/);
  const marker = JSON.parse(await readFile(join(directory, 'archive.json')));
  assert.equal(marker.complete, false);
  assert.match(marker.status, /incomplete/);
});
