import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resourceInventory } from '../src/resource-inventory.mjs';

test('shared resource inventory preserves internal links and excludes its own manifest', async t => {
  const root = await mkdtemp(join(tmpdir(), 'loginom-resource-inventory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'files'));
  await writeFile(join(root, 'files/сценарий.md'), 'Русский текст\n');
  await symlink('files', join(root, 'alias'));
  const first = await resourceInventory(root);
  assert.deepEqual(first.map(file => file.path), ['alias', 'files/сценарий.md']);
  assert.deepEqual(first[0], { path: 'alias', link: 'files', directory: true,
    sha256: createHash('sha256').update('files').digest('hex') });
  assert.equal(first[1].sha256, createHash('sha256').update('Русский текст\n').digest('hex'));
  await writeFile(join(root, 'resource-manifest.json'), JSON.stringify({ protocol: 1, files: first }));
  assert.deepEqual(await resourceInventory(root), first);
});

test('shared resource inventory rejects an external target without changing it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'loginom-resource-inventory-escape-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'resources'));
  await writeFile(join(root, 'external'), 'untouched');
  await symlink('../external', join(root, 'resources/link'));
  await assert.rejects(resourceInventory(join(root, 'resources')), /LOGINOM_BUILD_RESOURCE_ESCAPE/);
  assert.equal(await readFile(join(root, 'external'), 'utf8'), 'untouched');
});
