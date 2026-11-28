import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout} from 'node:timers/promises';
import {makeWorkspacePrepareCode,prepareWorkspaceSession} from '../lib/workspace.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {Page} from './support/workspace-ui-fixture.mjs';
import {nestedWorkspacePage} from './support/nested-workspace-page.mjs';

function fixture(options) {
  const browser=nestedWorkspacePage(options);
  const adapter=createNodeTargetBrowserAdapter({origin:'https://app.loginom.ai',build:'7.4.2',pinned:{},execute:browser.execute});
  const navigate=(wf,direction='enter',operationId='enter',{timeoutMs=120000,recoverOnly=false}={})=>browser.execute(makeWorkspacePrepareCode({
    loginomUrl:'https://app.loginom.ai/app/?testable=true',compatibility:{profile_id:'native',loginom_build:'7.4.2',platform:'linux',browser:'chromium'},
    intent:'existing_workflow',workflowRef:{...wf,document_id:'doc'},operationId,timeoutMs,recoverOnly,
    graphNavigation:{direction,...(direction==='enter'?{node_ref:{document_id:'doc',workflow_id:wf.workflow_id,node_id:'supernode'}}:{})},
  }));
  return {...browser,navigate,read:wf=>adapter.observe({document_id:'doc',workflow_ref:wf},Date.now()+2000),
    context:wf=>readPreparedNodeContext(browser.page,{document_id:'doc',workflow_ref:wf,node:{document_id:'doc',workflow_id:wf.workflow_id,node_id:'calc'}})};
}

test('NW1 fresh native Supernode renders entry only after owned selection (live DOM LAB-1615)',async()=>{
  const f=fixture({entryOnSelection:true});
  const entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  assert.equal(f.clicks(),1);assert.equal(f.selections(),1);
});

test('NW1 refuses a foreign selection overlay without selecting or navigating',async()=>{
  const f=fixture({entryOnSelection:true,foreignSelection:true});
  const result=await f.navigate(f.ref);
  assert.equal(result.status,'NOT_READY');assert.equal(result.effect_possible,false);
  assert.equal(f.clicks(),0);assert.equal(f.selections(),0);
});

for (const refused of [false, true]) {
  test('prepare replays reordered request keys after ' + (refused ? 'a no-effect refusal' : 'verified navigation'), async () => {
    const f = fixture({ entryOnSelection: refused, foreignSelection: refused });
    const metadata = { skillRevision: 'skill' };
    const request = {
      operation_id: 'enter',
      intent: 'existing_workflow',
      package_path: null,
      workflow_ref: { ...f.ref, document_id: 'doc' },
      graph_navigation: { direction: 'enter', node_ref: { document_id: 'doc', workflow_id: 'outer', node_id: 'supernode' } },
    };
    const reordered = {
      ...request,
      workflow_ref: { ...request.workflow_ref, navigation_path: f.ref.navigation_path.map(({ tid, label }) => ({ label, tid })) },
      graph_navigation: { node_ref: { node_id: 'supernode', workflow_id: 'outer', document_id: 'doc' }, direction: 'enter' },
    };
    const run = input => prepareWorkspaceSession({
      metadata, request: input, assertAllowed() {}, assertTarget() {}, record: async () => {}, save: async () => {},
      prepare: ({ recoverOnly }) => f.navigate(f.ref, 'enter', request.operation_id, { recoverOnly }),
    });
    const first = await run(request);
    assert.equal(first.status, refused ? 'NOT_READY' : 'READY', first.reason);
    const second = await run(reordered);
    assert.equal(second.status, first.status, second.reason);
    assert.equal(second.reason, first.reason);
    assert.equal(metadata.workspacePreparation.identity, JSON.stringify(request));
    if (!refused) {
      assert.equal(second.replayed, true);
      assert.equal(second.workflow_ref.workflow_id, first.workflow_ref.workflow_id);
    }
    assert.equal(f.clicks(), refused ? 0 : 1);
    await assert.rejects(run({ ...reordered, workflow_ref: {
      ...reordered.workflow_ref, navigation_path: [...reordered.workflow_ref.navigation_path].reverse(),
    } }), /Preparation operation conflict/);
    await assert.rejects(run({ ...reordered, graph_navigation: {
      ...reordered.graph_navigation, node_ref: { ...reordered.graph_navigation.node_ref, node_id: 'other-node' },
    } }), /Preparation operation conflict/);
  });
}

