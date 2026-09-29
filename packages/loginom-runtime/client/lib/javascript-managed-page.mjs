import {makeJavascriptManagedWizardSettlementCode} from './javascript-managed-opening.mjs';
import {wizardReadiness} from './javascript-wizard-page.mjs';

// The retained selection lease supplies the same native graph objects to the
// operator-proven wizard inspector. No source text or browser mutation is read.
export function inspectManagedJavascriptPage({held, task, afterIndex = null, afterPageTid = null}, inspect) {
  const preparation = globalThis.__loginomDockPreparationV1;
  const account = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName;
  if (preparation !== held.preparation || preparation?.document !== document
    || preparation.id !== task.owner.document_id || account !== held.account
    || ![...(preparation.receipts?.values() ?? [])].includes(held.receipt)
    || held.receipt.phase !== 'verified' || held.receipt.workflowId !== task.owner.workflow_id
    || held.receipt.nodeTargetWorkflowNode !== held.binding.workflow)
    throw Error('Managed JavaScript page preparation changed');
  const binding = held.wizardBinding ??= {...held.binding, ...held.retained};
  return inspect({prefix: task.workflow_ref.prefix, owned: held.receipt.packageNode,
    account: held.account, id: task.owner.node_id, binding, addressEpoch: 0,
    expectedWizard: held.wizard ?? null, expectedRoot: held.wizardRoot ?? null,
    inspect: true, inputOnly: false, afterIndex, afterPageTid});
}

export async function runManagedJavascriptPageRead(page, task, inspect) {
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true || Date.now() >= task.deadline)
    throw Error('Managed JavaScript page lease unavailable');
  const result = await page.evaluate(inspect, {held: lease.handle, task});
  if (result.ready !== true || result.page?.visible_editors > 1) throw Error('Managed JavaScript page not ready');
  if (!lease.wizardCaptured) {
    const held = await page.evaluateHandle(({retained, request}) => {
      const tab = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
      const wizard = tab?.Controller?.Node?.data?.node;
      const root = tab?.Controller?.FController?.FView?.el?.dom;
      if (tab !== retained.binding.tab || wizard?.ParentNode?.FGuid !== request.owner.node_id
        || root?.getAttribute?.('data-tid') !== request.workflow_ref.prefix + ';WizrdMCF')
        throw Error('Managed JavaScript page native capture changed');
      return {wizard, root};
    }, {retained: lease.handle, request: task});
    lease.wizardCaptured = held;
    await page.evaluate(({retained, capture}) => {
      retained.wizard = capture.wizard;
      retained.wizardRoot = capture.root;
    }, {retained: lease.handle, capture: held});
  }
  const after = await page.evaluate(inspect, {held: lease.handle, task});
  if (after.ready !== true || JSON.stringify(after.page) !== JSON.stringify(result.page))
    throw Error('Managed JavaScript page changed during capture');
  return after;
}

export function makeJavascriptManagedPageCode(task) {
  makeJavascriptManagedWizardSettlementCode(task);
  const inspect = `function inspect(args){const native=${wizardReadiness.toString()};`+
    `return (${inspectManagedJavascriptPage.toString()})(args,native);}`;
  return `async page=>(${runManagedJavascriptPageRead.toString()})(page,${JSON.stringify(task)},${inspect})`;
}
