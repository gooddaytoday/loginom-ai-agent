import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createArtifactStore } from '../lib/artifacts.mjs';
import { createHostArtifactAdmission } from '../lib/host-artifacts.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dock-host-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'host-inputs'), { mode: 0o700 });
  const sourcePath = join(root, 'sales.csv'); const bytes = Buffer.from('product,quantity\nA,2\n');
  await writeFile(sourcePath, bytes);
  const files = [{ sourcePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), name: 'sales.csv',
    upload: { directory: '/explicit/input', overwrite: 'reject' } }];
  const token = 'a'.repeat(64);
  const ticket = { version: 1, session_id: 'native-session', created_at: Date.now(), files };
  const path = join(root, 'host-inputs', token + '.json');
  await writeFile(path, JSON.stringify(ticket), { mode: 0o600 });
  const config = { stateDir: root, agent: 'hermes', resultProfile: 'user-v1' };
  const make = async id => ({ metadata: { sessionId: id }, artifactStore: await createArtifactStore({ directory: join(root, id) }) });
  return { root, config, make, token, ticket, path };
}
test('native ticket admits the exact CSV once and binds it to one Dock session', async t => {
  const f = await fixture(t), session = await f.make('one'), admit = createHostArtifactAdmission(f.config, session);
  const [first, again] = await Promise.all([admit(f.token), admit(f.token)]);
  assert.equal(first.length, 1);assert.deepEqual(again, first);assert.equal(session.artifactStore.list().length, 1);
  assert.equal(first[0].upload.destination, '/explicit/input/sales.csv');
  await assert.rejects(createHostArtifactAdmission(f.config, await f.make('two'))(f.token), /another Dock session/);
});
test('model paths, expired tickets, changed files and another agent cannot authorize input', async t => {
  const f = await fixture(t), session = await f.make('one');
  const admit = createHostArtifactAdmission(f.config, session);
  await assert.rejects(admit('/etc/passwd'), /Invalid host artifact ticket/);
  await assert.rejects(createHostArtifactAdmission({ ...f.config, agent: 'codex' }, session)(f.token), /Invalid host/);
  f.ticket.created_at = 0;await writeFile(f.path, JSON.stringify(f.ticket));
  await assert.rejects(admit(f.token), /Expired/);
  f.ticket.created_at = Date.now();await writeFile(f.path, JSON.stringify(f.ticket));
  await writeFile(f.ticket.files[0].sourcePath, 'changed');
  await assert.rejects(admit(f.token), /changed|match/);
  assert.equal(session.artifactStore.list().length, 0);
});
