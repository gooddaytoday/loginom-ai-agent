import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';
import {inspectJavascriptModulePolicy} from './javascript-module-policy.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';
import {inspectManagedJavascriptSourceEditor} from './javascript-managed-source.mjs';
import {makeJavascriptManagedWizardSettlementCode} from './javascript-managed-opening.mjs';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const need = (condition, message) => { if (!condition) throw Error(message); };

// This one browser action owns the entire CodeMirror gesture sequence. The
// source is data for keyboard.insertText, never evaluated as JavaScript.
export async function runManagedJavascriptSourceReplace(page, task, target, inspect) {
  const outcome = (status, phase, effectPossible, output = {}, error = null) => ({
    status, phase, effect_possible: effectPossible, cleanup_complete: true,
    action_key: 'javascript.source.replace', action_revision: '1',
    operation_id: task.gesture_id, output, error, trace: []});
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true
    || !lease.sourceEditorCaptured || typeof lease.sourceBaseline !== 'string'
    || lease.sourceWriteAttempted === true || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {},
      {code: 'SOURCE_LEASE_UNAVAILABLE', message: 'Owned source editor lease unavailable'});
  const read = options => page.evaluate(inspect,
    {held: lease.handle, editor: lease.sourceEditorCaptured, task, ...options});
  const before = await read({locate: true});
  if (before.source !== lease.sourceBaseline
    || before.source_utf8_bytes !== task.previous_source_utf8_bytes
    || before.source_lf_lines !== task.previous_source_lf_lines)
    return outcome('NOT_APPLIED', 'preflight', false, {},
      {code: 'SOURCE_BASELINE_CHANGED', message: 'Owned source baseline changed'});
  const timely = () => { if (Date.now() >= task.deadline) throw Error('Managed source write original deadline expired'); };
  // Set before the first UI gesture. A lost reply must never re-enter this
  // action, including when only focus or selection may have happened.
  lease.sourceWriteAttempted = true;
  timely(); await page.mouse.click(before.point.x, before.point.y);
  const focused = await read({requireInputFocus: true});
  if (focused.source !== before.source) throw Error('Managed source changed on focus');
  timely(); await page.keyboard.press('Control+A');
  const selected = await read({requireInputFocus: true, selectionCheck: true});
  if (selected.source !== before.source || selected.selection_full !== true)
    throw Error('Managed source full selection unconfirmed');
  timely(); await page.keyboard.press('Backspace');
  if ((await read({requireInputFocus: true})).source !== '')
    throw Error('Managed source clear unconfirmed');
  timely(); await page.keyboard.insertText(target.source_text);
  const after = await read({requireInputFocus: true});
  if (after.source !== target.source_text
    || after.source_utf8_bytes !== target.source_utf8_bytes
    || after.source_lf_lines !== target.source_lf_lines)
    throw Error('Managed source exact readback differs');
  lease.sourceDraftSha256 = target.source_sha256;
  timely();
  return outcome('SUCCEEDED', 'draft_verified', true, {
    previous_source_sha256: task.previous_source_sha256,
    source_sha256: target.source_sha256,
    source_utf8_bytes: after.source_utf8_bytes,
    source_lf_lines: after.source_lf_lines,
    draft_exact: true, wizard_commit_verified: false});
}

export function makeJavascriptManagedSourceReplaceCode(task, target) {
  const {gesture_id, previous_source_sha256, previous_source_utf8_bytes,
    previous_source_lf_lines, ...opening} = task ?? {};
  makeJavascriptManagedWizardSettlementCode(opening);
  need(gesture_id === task.operation_id + ':source-replace'
    && /^[a-f0-9]{64}$/.test(previous_source_sha256)
    && Number.isSafeInteger(previous_source_utf8_bytes) && previous_source_utf8_bytes >= 0
    && previous_source_utf8_bytes <= 32768
    && Number.isSafeInteger(previous_source_lf_lines) && previous_source_lf_lines >= 1
    && previous_source_lf_lines <= 1024, 'Invalid managed JavaScript source replace task');
  const source = javascriptSourceIdentity(target?.source_text);
  need(same(source, Object.fromEntries(Object.entries(target).filter(([key]) => key !== 'source_text')))
    && inspectJavascriptModulePolicy(target.source_text).status === 'ADMITTED',
  'Invalid managed JavaScript source target');
  return `async page=>(${runManagedJavascriptSourceReplace.toString()})(page,${JSON.stringify(task)},`+
    `${JSON.stringify(target)},${inspectManagedJavascriptSourceEditor.toString()})`;
}

