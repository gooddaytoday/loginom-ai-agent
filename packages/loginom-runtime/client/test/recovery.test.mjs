import test from 'node:test';
import assert from 'node:assert/strict';
import { actionDescribeTool, actionRunTool, assertActionOutcome, validateActionParameters } from '../lib/action-catalog.mjs';
import { actions, selectors, build, Page, nodeParameters, linkPage, linkParameters, runtime } from './support/executor-fixture.mjs';

test('root observation requires a delivered reference and cannot override a cursor', async () => {
  const engine=runtime(linkPage());
  await assert.rejects(()=>engine.observe({rootRef:'ui-unknown'}),/requires/);
  await assert.rejects(()=>engine.observe({rootRef:'ui-unknown',observationId:'unknown'}),/not been delivered/);
  await assert.rejects(()=>engine.observe({rootRef:'ui-unknown',observationId:'unknown',scope:'bootstrap'}),/prepared workspace/);
  await assert.rejects(()=>engine.observe({cursor:'cursor',rootRef:'ui-unknown',observationId:'unknown'}),/cursor alone/);
});

test('storage-name lookup rejects invalid combinations before browser work', async () => {
  const engine=runtime(linkPage());
  for (const args of [{storageName:'data'},{scope:'all',storageName:'data'},
    {scope:'roots',storageName:'../data'},{scope:'roots',storageName:'x'.repeat(201)},
    {scope:'roots',storageName:3},{scope:'roots',storageName:''},
    {cursor:'cursor',storageName:'data'}]) await assert.rejects(()=>engine.observe(args),/storage_name/);
});

test('wizard scope narrows only a unique observed current wizard and journals the chosen root',async()=>{
 for(const mode of ['valid','absent','duplicate','foreign','unbound','detached']) {
  const page=linkPage(),evaluate=page.evaluate,reads=[],records=[];
  page.evaluate=async function(fn,arg){
   if(arg && 'discoverRoots' in arg){
    reads.push({...arg});
    if(arg.rootRef && mode==='detached'){const e=new Error('detached');e.code='UI_ROOT_STALE';throw e;}
    const s=await evaluate.call(this,fn,arg);
    s.wizard={status:mode==='absent'?'absent':'observed',root_ref:'ui-wizard',stage:'text_import_file'};
    if(arg.discoverRoots){s.observation_kind='roots';s.ui.elements=[{ref:mode==='unbound'?'ui-other':'ui-wizard',
      tid:(mode==='foreign'?'MF;TF-2':s.workflow_ref.prefix)+';WizrdMCF',kind:'region',allowed_actions:[]}];
      if(mode==='duplicate')s.ui.elements.push({...s.ui.elements[0]});
    }else if(arg.rootRef)s.observation_root={ref:arg.rootRef};
    return s;
   }
   return evaluate.call(this,fn,arg);
  };
  const engine=runtime(page,{onRecord:async r=>records.push(r)}),out=await engine.observe({scope:'wizard'});
  assert.equal(records.length,1,mode);assert.equal(page.events.filter(e=>e==='click').length,0);
  if(['valid','detached'].includes(mode)){
   assert.equal(reads[0].discoverRoots,true);assert.equal(reads[1].rootRef,'ui-wizard');
   assert.equal(out.trace.at(-1).reason,'unique_observed_wizard');
   if(mode==='valid'){assert.equal(out.output.observation_root.ref,'ui-wizard');assert.equal(out.output.page.scope,'all');}
   else assert.equal(out.status,'NOT_APPLIED');
  }else{assert.equal(reads.length,1,mode);assert.equal(out.output.page.scope,'roots');assert.equal(out.trace.at(-1).reason,'unique_wizard_not_observed');}
  assert.equal(records[0].outcome.trace.at(-1).requested_scope,'wizard');
 }
});

function partialInputAdd() {
  const page = linkPage();
  page.nodes[1].ports = ['Input_Add', 'Input_Data-0', 'Input_Data-1'];
  page.onDrop = current => {
    current.nodes[1].ports.push('Input_Data-2');
    current.onDrop = null;
  };
  return page;
}
const inputPorts = page => page.nodes[1].ports.filter(port => port.startsWith('Input_Data-'));

// The real, serialized domain handlers run against the shared DOM/Playwright
// fixture. A test fault changes the observed UI result, not the executor result.
test('a partial Input_Add can be completed without another Add drop or a fourth input', async () => {
  const page = partialInputAdd(), records = [];
  const engine = runtime(page, { onRecord: async record => records.push(record) });
  const parameters = linkParameters(page);
  const first = await engine.run('link.create', parameters, { operationId: 'union-link' });
  assert.equal(first.status, 'AMBIGUOUS');
  assert.equal(inputPorts(page).length, 3);
  assert.deepEqual(page.edges, []);
  assert.equal(page.drops, 1);

  const blocked = await engine.run('link.create', parameters, { operationId: 'blind-retry' });
  assert.equal(blocked.status, 'AMBIGUOUS');
  assert.equal(blocked.operation_id, 'union-link');
  assert.equal(page.drops, 1);
  const inspected = await engine.inspect({ operationId: 'union-link' });
  assert.equal(inspected.output.state, 'pending');
  assert.equal(inspected.output.cleanup_confirmed, true);
  assert.ok(inspected.output.recovery_options.includes('complete_link'));
  const toolSchemas = new Map(engine.tools.map(tool => [tool.name, tool.inputSchema]));
  for (const step of inspected.output.next_steps) {
    const schema = toolSchemas.get(step.tool) ?? (step.tool === 'dock_workspace_observe' ? { properties: {}, required: [] } : null);
    assert.ok(schema, `Advice names an available tool: ${step.tool}`);
    const provided = [...Object.keys(step.arguments), ...step.required_fields];
    assert.ok(provided.every(field => field in schema.properties));
    assert.ok((schema.required ?? []).every(field => provided.includes(field)));
    if (step.arguments.strategy) assert.ok(schema.properties.strategy.enum.includes(step.arguments.strategy));
  }
  const repairAdvice = inspected.output.next_steps.find(step => step.tool === 'dock_ui_action');
  assert.equal(repairAdvice.arguments.recovery_operation_id, 'union-link');
  assert.equal(repairAdvice.id_roles.operation_id, 'new_unique_request');
  const completeAdvice = inspected.output.next_steps.find(step => step.arguments.strategy === 'complete_link');
  assert.equal(completeAdvice.arguments.operation_id, 'union-link');
  assert.equal(completeAdvice.id_roles.recovery_operation_id, 'new_unique_request');
  assert.ok(!inspected.output.recovery_options.includes('inspect_ui'));
  assert.ok(!inspected.output.recovery_options.includes('ui_repair'));


  const recovered = await engine.recover('union-link', { strategy: 'complete_link', recoveryOperationId: 'connect-existing-input' });
  assert.equal(recovered.status, 'SUCCEEDED');
  assert.equal(recovered.operation_id, 'union-link');
  assert.equal(recovered.recovery_operation_id, 'connect-existing-input');
  assert.deepEqual(inputPorts(page), ['Input_Data-0', 'Input_Data-1', 'Input_Data-2']);
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Приёмник|Input_Data-2']);
  assert.equal(page.drops, 2);
  assert.equal(page.down, false);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());

  const duplicate = await engine.recover('union-link', { strategy: 'complete_link', recoveryOperationId: 'connect-existing-input' });
  assert.deepEqual(duplicate, recovered);
  assert.equal(page.drops, 2);
  assert.equal((await engine.run('link.create', parameters, { operationId: 'union-link' })).status, 'SUCCEEDED');
  assert.equal(page.drops, 2);
  assert.ok(records.some(record => record.operation_id === 'union-link'));
});

