import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordLocalDiagnostics as record, readLocalDiagnosticReport as report, pruneLocalDiagnostics as prune } from '../lib/local-diagnostics.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dock-diagnostics-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
test('provider presence survives the complete redact-write-read-report path', async t => {
  const root = await fixture(t);
  await record(root, 'zero', [{ event: 'model.end', api_request_id: 'one', usage_format: 'hermes-canonical',
    usage: { input_tokens: 10, output_tokens: 2, cache_read_tokens: 0, cache_write_tokens: 0, total_tokens: 12 },
    reported: { cache_read: true, cache_write: false } }]);
  const result = await report(root, 'zero');
  assert.equal(result.usage.totals.cache_read_tokens, 0);
  assert.equal(result.usage.totals.cache_write_tokens, null);
  assert.equal(result.cache_summary, 'Из кеша: 0 токенов; записано в кеш: не сообщается провайдером');
});
test('local report preserves counters, cleans secrets and flags process interruption', async t => {
  const root = await fixture(t);
  const directory = await record(root, 'session', [{ event: 'model.start', api_request_id: 'pending' },
    { event: 'tool.end', args: { authorization: 'Bearer sensitive', system_prompt: 'hidden', cache_read_tokens: 100 } }]);
  const source = await readFile(join(directory, 'events.jsonl'), 'utf8');
  assert.ok(!source.includes('sensitive') && !source.includes('hidden'));
  assert.ok(source.includes('cache_read_tokens'));
  assert.equal((await report(root, 'session')).incomplete, true);
});
test('partial final line and dropped records are visible in reports', async t => {
  const root = await fixture(t);
  const directory = await record(root, 'session', [{ event: 'model.start', api_request_id: 'a' }]);
  await writeFile(join(directory, 'events.jsonl'), '{unfinished', { flag: 'a' });
  assert.equal((await report(root, 'session')).malformed_records, 1);
  await record(root, 'limited', [{ event: 'tool.end', result: 'large result' }],
    { policy: { sessionBytes: 1, eventBytes: 1000 } });
  // A session with no accepted events must still have a readable report.
  const limited = await report(root, 'limited');
  assert.equal(limited.incomplete, true);
});
test('retention preserves live hosts and never touches archive or receipt directories', async t => {
  const root = await fixture(t);
  const active = await record(root, 'active', [{ event: 'task.prepared', host_pid: process.pid }]);
  const inactive = await record(root, 'inactive', [{ event: 'task.prepared' }]);
  await mkdir(join(root, 'archive')); await writeFile(join(root, 'archive', 'pending'), 'keep');
  const result = await prune(root, { policy: { days: 0, bytes: 1 }, now: Date.now() + 1000 });
  assert.deepEqual(result.removed, [inactive]);
  assert.equal(result.protected_over_limit, true);
  assert.ok(await readFile(join(active, 'events.jsonl'), 'utf8'));
  assert.equal(await readFile(join(root, 'archive', 'pending'), 'utf8'), 'keep');
});
test('diagnostic writer refuses symlink destinations', async t => {
  const root = await fixture(t);
  const directory = await record(root, 'session', []);
  const target = join(root, 'unrelated'); await writeFile(target, 'untouched');
  await symlink(target, join(directory, 'events.jsonl'));
  await assert.rejects(record(root, 'session', [{ event: 'tool.end' }]));
  assert.equal(await readFile(target, 'utf8'), 'untouched');
});
