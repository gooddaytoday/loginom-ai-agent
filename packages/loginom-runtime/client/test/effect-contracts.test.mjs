import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EFFECT_CONTRACTS, validateEffect } from '../lib/effect-contracts.mjs';
import { requireCapability } from '../lib/capability-registry.mjs';

test('new effect kinds have explicit contracts without enabling a JSON-only action', async () => {
  const abi = JSON.parse(await readFile(new URL('../../executor/capability-abi.json', import.meta.url)));
  assert.deepEqual(abi.effect_contracts, EFFECT_CONTRACTS);
  for (const kind of ['configure', 'delete', 'execute', 'inspect', 'transfer']) {
    const effect = { kind, resource: 'workflow.node' };
    const contract = validateEffect(effect);
    for (const name of ['precondition', 'postcondition', 'reconciliation', 'ownership']) assert.ok(contract[name]);
    assert.throws(() => requireCapability({ action_key: `future.${kind}`, capability: `future.${kind}.v1`, effect }), /local capability/);
  }
});

test('effect contracts reject ignored executable fields and unsafe destination roots', () => {
  validateEffect({ kind: 'save', resource: 'package', allowed_roots: ['/user/data/packages'] });
  validateEffect({ kind: 'transfer', resource: 'artifact', allowed_roots: ['/user/data'] });
  for (const effect of [
    { kind: 'inspect', resource: 'workspace', script: 'execute' },
    { kind: 'unknown', resource: 'workspace' }, { kind: 'constructor', resource: 'workspace' },
    { kind: 'create', resource: 'workflow.node', allowed_roots: ['/user'] },
    ...['/', '/a/../b', '/a//b', '/a%2fb', '/a?token=x', 'relative'].map(root => ({ kind: 'save', resource: 'package', allowed_roots: [root] })),
    { kind: 'transfer', resource: 'artifact', allowed_roots: [] },
  ]) assert.throws(() => validateEffect(effect), /Invalid/);
});
