#!/usr/bin/env node
/**
 * One-way cutover at a coordinator-verified idle phase boundary.
 * Preparation of this file performs no migration. The explicit flag asserts
 * that the coordinator checked the completed turn and detached workers; it is
 * not independent proof. On failure after rename, keep the moved state and
 * diagnose it. Never restore the old backup over a newer capture cursor.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, chmod, readdir, lstat, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GENERATION = '20260913.3';
const MAX_HOOK_RECEIPT_AGE_MS = 10 * 60 * 1000;
const EVENTS = ['preCompact', 'sessionEnd', 'sessionStart', 'stop', 'userPromptSubmit'];
class MigrationError extends Error {}
const requireThat = (condition, message) => { if (!condition) throw new MigrationError(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function checkedPath(path, { directory = false, privateMode } = {}) {
  const stat = await lstat(path);
  requireThat(!stat.isSymbolicLink() && await realpath(path) === path && stat.uid === process.getuid(),
    'Migration paths must be canonical, owner-controlled and non-symlinked.');
  requireThat(directory ? stat.isDirectory() : stat.isFile(), 'Unexpected migration path type.');
  requireThat((stat.mode & 0o022) === 0, 'Migration paths must not be group/world writable.');
  if (privateMode != null) requireThat((stat.mode & 0o777) === privateMode, 'Unexpected migration file permissions.');
}

async function readJson(path, privateMode) {
  await checkedPath(path, { privateMode });
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new MigrationError('A migration input is not valid JSON.'); }
}

export function validateInstalledReceipt(receipt, { node, threadId, cwd, generation }) {
  requireThat(receipt?.node === node && receipt.threadId === threadId && receipt.cwd === cwd &&
    receipt.generation === generation && receipt.trustVerified === true && receipt.captureStateMoved === false &&
    /^[0-9a-f]{64}$/.test(receipt.configSha256) && /^[0-9a-f]{64}$/.test(receipt.hooksSha256) &&
    Number.isFinite(Date.parse(receipt.checkedAt)), 'The installed configuration receipt does not match this migration.');
}

export function validateHooksReceipt(receipt, installed, { cwd, generation, now = Date.now() }) {
  const checked = Date.parse(receipt?.checkedAt), installedAt = Date.parse(installed.checkedAt);
  requireThat(receipt?.generation === generation && receipt.trusted_hooks === 5 &&
    Number.isFinite(checked) && checked >= installedAt && checked <= now + 30_000 &&
    now - checked <= MAX_HOOK_RECEIPT_AGE_MS,
  'Refresh hooks/list verification after installation; the receipt is missing, stale or predates installation.');
  const matches = Array.isArray(receipt.workspaces) ? receipt.workspaces.filter(x => x.cwd === cwd) : [];
  requireThat(matches.length === 1, 'hooks/list did not identify exactly this workspace.');
  const workspace = matches[0], hooks = workspace.projectHooks;
  requireThat(Array.isArray(workspace.originalMemoryHooks) && workspace.originalMemoryHooks.length === 0,
    'Original memory hooks are still discovered in this workspace.');
  requireThat(Array.isArray(hooks) && hooks.length === 5 && new Set(hooks.map(x => x.key)).size === 5 &&
    JSON.stringify(hooks.map(x => x.event).sort()) === JSON.stringify(EVENTS) &&
    hooks.every(x => typeof x.key === 'string' && x.key && x.trustStatus === 'trusted' && /^sha256:[0-9a-f]{64}$/.test(x.currentHash)),
  'All five exact project hooks must be trusted in fresh hooks/list evidence.');
}

export function validatePreservedState(before, after) {
  requireThat(after?.workspacePeerId === '', 'SessionStart did not select its explicit project Peer.');
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === 'workspacePeerId' || key === 'lastUpdatedAt') continue;
    requireThat(JSON.stringify(before[key]) === JSON.stringify(after[key]),
      'SessionStart changed a preserved state field; stop and reconcile the moved state.');
  }
  requireThat(after.ovSessionId === null && Number.isInteger(after.capturedTurnCount) && after.capturedTurnCount >= 0,
    'SessionStart did not preserve the flushed capture boundary.');
}

async function absent(path) {
  try { await lstat(path); throw new MigrationError('A destination or recovery artifact already exists; reconcile it before retrying.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function rejectLegacyMarkers(stateDir, threadId, { ownLock = false } = {}) {
  const names = await readdir(stateDir);
  requireThat(!names.some(name => name === `${threadId}.ended` || name.startsWith(`${threadId}.ended.`) ||
    name === `${threadId}.json.tmp` || (!ownLock && name === `${threadId}.lock`)),
  'Legacy capture has an active lock, end marker or unfinished temporary state.');
}

async function executeSessionStart(runtime, cwd, threadId, transcriptPath) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [join(runtime, 'hook-router.mjs'), 'SessionStart'], {
      cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdoutBytes = 0, stderrBytes = 0;
    child.stdout.on('data', chunk => { stdoutBytes += chunk.length; });
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
    child.on('error', () => reject(new MigrationError('Routed SessionStart could not start.')));
    child.stdin.on('error', () => {});
    child.once('close', (code, signal) => accept({ code, signal, stdoutBytes, stderrBytes }));
    child.stdin.end(JSON.stringify({ session_id: threadId, cwd, source: 'resume', transcript_path: transcriptPath }));
  });
}

export async function migrateTaskState({ node, generation = GENERATION, phaseBoundaryVerified = false, hooksReceiptPath } = {}) {
  requireThat([11, 12, 13, 14].includes(node) && generation === GENERATION, 'Only registered nodes 11–14 and generation 20260913.3 are supported.');
  requireThat(phaseBoundaryVerified === true,
    'The coordinator must verify the completed phase and no detached writers, then supply --phase-boundary-verified.');
  requireThat(!process.env.OPENVIKING_CODEX_STATE_DIR && !process.env.OV_HOOK_WORKER && !process.env.OPENVIKING_HOOK_STDIN_CACHE,
    'Run migration from the unchanged coordinator environment, outside hook workers.');
  const rollout = join(ROOT, '.dock/shared-project-memory', `rollout-${generation}`);
  const backupDir = join(ROOT, '.dock/shared-project-memory/activation', generation, `node${node}`);
  await checkedPath(backupDir, { directory: true, privateMode: 0o700 });
  const manifest = await readJson(join(rollout, 'manifest.json'));
  const registry = await readJson(join(ROOT, '.dock/node-streams-20260912/state.json'));
  const task = manifest.tasks.find(x => x.node === node), lane = registry.lanes.find(x => x.node === node);
  requireThat(manifest.generation === generation && manifest.disablement_method === 'project-plugin-disabled' &&
    task && lane?.phase?.startsWith('awaiting-') && task.thread_id === lane.thread_id && task.cwd === lane.worktree,
  'The recorded task must be at its completed phase boundary.');
  const context = { node, threadId: lane.thread_id, cwd: lane.worktree, generation };
  requireThat(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(context.threadId), 'Invalid registered task ID.');
  await checkedPath(context.cwd, { directory: true });
  const installedPath = join(backupDir, 'configuration-installed.json');
  const installed = await readJson(installedPath, 0o600);
  validateInstalledReceipt(installed, context);
  const hooksPath = hooksReceiptPath || join(rollout, 'hooks-trust-verified.json');
  const hooksReceipt = await readJson(hooksPath, 0o600);
  const assertConfiguration = async () => {
    validateHooksReceipt(hooksReceipt, installed, context);
    requireThat(sha256(await readFile(join(context.cwd, '.codex/config.toml'))) === installed.configSha256 &&
      sha256(await readFile(join(ROOT, '.codex/hooks.json'))) === installed.hooksSha256 &&
      sha256(await readFile(join(rollout, 'hooks.json.pending'))) === installed.hooksSha256,
    'The installed project configuration or reviewed hook definitions changed.');
  };
  await assertConfiguration();
  const runtime = join(ROOT, '.dock/shared-project-memory/runtime', generation);
  requireThat(manifest.runtime === runtime, 'The prepared runtime does not match the migration generation.');
  const routing = await import(pathToFileURL(join(runtime, 'project-routing.mjs')));
  const route = routing.resolveProjectRoute(context.cwd, routing.loadProjectRouting());
  requireThat(route && route.generation === generation && route.projectRoot === ROOT,
    'The active exact-workspace route is missing or belongs to another generation.');
  const pluginRoot = join(homedir(), '.codex/plugins/cache/openviking/openviking-memory/0.8.1');
  requireThat(route.pluginRoot === pluginRoot, 'The official plugin path differs from the reviewed installation.');
  const stateDir = join(homedir(), '.openviking/codex-plugin-state');
  const source = join(stateDir, `${context.threadId}.json`), target = join(route.stateDir, `${context.threadId}.json`);
  const backup = join(backupDir, 'legacy-state-before.json'), outcomePath = join(backupDir, 'state-migration.json');
  const activation = routing.activationPath(context, route), receiptPath = routing.routingReceiptPath(route, context.threadId);
  await checkedPath(stateDir, { directory: true });
  await checkedPath(route.stateDir, { directory: true, privateMode: 0o700 });
  for (const path of [target, backup, outcomePath, activation, receiptPath]) await absent(path);
  await rejectLegacyMarkers(stateDir, context.threadId);
  const { withSessionLock } = await import(pathToFileURL(join(pluginRoot, 'scripts/session-state.mjs')));
  const { deriveWorkspacePeerId } = await import(pathToFileURL(join(pluginRoot, 'scripts/shared/workspace-peer.mjs')));
  const { loadConfig } = await import(pathToFileURL(join(pluginRoot, 'scripts/config.mjs')));
  const { readTranscriptTurns } = await import(pathToFileURL(join(pluginRoot, 'scripts/ov-session.mjs')));
  const cfg = loadConfig(), oldPeer = deriveWorkspacePeerId(context.cwd);
  requireThat(!cfg.peerId, 'Migration requires the unchanged workspace-derived Peer configuration.');
  const flush = await readJson(join(ROOT, '.dock/shared-project-memory/activation', `node${node}-legacy-flush.json`), 0o600);
  requireThat(flush.node === node && flush.threadId === context.threadId && flush.cwd === context.cwd &&
    flush.originalPeer === oldPeer && flush.ovSessionReleased === true && flush.hookExitCode === 0 &&
    Number.isInteger(flush.cursorAfter) && flush.cursorAfter >= 0 && flush.transcriptTurns === flush.cursorAfter,
  'A successful matching legacy flush receipt is required.');
  let before, moved = false;
  try {
    const locked = await withSessionLock(context.threadId, async () => {
      await assertConfiguration();
      await rejectLegacyMarkers(stateDir, context.threadId, { ownLock: true });
      await checkedPath(source);
      const bytes = await readFile(source); before = JSON.parse(bytes.toString());
      requireThat(before.codexSessionId === context.threadId && before.workspacePeerId === oldPeer &&
        before.ovSessionId === null && before.capturedTurnCount === flush.cursorAfter,
      'The legacy state changed after its flush; flush again before migration.');
      requireThat(typeof before.transcriptPath === 'string', 'The capture transcript reference is missing.');
      const transcript = await readTranscriptTurns(before.transcriptPath, cfg);
      requireThat(transcript.ok && transcript.turns.length === before.capturedTurnCount,
        'The legacy transcript acquired a new tail; flush again before migration.');
      requireThat(sha256(await readFile(source)) === sha256(bytes), 'Legacy state changed while validating the boundary.');
      await absent(target);
      await writeFile(backup, bytes, { flag: 'wx', mode: 0o600 });
      await rename(source, target); moved = true;
      await chmod(target, 0o600);
      requireThat(sha256(await readFile(target)) === sha256(bytes), 'The moved capture cursor differs from its backup.');
      const activationDir = join(route.stateDir, 'routing-activations');
      await mkdir(activationDir, { recursive: true, mode: 0o700 });
      await checkedPath(activationDir, { directory: true, privateMode: 0o700 });
      await writeFile(activation, JSON.stringify({ version: 1, threadId: context.threadId, cwd: context.cwd,
        routeHash: route.routeHash, generation, sourceStateDir: stateDir, originalStateRetired: true,
        originalProjectHooksDisabled: true, disablementMethod: 'project-plugin-disabled', verifiedAt: new Date().toISOString() }) + '\n',
      { flag: 'wx', mode: 0o600 });
    }, { waitMs: 0 });
    requireThat(!locked.skipped, 'An original capture writer acquired the session lock; retry only after verifying the boundary.');
    // The wrapper correctly rejects the old lock, so release it before SessionStart.
    await rejectLegacyMarkers(stateDir, context.threadId);
    routing.validateActivation(context, route);
    const hook = await executeSessionStart(runtime, context.cwd, context.threadId, before.transcriptPath);
    requireThat(hook.code === 0 && !hook.signal, 'Routed SessionStart failed; the moved state is preserved for recovery.');
    const after = routing.readMappedState(context, route);
    validatePreservedState(before, after);
    const receipt = routing.readRouteReceipt(context, route);
    routing.assertNoLegacyState(context, route);
    const result = { node, threadId: context.threadId, cwd: context.cwd, generation, migrated: true,
      capturedTurnCount: after.capturedTurnCount, ovSessionId: after.ovSessionId, workspacePeerId: after.workspacePeerId,
      effectivePeerId: receipt.effectivePeerId, routeHash: receipt.routeHash, runtimeReloadVerified: false,
      newCaptureVerified: false, checkedAt: new Date().toISOString() };
    await writeFile(outcomePath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return result;
  } catch (error) {
    if (moved) throw new MigrationError('Migration stopped after moving the cursor. Preserve the project state and external backup; diagnose before any retry or rollback.');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2), rawNode = args.shift();
  const node = Number(String(rawNode).replace(/^node/, ''));
  let generation = GENERATION, phaseBoundaryVerified = false, hooksReceiptPath;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--phase-boundary-verified') phaseBoundaryVerified = true;
    else if (arg === '--generation' && args.length) generation = args.shift();
    else if (arg === '--hooks-receipt' && args.length) hooksReceiptPath = resolve(args.shift());
    else throw new MigrationError('Usage: migrate_task_state.mjs node11|node12|node13|node14 --phase-boundary-verified [--generation 20260913.3] [--hooks-receipt path]');
  }
  const result = await migrateTaskState({ node, generation, phaseBoundaryVerified, hooksReceiptPath });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && existsSync(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`OpenViking migration: ${error instanceof MigrationError ? error.message : 'Input or filesystem validation failed; no unsafe fallback was attempted.'}\n`);
    process.exitCode = 1;
  });
}
