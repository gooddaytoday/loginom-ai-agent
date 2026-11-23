import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './support/javascript-source-fixture.mjs';

test('JavaScript source preserves captured editor ownership with coherent preparation receipts',()=>{
 const f=sourceFixture(),receipts=f.environment.__loginomDockPreparationV1.receipts,first=receipts.get('receipt');
 Object.assign(first,{tab:f.tab,packageNode:{}});
 const held=f.capture();receipts.set('existing-workflow',{...first});
 assert.doesNotThrow(()=>f.read(held));
});

for(const field of ['tab','packageNode','nodeTargetWorkflowNode'])
test('JavaScript source refuses conflicting preparation '+field,()=>{
 const f=sourceFixture(),receipts=f.environment.__loginomDockPreparationV1.receipts,first=receipts.get('receipt');
 Object.assign(first,{tab:f.tab,packageNode:{}});
 const held=f.capture();receipts.set('existing-workflow',{...first,[field]:{}});
 assert.throws(()=>f.read(held),/prepared owner changed/);
});
