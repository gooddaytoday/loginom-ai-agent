import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture, unionCleanupWitness} from './reviewer-kind-fixture.mjs';

// Original Close/Page/custody are doubles. Receipt IO is real; these controls
// neither qualify a native producer nor settle executor/runner cleanup gates.
test('receiving retains original ID across confirmed callback refusal and storage-only repair', async () => {
  const f = await fixture('transform.union_data');
  try {
    const original = structuredClone(f.operation);
    f.closeHook(async () => { f.operation.id = 'replacement'; });
    await assert.rejects(f.scope.complete(), /Original Union operation/);
    assert.deepEqual(f.counts, {close: 1, read: 0, write: 0});
    assert.equal(f.scope.primary, f.primary);
    await assert.rejects(f.scope.complete(), /Original Union operation/);
    assert.deepEqual(f.counts, {close: 1, read: 0, write: 0});
    f.operation.id = original.id;
    const proof = await f.scope.complete();
    assert(unionCleanupWitness(proof, f.operation));
    assert.deepEqual(f.counts, {close: 1, read: 1, write: 1});
    assert.deepEqual(f.operation, original);
    const receipt = JSON.parse(await readFile(join(f.directory, 'partial.json'), 'utf8'));
    assert.equal(receipt.operation_id, original.id);
    assert.equal(receipt.release_authority, false);
    assert.equal(receipt.package_saved, false);
    assert.equal(receipt.native_replay, false);
    assert.equal(await f.scope.complete(), proof);
    assert.deepEqual(f.counts, {close: 1, read: 1, write: 1});
  } finally { await f.cleanup(); }
});

test('receiving rejects changed ID before original callback/read/storage', async () => {
  const f = await fixture('transform.union_data');
  try {
    const original = structuredClone(f.operation);
    f.operation.id = 'replacement';
    await assert.rejects(f.scope.complete(), /Original Union operation/);
    assert.deepEqual(f.counts, {close: 0, read: 0, write: 0});
    assert.equal(f.scope.primary, f.primary);
    f.operation.id = original.id;
    assert(unionCleanupWitness(await f.scope.complete(), f.operation));
    assert.deepEqual(f.counts, {close: 1, read: 1, write: 1});
    assert.deepEqual(f.operation, original);
  } finally { await f.cleanup(); }
});