// LAB-2054 (bh-i103): the real in-page refusal carries the proof the gate
// needs, leaves the parent receipt verified, and admits a NEW existing_workflow.
test('NW1 a no-effect selection refusal keeps the parent receipt and admits a NEW existing_workflow ID',async()=>{
  const f=fixture({entryOnSelection:true,foreignSelection:true,playwrightErrors:true});
  const metadata={skillRevision:'skill'},workflow_ref={...f.ref,document_id:'doc'};
  const args={metadata,assertAllowed(){},assertTarget(){},record:async()=>{},save:async()=>{}};
  const enter={operation_id:'enter',intent:'existing_workflow',package_path:null,workflow_ref,
    graph_navigation:{direction:'enter',node_ref:{document_id:'doc',workflow_id:'outer',node_id:'supernode'}}};
  const refused=await prepareWorkspaceSession({...args,request:enter,prepare:()=>f.navigate(f.ref)});
  assert.equal(refused.status,'NOT_READY');assert.match(refused.reason,/Submodel selection control unavailable/);
  assert.equal(refused.effect_possible,false);assert.equal(refused.verification_required,false);assert.ok(Array.isArray(refused.trace));assert.equal(refused.trace.length,0);
  assert.equal(f.clicks(),0);assert.equal(f.selections(),0);
  assert.deepEqual([...f.preparation.receipts.keys()],['initial']);assert.equal(f.receipt.phase,'verified');
  await assert.rejects(prepareWorkspaceSession({...args,request:{operation_id:'draft',intent:'new_draft',package_path:null,workflow_ref:null},
    prepare:()=>assert.fail('must not dispatch')}),/NEW operation_id, intent existing_workflow/);
  let calls=0;
  const parent={operation_id:'parent',intent:'existing_workflow',package_path:null,workflow_ref};
  const ready=await prepareWorkspaceSession({...args,request:parent,prepare:async({recoverOnly})=>{calls++;assert.equal(recoverOnly,false);
    return {status:'READY',effect_possible:false,created_draft:false,target:{},workflow_ref};}});
  assert.equal(ready.status,'READY');assert.equal(calls,1);assert.equal(metadata.workspaceReady,true);
});

for(const trialFail of ['throw','block'])test('NW1 fresh selection is not repeated after refused navigation trial: '+trialFail,async()=>{
  const f=fixture({entryOnSelection:true,trialFail});
  assert.equal((await f.navigate(f.ref)).status,'NOT_READY');
  f.unmask();
  assert.equal((await f.navigate(f.ref)).status,'READY');
  assert.equal(f.selections(),1);assert.equal(f.clicks(),1);
});

test('NW1 real adapter enters, reads nested Calculator, leaves and issues fresh scoped refs',async()=>{
  const f=fixture(),before=await f.read(f.ref);
  const entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  assert.equal(entered.loginom_account,'worker');
  assert.notEqual(entered.workflow_ref.workflow_id,f.ref.workflow_id);
  assert.equal(entered.workflow_ref.prefix,f.ref.prefix);
  const inside=await f.read(entered.workflow_ref);
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='input').boundary_role,'input');
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='output').boundary_role,'output');
  assert.equal((await f.context(entered.workflow_ref)).verified,true);
  assert.equal(inside.nodes.find(n=>n.ref.node_id==='calc').type,'transform.calculator');
  assert.notEqual(inside.nodes.find(n=>n.ref.node_id==='repeated-guid').ref.workflow_id,before.nodes.find(n=>n.ref.node_id==='repeated-guid').ref.workflow_id);
  await assert.rejects(f.read(f.ref));
  const left=await f.navigate(entered.workflow_ref,'leave','leave');
  assert.equal(left.status,'READY',JSON.stringify(left));
  assert.notEqual(left.workflow_ref.workflow_id,f.ref.workflow_id);
  assert.ok((await f.read(left.workflow_ref)).nodes.some(n=>n.ref.node_id==='supernode'));
  await assert.rejects(f.read(entered.workflow_ref));
  await assert.rejects(f.read(f.ref));
  assert.equal(f.clicks(),3);
});

test('NW1 uncertain click is reconciled read-only under the same operation ID',async()=>{
  const f=fixture({loseReply:true}),unknown=await f.navigate(f.ref);
  assert.equal(unknown.status,'NOT_READY');assert.equal(unknown.effect_possible,true);
  f.unmask();
  const recovered=await f.navigate(f.ref);
  assert.equal(recovered.status,'READY',JSON.stringify(recovered));assert.equal(f.clicks(),1);
  assert.ok((await f.read(recovered.workflow_ref)).nodes.some(n=>n.ref.node_id==='calc'));
});

