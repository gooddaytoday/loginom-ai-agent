import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInstalledReceipt,
  validateHooksReceipt,
  validatePreservedState,
} from '../migrate_task_state.mjs';

// Pure validators only: no hooks, credentials, transcripts, or real state files.
const context = {
  node: 11,
  threadId: 'node11-fixture',
  cwd: '/fixture/workspace',
  generation: '20260913.3',
  now: Date.parse('2026-09-13T01:00:00Z'),
};
const installed = {
  ...context,
  checkedAt: '2026-09-13T00:58:00Z',
  configSha256: 'a'.repeat(64),
  hooksSha256: 'b'.repeat(64),
  trustVerified: true,
  captureStateMoved: false,
};
const projectHooks = ['preCompact', 'sessionEnd', 'sessionStart', 'stop', 'userPromptSubmit']
  .map((event, index) => ({
    event,
    key: `fixture-key-${index}`,
    trustStatus: 'trusted',
    currentHash: `sha256:${'a'.repeat(64)}`,
  }));
const hooks = {
  generation: context.generation,
  trusted_hooks: 5,
  checkedAt: '2026-09-13T00:59:00Z',
  workspaces: [{ cwd: context.cwd, projectHooks, originalMemoryHooks: [] }],
};
const before = {
  codexSessionId: context.threadId,
  workspacePeerId: 'old-fixture-peer',
  capturedTurnCount: 1452,
  ovSessionId: null,
  transcriptPath: '/fixture/rollout',
  createdAt: 1,
  lastUpdatedAt: 2,
};
const after = { ...before, workspacePeerId: '', lastUpdatedAt: 3 };

test('matching installed configuration receipt is accepted', () => {
  assert.doesNotThrow(() => validateInstalledReceipt(installed, context));
});

test('fresh trusted hooks after installation with no original hooks are accepted', () => {
  assert.doesNotThrow(() => validateHooksReceipt(hooks, installed, context));
});

for (const [name, patch] of [
  ['foreign task', { threadId: 'another-task' }],
  ['already moved state', { captureStateMoved: true }],
  ['another generation', { generation: 'older-generation' }],
  ['invalid configuration hash', { configSha256: 'invalid' }],
]) {
  test(`installed receipt rejects ${name}`, () => {
    assert.throws(() => validateInstalledReceipt({ ...installed, ...patch }, context),
      /installed configuration receipt/);
  });
}

for (const [name, patch] of [
  ['old verification predating installation', { checkedAt: '2026-09-13T00:00:00Z' }],
  ['future verification timestamp', { checkedAt: '2026-09-13T01:10:00Z' }],
  ['missing fifth trusted hook', { trusted_hooks: 4 }],
  ['another generation', { generation: 'older-generation' }],
]) {
  test(`hooks receipt rejects ${name}`, () => {
    assert.throws(() => validateHooksReceipt({ ...hooks, ...patch }, installed, context),
      /Refresh hooks\/list verification/);
  });
}

test('even a disabled original hook still requires reconciliation', () => {
  const receipt = {
    ...hooks,
    workspaces: [{
      cwd: context.cwd,
      projectHooks,
      originalMemoryHooks: [{ event: 'stop', enabled: false }],
    }],
  };
  assert.throws(() => validateHooksReceipt(receipt, installed, context), /Original memory hooks/);
});

test('one untrusted project hook prevents migration', () => {
  const receipt = {
    ...hooks,
    workspaces: [{
      cwd: context.cwd,
      projectHooks: projectHooks.map((hook, index) =>
        index === 0 ? { ...hook, trustStatus: 'untrusted' } : hook),
      originalMemoryHooks: [],
    }],
  };
  assert.throws(() => validateHooksReceipt(receipt, installed, context), /All five exact project hooks/);
});

test('SessionStart may change only the explicit-Peer marker and update timestamp', () => {
  assert.doesNotThrow(() => validatePreservedState(before, after));
});

for (const [name, patch] of [
  ['cursor reset', { capturedTurnCount: 0 }],
  ['unexpected new capture', { capturedTurnCount: 1453 }],
  ['foreign task ID', { codexSessionId: 'another-task' }],
  ['changed transcript', { transcriptPath: '/fixture/another-rollout' }],
  ['nonempty workspace Peer', { workspacePeerId: 'project-fixture-peer' }],
  ['unreleased session', { ovSessionId: 'cx-another-task' }],
]) {
  test(`post-SessionStart validation rejects ${name}`, () => {
    assert.throws(() => validatePreservedState(before, { ...after, ...patch }),
      /preserved state field|explicit project Peer|flushed capture boundary/);
  });
}
