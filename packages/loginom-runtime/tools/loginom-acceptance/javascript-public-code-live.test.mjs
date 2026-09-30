import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

test('new public Code lifecycle supplies the real pinned link primitive and selectors',async()=>{
  const pinned=await javascriptPublicCodePins();
  assert.equal(pinned.actions.get('link.create').capability,'link.create.v1');
  assert.ok(pinned.selectors.size>0);
  assert.ok(pinned.actions.has('package.save_checkpoint'));
});

test('public Code Save refuses unrelated and focus-changing modes before private config access',async()=>{
  const paths=['--config','/not-read/private.json','--profile','/not-created/profile',
    '--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
  await assert.rejects(()=>runJavascriptOperator([...paths,'--verify-public-code-save']),
    /Public Code Save requires the isolated public Code lifecycle/);
  for(const [extra,error] of [
    [['--execution-case','declared-table-execute'],/Public Code lifecycle requires its isolated new-node case in ordinary headed mode/],
    [['--execution-case','code-table-execute','--x11-no-focus'],/X11 focus guard requires the isolated managed opening probe/]]){
    await assert.rejects(()=>runJavascriptOperator([...paths,...extra,'--verify-public-code-lifecycle','--verify-public-code-save']),
      error);
  }
});

test('public declared Save refuses mixed schema modes, wrong entrypoint and unrelated flags',async()=>{
  const paths=['--config','/not-read/private.json','--profile','/not-created/profile',
    '--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
  await assert.rejects(()=>runJavascriptOperator([...paths,'--verify-public-declared-save']),/Public declared Save requires/);
  await assert.rejects(()=>runJavascriptOperator([...paths,'--verify-public-code-lifecycle','--verify-public-declared-lifecycle']),
    /one schema mode/);
  for(const extra of [['--execution-case','code-table-execute'],
    ['--execution-case','declared-table-execute','--verify-public-code-save'],
    ['--execution-case','declared-table-execute','--verify-public-source-read']]){
    await assert.rejects(()=>runJavascriptOperator([...paths,'--verify-public-declared-lifecycle','--verify-public-declared-save',...extra]),
      /Public (declared lifecycle|Code Save|source read) requires/);
  }
});
