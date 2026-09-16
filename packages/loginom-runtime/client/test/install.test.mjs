import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { installBundle, rollbackBundle, verifyBundle } from '../lib/install.mjs';
import { readRuntimePointer } from '../lib/platform.mjs';

test('immutable releases update and roll back without changing credentials or unrelated files; tampering never activates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-install-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, 'home'); await mkdir(home, { mode: 0o700 });
  await writeFile(join(home, 'config.json'), 'credential sentinel', { mode: 0o600 });
  await writeFile(join(home, 'other-settings'), 'untouched');
  async function bundle(version) {
    const path = join(directory, version); await mkdir(path);
    await writeFile(join(path, 'payload'), version);
    await writeFile(join(path, 'release.json'), JSON.stringify({ version, node: process.versions.node,
      platform: `${process.platform}-${process.arch}`, files: [{ path: 'payload', sha256: createHash('sha256').update(version).digest('hex') }] }));
    return path;
  }
  const first = await bundle('0.1.0'), second = await bundle('0.2.0');
  const a = await installBundle(first, home);
  assert.equal((await installBundle(first, home)).destination, a.destination);
  const b = await installBundle(second, home);
  assert.equal(await readRuntimePointer(home, 'previous'), join('releases', a.manifest.id));
  assert.equal(await rollbackBundle(home), join('releases', a.manifest.id));
  assert.equal(await readFile(join(home, 'config.json'), 'utf8'), 'credential sentinel');
  assert.equal(await readFile(join(home, 'other-settings'), 'utf8'), 'untouched');
  await writeFile(join(b.destination, 'payload'), 'tampered');
  await assert.rejects(() => rollbackBundle(home), /checksum/);
  assert.equal(await readRuntimePointer(home), join('releases', a.manifest.id));
  const outside = join(directory, 'outside-target');
  await writeFile(outside, 'outside');
  await symlink(outside, join(first, 'outside'));
  await assert.rejects(() => verifyBundle(first), /Unexpected/);
});

test('Windows releases use atomic pointer files and a cmd launcher without symlink privileges', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-install-win-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, 'home');
  async function bundle(version) {
    const path = join(directory, version); await mkdir(path);
    await writeFile(join(path, 'payload'), version);
    await writeFile(join(path, 'release.json'), JSON.stringify({ version, node: process.versions.node,
      platform: 'win32-x64', files: [{ path: 'payload', sha256: createHash('sha256').update(version).digest('hex') }] }));
    return path;
  }
  const first = await installBundle(await bundle('1.0.0'), home, { platform: 'win32', arch: 'x64' });
  const second = await installBundle(await bundle('2.0.0'), home, { platform: 'win32', arch: 'x64' });
  assert.equal(await readRuntimePointer(home, 'current', 'win32'), join('releases', second.manifest.id));
  assert.equal(await readRuntimePointer(home, 'previous', 'win32'), join('releases', first.manifest.id));
  const launcher = await readFile(join(home, 'bin/loginom-dock.cmd'), 'utf8');
  assert.match(launcher, /runtime\\node\.exe/);
  assert.match(launcher, /dock_release:\/=\\/);
  assert.equal(await rollbackBundle(home, { platform: 'win32', arch: 'x64' }), join('releases', first.manifest.id));
  assert.equal(await readRuntimePointer(home, 'current', 'win32'), join('releases', first.manifest.id));
});
