import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptPublicCodePins,javascriptPublicTypedIds,javascriptPublicCodeProbe,javascriptPublicCodeRequest} from './javascript-public-code-live.mjs';
import {validateNodeApplyRequest} from '../../client/lib/node-apply.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
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

for(const id of javascriptPublicTypedIds)test('fixed public typed request passes actual installed JS apply admission: '+id,()=>{
  const prepared={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',
    tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'workflow',label:'Сценарий'}]}};
  const input={node:{document_id:'doc',workflow_id:'flow',node_id:'input'}};
  const probe=javascriptPublicCodeProbe(id,'code');
  const support=createJavascriptCodeNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor()});
  const request=javascriptPublicCodeRequest({prepared,input,probe,schemaMode:'code',remaining:1000000});
  validateNodeApplyRequest(request,support.nodeApplyHandlers);
  assert.equal(request.read.coverage,'full');assert.equal(request.parameters.source_text,probe.source);
  assert.equal(request.parameters.schema_mode,'code');assert.equal(request.finish,'execute');
  assert.throws(()=>javascriptPublicCodeRequest({prepared,input,probe:{...probe,source:probe.source+'// drift'},schemaMode:'code',remaining:1000000}),/pin changed/);
});

test('typed operator refuses characterizations, declared, Save and cold writes before config',async()=>{
  for(const id of ['g5-outside-safe','g5-undefined','unknown','p1-business-code-base'])
    assert.throws(()=>javascriptPublicCodeProbe(id,'code'),/fixed code case/);
  assert.throws(()=>javascriptPublicCodeProbe('g5-null-empty','declared'),/fixed code case/);
  for(const [args,options,error] of [
    [['--config','/not-read/private.json'],{publicProbeId:'unknown'},/separate fixed entrypoint/],
    [['--config','/not-read/private.json'],{publicProbeId:'g5-null-empty',coldReader:true},/separate fixed entrypoint/],
    [['--config','/not-read/private.json'],{publicProbeId:'g5-null-empty'},/code lifecycle without Save/],
    [['--config','/not-read/private.json','--execution-case','code-table-execute','--verify-public-code-lifecycle','--verify-public-code-save'],{publicProbeId:'g5-null-empty'},/code lifecycle without Save/]])
    await assert.rejects(()=>runJavascriptOperator(args,options),error);
});
