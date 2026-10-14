import test from 'node:test';
import assert from 'node:assert/strict';
import {Page,run,runtime,actions,selectors} from '../../../packages/loginom-runtime/client/test/support/executor-fixture.mjs';
import {consumeSavedPackageRecords,savedRecordHash} from '../grouping-saved-package-consumer.mjs';

const build='7.4.2',path='/user/data/packages/grouping.lgp';

function correlatedRecords(action,checkpoint,outcome,fullWorkflow=checkpoint.workflow_ref) {
  const now=Date.parse('2026-10-12T02:00:00Z');
  const expected={sessionId:'review-cli-session',documentId:'review-prepared-document',account:'own',packagePath:path,
    loginomUrl:'https://loginom.invalid/app/',loginomBuild:build,prepareOperationId:'prepare',saveOperationId:'review-save',
    runtimeRevision:'a'.repeat(64),manifestSha256:'b'.repeat(64),workflowRef:fullWorkflow};
  const meta={session_id:expected.sessionId,runtime_revision:expected.runtimeRevision,manifest_sha256:expected.manifestSha256,target:{loginom_build:build}};
  const parameters={path,conflict_policy:'fail'};
  const records={
    workspace:{...meta,recorded_at:new Date(now-4000).toISOString(),event:'workspace_prepared',state:{
      status:'READY',target:{loginom_build:build},authenticated:true,created_draft:true,operation_id:'prepare',
      session_id:expected.sessionId,document_id:expected.documentId,loginom_account:expected.account,
      workflow_ref:fullWorkflow,ownership_verified:true,target_verified:true,package_ref:{path:null}}},
    request:{...meta,recorded_at:new Date(now-3000).toISOString(),phase:'prepared',operation_id:expected.saveOperationId,action_key:action,parameters,checkpoint},
    save:{...meta,recorded_at:new Date(now-2000).toISOString(),phase:'completed',operation_id:expected.saveOperationId,action_key:action,parameters,checkpoint,outcome},
    dirty:{...meta,recorded_at:new Date(now-1000).toISOString(),phase:'saved_package_state_observed',operation_id:expected.saveOperationId,state:{
      version:1,session_id:expected.sessionId,document_id:expected.documentId,account:expected.account,package_path:path,
      modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false}}
  };
  const raw=Object.fromEntries(Object.entries(records).map(([k,v])=>[k,JSON.stringify(v)]));
  expected.recordPins=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,savedRecordHash(v)]));
  return consumeSavedPackageRecords(raw,expected,{now});
}

// Real installed serialized capability; Page/DOM and the full preparation
// binding/journal metadata are explicit doubles. No Loginom/native call occurs.
for(const action of ['package.save_as','package.save_checkpoint']) {
  test(`reviewer: real ${action} verified outcome correlates without changing producer phase`,async t=>{
    const page=new Page();page.app.Version=build;
    const prepared=await run(page,action,{path,conflict_policy:'fail'},{mode:'prepare',expected_build:build,operation_id:'review-save'});
    assert.equal(prepared.phase,'prepared');
    const checkpoint=prepared.checkpoint;
    // A separately pinned complete preparation double supplies these fields;
    // this does not assert that the classic runtime adds them to its journal.
    checkpoint.workflow_ref={...checkpoint.workflow_ref,workflow_id:'review-workflow',navigation_path:[]};
    const outcome=await run(page,action,{path,conflict_policy:'fail'},{mode:'apply',checkpoint,expected_build:build,operation_id:'review-save'});
    assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome));
    assert.equal(outcome.cleanup_complete,true);
    assert.equal(outcome.error,null);
    assert.equal(outcome.phase,'verified');
    const receipt=correlatedRecords(action,checkpoint,outcome);
    t.diagnostic(JSON.stringify({action,journal_phase:'completed',producer_outcome_phase:outcome.phase,consumer:receipt}));
    assert.equal(receipt.correlation,'VERIFIED','completed journal phase and verified native outcome are distinct');
    assert.equal(receipt.status,'NOT_VERIFIED');
    assert.equal(receipt.native_binding,'NOT_VERIFIED');
    assert.equal(receipt.mutation_authorized,false);
    assert.equal(receipt.release_authorized,false);
  });
}

test('reviewer: classic runtime records completed/verified and only tab/prefix checkpoint',async t=>{
  const page=new Page();page.app.Version=build;const records=[];
  const engine=runtime(page,{pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},onRecord:async r=>records.push(r)});
  const outcome=await engine.run('package.save_checkpoint',{path,conflict_policy:'fail'},{operationId:'review-save'});
  assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome));
  const completed=records.find(r=>r.phase==='completed');
  assert.equal(completed.outcome.phase,'verified');
  assert.equal(Object.hasOwn(completed.checkpoint.workflow_ref,'workflow_id'),false);
  assert.equal(Object.hasOwn(completed.checkpoint.workflow_ref,'navigation_path'),false);
  const fullWorkflow={...completed.checkpoint.workflow_ref,workflow_id:'review-workflow',navigation_path:[]};
  const consumed=correlatedRecords('package.save_checkpoint',completed.checkpoint,completed.outcome,fullWorkflow);
  assert.equal(consumed.correlation,'NOT_VERIFIED');
  assert.equal(consumed.reason,'SAVE_WORKFLOW_BINDING_UNAVAILABLE');
  assert.equal(consumed.mutation_authorized,false);
  assert.equal(consumed.release_authorized,false);
  t.diagnostic(JSON.stringify({journal_phase:completed.phase,outcome_phase:completed.outcome.phase,checkpoint_keys:Object.keys(completed.checkpoint.workflow_ref)}));
});
