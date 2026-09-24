import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'memory-deployment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  copyFileSync(fileURLToPath(new URL('../deployment.mjs', import.meta.url)), join(root, 'deployment.mjs'));
  const identity = JSON.parse(readFileSync(new URL('../deployment.json', import.meta.url)));
  const save = value => writeFileSync(join(root, 'deployment.json'), JSON.stringify(value), { mode: 0o600 });
  save(identity);
  const run = () => spawnSync(process.execPath, ['deployment.mjs'], { cwd: root, encoding: 'utf8' });
  return { root, identity, save, run };
}

test('assembled deployment accepts its explicit project and rejects global Peer overrides', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  for (const value of [{ ...f.identity, peerId: 'old-project' },
    { ...f.identity, projectRoot: 'relative' }, { ...f.identity, namespace: '../foreign' },
    { ...f.identity, generation: '' }, { ...f.identity, version: 2 }]) {
    f.save(value);
    assert.notEqual(f.run().status, 0);
  }
});

test('deployment cannot be read from missing or insecure files', t => {
  const f = fixture(t);
  chmodSync(join(f.root, 'deployment.json'), 0o644);
  assert.notEqual(f.run().status, 0);
  rmSync(join(f.root, 'deployment.json'));
  assert.notEqual(f.run().status, 0);
});
