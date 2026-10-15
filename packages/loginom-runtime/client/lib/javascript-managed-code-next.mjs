import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {inspectManagedJavascriptPage, makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {inspectManagedJavascriptSourceEditor, makeJavascriptManagedSourceCode} from './javascript-managed-source.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';
import {wizardReadiness} from './javascript-wizard-page.mjs';

export function inspectManagedJavascriptCodeNextPoint({held, task}, inspect) {
  const state = inspect({held, task});
  const prefix = task.workflow_ref.prefix;
  if (state.ready !== true || state.node_guid !== task.owner.node_id
    || state.page?.tid !== prefix + ';WizrdMCF;JavaScriptCodeWizard'
    || state.page.index !== 1 || state.page.indicator_count !== 4
    || state.page.visible_editors !== 1 || !held.wizard || !held.wizardRoot)
    throw Error('Managed JavaScript Code Next page changed');
  const tab = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const root = held.wizardRoot;
  if (tab !== held.binding.tab || tab?.Controller?.Node?.data?.node !== held.wizard
    || tab?.Controller?.FController?.FView?.el?.dom !== root
    || !root.isConnected || root.getAttribute('data-tid') !== prefix + ';WizrdMCF')
    throw Error('Managed JavaScript Code Next wizard owner changed');
  const visible = element => !!element?.isConnected && element.getBoundingClientRect().width > 0
    && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
  const buttons = [...root.querySelectorAll('[data-tid=' + JSON.stringify(prefix + ';WizrdMCF;btnNext') + ']')].filter(visible);
  const button = buttons[0], control = button && globalThis.Ext?.getCmp?.(button.id);
  if (buttons.length !== 1 || control?.el?.dom !== button || control.disabled === true
    || button.closest('.x-item-disabled,.x-btn-disabled')
    || button.getAttribute('aria-disabled') === 'true')
    throw Error('Managed JavaScript Code Next button unavailable');
  const box = button.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !(hit === button || button.contains(hit)))
    throw Error('Managed JavaScript Code Next button covered');
  return {x, y, tid: prefix + ';WizrdMCF;btnNext', page_tid: state.page.tid,
    page_index: state.page.index, node_id: task.owner.node_id};
}

export async function runManagedJavascriptCodeNextPoint(page, task, inspect) {
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true
    || !lease.wizardCaptured || !lease.sourceEditorCaptured
    || lease.sourceDraftSha256 !== task.expected_source_sha256
    || typeof lease.sourceDraftText !== 'string' || lease.codeNextAttempted === true
    || Date.now() >= task.deadline)
    throw Error('Managed JavaScript Code Next lease unavailable');
  return page.evaluate(inspect, {held: lease.handle, task});
}

export async function runManagedJavascriptCodeNextGesture(page, task, inspectPoint, inspectSource) {
  const outcome = (status, phase, effectPossible, output = {}, error = null) => ({
    status, phase, effect_possible: effectPossible, cleanup_complete: true,
    action_key: 'javascript.wizard.code.next', action_revision: '1',
    operation_id: task.gesture_id, output, error, trace: []});
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true
    || !lease.wizardCaptured || !lease.sourceEditorCaptured
    || lease.sourceDraftSha256 !== task.expected_source_sha256
    || typeof lease.sourceDraftText !== 'string' || lease.codeNextAttempted === true
    || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {},
      {code: 'CODE_NEXT_LEASE_UNAVAILABLE', message: 'Owned Code Next lease unavailable'});
  const source = await page.evaluate(inspectSource,
    {held: lease.handle, editor: lease.sourceEditorCaptured, task, requireInputFocus: true});
  if (source.source !== lease.sourceDraftText || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {},
      {code: 'CODE_NEXT_SOURCE_CHANGED', message: 'Owned Code source changed'});
  const point = await page.evaluate(inspectPoint, {held: lease.handle, task});
  if (JSON.stringify(point) !== JSON.stringify(task.point) || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {},
      {code: 'CODE_NEXT_POINT_CHANGED', message: 'Owned Code Next point changed'});
  lease.codeNextAttempted = true;
  await page.mouse.click(point.x, point.y);
  return outcome('SUCCEEDED', 'gesture_returned', true,
    {next_gesture_returned: true, transition_verified: false, execution_started: null});
}

