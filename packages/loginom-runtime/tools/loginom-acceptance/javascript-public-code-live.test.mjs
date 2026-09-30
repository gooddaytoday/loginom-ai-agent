import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';

test('new public Code lifecycle supplies the real pinned link primitive and selectors',async()=>{
  const pinned=await javascriptPublicCodePins();
  assert.equal(pinned.actions.get('link.create').capability,'link.create.v1');
  assert.ok(pinned.selectors.size>0);
  assert.ok(pinned.actions.has('package.save_checkpoint'));
});