test('partial link repair rejects an unrelated graph change instead of claiming the original checkpoint', async () => {
  for (const change of [
    page => page.addNode('Чужой_узел', 700, 200, ['Output_Data-0']),
    page => page.nodes[0].ports.push('Output_Data-9'),
    page => page.nodes[1].ports.push('Input_Data-9'),
    page => page.edges.push('Источник|Output_Data-0|Приёмник|Input_Data-0'),
  ]) {
    const page = partialInputAdd(), engine = runtime(page);
    assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'partial-link' })).status, 'AMBIGUOUS');
    change(page);
    const inspected = await engine.inspect({ operationId: 'partial-link' });
    assert.equal(inspected.output.state, 'pending');
    assert.ok(!inspected.output.recovery_options.includes('complete_link'));
    const recovered = await engine.recover('partial-link', { strategy: 'complete_link', recoveryOperationId: 'invalid-repair' });
    assert.notEqual(recovered.status, 'SUCCEEDED');
    assert.equal(page.drops, 1);
    assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
  }
});

test('lost browser response is recovered from the original completed receipt without rerunning the action', async () => {
  const page = new Page(); let responses = 0;
  const engine = runtime(page, { execute: async code => {
    const result = await page.execute(code);
    if (++responses === 2) throw new Error('Response lost after browser cleanup');
    return result;
  } });
  const first = await engine.run('node.add', nodeParameters, { operationId: 'lost-node-response' });
  assert.equal(first.status, 'AMBIGUOUS');
  assert.equal(first.error.code, 'BROWSER_CALL_UNCERTAIN');
  assert.equal(page.drops, 1);
  const inspected = await engine.inspect({ operationId: 'lost-node-response' });
  assert.equal(inspected.output.state, 'resolved');
  assert.equal(inspected.output.cleanup_confirmed, true);
  assert.equal(inspected.output.outcome.status, 'SUCCEEDED');
  assert.equal(inspected.output.outcome.operation_id, 'lost-node-response');
  assert.equal(page.drops, 1);
  const repeat = await engine.run('node.add', nodeParameters, { operationId: 'lost-node-response' });
  assert.equal(repeat.status, 'SUCCEEDED');
  assert.equal(page.drops, 1);
  assert.deepEqual(page.nodes.map(node => node.label), ['Источник']);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
});

test('a receipt in the same browser from another runtime cannot resolve a new lost request with the same id', async () => {
  const page = new Page();
  const first = runtime(page);
  assert.equal((await first.run('node.add', nodeParameters, { operationId: 'reused-id' })).status, 'SUCCEEDED');
  page.nodes = [];
  let responses = 0;
  const second = runtime(page, { execute: async code => {
    if (++responses === 2) throw new Error('Request lost before any browser execution');
    return page.execute(code);
  } });
  assert.equal((await second.run('node.add', nodeParameters, { operationId: 'reused-id' })).status, 'AMBIGUOUS');
  const inspected = await second.inspect({ operationId: 'reused-id' });
  assert.equal(inspected.output.state, 'pending');
  assert.equal(inspected.output.cleanup_confirmed, false);
  assert.notEqual(inspected.output.outcome.status, 'SUCCEEDED');
  assert.equal(page.drops, 1);
  assert.deepEqual(page.nodes, []);
  assert.throws(() => second.assertPreparationAllowed(), /preparation cannot run/);
});

test('recovery ids cannot silently refer to a different repair or original operation', async () => {
  const page = partialInputAdd(), engine = runtime(page);
  assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'original' })).status, 'AMBIGUOUS');
  const recovered = await engine.recover('original', { strategy: 'complete_link', recoveryOperationId: 'repair' });
  assert.equal(recovered.status, 'SUCCEEDED');
  await assert.rejects(engine.recover('original', { strategy: 'restore_control', recoveryOperationId: 'repair' }), /different|already used|identity/);
  await assert.rejects(engine.recover('other-original', { strategy: 'complete_link', recoveryOperationId: 'repair' }), /different|already used|identity|unknown/i);
  assert.equal(page.drops, 2);
});

const observationId = outcome => outcome.output.observation_id;
const uiElement = (outcome, predicate) => {
  const found = outcome.output.ui.elements.filter(predicate);
  assert.equal(found.length, 1, 'the observed UI target must be unique');
  return found[0];
};

test('UI repair requires the actual pending operation and refuses stale observations before a gesture', async () => {
  const page = partialInputAdd(), engine = runtime(page);
  assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'pending-link' })).status, 'AMBIGUOUS');
  const observed = await engine.observe();
  const target = uiElement(observed, element => element.tid?.endsWith(';Приёмник;Label;Label'));
  const action = { verb: 'click', ref: target.ref };
  await assert.rejects(engine.uiAct(action, { observationId: observationId(observed), operationId: 'unbound-click' }), /pending operation|completion\/cleanup/);
  await assert.rejects(engine.uiAct(action, { observationId: observationId(observed), operationId: 'wrong-binding', recoveryOperationId: 'someone-else' }), /binding/);
  assert.equal(page.drops, 1);
  await engine.recover('pending-link', { strategy: 'complete_link', recoveryOperationId: 'finish-link' });
  await assert.rejects(engine.uiAct(action, { observationId: observationId(observed), operationId: 'stale-click' }), /stale|observe again/);
  assert.equal(page.drops, 2);
});

test('a completed node with an unfinished rename is repaired through observed UI then rechecked against its original checkpoint', async () => {
  const page = new Page(); page.failRenameOnce = true; page.hideLabelWhileEditing = true;
  const engine = runtime(page);
  assert.equal((await engine.run('node.add', nodeParameters, { operationId: 'rename-pending' })).status, 'AMBIGUOUS');
  assert.deepEqual(page.nodes.map(node => node.label), ['Текстовый_файл']);
  const inspected = await engine.inspect({ operationId: 'rename-pending' });
  assert.equal(inspected.output.cleanup_confirmed, true);
  assert.equal(inspected.output.outcome.output.added_label, 'Текстовый_файл');
  const observed = await engine.observe();
  const label = uiElement(observed, element => element.tid?.endsWith(';Текстовый_файл;Label;Label'));
  const opened = await engine.uiAct({ verb: 'double_click', ref: label.ref }, {
    observationId: observationId(observed), operationId: 'open-rename', recoveryOperationId: 'rename-pending',
  });
  assert.equal(opened.status, 'SUCCEEDED');
  assert.equal(opened.output.recovery.state, 'pending');
  assert.equal(opened.output.recovery.outcome_summary.detail_tool, 'dock_operation_inspect');
  assert.match((await engine.inspect({ operationId: 'rename-pending' })).output.outcome.output.reason, /editor is still open/);
  const blocked = await engine.run('node.add', nodeParameters, { operationId: 'cannot-create-during-edit' });
  assert.equal(blocked.status, 'AMBIGUOUS');
  assert.equal(page.drops, 1);
  const editor = uiElement(opened, element => element.kind === 'field');
  // This is Loginom's real shape: no data-tid on textarea, with an ancestor
  // cmpDiagram locator path and graph_editor scope supplied by observation.
  assert.equal(editor.tid, null);
  assert.equal(editor.identity.anchor_tid, page.prefix + ';ModelForm;cmpDiagram');
  const typed = await engine.uiAct({ verb: 'fill', ref: editor.ref, text: 'Источник' }, {
    observationId: observationId(opened), operationId: 'type-name', recoveryOperationId: 'rename-pending',
  });
  assert.equal(typed.status, 'SUCCEEDED');
  const currentEditor = uiElement(typed, element => element.kind === 'field');
  const committed = await engine.uiAct({ verb: 'press', ref: currentEditor.ref, key: 'Enter' }, {
    observationId: observationId(typed), operationId: 'commit-name', recoveryOperationId: 'rename-pending',
  });
  assert.equal(committed.status, 'SUCCEEDED');
  assert.equal(committed.output.recovery.state, 'resolved');
  assert.equal(committed.output.recovery.outcome_summary.status, 'SUCCEEDED');
  assert.deepEqual(page.nodes.map(node => node.label), ['Источник']);
  assert.equal(page.drops, 1);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  assert.equal((await engine.run('node.add', nodeParameters, { operationId: 'rename-pending' })).status, 'SUCCEEDED');
  assert.equal(page.drops, 1);
});

