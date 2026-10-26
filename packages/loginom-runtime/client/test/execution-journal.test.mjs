import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExecutionJournal } from '../lib/execution-journal.mjs';
import {createRedactor} from '../lib/redact.mjs';

test('JSON business text retains its exact whitespace in durable evidence and ACK',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dock-json-text-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{}});
 const value=' {\n  "args": {"Code": "CHK12", "Route": "west"},\n  "message": "quoted \\\" space ",\n  "method": "GET"\n}\n';
 const saved=await record({phase:'node_phase_completed',receipt:{value}});
 assert.equal(saved.receipt.value,value);
 assert.equal(JSON.parse((await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim()).receipt.value,value);
});

for(const value of ['{ "password": "first-private", "password": "safe-value" }',
 '{ "text": "first-private", "text": "safe-value" }',
 '{ "nested": { "api_key": "first-private" } }',
 '{ "escaped": "first\\u002dprivate" }'])
test('JSON text preservation cannot retain discarded or sensitive input: '+value,()=>{
 const cleaned=createRedactor(['first-private']).redact({value},{preserveJsonText:true}).value;
 assert.doesNotMatch(cleaned,/first-private|first\\u002dprivate/);
 assert.notEqual(cleaned,value);
});

test('journal JSON preservation does not change default source redaction',()=>{
 const redactor=createRedactor(),value='[ 1, 2 ]';
 assert.equal(redactor.redact({value}).value,'[1,2]');
 assert.equal(redactor.redact({value},{preserveJsonText:true}).value,value);
 assert.equal(redactor.redact({value}).value,'[1,2]');
});

test('operation evidence is durable, ordered and redacted independently of transcripts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-execution-journal-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const metadata = { sessionId: 'session', clientRevision: 'runtime', actionManifestDigest: 'manifest' };
  const redactor=createRedactor(['private-key-value']);
  const record = createExecutionJournal({ directory, metadata, redactor });
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
  assert.equal(redactor.text('user-password'),'[redacted]',
    'the source reader must inherit secrets learned by the same journal');
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
