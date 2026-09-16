// Local harness checks only. These do not count as live acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { makeCapabilityCode } from '../../client/lib/executor.mjs';
import { RENAME_NEEDLE, injectRename, readTask, renameFaultCall } from './rename-client.mjs';
import { LINK_NEEDLE, injectPartialLink, partialLinkFaultCall } from './partial-link-client.mjs';
import { lostReceiptCall } from './lost-receipt-client.mjs';
import { DROP_NEEDLE, injectPosition, positionFaultCall } from './position-client.mjs';
import { validateFaultContext } from './fault-launcher.mjs';
const actions = JSON.parse(await readFile(new URL('../../executor/catalog/actions.json', import.meta.url)));
const selectorsJSON = JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json', import.meta.url)));
const selectors = new Map(selectorsJSON.selectors.map(item => [item.symbol, item]));
const action = key => actions.actions.find(item => item.action_key === key);
const node = { mode: 'apply', action: action('node.add'), parameters: { component_key: 'imports.text', expected_label: 'Источник', target_position: { x: 220, y: 220 } } };
const link = { mode: 'apply', action: action('link.create'), parameters: { source_node: { node_label: 'Источник' }, target_node: { node_label: 'Объединение' }, target_port: { kind: 'add' } } };
const request = (task, ledger = true) => ({ name: 'browser_run_code_unsafe', arguments: { code: makeCapabilityCode(task.action, selectors, task.parameters, { mode: task.mode,
  ...(ledger ? { receipt_namespace: 'static-test-session', receipt_id: 'static-test-operation', receipt_signature: 'static-test-signature' } : {}) }) } });
const response = key => ({ content: [{ type: 'text', text: JSON.stringify({ status: 'AMBIGUOUS', action_key: key, action_revision: '1.0.0', operation_id: 'static-harness-test', output: {}, error: null, trace: [{ event: 'operator_fault_injected' }] }) }] });
test('fault gate rejects stale SHA, other run, other state and undeclared variant', () => {
  const runId = '20260905-120000-1234abcd';
  const context = { variant: 'lost_receipt', state: `/isolated/${runId}/private/dock-state`, runDirectory: `/isolated/${runId}`,
    actualSha: 'a'.repeat(64), expectedSha: 'a'.repeat(64), request: { run_id: runId, scope: 'source_runtime',
      fault_injection: 'lost_receipt', runtime_source_pin: { inputs: { 'client/lib/executor.mjs': 'a'.repeat(64) } } } };
  assert.doesNotThrow(() => validateFaultContext(context));
  for (const change of [{expectedSha:'b'.repeat(64)}, {actualSha:'b'.repeat(64)}, {state:'/personal/dock-state'},
    {variant:'rename'}, {runDirectory:'/other/run'}, {request:{...context.request,fault_injection:false}}]) {
    assert.throws(() => validateFaultContext({...context,...change}));
  }
});
test('task decoder recognizes only fixed generated browser capability envelopes', () => {
  assert.equal(readTask(request(node)).parameters.expected_label, 'Источник');
  assert.equal(readTask(request(node, false)).parameters.expected_label, 'Источник');
  const unusual = { ...node, parameters: { ...node.parameters, expected_label: 'quoted "brace } ( text' } };
  assert.deepEqual(readTask(request(unusual)).parameters, unusual.parameters);
  assert.equal(readTask({ name: 'browser_evaluate', arguments: { code: request(node).arguments.code } }), null);
  assert.equal(readTask({ name: 'browser_run_code_unsafe', arguments: { code: 'arbitrary code' } }), null);
});
test('rename interruption occurs once at source-bound rename boundary after drag', () => {
  const original=request(node), patched=injectRename(original);
  assert.equal(original.arguments.code.split(RENAME_NEEDLE).length, 2);
  assert.ok(patched.arguments.code.indexOf('OPERATOR_RENAME_EDITOR_INTERRUPTED') > patched.arguments.code.indexOf('component_dragged'));
  assert.doesNotThrow(() => new Function('return (' + patched.arguments.code + ')'));
  assert.throws(() => injectRename({ arguments: { code: original.arguments.code.replace(RENAME_NEEDLE, '') } }), /not unique/);
});
test('partial link fault preserves product reconcile and uses exact one-link UI confirmation', () => {
  const original=request(link), patched=injectPartialLink(original);
  assert.equal(patched.arguments.code.split(LINK_NEEDLE).length, 2);
  assert.ok(patched.arguments.code.includes("!== 'Удалить выделенную связь?'"));
  assert.ok(patched.arguments.code.includes('OPERATOR_FAULT_POSTCONDITION_NOT_EXACT'));
  assert.doesNotThrow(() => new Function('return (' + patched.arguments.code + ')'));
  assert.throws(() => injectPartialLink({ arguments: { code: original.arguments.code.replace(LINK_NEEDLE, '') } }), /not unique/);
});
for (const [label, task, wrap] of [['rename',node,renameFaultCall], ['partial_link',link,partialLinkFaultCall], ['position',node,positionFaultCall]]) {
  test(label + ' wraps one real call, returns underlying receipt unchanged, then stops injecting', async () => {
    const received=[], receipts=[], actual=response(task.action.action_key);
    const wrapped=wrap(async value => { received.push(value); return actual; }, async value => receipts.push(value));
    const original=request(task);
    assert.equal(await wrapped(original), actual);
    assert.equal(await wrapped(original), actual);
    assert.equal(received.length, 2);
    assert.notEqual(received[0].arguments.code, original.arguments.code);
    assert.equal(received[1].arguments.code, original.arguments.code);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].injection_reached, true);
    assert.deepEqual(receipts[0].actual_browser_reply, JSON.parse(actual.content[0].text));
  });
}
test('position fault shifts only real drop and preserves original task/checkpoint',()=>{
  const original=request(node),patched=injectPosition(original);
  assert.deepEqual(readTask(patched),readTask(original));
  assert.ok(patched.arguments.code.includes('before.geometry.point.x + 24'));
  assert.doesNotThrow(()=>new Function('return ('+patched.arguments.code+')'));
  assert.throws(()=>injectPosition({arguments:{code:original.arguments.code.replace(DROP_NEEDLE,'')}}),/unique/);
});
test('lost response leaves production code unchanged, saves successful receipt, withholds once', async () => {
  const actual = response('node.add');
  const body = JSON.parse(actual.content[0].text); body.status = 'SUCCEEDED'; body.cleanup_complete = true;
  actual.content[0].text = JSON.stringify(body);
  const received = [], receipts = [];
  const wrapped = lostReceiptCall(async value => { received.push(value); return actual; }, async value => receipts.push(value));
  const original = request(node);
  await assert.rejects(wrapped(original), /OPERATOR_SIMULATED_LOST_COMPLETED_BROWSER_RESPONSE/);
  assert.equal(await wrapped(original), actual);
  assert.equal(received[0], original);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].generated_code_modified, false);
  assert.equal(receipts[0].source_code_sha256, receipts[0].injected_code_sha256);
  assert.deepEqual(receipts[0].actual_browser_reply, body);
});
