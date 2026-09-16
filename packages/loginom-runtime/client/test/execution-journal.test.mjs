import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExecutionJournal } from '../lib/execution-journal.mjs';

test('operation evidence is durable, ordered and redacted independently of transcripts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-execution-journal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const metadata = { sessionId: 'session', clientRevision: 'runtime', actionManifestDigest: 'manifest' };
  const record = createExecutionJournal({ directory, metadata, knownSecrets: ['private-key-value'] });
  await Promise.all([
    record({ operation_id: 'one', phase: 'intent', detail: 'value private-key-value', password: 'user-password' }),
    record({ operation_id: 'one', phase: 'completed', detail: 'user-password' }),
  ]);
  const path = join(directory, 'execution-events.jsonl');
  const text = await readFile(path, 'utf8');
  assert.doesNotMatch(text, /private-key-value|user-password/);
  const records = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(item => item.phase), ['intent', 'completed']);
  assert.equal(records[0].manifest_sha256, 'manifest');
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('journal fails before mutation when evidence cannot be persisted safely', async t => {
  if (process.platform === 'win32') return t.skip('POSIX symlink protection');
  const directory = await mkdtemp(join(tmpdir(), 'dock-execution-symlink-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = join(directory, 'untouched');
  await writeFile(target, 'unchanged');
  await symlink(target, join(directory, 'execution-events.jsonl'));
  const record = createExecutionJournal({ directory, metadata: {} });
  await assert.rejects(record({ phase: 'intent' }));
  assert.equal(await readFile(target, 'utf8'), 'unchanged');
});