for(const recoverOnly of [false,true])test('NW1 retry after the original deadline verifies navigation with one click (recoverOnly='+recoverOnly+')',async()=>{
  const f=fixture({loseReply:true}),unknown=await f.navigate(f.ref,'enter','enter',{timeoutMs:300});
  assert.equal(unknown.status,'NOT_READY');
  assert.equal(unknown.verification_required,true);
  assert.equal(unknown.effect_possible,true);
  await setTimeout(301);
  f.unmask();
  const recovered=await f.navigate(f.ref,'enter','enter',{timeoutMs:120000,recoverOnly});
  assert.equal(recovered.status,'READY',JSON.stringify(recovered));
  assert.equal(f.clicks(),1);
  assert.ok((await f.read(recovered.workflow_ref)).nodes.some(n=>n.ref.node_id==='calc'));
  await assert.rejects(f.read(f.ref));
});

for(const trialFail of ['throw','block'])test('NW1 a refused trial leaves the receipt reserved and the same ID navigates with one click ('+trialFail+')',async()=>{
  const f=fixture({trialFail}),refused=await f.navigate(f.ref);
  assert.equal(refused.status,'NOT_READY');assert.equal(refused.effect_possible,false);
  assert.equal(refused.verification_required,false);assert.equal(f.clicks(),0);
  assert.equal(f.preparation.receipts.get('enter').phase,'reserved');
  f.unmask();
  const observed=await f.navigate(f.ref,'enter','enter',{recoverOnly:true});
  assert.equal(observed.status,'NOT_READY');assert.equal(observed.effect_possible,false);assert.equal(f.clicks(),0);
  const retried=await f.navigate(f.ref);
  assert.equal(retried.status,'READY',JSON.stringify(retried));assert.equal(f.clicks(),1);
  assert.ok((await f.read(retried.workflow_ref)).nodes.some(n=>n.ref.node_id==='calc'));
  const replay=await f.navigate(f.ref);
  assert.equal(replay.status,'READY',JSON.stringify(replay));assert.equal(f.clicks(),1);
});

test('NW1 a lost dispatch reply retains possible effect; same ID only observes until deadline',async()=>{
  const f=fixture({loseDispatchReply:true}),unknown=await f.navigate(f.ref);
  assert.equal(unknown.status,'NOT_READY');
  assert.equal(unknown.effect_possible,true);
  assert.equal(unknown.verification_required,true);
  assert.equal(f.preparation.receipts.get('enter').phase,'effect_possible');assert.equal(f.clicks(),0);
  const retried=await f.navigate(f.ref,'enter','enter',{timeoutMs:300});
  assert.equal(retried.status,'NOT_READY');assert.equal(retried.effect_possible,true);
  assert.equal(retried.reason,'DEADLINE');assert.equal(f.clicks(),0);
});

test('NW1 refuses a foreign nested owner after a gesture and blockers before one',async()=>{
  const f=fixture({foreignOwner:true}),foreign=await f.navigate(f.ref);
  assert.equal(foreign.status,'NOT_READY');assert.equal(foreign.effect_possible,true);
  assert.match(foreign.reason,/different submodel/);assert.equal(f.clicks(),1);
  const b=fixture({block:true}),blocked=await b.navigate(b.ref);
  assert.equal(blocked.status,'NOT_READY');assert.equal(blocked.effect_possible,false);assert.equal(b.clicks(),0);
});

