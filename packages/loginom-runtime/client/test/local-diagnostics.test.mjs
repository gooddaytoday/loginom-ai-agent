import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink, chmod, lstat, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

test('diagnostics work in paths with spaces and Cyrillic and retain private permissions', async t => {
  const root = join(await fixture(t), 'журналы с пробелами');
  const directory = await record(root, 'session', [{ event: 'task.end' }]);
  assert.equal((await report(root, 'session')).events.length, 1);
  if (process.platform === 'win32') {
    // Check the actual ACL, rather than Windows' synthetic POSIX mode bits.
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop"; $a=Get-Acl -LiteralPath $env:DOCK_DIAGNOSTIC_PATH; ' +
      'ConvertTo-Json -Compress @{protected=$a.AreAccessRulesProtected; rules=@($a.Access | ForEach-Object { ' +
      '@{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; rights=[int]$_.FileSystemRights} }); ' +
      'sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value}'],
    { encoding: 'utf8', env: { ...process.env, DOCK_DIAGNOSTIC_PATH: directory } });
    assert.equal(result.status, 0, result.stderr);
    const acl = JSON.parse(result.stdout);
    assert.equal(acl.protected, true);
    assert.deepEqual(acl.rules.map(rule => rule.sid).sort(), [acl.sid, 'S-1-5-18'].sort());
    for (const rule of acl.rules) assert.equal(rule.rights, 2032127); // FullControl
    const slashRoot = root.replaceAll('\\', '/');
    await record(slashRoot, 'session', [{ event: 'task.end' }]);
    assert.equal((await report(root, 'session')).events.length, 2);
  } else {
    assert.equal((await lstat(directory)).mode & 0o077, 0);
    assert.equal((await lstat(join(directory, 'events.jsonl'))).mode & 0o077, 0);
    await chmod(join(directory, 'events.jsonl'), 0o644);
    await assert.rejects(record(root, 'session', [{ event: 'task.end' }]), /Invalid diagnostic file/);
  }
});

test('diagnostic writer refuses linked directories before modifying the target', async t => {
  const root = await fixture(t), target = join(root, 'unrelated');
  await mkdir(target);
  const acl = path => {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop"; (Get-Acl -LiteralPath $env:DOCK_DIAGNOSTIC_PATH).Sddl'],
    { encoding: 'utf8', env: { ...process.env, DOCK_DIAGNOSTIC_PATH: path } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const link = join(root, 'diagnostics');
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const before = process.platform === 'win32' ? [acl(target), acl(link)] : null;
  await assert.rejects(record(root, 'session', [{ event: 'task.end' }]), /Invalid diagnostic directory/);
  assert.deepEqual(await readdir(target), []);
  if (process.platform === 'win32') {
    assert.equal(acl(target), before[0], 'junction target SDDL must stay unchanged');
    assert.equal(acl(link), before[1], 'junction SDDL must stay unchanged');
  }
});