test('a technically successful but user-selected wrong connection can be removed and reconnected to the intended existing input', async () => {
  const page = linkPage(); page.nodes[1].ports = ['Input_Data-0', 'Input_Data-1'];
  const engine = runtime(page);
  const wrong = { ...linkParameters(page, 'data'), target_port: { kind: 'data', index: 0 } };
  assert.equal((await engine.run('link.create', wrong, { operationId: 'wrong-choice' })).status, 'SUCCEEDED');
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Приёмник|Input_Data-0']);
  const observed = await engine.observe();
  const edge = uiElement(observed, element => element.tid?.includes('|'));
  const clicked = await engine.uiAct({ verb: 'click', ref: edge.ref }, { observationId: observationId(observed), operationId: 'select-wrong-link' });
  assert.equal(clicked.status, 'SUCCEEDED');
  assert.equal(clicked.output.verification_required, true);
  const selected = uiElement(clicked, element => element.tid?.includes('|'));
  const removed = await engine.uiAct({ verb: 'press', ref: selected.ref, key: 'Delete' }, { observationId: observationId(clicked), operationId: 'delete-wrong-link' });
  assert.equal(removed.status, 'SUCCEEDED');
  assert.deepEqual(removed.output.links, []);
  const correct = { ...wrong, target_port: { kind: 'data', index: 1 } };
  assert.equal((await engine.run('link.create', correct, { operationId: 'correct-choice' })).status, 'SUCCEEDED');
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Приёмник|Input_Data-1']);
  assert.deepEqual(inputPorts(page), ['Input_Data-0', 'Input_Data-1']);
  assert.equal(page.drops, 2);
});

test('UI operation ids deduplicate one actual gesture and cannot be reused for another gesture', async () => {
  const page = linkPage(), engine = runtime(page);
  const observed = await engine.observe();
  const target = uiElement(observed, element => element.tid?.endsWith(';Источник;Label;Label'));
  const action = { verb: 'double_click', ref: target.ref }, options = { observationId: observationId(observed), operationId: 'open-editor' };
  const first = await engine.uiAct(action, options);
  assert.equal(first.status, 'SUCCEEDED');
  const same = await engine.uiAct(action, options);
  assert.deepEqual(same, first);
  assert.equal(page.events.filter(event => event === 'double_click').length, 1);
  await assert.rejects(engine.uiAct({ verb: 'click', ref: target.ref }, options), /already used|different parameters/);
  await assert.rejects(engine.run('node.add', nodeParameters, { operationId: 'open-editor' }), /conflicts/);
});

test('UI repair cannot bypass a transport-uncertain domain operation before its receipt has been recovered', async () => {
  const page = partialInputAdd(); let calls = 0;
  const engine = runtime(page, { execute: async code => {
    const outcome = await page.execute(code);
    if (++calls === 2) throw new Error('Partial action response lost');
    return outcome;
  } });
  assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'lost-partial' })).status, 'AMBIGUOUS');
  const observed = await engine.observe();
  const target = uiElement(observed, element => element.tid?.endsWith(';Приёмник;Label;Label'));
  await assert.rejects(engine.uiAct({ verb: 'click', ref: target.ref }, {
    observationId: observationId(observed), operationId: 'too-early', recoveryOperationId: 'lost-partial',
  }), /completion\/cleanup/);
  assert.equal(page.drops, 1);
  const inspected = await engine.inspect({ operationId: 'lost-partial' });
  assert.equal(inspected.output.cleanup_confirmed, true);
  assert.ok(inspected.output.recovery_options.includes('complete_link'));
  assert.equal((await engine.recover('lost-partial', { strategy: 'complete_link', recoveryOperationId: 'complete-after-receipt' })).status, 'SUCCEEDED');
  assert.equal(inputPorts(page).length, 3);
});

test('confirmed completed call with failed mouse cleanup can restore control and continue without restarting', async () => {
  const page = new Page(); page.failDrag = true;
  const release = page.mouse.up;
  let attempts = 0;
  page.mouse.up = async () => { if (++attempts <= 2) throw new Error('Mouse release unavailable'); return release(); };
  const engine = runtime(page);
  const first = await engine.run('node.add', nodeParameters, { operationId: 'failed-cleanup' });
  assert.equal(first.status, 'AMBIGUOUS');
  assert.equal(first.cleanup_complete, false);
  assert.equal(page.down, true);
  const inspected = await engine.inspect({ operationId: 'failed-cleanup' });
  assert.equal(inspected.output.cleanup_confirmed, false);
  assert.deepEqual(inspected.output.recovery_options, ['restore_control']);
  const recovered = await engine.recover('failed-cleanup', { strategy: 'restore_control', recoveryOperationId: 'restore-mouse' });
  assert.equal(recovered.status, 'NOT_APPLIED');
  assert.equal(page.down, false);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  page.failDrag = false;
  assert.equal((await engine.run('node.add', nodeParameters, { operationId: 'new-attempt' })).status, 'SUCCEEDED');
  assert.deepEqual(page.nodes.map(node => node.label), ['Источник']);
});

test('recovery never changes the UI if its pre-mutation journal write fails', async () => {
  const page = partialInputAdd();
  const engine = runtime(page, { onRecord: async record => { if (record.phase === 'recovery_prepared') throw new Error('Journal unavailable'); } });
  assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'journal-partial' })).status, 'AMBIGUOUS');
  await assert.rejects(engine.recover('journal-partial', { strategy: 'complete_link', recoveryOperationId: 'unrecorded-repair' }), /Journal unavailable/);
  assert.equal(page.drops, 1);
  assert.deepEqual(page.edges, []);
  assert.equal(inputPorts(page).length, 3);
});

test('a lost repair response resolves from its distinct receipt without reconnecting the link again', async () => {
  const page = partialInputAdd(); let loseRepair = true;
  const engine = runtime(page, { execute: async code => {
    const result = await page.execute(code);
    if (loseRepair && code.includes('"mode":"recover_link"')) { loseRepair = false; throw new Error('Repair receipt response lost'); }
    return result;
  } });
  assert.equal((await engine.run('link.create', linkParameters(page), { operationId: 'partial' })).status, 'AMBIGUOUS');
  const first = await engine.recover('partial', { strategy: 'complete_link', recoveryOperationId: 'lost-repair' });
  assert.equal(first.status, 'AMBIGUOUS');
  assert.equal(page.drops, 2);
  const inspected = await engine.inspect({ operationId: 'partial' });
  assert.equal(inspected.output.state, 'resolved');
  assert.equal(inspected.output.outcome.status, 'SUCCEEDED');
  const repeated = await engine.recover('partial', { strategy: 'complete_link', recoveryOperationId: 'lost-repair' });
  assert.equal(repeated.status, 'SUCCEEDED');
  assert.equal(repeated.recovery_operation_id, 'lost-repair');
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Приёмник|Input_Data-2']);
  assert.equal(page.drops, 2);
});

test('a lost UI response returns the recovered completed gesture on a repeated id without another gesture', async () => {
  const page = linkPage(); let loseGesture = true;
  const engine = runtime(page, { execute: async code => {
    const result = await page.execute(code);
    if (loseGesture && code.includes('"kind":"workspace-ui"') && code.includes('"mode":"act"')) { loseGesture = false; throw new Error('Gesture receipt response lost'); }
    return result;
  } });
  const observed = await engine.observe();
  const label = uiElement(observed, element => element.tid?.endsWith(';Источник;Label;Label'));
  const action = { verb: 'double_click', ref: label.ref }, options = { observationId: observationId(observed), operationId: 'lost-open-editor' };
  assert.equal((await engine.uiAct(action, options)).status, 'AMBIGUOUS');
  const inspected = await engine.inspect({ operationId: 'lost-open-editor' });
  assert.equal(inspected.output.state, 'resolved');
  assert.equal(inspected.output.outcome.status, 'SUCCEEDED');
  assert.equal((await engine.uiAct(action, options)).status, 'SUCCEEDED');
  assert.equal(page.events.filter(event => event === 'double_click').length, 1);
});

