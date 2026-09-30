import {makeJavascriptManagedPageCode, inspectManagedJavascriptPage} from './javascript-managed-page.mjs';
import {wizardReadiness} from './javascript-wizard-page.mjs';
import {readJavascriptSchema} from './javascript-schema-browser.mjs';

// A mode change is bound to the retained wizard and the complete native schema,
// never to a checkbox tid supplied by the model.
export function inspectManagedJavascriptGeneration({held, task, expected = null}, inspectPage, readSchema) {
  const state = inspectPage({held, task});
  if (state.ready !== true || state.node_guid !== task.owner.node_id
    || state.page?.tid !== task.workflow_ref.prefix + ';WizrdMCF;JavaScriptColumnsWizard'
    || state.page.index !== 0 || state.page.indicator_count !== 4)
    throw Error('Managed JavaScript generation page changed');
  const tab = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const root = held.wizardRoot;
  if (tab !== held.binding.tab || tab?.Controller?.Node?.data?.node !== held.wizard
    || tab?.Controller?.FController?.FView?.el?.dom !== root || !root?.isConnected)
    throw Error('Managed JavaScript generation wizard changed');
  const schema = readSchema({root, native: held.wizard, binding: held.wizardBinding,
    prefix: task.workflow_ref.prefix});
  if (schema.verified !== true || schema.inventory_complete !== true
    || schema.form !== 'JavaScriptColumnsWizard' || schema.generation?.disabled !== false
    || expected && JSON.stringify(schema) !== JSON.stringify(expected))
    throw Error('Managed JavaScript generation schema changed');
  const tid = schema.generation.tid;
  const elements = [...root.querySelectorAll('[data-tid=' + JSON.stringify(tid) + ']')];
  const display = elements[0];
  if (elements.length !== 1 || !display?.isConnected
    || getComputedStyle(display).visibility === 'hidden' || display.closest('.x-item-disabled'))
    throw Error('Managed JavaScript generation control unavailable');
  const bounds = display.getBoundingClientRect(), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (bounds.width <= 0 || bounds.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight
    || !(hit === display || display.contains(hit)))
    throw Error('Managed JavaScript generation control covered');
  return {schema, point: {x, y, tid}};
}

export async function runManagedJavascriptGeneration(page, task, inspect) {
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  const outcome = (status, phase, effect_possible, output = {}, error = null) => ({status, phase,
    effect_possible, cleanup_complete: true, action_key: 'javascript.schema.generation', action_revision: '1',
    operation_id: task.gesture_id, output, error, trace: []});
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true || !lease.wizardCaptured
    || lease.nextAttempted === true || lease.generationAttempted === true || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {}, {code: 'GENERATION_LEASE_UNAVAILABLE', message: 'Generation lease unavailable'});
  const before = await page.evaluate(inspect, {held: lease.handle, task, expected: task.expected.schema});
  if (JSON.stringify(before) !== JSON.stringify(task.expected) || Date.now() >= task.deadline)
    return outcome('NOT_APPLIED', 'preflight', false, {}, {code: 'GENERATION_CHANGED', message: 'Generation baseline changed'});
  // Set before the click: a lost reply can never toggle the mode a second time.
  lease.generationAttempted = true;
  await page.mouse.click(before.point.x, before.point.y);
  const after = await page.evaluate(inspect, {held: lease.handle, task});
  const wanted = {...before.schema, generation: {...before.schema.generation, checked: true}};
  if (JSON.stringify(after.schema) !== JSON.stringify(wanted) || Date.now() >= task.deadline)
    throw Error('Managed JavaScript generation readback differs');
  return outcome('SUCCEEDED', 'draft_verified', true, {generation: true, schema: after.schema,
    generation_readback_verified: true, wizard_commit_verified: false});
}

export async function runManagedJavascriptGenerationRead(page, task, inspect) {
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true || !lease.wizardCaptured
    || lease.nextAttempted === true || lease.generationAttempted === true || Date.now() >= task.deadline)
    throw Error('Managed JavaScript generation lease unavailable');
  return page.evaluate(inspect, {held: lease.handle, task});
}

export function makeJavascriptManagedGenerationCode(task, expected = null) {
  const {gesture_id, ...base} = task ?? {};
  makeJavascriptManagedPageCode(base);
  if (expected !== null && (gesture_id !== task.operation_id + ':generation-code'
    || expected.schema?.verified !== true || expected.schema.generation?.checked !== false
    || expected.schema.generation.disabled !== false
    || expected.schema.page_tid !== task.workflow_ref.prefix + ';WizrdMCF;JavaScriptColumnsWizard'
    || expected.point?.tid !== expected.schema.generation.tid
    || !Number.isFinite(expected.point?.x) || !Number.isFinite(expected.point?.y)))
    throw Error('Invalid managed JavaScript generation baseline');
  const inspect = `function inspect(args){const native=${wizardReadiness.toString()};` +
    `const pageRead=input=>(${inspectManagedJavascriptPage.toString()})(input,native);` +
    `return (${inspectManagedJavascriptGeneration.toString()})(args,pageRead,${readJavascriptSchema.toString()});}`;
  return expected === null
    ? `async page=>(${runManagedJavascriptGenerationRead.toString()})(page,${JSON.stringify(base)},${inspect})`
    : `async page=>(${runManagedJavascriptGeneration.toString()})(page,${JSON.stringify({...base, gesture_id, expected})},${inspect})`;
}