function validate(task) {
  const {gesture_id, point, expected_source_sha256, ...opening} = task ?? {};
  makeJavascriptManagedPageCode(opening);
  if (!/^[a-f0-9]{64}$/.test(expected_source_sha256))
    throw Error('Managed JavaScript Code Next requires exact draft digest');
}

export function makeJavascriptManagedCodeNextPointCode(task) {
  validate(task);
  const inspect = `function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptCodeNextPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptCodeNextPoint.toString()})(page,${JSON.stringify(task)},${inspect})`;
}

export function makeJavascriptManagedCodeNextGestureCode(task) {
  validate(task);
  if (task.gesture_id !== task.operation_id + ':next-code-done'
    || task.point?.tid !== task.workflow_ref.prefix + ';WizrdMCF;btnNext'
    || task.point.page_tid !== task.workflow_ref.prefix + ';WizrdMCF;JavaScriptCodeWizard'
    || task.point.page_index !== 1 || task.point.node_id !== task.owner.node_id
    || !Number.isFinite(task.point.x) || !Number.isFinite(task.point.y))
    throw Error('Invalid managed JavaScript Code Next gesture');
  const inspect = `function inspect(args){const native=${wizardReadiness.toString()};`+
    `const read=(input)=>(${inspectManagedJavascriptPage.toString()})(input,native);`+
    `return (${inspectManagedJavascriptCodeNextPoint.toString()})(args,read);}`;
  return `async page=>(${runManagedJavascriptCodeNextGesture.toString()})(page,${JSON.stringify(task)},`+
    `${inspect},${inspectManagedJavascriptSourceEditor.toString()})`;
}

export async function dispatchManagedJavascriptCodeNext({task, expected_source_sha256,
  execute, record, receiptOptions}) {
  const base = {...task, expected_source_sha256};
  validate(base);
  const before = await execute(makeJavascriptManagedSourceCode(task));
  if (before?.verified !== true || javascriptSourceIdentity(before.source).source_sha256 !== expected_source_sha256)
    throw Error('Managed JavaScript Code Next source baseline changed');
  const point = await execute(makeJavascriptManagedCodeNextPointCode(base));
  const gesture_id = task.operation_id + ':next-code-done';
  const gesture = {...base, gesture_id, point};
  const code = makeJavascriptManagedCodeNextGestureCode(gesture);
  const intent = {phase: 'javascript_managed_code_next_prepared', operation_id: task.operation_id,
    gesture_id, owner: task.owner, source_sha256: expected_source_sha256,
    from_tid: point.page_tid, point, deadline: task.deadline, effect_possible: false};
  const ack = await record(intent);
  if (JSON.stringify(Object.fromEntries(Object.keys(intent).map(key => [key, ack?.[key]]))) !== JSON.stringify(intent))
    throw Error('Managed JavaScript Code Next journal ACK differs');
  const signature = createHash('sha256').update(JSON.stringify([
    gesture_id, task.owner, expected_source_sha256, point, task.deadline])).digest('hex');
  const result = await execute(withBrowserReceipt('(' + code + ')(page)', {
    ...receiptOptions(gesture_id, 'javascript.wizard.code.next', signature), operation_id: gesture_id}),
  {timeout: Math.max(1, Math.min(35000, task.deadline - Date.now() + 5000))});
  if (result?.status !== 'SUCCEEDED' || result.action_key !== 'javascript.wizard.code.next'
    || result.operation_id !== gesture_id || result.output?.next_gesture_returned !== true)
    throw Error('Managed JavaScript Code Next gesture unconfirmed');
  return result;
}