test('generic UI cleanup and explicit acceptance of fresh observed state allow continuation without falsely verifying the gesture', async () => {
  const page = linkPage();
  page.afterDoubleClick = async () => { page.afterDoubleClick = null; throw new Error('Editor opened but double click completion was interrupted'); };
  const engine = runtime(page);
  const observed = await engine.observe();
  const label = uiElement(observed, element => element.tid?.endsWith(';Источник;Label;Label'));
  const failed = await engine.uiAct({ verb: 'double_click', ref: label.ref }, { observationId: observationId(observed), operationId: 'partial-ui-gesture' });
  assert.equal(failed.status, 'AMBIGUOUS');
  assert.equal(failed.cleanup_complete, true);
  assert.ok(page.editor);
  const restored = await engine.recover('partial-ui-gesture', { strategy: 'restore_control', recoveryOperationId: 'restore-ui-control' });
  assert.notEqual(restored.error?.code, 'BROWSER_CALL_UNCERTAIN');
  assert.equal(restored.cleanup_complete, true);
  assert.equal(page.editor, null);
  assert.equal((await engine.inspect({ operationId: 'partial-ui-gesture' })).output.state, 'pending');
  const actual = await engine.observe();
  const accepted = await engine.recover('partial-ui-gesture', { strategy: 'accept_observed_state', recoveryOperationId: 'accept-restored-ui', observationId: observationId(actual) });
  assert.equal(accepted.status, 'SUCCEEDED');
  assert.equal(accepted.action_key, 'operation.recover');
  assert.equal(accepted.output.original_outcome.status, 'AMBIGUOUS');
  assert.equal(accepted.output.goal_verified, false);
  assert.equal((await engine.inspect({ operationId: 'partial-ui-gesture' })).output.state, 'resolved');
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  assert.equal((await engine.run('node.add', { ...nodeParameters, expected_label: 'Дополнение' }, { operationId: 'continue-after-ui-recovery' })).status, 'SUCCEEDED');
  assert.equal(page.nodes.length, 3);
});

test('accepting observed UI state rejects a stale graph and cannot waive a domain action postcondition', async () => {
  const page = linkPage();
  page.afterDoubleClick = async () => { page.afterDoubleClick = null; throw new Error('Completion interrupted'); };
  const engine = runtime(page);
  const before = await engine.observe(), label = uiElement(before, element => element.tid?.endsWith(';Источник;Label;Label'));
  await engine.uiAct({ verb: 'double_click', ref: label.ref }, { observationId: observationId(before), operationId: 'uncertain-ui' });
  const fresh = await engine.observe();
  page.addNode('Постороннее_изменение', 700, 400, []);
  await assert.rejects(engine.recover('uncertain-ui', { strategy: 'accept_observed_state', recoveryOperationId: 'stale-accept', observationId: observationId(fresh) }), /changed|stale|observe/i);
  assert.equal((await engine.inspect({ operationId: 'uncertain-ui' })).output.state, 'pending');

  const domainPage = partialInputAdd(), domain = runtime(domainPage);
  await domain.run('link.create', linkParameters(domainPage), { operationId: 'domain-partial' });
  const graph = await domain.observe();
  await assert.rejects(domain.recover('domain-partial', { strategy: 'accept_observed_state', recoveryOperationId: 'waive-link', observationId: observationId(graph) }), /UI|ui\.act|domain/i);
  assert.equal((await domain.inspect({ operationId: 'domain-partial' })).output.state, 'pending');
  assert.equal(domainPage.drops, 1);
});

test('observed-state acceptance keeps the mutation guard until its resolution journal is durable', async () => {
  const page = linkPage(); let refuseResolution = true;
  page.afterDoubleClick = async () => { page.afterDoubleClick = null; throw new Error('Completion interrupted'); };
  const engine = runtime(page, { onRecord: async record => {
    if (record.phase === 'observed_state_accepted' && refuseResolution) throw new Error('Resolution journal unavailable');
  } });
  const observed = await engine.observe(), label = uiElement(observed, element => element.tid?.endsWith(';Источник;Label;Label'));
  await engine.uiAct({ verb: 'double_click', ref: label.ref }, { observationId: observationId(observed), operationId: 'journal-ui' });
  const current = await engine.observe();
  const options = { strategy: 'accept_observed_state', recoveryOperationId: 'durable-accept', observationId: observationId(current) };
  await assert.rejects(engine.recover('journal-ui', options), /Resolution journal unavailable/);
  assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
  assert.equal((await engine.inspect({ operationId: 'journal-ui' })).output.state, 'pending');
  refuseResolution = false;
  const accepted = await engine.recover('journal-ui', options);
  assert.equal(accepted.output.goal_verified, false);
  assert.equal(accepted.output.original_outcome.status, 'AMBIGUOUS');
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
});

test('empty action discovery lists callable keys and both public schemas guide the model to those keys', async () => {
  const page = new Page(); let calls = 0;
  const engine = runtime(page, { execute: code => { calls++; return page.execute(code); } });
  assert.doesNotThrow(() => validateActionParameters(actionDescribeTool.inputSchema, {}));
  const described = engine.describe();
  assert.deepEqual(described.available_actions, ['node.add', 'link.create', 'package.save_as', 'node.configure_text_import', 'package.save_checkpoint']);
  assert.equal(described.observation_tool, 'dock_workspace_observe');
  assert.equal(described.ui_action_tool, 'dock_ui_action');
  assert.equal(calls, 0);
  for (const key of described.available_actions) {
    validateActionParameters(actionDescribeTool.inputSchema, { action_key: key });
    validateActionParameters(actionRunTool.inputSchema, { action_key: key, parameters: {} });
    assert.equal(engine.describe(key).action.action_key, key);
  }
  assert.throws(() => validateActionParameters(actionDescribeTool.inputSchema, { action_key: 'canvas.add_node' }), /allowed value|enum|one of|not in/i);
  assert.throws(() => validateActionParameters(actionRunTool.inputSchema, { action_key: 'node.rename', parameters: {} }), /allowed value|enum|one of|not in/i);
  described.available_actions.push('made.up');
  assert.equal(engine.describe().available_actions.length, 5);
});

test('bad action names are bounded typed request feedback and do not prevent a subsequent valid action', async () => {
  const page = new Page(); let browserCalls = 0;
  const engine = runtime(page, { execute: code => { browserCalls++; return page.execute(code); } });
  for (const key of ['canvas.add_node', 'node.rename', 'workflow.create']) {
    let rejection;
    try { await engine.run(key, {}); assert.fail('invented action key was accepted'); }
    catch (error) { rejection = engine.requestFailure(error); }
    assertActionOutcome(rejection);
    assert.equal(rejection.status, 'FAILED');
    assert.equal(rejection.error.code, 'REQUEST_REJECTED');
    assert.equal(rejection.phase, 'request_rejected');
    assert.equal(rejection.request_rejected, true);
    assert.equal(rejection.effect_possible, false);
    assert.equal(rejection.operation_id, null);
    assert.equal(rejection.output.operation.state, 'idle');
    assert.deepEqual(rejection.output.available_actions, engine.describe().available_actions);
  }
  assert.equal(browserCalls, 0);
  assert.equal(page.drops, 0);
  assert.equal(engine.requestFailure(new Error('x'.repeat(2000))).error.message.length, 1000);
  const outcome = await engine.run('node.add', nodeParameters, { operationId: 'valid-after-refusals' });
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(page.drops, 1);
  assert.deepEqual(page.nodes.map(node => node.label), ['Источник']);
});

