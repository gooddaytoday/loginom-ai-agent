import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, win32 } from 'node:path';
import { privateDirectory } from '../lib/platform.mjs';

test('Windows ACL tools do not depend on PATH', { skip: process.platform !== 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'loginom-platform-windows-'));
  const previous = process.env.PATH;
  try {
    process.env.PATH = '';
    await privateDirectory(directory);
    assert.ok(true);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});


test('Windows private directory removes explicit foreign ACEs', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dock explicit ACL '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await privateDirectory(root);
  const directory = join(root, 'server-cache');
  await privateDirectory(directory);
  const grant = spawnSync(win32.join(process.env.SystemRoot, 'System32', 'icacls.exe'),
    [directory, '/grant', '*S-1-5-32-545:(OI)(CI)F'], { encoding: 'utf8' });
  assert.equal(grant.status, 0, grant.stderr);
  const acl = () => {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop"; $a=Get-Acl -LiteralPath $env:DOCK_ACL_PATH; ' +
      'ConvertTo-Json -Compress @{protected=$a.AreAccessRulesProtected; ' +
      'sids=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {$_.IdentityReference.Value}); ' +
      'user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}'],
    { encoding: 'utf8', env: { ...process.env, DOCK_ACL_PATH: directory } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.ok(acl().sids.includes('S-1-5-32-545'), 'fixture must contain an explicit Users ACE');
  await privateDirectory(directory);
  const after = acl();
  assert.equal(after.protected, true);
  assert.deepEqual(after.sids.sort(), [after.user, 'S-1-5-18'].sort());
});
