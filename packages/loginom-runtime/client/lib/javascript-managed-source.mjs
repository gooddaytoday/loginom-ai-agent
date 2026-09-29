import {readPreparedNodeContext} from './node-context.mjs';
import {readJavascriptSourceBrowser, readJavascriptSourceContext} from './javascript-source-context.mjs';
import {makeJavascriptManagedWizardSettlementCode} from './javascript-managed-opening.mjs';

// The retained selection lease binds every source read to one actual editor.
// Reconstructed context alone can accept a newly mounted CodeMirror with the
// same node ID; a writer must never treat that as the original draft.
export function inspectManagedJavascriptSourceEditor({held, editor, task, capture = false,
  requireInputFocus = false, locate = false, selectionCheck = false}) {
  const fail = message => { throw Error('Managed JavaScript editor ' + message); };
  const visible = element => !!element?.isConnected && element.getBoundingClientRect().width > 0
    && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
  const preparation = globalThis.__loginomDockPreparationV1;
  const app = globalThis.bg?.app;
  const form = app?.Application?.FInstance?.FMainForm;
  const tab = form?.Items?.Workspace?.getActiveTab?.();
  const native = tab?.Controller?.Node?.data?.node;
  const model = tab?.Controller?.FController;
  const root = model?.FView?.el?.dom;
  if (preparation !== held.preparation || preparation?.document !== document
    || preparation.id !== task.owner.document_id || form?.FMapTree?.FServerConnection?.UserName !== held.account
    || app?.Version !== task.targetBuild || location.origin !== task.targetOrigin
    || ![...(preparation.receipts?.values() ?? [])].includes(held.receipt)
    || held.receipt.phase !== 'verified' || held.receipt.workflowId !== task.owner.workflow_id
    || held.receipt.nodeTargetWorkflowNode !== held.binding.workflow
    || tab !== held.binding.tab || native !== held.wizard || root !== held.wizardRoot
    || native?.ParentNode?.FGuid !== task.owner.node_id
    || model?.FModelNode !== held.binding.nodeData || !visible(root)) fail('owner changed');
  const pages = [...root.querySelectorAll('[data-tid=' + JSON.stringify(task.workflow_ref.prefix + ';WizrdMCF;JavaScriptCodeWizard') + ']')].filter(visible);
  const wrappers = [...root.querySelectorAll('.CodeMirror')].filter(visible);
  if (pages.length !== 1 || wrappers.length !== 1 || !pages[0].contains(wrappers[0])
    || [...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible))
    fail('page changed');
  const wrapper = wrappers[0], cm = wrapper.CodeMirror, doc = cm?.getDoc?.(), input = cm?.getInputField?.();
  if (!doc || !input?.isConnected || !wrapper.contains(input) || !root.contains(input)
    || cm.getWrapperElement?.() !== wrapper || cm.getOption?.('readOnly') !== false
    || input.disabled === true || input.readOnly === true) fail('binding changed');
  if (editor && (editor.document !== document || editor.tab !== tab || editor.native !== native
    || editor.model !== model || editor.root !== root || editor.page !== pages[0]
    || editor.wrapper !== wrapper || editor.cm !== cm || editor.doc !== doc
    || editor.input !== input || (requireInputFocus ? document.activeElement !== input
      : editor.focus !== document.activeElement))) fail('identity changed');
  const count = doc.lineCount?.();
  if (!Number.isSafeInteger(count) || count < 1 || count > 1024
    || doc.firstLine?.() !== 0 || doc.lastLine?.() !== count - 1) fail('lines changed');
  const lines = []; let bytes = 0;
  for (let index = 0; index < count; index++) {
    const line = doc.getLine(index);
    if (typeof line !== 'string' || /[\r\n\0]/u.test(line) || !line.isWellFormed()) fail('characters changed');
    bytes += new TextEncoder().encode(line).length + (index ? 1 : 0);
    if (bytes > 32768) fail('bytes changed');
    lines.push(line);
  }
  if (capture) return {document, tab, native, model, root, page: pages[0], wrapper, cm, doc, input,
    focus: document.activeElement};
  if (!editor) fail('retained identity required');
  const source = lines.join('\n');
  if (locate) {
    if (requireInputFocus || selectionCheck) fail('point state changed');
    const bounds = wrapper.getBoundingClientRect();
    const x = bounds.x + Math.min(35, bounds.width / 2);
    const y = bounds.y + Math.min(15, bounds.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !hit || !wrapper.contains(hit))
      fail('point covered');
    return {source, source_utf8_bytes: bytes, source_lf_lines: count, point: {x, y}};
  }
  if (selectionCheck) {
    if (!requireInputFocus || typeof doc.getSelection !== 'function') fail('selection unavailable');
    return {source, source_utf8_bytes: bytes, source_lf_lines: count,
      selection_full: doc.getSelection() === source};
  }
  return {source, source_utf8_bytes: bytes, source_lf_lines: count};
}

// The source stays in the trusted host response. A caller must pass it through
// the owned source reader's full redaction and chunk admission before delivery.
export async function readManagedJavascriptSource(page, task, readSource = readJavascriptSourceContext,
  inspectEditor = inspectManagedJavascriptSourceEditor) {
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
  if (!lease.sourceEditorCaptured) {
    lease.sourceEditorCaptured = await page.evaluateHandle(inspectEditor,
      {held: lease.handle, editor: null, task, capture: true});
  }
  const before = await page.evaluate(inspectEditor,
    {held: lease.handle, editor: lease.sourceEditorCaptured, task,
      requireInputFocus: lease.sourceWriteAttempted === true});
  const result = await readSource(page, task.prepared, held.account);
  if (result.verified !== true || result.node_context?.verified !== true
    || result.node_context.surface !== 'wizard'
    || !['document_id', 'workflow_id', 'node_id'].every(key => result.node_context[key] === task.owner[key])
    || result.source !== before.source || result.source_utf8_bytes !== before.source_utf8_bytes
    || result.source_lf_lines !== before.source_lf_lines || Date.now() >= task.deadline)
    throw Error('Managed JavaScript source owner changed');
  const after = await page.evaluate(inspectEditor,
    {held: lease.handle, editor: lease.sourceEditorCaptured, task,
      requireInputFocus: lease.sourceWriteAttempted === true});
  if (JSON.stringify(after) !== JSON.stringify(before))
    throw Error('Managed JavaScript source editor changed during read');
  lease.sourceBaseline = result.source;
  return result;
}

export function makeJavascriptManagedSourceCode(task) {
  makeJavascriptManagedWizardSettlementCode(task);
  return `async page=>(${readManagedJavascriptSource.toString()})(page,${JSON.stringify(task)},`+
    `async (page,prepared,account)=>(${readJavascriptSourceContext.toString()})(page,prepared,account,`+
    `${readPreparedNodeContext.toString()},${readJavascriptSourceBrowser.toString()}),`+
    `${inspectManagedJavascriptSourceEditor.toString()})`;
}
