// Serialized read-only boundary. Only local CodeMirror/cache access; never JS
// source evaluation, model setters, proxy reads, or editor input gestures.
export function observeJavascriptSource({context, owner, epoch, held = null, capture = false,
  requireInputFocus = false, locate = false, selectionCheck = false}) {
  const {root, native, binding, prefix} = context;
  const need = (ok, message) => { if (!ok) throw Error('Source browser: ' + message); };
  const visible = element => !!element?.isConnected && element.getBoundingClientRect().width > 0
    && element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
  const preparation = globalThis.__loginomDockPreparationV1;
  const app = globalThis.bg?.app;
  const form = app?.Application?.FInstance?.FMainForm;
  const tab = form?.Items?.Workspace?.getActiveTab?.();
  const receipts = [...(preparation?.receipts?.values() ?? [])].filter(receipt => receipt.phase === 'verified' && receipt.workflowId === owner.workflow_id);
  need(preparation?.document === document && preparation.id === owner.document_id && binding?.document === document
    && receipts.length === 1 && receipts[0].nodeTargetWorkflowNode === binding.workflow, 'prepared owner changed');
  need(app.Version === context.build && form.FMapTree.FServerConnection.UserName === context.account, 'account/build changed');
  need(tab === binding.tab && tab?.Controller?.Node?.data?.node === native && native?.FParentNode?.FParentNode === binding.workflow
    && native.FParentNode.FGuid === owner.node_id && native.FParentNode.FModelNode === binding.nodeData
    && binding.native?.FGuid === owner.node_id && binding.native.data === binding.nodeData && binding.native.FCell === binding.cell
    && tab.Controller.FController?.FModelNode === binding.nodeData && tab.Controller.FController?.FView?.el?.dom === root,
  'native owner changed');
  need(Number.isSafeInteger(epoch) && binding.wizardAddress?.epoch === epoch && binding.wizardAddress.wizard === native
    && binding.wizardAddress.node === binding.native, 'wizard epoch changed');
  const roots = [...document.querySelectorAll('[data-tid=' + JSON.stringify(prefix + ';WizrdMCF') + ']')].filter(visible);
  need(roots.length === 1 && roots[0] === root && visible(root), 'wizard root changed');
  need(![...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible), 'wizard blocked');
  const pages = [...root.querySelectorAll('[data-tid=' + JSON.stringify(prefix + ';WizrdMCF;JavaScriptCodeWizard') + ']')].filter(visible);
  need(pages.length === 1, 'code page ambiguous');
  const wrappers = [...root.querySelectorAll('.CodeMirror')].filter(visible);
  need(wrappers.length === 1, 'editor ambiguous');
  const wrapper = wrappers[0], cm = wrapper.CodeMirror, doc = cm?.getDoc?.(), input = cm?.getInputField?.();
  need(pages[0].contains(wrapper) && doc && input?.isConnected && root.contains(input) && root.contains(wrapper) && cm.getOption('readOnly') === false
    && input.disabled !== true, 'editor unavailable');
  if (held) need(held.document === document && held.root === root && held.native === native && held.tab === tab
    && held.model === tab.Controller.FController && held.binding === binding && held.wrapper === wrapper && held.cm === cm
    && held.page === pages[0] && held.doc === doc && held.input === input
    && (requireInputFocus ? document.activeElement === input : held.focus === document.activeElement) && held.epoch === epoch,
  'retained editor/focus changed');
  const count = doc.lineCount();
  need(Number.isInteger(count) && count >= 1 && count <= 1024 && doc.firstLine() === 0 && doc.lastLine() === count - 1, 'line bound');
  const lines = []; let bytes = 0;
  for (let index = 0; index < count; index++) {
    const line = doc.getLine(index);
    need(typeof line === 'string' && !/[\r\n\0]/u.test(line) && line.isWellFormed(), 'line characters');
    bytes += new TextEncoder().encode(line).length + (index ? 1 : 0);
    need(bytes <= 32768, 'byte bound'); lines.push(line);
  }
  const source = lines.join('\n');
  if (capture) return {document, root, native, binding, tab, model: tab.Controller.FController, wrapper, cm, doc, input,
    focus: document.activeElement, epoch, page: pages[0]};
  need(held, 'retained handle required');
  if (locate) {
    need(!requireInputFocus && !selectionCheck && cm.getWrapperElement?.() === wrapper && wrapper.contains(input),
      'editor point identity');
    const bounds = wrapper.getBoundingClientRect(), x = bounds.x + Math.min(35, bounds.width / 2),
      y = bounds.y + Math.min(15, bounds.height / 2);
    const hit = document.elementFromPoint(x, y);
    need(x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && !!hit && wrapper.contains(hit),
      'editor point covered');
    return {owner, source, point: {x, y}};
  }
  if (selectionCheck) {
    need(requireInputFocus && typeof doc.getSelection === 'function', 'editor selection unavailable');
    return {owner, source, selection_full: doc.getSelection() === source};
  }
  return {owner, source};
}

// Operator witness only: cache observation cannot certify hidden server effects.
export function observeJavascriptSourceProcesses({held = null, capture = false} = {}) {
  const need = (ok, message) => { if (!ok) throw Error('Source process boundary: ' + message); };
  const trees = [...document.querySelectorAll('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]')];
  need(trees.length === 1, 'tree ambiguous');
  const tree = trees[0], store = globalThis.Ext?.getCmp?.(tree.id)?.getStore?.(), root = store?.getRoot?.();
  need(store && !store.isLoading() && root?.data?.loaded === true, 'tree incomplete');
  const records = [], queue = [{record: root, parent: null}], seen = new Set();
  while (queue.length) {
    const {record, parent} = queue.shift();
    need(record && !seen.has(record) && seen.size < 2000 && record.data && !record.data.loading
      && Array.isArray(record.childNodes), 'records incomplete');
    seen.add(record);
    const scalars = Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(record.data))
      .filter(([, descriptor]) => descriptor.value === null || ['string','number','boolean'].includes(typeof descriptor.value))
      .map(([key, descriptor]) => [key, descriptor.value]));
    records.push({record, internal_id: String(record.internalId), data: record.data, parent, model: record.data.ModelNode, scalars: JSON.stringify(scalars)});
    need(queue.length + record.childNodes.length + seen.size <= 2000, 'record bound');
    queue.push(...record.childNodes.map(child => ({record: child, parent: record})));
  }
  if (held) need(held.document === document && held.tree === tree && held.store === store && held.root === root
    && held.records.length === records.length && records.every((entry, index) => {
      const previous = held.records[index];
      return ['record','internal_id','data','parent','model','scalars'].every(key => previous[key] === entry[key]);
    }), 'process history changed');
  if (capture) return {document, tree, store, root, records};
  need(held, 'retained history required');
  return {unchanged: true, record_count: records.length, provenance: 'observed local process cache', server_execution_absence_verified: false};
}
