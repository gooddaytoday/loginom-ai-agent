import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { loadEnrollment, protectedPath, observationPath, hash } from './enrollment-routing.mjs';
import { activationPath, validateActivation, readMappedState, readRouteReceipt, routingReceiptPath,
  assertNoLegacyState, DEFAULT_LEGACY_STATE_DIR } from './project-routing.mjs';
import { runHook } from './hook-router.mjs';

const fail = message => { throw new Error(message); };
export function atomicJson(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try { writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export function validateBootstrapEvidence(evidence, record, threadId, now = Date.now()) {
  if (!evidence || evidence.threadId !== threadId || evidence.cwd !== record.cwd ||
      evidence.registrationId !== record.registrationId || evidence.turnStatus !== 'completed' ||
      evidence.threadStatus !== 'idle' || evidence.developmentStarted !== false ||
      !evidence.turnId || !Number.isFinite(Date.parse(evidence.checkedAt)) ||
      now - Date.parse(evidence.checkedAt) > 600000 || Date.parse(evidence.checkedAt) > now + 30000)
    fail('Fresh completed bootstrap evidence from the coordinator is required.');
}

export function validateEnrollmentHooks(receipt, record, now = Date.now()) {
  const workspace = receipt?.workspaces?.find(x => x.cwd === record.cwd);
  if (!receipt || receipt.generation !== record.routeSpec.generation || receipt.hooksSha256 !== record.prepared.hooksSha256 ||
      !Number.isFinite(Date.parse(receipt.checkedAt)) || now - Date.parse(receipt.checkedAt) > 600000 ||
      Date.parse(receipt.checkedAt) > now + 30000 || !workspace || workspace.originalMemoryHooks?.length !== 0 ||
      workspace.projectHooks?.length !== 10 || new Set(workspace.projectHooks.map(x => x.event)).size !== 5 ||
      !workspace.projectHooks.every(x => x.trustStatus === 'trusted' && /^sha256:[a-f0-9]{64}$/.test(x.currentHash)))
    fail('Refresh normal hooks/list: legacy and enrollment hooks must be trusted and original plugin capture absent.');
}

export async function enrollFreshTask({ cwd, threadId, evidence, hooksReceipt,
  enrollmentOptions, legacyStateDir = DEFAULT_LEGACY_STATE_DIR, hookRunner = runHook } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(threadId)) fail('Invalid host task ID.');
  let enrollment = loadEnrollment(cwd, enrollmentOptions);
  if (!enrollment) fail('Prepare this exact workspace before creating its bootstrap task.');
  const lock = enrollment.path + '.lock';
  mkdirSync(lock, { mode: 0o700 }); // No stale-lock stealing: an interrupted coordinator must reconcile.
  try {
    enrollment = loadEnrollment(cwd, enrollmentOptions);
    const { record, route } = enrollment, context = { cwd, threadId };
    if (record.status !== 'pending' && record.threadId !== threadId) fail('Another task owns this workspace.');
    validateBootstrapEvidence(evidence, record, threadId);
    validateEnrollmentHooks(hooksReceipt, record);
    if (hash(readFileSync(join(cwd, '.codex/config.toml'))) !== record.prepared.configSha256 ||
        hash(readFileSync(join(route.projectRoot, '.codex/hooks.json'))) !== record.prepared.hooksSha256)
      fail('Prepared MCP or hook definitions changed; reconcile before enrollment.');
    protectedPath(observationPath(enrollment));
    const observed = JSON.parse(readFileSync(observationPath(enrollment), 'utf8'));
    if (observed.threadId !== threadId || observed.cwd !== cwd || observed.registrationId !== record.registrationId || observed.routeHash !== route.routeHash)
      fail('Actual SessionStart observation does not match this host task.');
    assertNoLegacyState(context, route, legacyStateDir);
    const statePath = join(route.stateDir, threadId + '.json');
    const activation = activationPath(context, route), receiptPath = routingReceiptPath(route, threadId);
    if (record.status === 'active') {
      validateActivation(context, route, legacyStateDir); readRouteReceipt(context, route);
      return { status: 'already-enrolled', threadId, cwd, capturedTurnCount: readMappedState(context, route).capturedTurnCount };
    }
    if (readdirSync(route.stateDir).some(x => x === threadId + '.lock' || x.startsWith(threadId + '.ended') || x === threadId + '.json.tmp'))
      fail('A capture writer or unfinished state exists; do not enroll or reset it.');
    if (record.status === 'pending') {
      if ([statePath, activation, receiptPath].some(existsSync)) fail('Existing task state must never be treated as a fresh enrollment.');
      atomicJson(enrollment.path, { ...record, status: 'enrolling', threadId });
    }
    for (const name of ['routing-activations','routing-receipts']) {
      const path = join(route.stateDir, name);
      mkdirSync(path, { recursive: true, mode: 0o700 }); protectedPath(path, true);
    }
    if (!existsSync(activation)) {
      writeFileSync(activation, JSON.stringify({ version: 1, ...context, routeHash: route.routeHash,
        generation: route.generation, sourceStateDir: legacyStateDir, originalStateRetired: true,
        originalProjectHooksDisabled: true, disablementMethod: 'project-plugin-disabled',
        verifiedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
    }
    validateActivation(context, route, legacyStateDir);
    if (existsSync(statePath)) {
      const state = readMappedState(context, route);
      if (state.capturedTurnCount !== 0 || state.ovSessionId !== null) fail('Recovery found captured data; preserve it and reconcile manually.');
    }
    let stdoutBytes = 0, stderrBytes = 0;
    const sink = add => new Writable({write(chunk, encoding, done) { add(chunk.length); done(); }});
    // Resume avoids the official startup sweeper touching other tasks.
    await hookRunner('SessionStart', { cwd, raw: Buffer.from(JSON.stringify({session_id:threadId,cwd,source:'resume'})),
      stdout: sink(n => stdoutBytes += n), stderr: sink(n => stderrBytes += n),
      legacyStateDir, enrollmentSetup: true, enrollmentsOnly: true,
      enrollmentLoader: path => loadEnrollment(path, enrollmentOptions) });
    const state = readMappedState(context, route); readRouteReceipt(context, route);
    if (state.capturedTurnCount !== 0 || state.ovSessionId !== null) fail('Fresh SessionStart did not preserve the empty capture boundary.');
    atomicJson(enrollment.path, { ...record, status:'active', threadId });
    return { status:'enrolled', threadId, cwd, peer:route.canonicalPeerId, routeHash:route.routeHash,
      capturedTurnCount:0, stdoutBytes, stderrBytes, actorAccessVerified:false, newCaptureVerified:false };
  } finally {
    // Only our empty reservation lock. Never remove official capture locks.
    const { rmdirSync } = await import('node:fs'); rmdirSync(lock);
  }
}