test('request feedback preserves the exact pending effect and does not silently reconcile or mutate it', async () => {
  const page = partialInputAdd(); let browserCalls = 0;
  const engine = runtime(page, { execute: code => { browserCalls++; return page.execute(code); } });
  await engine.run('link.create', linkParameters(page), { operationId: 'existing-partial' });
  const countBefore = browserCalls;
  const rejection = engine.requestFailure(new Error('Invalid repair request'));
  assertActionOutcome(rejection);
  assert.equal(rejection.status, 'AMBIGUOUS');
  assert.equal(rejection.request_rejected, true);
  assert.equal(rejection.effect_possible, true);
  assert.equal(rejection.operation_id, 'existing-partial');
  assert.equal(rejection.action_key, 'link.create');
  assert.equal(rejection.output.operation.state, 'pending');
  assert.equal(rejection.output.operation.outcome.status, 'AMBIGUOUS');
  assert.equal(rejection.output.operation.cleanup_confirmed, true);
  assert.equal(browserCalls, countBefore);
  assert.equal(page.drops, 1);
  assert.equal(inputPorts(page).length, 3);
  assert.equal((await engine.recover('existing-partial', { strategy: 'complete_link', recoveryOperationId: 'finish-after-invalid-request' })).status, 'SUCCEEDED');
  assert.equal(page.drops, 2);
});

function autoConnectedNodePage({ unrelated = false, both = false } = {}) {
  const page = new Page();
  page.addNode('Источник', 104, 104, ['Output_Data-0']);
  if (unrelated) page.addNode('Существующий_приёмник', 700, 104, ['Input_Data-0']);
  page.onDrop = current => {
    current.addNode('Объединение', 400, 104, ['Input_Add', 'Input_Data-0', 'Input_Data-1', 'Output_Data-0']);
    if (!unrelated || both) current.edges.push('Источник|Output_Data-0|Объединение|Input_Data-0');
    if (unrelated) current.edges.push('Источник|Output_Data-0|Существующий_приёмник|Input_Data-0');
    current.onDrop = null;
  };
  return page;
}
const unionNodeParameters = { component_key: 'transform.union_data', target_position: { x: 400, y: 104 }, expected_label: 'Объединение' };

test('normal auto-connections are disclosed with a successful node receipt and can be retained without another drag', async () => {
  const page = autoConnectedNodePage(), engine = runtime(page);
  const created = await engine.run('node.add', unionNodeParameters, { operationId: 'auto-connected-node' });
  const edgeTid = page.prefix + ';Graph;Источник|Output_Data-0|Объединение|Input_Data-0';
  assert.equal(created.status, 'SUCCEEDED');
  assert.equal(created.output.node_ref.node_label, 'Объединение');
  assert.deepEqual(created.output.auto_created_links, [edgeTid]);
  assert.equal(created.output.goal_verified, false);
  assert.equal(page.nodes.length, 2);
  assert.equal(page.drops, 1);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  assert.deepEqual(await engine.run('node.add', unionNodeParameters, { operationId: 'auto-connected-node' }), created);
  const observed = await engine.observe();
  assert.deepEqual(observed.output.links, [edgeTid]);
  // The agent keeps the useful connection. Asking for that exact existing link
  // verifies it without a duplicate edge, port or mouse gesture.
  const kept = await engine.run('link.create', { source_node: page.ref('Источник'), source_port: { kind: 'data' },
    target_node: page.ref('Объединение'), target_port: { kind: 'data', index: 0 } }, { operationId: 'retain-useful-auto-link' });
  assert.equal(kept.status, 'SUCCEEDED');
  assert.equal(kept.output.reconciled, true);
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Объединение|Input_Data-0']);
  assert.equal(page.drops, 1);
});

test('the agent may replace an unwanted auto-connection with normal observed UI without recreating the successfully added node', async () => {
  const page = autoConnectedNodePage(), engine = runtime(page);
  const created = await engine.run('node.add', unionNodeParameters, { operationId: 'auto-connected-node' });
  assert.equal(created.status, 'SUCCEEDED');
  const edgeTid = page.prefix + ';Graph;Источник|Output_Data-0|Объединение|Input_Data-0';
  assert.deepEqual(created.output.auto_created_links, [edgeTid]);
  const observed = await engine.observe(), edge = uiElement(observed, element => element.tid === edgeTid);
  const selected = await engine.uiAct({ verb: 'click', ref: edge.ref }, {
    observationId: observationId(observed), operationId: 'select-auto-link',
  });
  assert.equal(selected.status, 'SUCCEEDED');
  assert.equal(selected.output.recovery, undefined);
  const selectedEdge = uiElement(selected, element => element.tid === edgeTid);
  const removed = await engine.uiAct({ verb: 'press', ref: selectedEdge.ref, key: 'Delete' }, {
    observationId: observationId(selected), operationId: 'remove-auto-link',
  });
  assert.equal(removed.status, 'SUCCEEDED');
  assert.deepEqual(removed.output.links, []);
  assert.equal(removed.output.recovery, undefined);
  assert.deepEqual(page.nodes.map(node => node.label), ['Источник', 'Объединение']);
  // A duplicate operation returns its historical receipt, including the initial
  // auto-connection, rather than pretending to be a new snapshot of the graph.
  assert.deepEqual(await engine.run('node.add', unionNodeParameters, { operationId: 'auto-connected-node' }), created);
  assert.equal(page.drops, 1);
  const connected = await engine.run('link.create', { source_node: page.ref('Источник'), source_port: { kind: 'data' },
    target_node: page.ref('Объединение'), target_port: { kind: 'add' } }, { operationId: 'intended-added-input-link' });
  assert.equal(connected.status, 'SUCCEEDED');
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Объединение|Input_Data-2']);
  assert.equal(page.nodes[1].ports.filter(port => port.startsWith('Input_Data-')).length, 3);
  assert.equal(page.drops, 2);
});

test('new unrelated edges cannot be classified or acted on as repairable effects of node.add', async () => {
  for (const both of [false, true]) {
    const page = autoConnectedNodePage({ unrelated: true, both }), engine = runtime(page);
    const created = await engine.run('node.add', unionNodeParameters, { operationId: 'node-with-unrelated-change' });
    assert.equal(created.status, 'AMBIGUOUS');
    assert.equal(created.output.reason, 'unrelated graph changed');
    assert.deepEqual(created.output.repairable_links, []);
    const observed = await engine.observe();
    const edge = uiElement(observed, element => element.tid?.endsWith('|Существующий_приёмник|Input_Data-0'));
    const before = [...page.edges];
    await assert.rejects(engine.uiAct({ verb: 'click', ref: edge.ref }, {
      observationId: observationId(observed), operationId: 'unrelated-link-repair', recoveryOperationId: 'node-with-unrelated-change',
    }), /outside the pending operation/);
    if (both) {
      const auto = uiElement(observed, element => element.tid?.endsWith('|Объединение|Input_Data-0'));
      await assert.rejects(engine.uiAct({ verb: 'click', ref: auto.ref }, {
        observationId: observationId(observed), operationId: 'incomplete-cleanup', recoveryOperationId: 'node-with-unrelated-change',
      }), /outside the pending operation/);
    }
    assert.deepEqual(page.edges, before);
    assert.equal(page.drops, 1);
    assert.equal((await engine.inspect({ operationId: 'node-with-unrelated-change' })).output.state, 'pending');
  }
});