// Host side of the same one-shot attempt. All journal records contain only
// owner/digests/bounds. The browser receipt never returns raw source text.
export async function replaceManagedJavascriptSource({task, handle, owner, deadline, expected_source_sha256,
  source_text, read, execute, record, receiptOptions, markUncertain}) {
  need(handle?.task === task && same(handle.owner, owner)
    && Number.isSafeInteger(deadline) && deadline >= task.deadline && Date.now() < task.deadline
    && typeof read === 'function' && typeof execute === 'function'
    && typeof record === 'function' && typeof receiptOptions === 'function'
    && typeof markUncertain === 'function', 'Managed JavaScript source writer dependencies unavailable');
  need(typeof expected_source_sha256 === 'string' && /^[a-f0-9]{64}$/.test(expected_source_sha256),
    'Complete expected source digest required');
  const target = javascriptSourceIdentity(source_text);
  const policy = inspectJavascriptModulePolicy(source_text);
  need(policy.status === 'ADMITTED' && policy.source_sha256 === target.source_sha256,
    'Managed JavaScript source policy refused');
  const first = await read(handle, {owner, deadline});
  const second = await read(handle, {owner, deadline});
  const previous = javascriptSourceIdentity(first.source);
  need(first.source === second.source && previous.source_sha256 === expected_source_sha256,
    'Managed JavaScript source baseline changed');
  const event = phase => ({phase, owner, deadline: task.deadline, previous_source_sha256: previous.source_sha256,
    source_sha256: target.source_sha256, source_utf8_bytes: target.source_utf8_bytes,
    source_lf_lines: target.source_lf_lines});
  const journal = async phase => {
    const value = event(phase), ack = await record(structuredClone(value));
    need(Object.keys(value).every(key => same(value[key], ack?.[key])),
      'Managed JavaScript source journal ACK differs');
  };
  await journal('javascript_source_write_prepared');
  const gesture_id = task.operation_id + ':source-replace';
  const gesture = {...task, gesture_id, previous_source_sha256: previous.source_sha256,
    previous_source_utf8_bytes: previous.source_utf8_bytes,
    previous_source_lf_lines: previous.source_lf_lines};
  const code = makeJavascriptManagedSourceReplaceCode(gesture, {source_text, ...target});
  await journal('javascript_source_write_mutation_dispatch');
  const signature = createHash('sha256').update(JSON.stringify([gesture_id, owner,
    previous.source_sha256, target.source_sha256, task.deadline])).digest('hex');
  markUncertain(true);
  const result = await execute(withBrowserReceipt('(' + code + ')(page)', {
    ...receiptOptions(gesture_id, 'javascript.source.replace', signature), operation_id: gesture_id}),
  {timeout: Math.max(1, Math.min(35000, task.deadline - Date.now() + 5000))});
  if (result?.status === 'NOT_APPLIED' && result.effect_possible === false) {
    markUncertain(false);
    throw Error('Managed JavaScript source replacement refused before editor gesture');
  }
  need(result?.status === 'SUCCEEDED' && result.action_key === 'javascript.source.replace'
    && result.operation_id === gesture_id && result.output?.draft_exact === true
    && same(Object.fromEntries(['source_sha256', 'source_utf8_bytes', 'source_lf_lines']
      .map(key => [key, result.output[key]])), target),
  'Managed JavaScript source replacement unconfirmed');
  markUncertain(false);
  try {
    const observed = await read(handle, {owner, deadline});
    need(observed.source === source_text, 'Managed JavaScript source independent readback differs');
    await journal('javascript_source_write_draft_verified');
  } catch (error) { markUncertain(true); throw error; }
  return {owner, previous_source_sha256: previous.source_sha256, ...target,
    draft_exact: true, wizard_commit_verified: false, source_mutation_possible: true};
}