test('NW1 validates scoped enter and leave arguments before browser work',()=>{
  const base={loginomUrl:'https://app.loginom.ai/app/',compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'}};
  assert.throws(()=>makeWorkspacePrepareCode({...base,graphNavigation:{direction:'leave'}}),/Graph navigation/);
  const f=fixture(),workflowRef={...f.ref,document_id:'doc'};
  for(const graphNavigation of [{direction:'enter',node_ref:{document_id:'other',workflow_id:'outer',node_id:'x'}},{direction:'leave',node_ref:{}},{direction:'enter'}])
    assert.throws(()=>makeWorkspacePrepareCode({...base,intent:'existing_workflow',workflowRef,graphNavigation}),/Graph navigation/);
});

for(const role of ['input','output'])test('NW1 public workspace observation exposes the native '+role+' boundary role',async()=>{
  const page=new Page(),tid='MF;TF-1;Graph;Boundary',body=page.add('g',tid);
  // Native GenericInputNode/GenericOutputNode captions can be hidden.
  page.add('g',tid+';'+(role==='input'?'Output':'Input')+'_Data-0');
  const f=page.graphModels.get(body.parentElement),node=f.byTid.get(tid),diagram=f.model.FDiagram;
  node.FGuid='da493381-d79a-3458-8192-b3fa1602118b';node.FIconCls='bg-vendor-icon-nullvendor';
  diagram.FIsSubmodel=true;diagram[role==='input'?'GenericInputNode':'GenericOutputNode']=node;
  assert.equal((await page.observe()).nodes.find(n=>n.node_id===node.FGuid).boundary_role,role);
  diagram.FIsSubmodel=false;
  assert.equal((await page.observe()).nodes.find(n=>n.node_id===node.FGuid)?.boundary_role,undefined);
});

test('NW1 same operation never repeats a completed navigation; foreign/stale refs do not click',async()=>{
  const f=fixture(),entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  const replay=await f.navigate(f.ref);
  assert.equal(replay.status,'READY',JSON.stringify(replay));
  assert.equal(f.clicks(),1);
  const stale=await f.navigate(f.ref,'enter','different');
  assert.equal(stale.status,'NOT_READY');assert.equal(stale.effect_possible,false);
  assert.equal(f.clicks(),1);
});

// Review 2 of #1280: graph navigation is a NEW operation too. Behind another
// operation's pending or replaced session restore it makes no gesture and
// asks for a reload, like dock_prepare's reserve.
for(const restore of [{pending:true},{pending:false,replaced:true}])test('NW1 graph navigation is refused behind an unresolved session restore: '+JSON.stringify(restore),async()=>{
  const f=fixture({entryOnSelection:true});
  f.preparation.receipts.set('restoring',{phase:'reserved',restore:{prompt:{},...restore}});
  const refused=await f.navigate(f.ref);
  assert.equal(refused.status,'NOT_READY',JSON.stringify(refused));assert.equal(refused.reason,'NATIVE_MESSAGE_BOX_BLOCKED');
  assert.equal(refused.connection_restore,'restore_unresolved');assert.equal(refused.effect_possible,false);
  assert.equal(refused.next_step.new_operation_id_required,true);assert.match(refused.message,/reload the Loginom page/);
  assert.equal(f.clicks(),0);assert.equal(f.selections(),0);
  f.preparation.receipts.get('restoring').restore={prompt:{},pending:false};
  assert.equal((await f.navigate(f.ref,'enter','after-settle')).status,'READY');
});

// Review 4 of #1280: the refusal stays structural with Playwright's error prefix.
test('NW1 graph navigation refusal behind a session restore survives the Playwright error prefix',async()=>{
  const f=fixture({entryOnSelection:true,playwrightErrors:true});
  f.preparation.receipts.set('restoring',{phase:'reserved',restore:{prompt:{},pending:false,replaced:true}});
  const refused=await f.navigate(f.ref);
  assert.equal(refused.status,'NOT_READY',JSON.stringify(refused));assert.equal(refused.reason,'NATIVE_MESSAGE_BOX_BLOCKED');
  assert.equal(refused.connection_restore,'restore_unresolved');assert.equal(refused.effect_possible,false);
  assert.equal(refused.next_step.new_operation_id_required,true);
  assert.equal(f.clicks(),0);assert.equal(f.selections(),0);
});

// Review 3 of #1280: replaying a completed navigation is an operation too.
for(const restore of [{pending:true},{pending:false,replaced:true}])test('NW1 replay of a completed navigation is refused behind an unresolved session restore: '+JSON.stringify(restore),async()=>{
  const f=fixture(),entered=await f.navigate(f.ref);
  assert.equal(entered.status,'READY',JSON.stringify(entered));
  f.preparation.receipts.set('restoring',{phase:'reserved',restore:{prompt:{},...restore}});
  const replay=await f.navigate(f.ref);
  assert.equal(replay.status,'NOT_READY',JSON.stringify(replay));assert.equal(replay.reason,'NATIVE_MESSAGE_BOX_BLOCKED');
  assert.equal(replay.connection_restore,'restore_unresolved');assert.equal(replay.workflow_ref,undefined);
  assert.equal(f.clicks(),1);
});