test('incident auto-connections cannot hide an unconfirmed requested node name or an incorrect position', async () => {
  for (const wrongName of [true, false]) {
    const page = new Page(); page.addNode('Источник', 104, 104, ['Output_Data-0']);
    page.failRenameOnce = wrongName;
    const actualLabel = wrongName ? 'Объединение_1' : 'Объединение';
    page.onDrop = current => {
      current.addNode(actualLabel, wrongName ? 400 : 416, 104, ['Input_Data-0']);
      current.edges.push(`Источник|Output_Data-0|${actualLabel}|Input_Data-0`);
      current.onDrop = null;
    };
    const engine = runtime(page);
    const created = await engine.run('node.add', unionNodeParameters, { operationId: 'unverified-auto-node' });
    assert.equal(created.status, 'AMBIGUOUS');
    const inspected = await engine.inspect({ operationId: 'unverified-auto-node' });
    assert.equal(inspected.output.state, 'pending');
    assert.equal(inspected.output.outcome.status, 'AMBIGUOUS');
    if (wrongName) {
      assert.equal(inspected.output.outcome.output.added_label, 'Объединение_1');
      assert.match(inspected.output.outcome.output.reason, /rename/);
    } else assert.match(inspected.output.outcome.error.message, /position/);
    assert.equal(page.nodes.length, 2);
    assert.equal(page.drops, 1);
  }
});

test('legacy node output contracts remain compatible without silently accepting an unreviewed auto-connection', async () => {
  const legacy = structuredClone(actions.get('node.add'));
  legacy.revision = '1';
  legacy.min_executor_revision = '1.0.0';
  delete legacy.output_schema.properties.auto_created_links;
  delete legacy.output_schema.properties.goal_verified;
  legacy.output_schema.required = ['node_ref'];
  const legacyActions = new Map(actions); legacyActions.set('node.add', legacy);
  const pinned = { actions: legacyActions, selectors, pins: {}, compatibility: { loginom_build: build } };

  const plainPage = new Page(), oldPlain = runtime(plainPage, { pinned });
  const plain = await oldPlain.run('node.add', nodeParameters, { operationId: 'legacy-plain-node' });
  assert.equal(plain.status, 'SUCCEEDED');
  assert.deepEqual(Object.keys(plain.output), ['node_ref']);
  validateActionParameters(legacy.output_schema, plain.output, 'legacy node output');
  assert.equal(plainPage.drops, 1);

  const connectedPage = autoConnectedNodePage(), oldConnected = runtime(connectedPage, { pinned });
  const connected = await oldConnected.run('node.add', unionNodeParameters, { operationId: 'legacy-auto-node' });
  assert.equal(connected.status, 'AMBIGUOUS');
  assert.deepEqual(connected.output.repairable_links, [connectedPage.prefix + ';Graph;Источник|Output_Data-0|Объединение|Input_Data-0']);
  assert.equal((await oldConnected.inspect({ operationId: 'legacy-auto-node' })).output.state, 'pending');
  assert.equal(connectedPage.drops, 1);
  assert.equal(connectedPage.nodes.length, 2);
  assert.equal(connectedPage.edges.length, 1);
});

function wrongPortLandingPage({ unrelatedNewEdge = false } = {}) {
  const page = linkPage(); page.nodes[1].ports = ['Input_Data-0', 'Input_Data-1'];
  page.addNode('Другой_источник', 104, 400, ['Output_Data-0']);
  page.addNode('Другой_приёмник', 400, 400, ['Input_Data-0', 'Input_Data-1']);
  page.edges.push('Другой_источник|Output_Data-0|Другой_приёмник|Input_Data-0');
  page.onDrop = current => {
    current.edges.push('Источник|Output_Data-0|Приёмник|Input_Data-0');
    if (unrelatedNewEdge) current.edges.push('Другой_источник|Output_Data-0|Другой_приёмник|Input_Data-1');
    current.onDrop = null;
  };
  return page;
}
const intendedSecondInput = page => ({ ...linkParameters(page, 'data'), target_port: { kind: 'data', index: 1 } });

test('a pending link that landed on the wrong existing input can remove only that new edge and then retry the intended input', async () => {
  const page = wrongPortLandingPage(), engine = runtime(page), parameters = intendedSecondInput(page);
  const created = await engine.run('link.create', parameters, { operationId: 'mislanded-link' });
  assert.equal(created.status, 'AMBIGUOUS');
  const wrongTid = page.prefix + ';Graph;Источник|Output_Data-0|Приёмник|Input_Data-0';
  assert.deepEqual(created.output.added_links, [wrongTid]);
  const observed = await engine.observe();
  const previous = uiElement(observed, element => element.tid?.includes('Другой_источник|'));
  await assert.rejects(engine.uiAct({ verb: 'click', ref: previous.ref }, {
    observationId: observationId(observed), operationId: 'touch-previous-edge', recoveryOperationId: 'mislanded-link',
  }), /outside the pending operation/);
  const wrong = uiElement(observed, element => element.tid === wrongTid);
  const selected = await engine.uiAct({ verb: 'click', ref: wrong.ref }, {
    observationId: observationId(observed), operationId: 'select-mislanded-edge', recoveryOperationId: 'mislanded-link',
  });
  assert.equal(selected.status, 'SUCCEEDED');
  const selectedWrong = uiElement(selected, element => element.tid === wrongTid);
  const removed = await engine.uiAct({ verb: 'press', ref: selectedWrong.ref, key: 'Delete' }, {
    observationId: observationId(selected), operationId: 'remove-mislanded-edge', recoveryOperationId: 'mislanded-link',
  });
  assert.equal(removed.status, 'SUCCEEDED');
  assert.equal(removed.output.recovery.state, 'resolved');
  assert.equal(removed.output.recovery.outcome_summary.status, 'NOT_APPLIED');
  assert.deepEqual(page.edges, ['Другой_источник|Output_Data-0|Другой_приёмник|Input_Data-0']);
  assert.equal(page.drops, 1);
  const corrected = await engine.run('link.create', parameters, { operationId: 'correct-second-input' });
  assert.equal(corrected.status, 'SUCCEEDED');
  assert.deepEqual(page.edges, ['Другой_источник|Output_Data-0|Другой_приёмник|Input_Data-0', 'Источник|Output_Data-0|Приёмник|Input_Data-1']);
  assert.deepEqual(page.nodes[1].ports, ['Input_Data-0', 'Input_Data-1']);
  assert.equal(page.drops, 2);
});

test('mislanded-link repair cannot erase an unrelated new edge or ignore another graph mutation', async () => {
  const page = wrongPortLandingPage({ unrelatedNewEdge: true }), engine = runtime(page);
  await engine.run('link.create', intendedSecondInput(page), { operationId: 'mixed-link-effects' });
  const observed = await engine.observe(), before = [...page.edges];
  for (const suffix of ['Источник|Output_Data-0|Приёмник|Input_Data-0', 'Другой_источник|Output_Data-0|Другой_приёмник|Input_Data-1']) {
    const edge = uiElement(observed, element => element.tid === page.prefix + ';Graph;' + suffix);
    await assert.rejects(engine.uiAct({ verb: 'click', ref: edge.ref }, {
      observationId: observationId(observed), operationId: 'reject-' + (suffix.startsWith('Другой') ? 'unrelated' : 'partial'), recoveryOperationId: 'mixed-link-effects',
    }), /outside the pending operation/);
  }
  assert.deepEqual(page.edges, before);
  assert.equal((await engine.inspect({ operationId: 'mixed-link-effects' })).output.state, 'pending');
  assert.equal(page.drops, 1);
});

