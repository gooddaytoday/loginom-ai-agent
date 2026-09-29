import {readPreparedNodeContext} from './node-context.mjs';
import {readJavascriptSourceBrowser, readJavascriptSourceContext} from './javascript-source-context.mjs';
import {makeJavascriptManagedWizardSettlementCode} from './javascript-managed-opening.mjs';

// The source stays in the trusted host response. A caller must pass it through
// the owned source reader's full redaction and chunk admission before delivery.
export async function readManagedJavascriptSource(page, task, readSource = readJavascriptSourceContext) {
  const lease = page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(task.operation_id);
  const identity = JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]);
  if (!lease || lease.identity !== identity || lease.settingAttempted !== true || Date.now() >= task.deadline)
    throw Error('Managed JavaScript source lease unavailable');
  const held = await page.evaluate(({handle, request}) => {
    const preparation = globalThis.__loginomDockPreparationV1;
    const account = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection?.UserName;
    if (preparation !== handle.preparation || preparation?.document !== document
      || preparation.id !== request.owner.document_id || account !== handle.account
      || ![...(preparation.receipts?.values() ?? [])].includes(handle.receipt)
      || handle.receipt.phase !== 'verified' || handle.receipt.workflowId !== request.owner.workflow_id
      || handle.receipt.nodeTargetWorkflowNode !== handle.binding.workflow)
      throw Error('Managed JavaScript source preparation changed');
    return {account};
  }, {handle: lease.handle, request: task});
  const result = await readSource(page, task.prepared, held.account);
  if (result.verified !== true || result.node_context?.verified !== true
    || result.node_context.surface !== 'wizard'
    || !['document_id', 'workflow_id', 'node_id'].every(key => result.node_context[key] === task.owner[key])
    || Date.now() >= task.deadline)
    throw Error('Managed JavaScript source owner changed');
  return result;
}

export function makeJavascriptManagedSourceCode(task) {
  makeJavascriptManagedWizardSettlementCode(task);
  return `async page=>(${readManagedJavascriptSource.toString()})(page,${JSON.stringify(task)},`+
    `async (page,prepared,account)=>(${readJavascriptSourceContext.toString()})(page,prepared,account,`+
    `${readPreparedNodeContext.toString()},${readJavascriptSourceBrowser.toString()}))`;
}
