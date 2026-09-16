#!/usr/bin/env node
// Finalize one completed worker's existing official capture before routing changes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = '/Users/kartamyshev/Git/loginom-dock';
const nodeId = Number(process.argv[2]);
if (![11, 12, 13, 14].includes(nodeId)) throw new Error('Specify one registered node ID');
const registry = JSON.parse(await readFile(join(root, '.dock/node-streams-20260912/state.json'), 'utf8'));
const lane = registry.lanes.find(x => x.node === nodeId);
if (!lane || !lane.phase.startsWith('awaiting-')) throw new Error('The coordinator has not recorded a completed phase');
const pluginRoot = join(homedir(), '.codex/plugins/cache/openviking/openviking-memory/0.8.1');
if (process.env.OPENVIKING_CODEX_STATE_DIR || process.env.OV_HOOK_WORKER || process.env.OPENVIKING_HOOK_STDIN_CACHE)
  throw new Error('Legacy flush must run outside project hook workers and state overrides');
const { loadConfig } = await import(pathToFileURL(join(pluginRoot, 'scripts/config.mjs')));
const cfg = loadConfig();
if (cfg.peerId) throw new Error('Legacy flush requires the unchanged workspace-derived Peer configuration');
const stateDir = join(homedir(), '.openviking/codex-plugin-state');
const statePath = join(stateDir, `${lane.thread_id}.json`);
const before = JSON.parse(await readFile(statePath, 'utf8'));
const { deriveWorkspacePeerId } = await import(pathToFileURL(join(pluginRoot, 'scripts/shared/workspace-peer.mjs')));
if (before.codexSessionId !== lane.thread_id || before.workspacePeerId !== deriveWorkspacePeerId(lane.worktree))
  throw new Error('Legacy cursor does not belong to the expected task/workspace');
if (existsSync(join(stateDir, `${lane.thread_id}.lock`))) throw new Error('Capture is still locked');
if (typeof before.transcriptPath !== 'string' || !existsSync(before.transcriptPath))
  throw new Error('The existing capture transcript is unavailable');
const input = {session_id: lane.thread_id, cwd: lane.worktree, transcript_path: before.transcriptPath, trigger: 'manual'};
const result = await new Promise((accept, reject) => {
  const child = spawn(process.execPath, [join(pluginRoot, 'scripts/pre-compact-capture.mjs')], {
    cwd: lane.worktree, env: process.env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = ''; let errorBytes = 0;
  child.stdout.on('data', b => { if (output.length < 64000) output += b.toString(); });
  child.stderr.on('data', b => { errorBytes += b.length; });
  child.on('error', () => reject(new Error('Official capture hook could not start')));
  child.on('close', code => accept({code, output, errorBytes}));
  child.stdin.end(JSON.stringify(input));
});
const after = JSON.parse(await readFile(statePath, 'utf8'));
if (result.code !== 0 || after.ovSessionId !== null || after.codexSessionId !== before.codexSessionId ||
    after.workspacePeerId !== before.workspacePeerId || after.capturedTurnCount < before.capturedTurnCount)
  throw new Error('Official capture did not confirm a complete, preserved legacy cursor');
const { readTranscriptTurns } = await import(pathToFileURL(join(pluginRoot, 'scripts/ov-session.mjs')));
const transcript = await readTranscriptTurns(before.transcriptPath, cfg);
if (!transcript.ok || transcript.turns.length !== after.capturedTurnCount)
  throw new Error('Transcript cursor still has an unsent tail or changed during flush');
if (existsSync(join(stateDir, `${lane.thread_id}.lock`))) throw new Error('A capture writer remains active after flush');
const receipt = {node: nodeId, threadId: lane.thread_id, cwd: lane.worktree,
  originalPeer: before.workspacePeerId, cursorBefore: before.capturedTurnCount, cursorAfter: after.capturedTurnCount,
  transcriptTurns: transcript.turns.length, ovSessionReleased: true, hookExitCode: result.code,
  hookReportedCommit: result.output.includes('is committed'), hookStderrBytes: result.errorBytes,
  checkedAt: new Date().toISOString(), settingsChanged: false, stateMoved: false};
const out = join(root, '.dock/shared-project-memory/activation');
await mkdir(out, {recursive: true, mode: 0o700});
await writeFile(join(out, `node${nodeId}-legacy-flush.json`), JSON.stringify(receipt, null, 2) + '\n', {mode: 0o600});
process.stdout.write(JSON.stringify(receipt) + '\n');