test('removing a newly added node does not hide an auto-added port left on a pre-existing target', async () => {
  const page = new Page();
  page.addNode('Существующий_приёмник', 700, 104, ['Input_Add', 'Input_Data-0']);
  page.onDrop = current => {
    current.addNode('Объединение', 400, 104, ['Output_Data-0']);
    current.nodes[0].ports.push('Input_Data-1');
    current.edges.push('Объединение|Output_Data-0|Существующий_приёмник|Input_Data-1');
    current.onDrop = null;
  };
  const engine = runtime(page);
  assert.equal((await engine.run('node.add', unionNodeParameters, { operationId: 'node-with-extra-target-port' })).status, 'AMBIGUOUS');
  const observed = await engine.observe(), node = uiElement(observed, element => element.tid?.endsWith(';Объединение;Label;Label'));
  const selected = await engine.uiAct({ verb: 'click', ref: node.ref }, {
    observationId: observationId(observed), operationId: 'select-new-node', recoveryOperationId: 'node-with-extra-target-port',
  });
  const selectedNode = uiElement(selected, element => element.tid?.endsWith(';Объединение;Label;Label'));
  const removed = await engine.uiAct({ verb: 'press', ref: selectedNode.ref, key: 'Delete' }, {
    observationId: observationId(selected), operationId: 'remove-new-node', recoveryOperationId: 'node-with-extra-target-port',
  });
  assert.equal(removed.status, 'SUCCEEDED');
  assert.deepEqual(page.nodes.map(item => item.label), ['Существующий_приёмник']);
  assert.deepEqual(page.edges, []);
  assert.deepEqual(page.nodes[0].ports, ['Input_Add', 'Input_Data-0', 'Input_Data-1']);
  assert.equal(removed.output.recovery.state, 'pending');
  assert.equal(removed.output.recovery.outcome_summary.status, 'AMBIGUOUS');
  assert.equal((await engine.inspect({ operationId: 'node-with-extra-target-port' })).output.outcome.output.reason, 'unrelated graph changed');
  assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
  // An independently observed restoration of the remaining port is necessary
  // before node.add can truthfully report that its effect was not applied.
  page.nodes[0].ports.pop();
  const restored = await engine.inspect({ operationId: 'node-with-extra-target-port' });
  assert.equal(restored.output.state, 'resolved');
  assert.equal(restored.output.outcome.status, 'NOT_APPLIED');
  assert.equal(page.drops, 1);
});

test('an agent can abandon a completed partial domain step, retain its truthful receipt, and continue from the observed graph', async () => {
  const page = partialInputAdd(), records = [];
  const engine = runtime(page, { onRecord: async record => records.push(record) });
  const parameters = linkParameters(page);
  const initial = await engine.run('link.create', parameters, { operationId: 'abandoned-add-input-step' });
  assert.equal(initial.status, 'AMBIGUOUS');
  assert.equal(initial.cleanup_complete, true);
  const observed = await engine.observe();
  const abandoned = await engine.recover('abandoned-add-input-step', {
    strategy: 'abandon_operation', recoveryOperationId: 'change-the-plan', observationId: observationId(observed),
  });
  assert.equal(abandoned.status, 'SUCCEEDED');
  assert.equal(abandoned.action_key, 'operation.recover');
  assert.equal(abandoned.output.resolution, 'abandoned_after_observation');
  assert.equal(abandoned.output.goal_verified, false);
  assert.equal(abandoned.output.original_outcome.status, 'AMBIGUOUS');
  assert.deepEqual(abandoned.output.original_outcome.output, initial.output);
  assert.equal(page.drops, 1);
  assert.equal(inputPorts(page).length, 3);
  assert.deepEqual(page.edges, []);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  const inspected = await engine.inspect({ operationId: 'abandoned-add-input-step' });
  assert.equal(inspected.output.state, 'resolved');
  assert.equal(inspected.output.outcome.status, 'AMBIGUOUS');
  assert.equal(inspected.output.outcome.resolution, 'abandoned_after_observation');
  assert.equal(inspected.output.outcome.goal_verified, false);
  const duplicate = await engine.run('link.create', parameters, { operationId: 'abandoned-add-input-step' });
  assert.deepEqual(duplicate, inspected.output.outcome);
  assert.equal(page.drops, 1);

  const fresh = await engine.observe(), target = uiElement(fresh, element => element.tid?.endsWith(';Приёмник;Label;Label'));
  const selected = await engine.uiAct({ verb: 'click', ref: target.ref }, {
    observationId: observationId(fresh), operationId: 'continue-with-observed-target',
  });
  assert.equal(selected.status, 'SUCCEEDED');
  assert.equal(selected.output.recovery, undefined);
  const adopted = await engine.run('link.create', { ...parameters, target_port: { kind: 'data', index: 2 } }, { operationId: 'adopt-existing-third-input' });
  assert.equal(adopted.status, 'SUCCEEDED');
  assert.deepEqual(page.edges, ['Источник|Output_Data-0|Приёмник|Input_Data-2']);
  assert.equal(inputPorts(page).length, 3);
  assert.equal(page.drops, 2);
  assert.deepEqual(await engine.run('link.create', parameters, { operationId: 'abandoned-add-input-step' }), duplicate);
  assert.equal(page.drops, 2);
  assert.ok(records.some(record => record.outcome?.resolution === 'abandoned_after_observation'));
});

test('abandoning a domain step requires unchanged observed graph and package identity', async () => {
  for (const change of [
    page => page.nodes[0].ports.push('Output_Data-9'),
    page => { page.packagePath = '/user/data/packages/another-package.lgp'; },
  ]) {
    const page = partialInputAdd(), engine = runtime(page);
    await engine.run('link.create', linkParameters(page), { operationId: 'stale-abandon-target' });
    const observed = await engine.observe();
    change(page);
    await assert.rejects(engine.recover('stale-abandon-target', {
      strategy: 'abandon_operation', recoveryOperationId: 'stale-abandon', observationId: observationId(observed),
    }), /changed|stale|observe/i);
    assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
    assert.equal((await engine.inspect({ operationId: 'stale-abandon-target' })).output.state, 'pending');
    assert.equal(page.drops, 1);
  }
});

test('abandonment cannot release an operation with a missing completion receipt or unconfirmed cleanup', async () => {
  for (const failure of ['missing_receipt', 'cleanup_failed']) {
    const page = new Page(); let calls = 0;
    if (failure === 'cleanup_failed') {
      page.failDrag = true;
      page.mouse.up = async () => { throw new Error('Mouse cleanup failed'); };
    }
    const engine = runtime(page, { execute: async code => {
      if (++calls === 2 && failure === 'missing_receipt') throw new Error('Request lost before reaching the browser');
      return page.execute(code);
    } });
    assert.equal((await engine.run('node.add', nodeParameters, { operationId: 'unfinished-step' })).status, 'AMBIGUOUS');
    const observed = await engine.observe();
    await assert.rejects(engine.recover('unfinished-step', {
      strategy: 'abandon_operation', recoveryOperationId: 'unsafe-abandon', observationId: observationId(observed),
    }), /completion|cleanup|control|confirmed/i);
    const inspected = await engine.inspect({ operationId: 'unfinished-step' });
    assert.equal(inspected.output.state, 'pending');
    assert.equal(inspected.output.cleanup_confirmed, false);
    assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
    assert.equal(page.drops, 0);
    assert.deepEqual(page.nodes, []);
  }
});

test('abandonment releases the mutation guard only after its resolution is durably recorded', async () => {
  const page = partialInputAdd(); let refuseJournal = true;
  const engine = runtime(page, { onRecord: async record => {
    if (record.outcome?.resolution === 'abandoned_after_observation' && refuseJournal) throw new Error('Abandonment journal unavailable');
  } });
  await engine.run('link.create', linkParameters(page), { operationId: 'durable-abandon-target' });
  const observed = await engine.observe();
  const options = { strategy: 'abandon_operation', recoveryOperationId: 'durable-abandon', observationId: observationId(observed) };
  await assert.rejects(engine.recover('durable-abandon-target', options), /Abandonment journal unavailable/);
  assert.equal((await engine.inspect({ operationId: 'durable-abandon-target' })).output.state, 'pending');
  assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
  assert.equal(page.drops, 1);
  refuseJournal = false;
  const accepted = await engine.recover('durable-abandon-target', options);
  assert.equal(accepted.output.resolution, 'abandoned_after_observation');
  assert.equal(accepted.output.original_outcome.status, 'AMBIGUOUS');
  assert.equal(accepted.output.goal_verified, false);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  assert.equal(page.drops, 1);
});

