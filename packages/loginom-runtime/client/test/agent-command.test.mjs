import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createAgentLauncher } from '../lib/agent-command.mjs';
import { createNativeCommand, nativeSnapshot, registerNative, restoreNative, unregisterNative } from '../lib/native.mjs';
import { agentVersionGuidance } from '../lib/diagnostics.mjs';

const windows = process.platform === 'win32';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dock agent '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'npm bin');
  await mkdir(bin);
  const script = join(bin, 'echo.cjs');
  await writeFile(script, `if (process.argv[2] === '--version') console.log('codex-cli 0.153.2');
else console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), marker: process.env.DOCK_TEST_MARKER }));`);
  const command = join(bin, windows ? 'codex.cmd' : 'codex');
  await writeFile(command, windows
    ? `@echo off\r\n"${process.execPath}" "%~dp0echo.cjs" %*\r\n`
    : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${script.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o700 });
  const env = { ...process.env, DOCK_TEST_MARKER: 'isolated' };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' || key.toLowerCase() === 'pathext') delete env[key];
  env[windows ? 'Path' : 'PATH'] = bin;
  if (windows) env.PathExt = '.CMD;.EXE';
  return { root, bin, command, env };
}

test('selects the agent from the supplied PATH and pins it through later native operations', async t => {
  const f = await fixture(t);
  const launcher = createAgentLauncher('codex', { env: f.env, cwd: f.root });
  assert.equal(launcher.executable?.toLowerCase(), f.command.toLowerCase());
  const version = launcher.run(['--version'], { encoding: 'utf8', windowsHide: true });
  assert.equal(agentVersionGuidance('codex', version), '');
  f.env[windows ? 'Path' : 'PATH'] = dirname(process.execPath);
  f.env.DOCK_TEST_MARKER = 'changed after selection';
  const run = createNativeCommand(launcher);
  const args = ['plugin', 'marketplace', 'add', join(f.root, 'пакет с пробелами')];
  const result = JSON.parse(run('codex', args, f.env, { capture: true }));
  assert.deepEqual(result.args, args);
  assert.equal(await realpath(result.cwd), await realpath(f.root));
  assert.equal(result.marker, 'isolated');
  await rm(f.command);
  assert.ok(launcher.run(['--version'], { encoding: 'utf8' }).error);
});

test('arguments survive shim execution including JSON, empty values and shell metacharacters', async t => {
  const f = await fixture(t);
  const args = ['', 'space here', 'кириллица', 'a"b', 'trailing\\', 'a&b|c<d>e^f', '%DOCK_TEST_MARKER%', '!variable!', '(parens)',
    JSON.stringify({ command: 'C:\\Users\\Test Person\\dock.cmd', args: ['a"b', '&', ''] })];
  const result = createAgentLauncher('codex', { env: f.env, cwd: f.root }).run(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).args, args);
});

test('missing agent does not fall back to the parent PATH or report an unsupported version', async t => {
  const f = await fixture(t);
  const result = createAgentLauncher('dock-nonexistent-agent', { env: f.env, cwd: f.root }).run(['--version']);
  assert.equal(result.error.code, 'ENOENT');
  assert.equal(result.status, null);
  assert.match(agentVersionGuidance('codex', result), /Не удалось запустить.*ENOENT/);
  assert.doesNotMatch(agentVersionGuidance('codex', result), /не ниже/);
});

test('native snapshot, registration, rollback and removal share the selected launcher', async () => {
  const calls = [];
  const launcher = { run(args) {
    calls.push(args);
    const stdout = args[1] === 'marketplace' && args[2] === 'list' ? '{"marketplaces":[]}'
      : args[1] === 'list' ? '{"installed":[]}' : '';
    return { status: 0, stdout };
  } };
  const run = createNativeCommand(launcher), env = {};
  const before = await nativeSnapshot('codex', env, run);
  await registerNative({ agent: 'codex', destination: 'C:\\Dock Space', manifest: {}, before, env, run });
  await restoreNative({ agent: 'codex', before, env, run });
  await unregisterNative({ agent: 'codex', env, run });
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[2], ['plugin', 'marketplace', 'add', 'C:\\Dock Space']);
});

test('Windows selects CMD or EXE according to supplied PATHEXT and PATH order', { skip: !windows }, async t => {
  const f = await fixture(t);
  const exe = join(f.bin, 'codex.exe');
  await copyFile(process.execPath, exe);
  assert.equal(createAgentLauncher('codex', { env: f.env, cwd: f.root }).executable.toLowerCase(), f.command.toLowerCase());
  f.env.PathExt = '.EXE;.CMD';
  const launcher = createAgentLauncher('codex', { env: f.env, cwd: f.root });
  assert.equal(launcher.executable.toLowerCase(), exe.toLowerCase());
  const result = launcher.run(['-p', 'JSON.stringify(process.argv.slice(1))', 'hello & world'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['hello & world']);
});

test('version failures distinguish launch, exit code, signal and version mismatch', () => {
  assert.match(agentVersionGuidance('codex', { error: { code: 'EACCES' } }), /EACCES/);
  assert.match(agentVersionGuidance('codex', { status: 7, executable: 'C:\\Agent\\codex.cmd' }), /кодом 7/);
  assert.match(agentVersionGuidance('codex', { status: null, signal: 'SIGTERM' }), /SIGTERM/);
  assert.match(agentVersionGuidance('codex', { status: 0, stdout: 'unknown' }), /не распознана/);
  assert.ok(agentVersionGuidance('codex', { status: 0, stdout: 'x'.repeat(10000) }).length < 500);
  for (const version of ['0.149.1', '0.153.2']) assert.equal(agentVersionGuidance('codex', { status: 0, stdout: 'codex-cli ' + version }), '');
  for (const version of ['0.148.9', '1.0.0']) assert.match(agentVersionGuidance('codex', { status: 0, stdout: 'codex-cli ' + version }), /не поддерживается/);
});
