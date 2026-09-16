import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEYS, CAPABILITY_REGISTRY, requireCapability } from '../lib/capability-registry.mjs';
import { actionDescribeTool, actionRunTool } from '../lib/action-catalog.mjs';
import { makeCapabilityCode, createActionRuntime } from '../lib/executor.mjs';

test('local registry agrees with advertised tools, ABI and authored action contracts', async () => {
  const abi = JSON.parse(await readFile(new URL('../../executor/capability-abi.json', import.meta.url)));
  const catalog = JSON.parse(await readFile(new URL('../../executor/catalog/actions.json', import.meta.url)));
  assert.deepEqual(actionDescribeTool.inputSchema.properties.action_key.enum, ACTION_KEYS);
  assert.deepEqual(actionRunTool.inputSchema.properties.action_key.enum, ACTION_KEYS);
  assert.equal(new Set(CAPABILITY_REGISTRY.map(item => item.handler)).size, ACTION_KEYS.length);
  assert.deepEqual(Object.keys(abi.capabilities).sort(), CAPABILITY_REGISTRY.map(item => item.capability).sort());
  for (const action of catalog.actions) {
    const entry = requireCapability(action);
    assert.equal(abi.capabilities[entry.capability].action_key, entry.actionKey);
    assert.equal(abi.capabilities[entry.capability].effect_kind, entry.effectKind);
  }
});

test('unknown JSON actions and cross-wired known handlers fail before browser dispatch', async () => {
  let browserCalls = 0;
  for (const action of [
    { action_key: 'node.add', capability: 'link.create.v1', effect: { kind: 'create', resource: 'workflow.node' } },
    { action_key: 'package.save_as', capability: 'package.save_as.v1', effect: { kind: 'create', resource: 'workflow.node' } },
    { action_key: 'future.inspect', capability: 'future.inspect.v1', effect: { kind: 'inspect', resource: 'workspace' } },
  ]) {
    action.status = 'candidate';
    assert.throws(() => makeCapabilityCode(action, new Map(), {}), /local capability/);
    const runtime = createActionRuntime({ pinned: { actions: new Map([[action.action_key, action]]), selectors: new Map() },
      allowCandidate: true, execute: async () => { browserCalls++; } });
    assert.throws(() => runtime.describe(action.action_key), /local capability/);
    await assert.rejects(runtime.run(action.action_key, {}), /local capability/);
  }
  assert.equal(browserCalls, 0);
});