test('each observation records its own immutable browser result before paging', async () => {
  const events=[],engine=runtime(linkPage(),{onRecord:async event=>events.push(event)});
  const first=await engine.observe(),second=await engine.observe();
  const reads=events.filter(e=>e.phase==='observation_completed');
  assert.equal(reads.length,2);assert.notEqual(reads[0].operation_id,reads[1].operation_id);
  assert.equal(first.operation_id,reads[0].operation_id);assert.equal(second.operation_id,reads[1].operation_id);
  assert.equal(reads[0].outcome.output.page,undefined);
  assert.equal(reads[0].outcome.output.operation,undefined);
  first.output.origin='changed';assert.notEqual(reads[0].outcome.output.origin,'changed');
});

test('abandon recovery observes the same roots or narrow region instead of the whole page',async()=>{
  for(const scope of ['roots','narrow','roots_changed','narrow_changed']) {
    const page=partialInputAdd();
    const evaluate=page.evaluate;
    page.evaluate=async function(fn,arg){
      const result=await evaluate.call(this,fn,arg);
      if(result?.ui && arg && ('rootRef' in arg || 'discoverRoots' in arg)) {
        if(arg.discoverRoots){result.observation_kind='roots';result.ui.elements=result.ui.elements.slice(0,1);}
        if(arg.rootRef){result.observation_root={ref:arg.rootRef};result.ui.elements=result.ui.elements.slice(0,1);}
      }
      return result;
    };
    const engine=runtime(page);
    const initial=await engine.run('link.create',linkParameters(page),{operationId:'scoped-partial'});
    assert.equal(initial.status,'AMBIGUOUS');
    const roots=await engine.observe({scope:'roots'});
    let observed=roots;
    if(scope.startsWith('narrow')) {
      const root=roots.output.ui.elements.find(e=>e.ref);assert.ok(root);
      observed=await engine.observe({rootRef:root.ref,observationId:observationId(roots)});
      assert.ok(observed.output.observation_root);
    }
    if(scope.endsWith('_changed')) {
      page.nodes[0].label='Changed';
      await assert.rejects(engine.recover('scoped-partial',{strategy:'abandon_operation',recoveryOperationId:'changed-abandon',observationId:observationId(observed)}),/changed/);
      assert.throws(()=>engine.assertPreparationAllowed(),/preparation cannot run/);continue;
    }
    const result=await engine.recover('scoped-partial',{strategy:'abandon_operation',recoveryOperationId:'scoped-abandon',observationId:observationId(observed)});
    assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.goal_verified,false);
    assert.equal(page.drops,1);
  }
});

test('oversized broad observations return paged read-only roots and journal the delivered scope',async()=>{
  for(const scope of ['all','graph','dialogs','palette']) {
    const page=linkPage(),evaluate=page.evaluate,records=[];let broad=0,roots=0;
    page.evaluate=async function(fn,arg) {
      if(arg && 'discoverRoots' in arg && !arg.discoverRoots) {
        broad++;const error=new Error('oversized document');error.code='UI_SCAN_LIMIT';throw error;
      }
      const result=await evaluate.call(this,fn,arg);
      if(result?.ui && arg?.discoverRoots) {
        roots++;result.observation_kind='roots';result.nodes=[];result.links=[];
        result.ui.elements=Array.from({length:45},(_,i)=>({ref:'ui-region-'+i,tid:'Region-'+i,
          identity:{anchor_tid:'Region-'+i,path:[]},kind:'region',scope:'workflow',label:'Region '+i,allowed_actions:[]}));
        result.ui.truncated.nodes=true;result.ui.truncated.links=true;
      }
      return result;
    };
    const engine=runtime(page,{onRecord:async r=>records.push(r)});
    const first=await engine.observe({scope});
    assert.equal(first.status,'SUCCEEDED');assert.equal(first.output.observation_kind,'roots');
    assert.equal(first.output.page.scope,'roots');assert.equal(first.output.ui.truncated.nodes,true);
    assert.ok(first.output.ui.elements.length);assert.ok(first.output.page.next_cursor);
    assert.equal(broad,1);assert.equal(roots,1);assert.equal(records.length,1);
    assert.deepEqual(records[0].outcome.trace.at(-1),{event:'observation_scope_fallback',requested_scope:scope,delivered_scope:'roots',reason:'UI_SCAN_LIMIT'});
    await assert.rejects(engine.uiAct({verb:'click',ref:first.output.ui.elements[0].ref},{observationId:observationId(first),operationId:'not-a-control'}),/does not support/);
    const next=await engine.observe({cursor:first.output.page.next_cursor});
    assert.equal(next.status,'SUCCEEDED');assert.equal(next.output.observation_id,first.output.observation_id);
    assert.equal(broad,1);assert.equal(roots,2);
  }
});

test('root discovery failures never trigger recursive scan retries',async()=>{
  const page=linkPage(),evaluate=page.evaluate;let attempts=0;
  page.evaluate=async function(fn,arg){
    if(arg && 'discoverRoots' in arg){attempts++;const e=new Error('limit');e.code='UI_SCAN_LIMIT';throw e;}
    return evaluate.call(this,fn,arg);
  };
  const engine=runtime(page);
  assert.equal((await engine.observe({scope:'roots'})).status,'NOT_APPLIED');assert.equal(attempts,1);
  assert.equal((await engine.observe({scope:'graph'})).status,'NOT_APPLIED');assert.equal(attempts,3);
});

test('relocated native graph recovery preserves workflow and scopes repair to its owned diagram',async()=>{
  const page=partialInputAdd();page.prefix='MF;TF-4';page.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-4';page.graphPrefix='MF;TF-1';
  const engine=runtime(page);
  const first=await engine.run('link.create',linkParameters(page),{operationId:'relocated-partial'});
  assert.equal(first.status,'AMBIGUOUS');
  const observed=await engine.observe();
  const target=uiElement(observed,e=>e.tid?.endsWith(';Приёмник;Label;Label'));
  const clicked=await engine.uiAct({verb:'click',ref:target.ref},{observationId:observationId(observed),operationId:'relocated-inspect',recoveryOperationId:'relocated-partial'});
  assert.equal(clicked.status,'SUCCEEDED');
  const recovered=await engine.recover('relocated-partial',{strategy:'complete_link',recoveryOperationId:'relocated-repair'});
  assert.equal(recovered.status,'SUCCEEDED',JSON.stringify(recovered.error));
  assert.ok(recovered.output.link_ref.tid.startsWith('MF;TF-1;Graph;'));
  assert.equal(page.prefix,'MF;TF-4');assert.equal(page.drops,2);
});

test('pending graph repair rejects an observation bound to a different diagram before a gesture',async()=>{
  const page=partialInputAdd(),engine=runtime(page);
  assert.equal((await engine.run('link.create',linkParameters(page),{operationId:'binding-guard'})).status,'AMBIGUOUS');
  const snapshot=page.uiSnapshot.bind(page);
  page.uiSnapshot=()=>{const value=snapshot();value.graph_identity.container_tid='MF;TF-9;ModelForm;cmpDiagram';return value;};
  const observed=await engine.observe(),target=uiElement(observed,e=>e.tid?.endsWith(';Приёмник;Label;Label'));
  const before=page.events.length;
  await assert.rejects(()=>engine.uiAct({verb:'click',ref:target.ref},{observationId:observationId(observed),operationId:'binding-guard-click',recoveryOperationId:'binding-guard'}),/outside the pending operation/);
  assert.equal(page.events.length,before);
});
