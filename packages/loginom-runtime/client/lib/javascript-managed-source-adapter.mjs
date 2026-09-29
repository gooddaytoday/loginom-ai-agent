import {openManagedJavascriptExistingWizard} from './javascript-managed-existing.mjs';
import {dispatchManagedJavascriptNext} from './javascript-managed-next.mjs';
import {makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {makeJavascriptManagedSourceCode} from './javascript-managed-source.mjs';
import {closeManagedJavascriptWizard} from './javascript-managed-close.mjs';
import {makeJavascriptManagedSelectionReadCode} from './javascript-managed-selection.mjs';
import {makeJavascriptSchemaContextCode} from './javascript-schema-context.mjs';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const need = (condition, message) => { if (!condition) throw Error(message); };

// Native record IDs are transient across wizard openings. Preserve the complete
// semantic grid values, including order, so source admission can detect drift.
export function javascriptManagedSourceSettings(schema) {
  need(schema?.verified === true && typeof schema.generation?.checked === 'boolean'
    && Array.isArray(schema.grids) && schema.grids.every(grid => typeof grid.tid === 'string'
      && Array.isArray(grid.fields)), 'Managed JavaScript source settings unavailable');
  return {generation: schema.generation.checked, grids: schema.grids.map(grid => ({
    tid: grid.tid, fields: grid.fields.map(({record_id, connected_record_id, connected_back_id, ...field}) => field)
  }))};
}

// Host-only adapter for createJavascriptSourceReader/Admission. The caller owns
// the graph/workflow gate, and supplies trusted browser execution and journaling.
// No model-provided script, navigation target, or executable callback enters it.
export function createJavascriptManagedSourceAdapter({page, prepared, node, uiEpoch, deadline, targetOrigin,
  execute, record, receiptOptions, channel, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  driver = {openManagedJavascriptExistingWizard, dispatchManagedJavascriptNext,
    closeManagedJavascriptWizard, makeJavascriptManagedPageCode, makeJavascriptManagedSourceCode,
    makeJavascriptManagedSelectionReadCode, makeJavascriptSchemaContextCode}}) {
  need(page && prepared?.document_id === node?.document_id
    && prepared.workflow_ref?.workflow_id === node.workflow_id && node.node_id
    && Number.isSafeInteger(uiEpoch) && uiEpoch >= 0
    && Number.isSafeInteger(deadline) && deadline > Date.now()
    && typeof targetOrigin === 'string' && targetOrigin.length > 0
    && typeof execute === 'function' && typeof record === 'function'
    && typeof receiptOptions === 'function' && typeof channel === 'function',
  'Managed JavaScript source adapter dependencies unavailable');
  const expectedOwner = {document_id: node.document_id, workflow_id: node.workflow_id,
    node_id: node.node_id, ui_epoch: uiEpoch};
  let active = null, uncertain = false;
  const check = (owner, operationDeadline) => {
    need(!uncertain && owner && same(Object.keys(owner).sort(),
      ['document_id', 'node_id', 'operation_id', 'ui_epoch', 'workflow_id'])
      && same(Object.fromEntries(Object.entries(owner).filter(([key]) => key !== 'operation_id')),
      expectedOwner) && typeof owner.operation_id === 'string' && owner.operation_id.length > 0,
    'Managed JavaScript source owner changed');
    need(Number.isSafeInteger(operationDeadline) && operationDeadline === deadline && Date.now() < deadline,
      'Managed JavaScript source deadline changed');
  };
  const codePage = async task => {
    while (Date.now() < task.deadline) {
      const observed = await execute(driver.makeJavascriptManagedPageCode(task)).catch(error => {
        if (error?.message === 'Managed JavaScript page not ready') return null;
        throw error;
      });
      if (observed?.ready === true) {
        need(observed.node_guid === node.node_id, 'Managed JavaScript Code page owner changed');
        if (observed.page?.tid === task.workflow_ref.prefix + ';WizrdMCF;JavaScriptCodeWizard') {
          need(observed.page.visible_editors === 1, 'Managed JavaScript Code editor unavailable');
          return;
        }
        need(observed.page?.tid === task.workflow_ref.prefix + ';WizrdMCF;JavaScriptColumnsWizard'
          && observed.page.index === 0, 'Managed JavaScript Code page changed');
      }
      await wait(Math.min(100, Math.max(1, task.deadline - Date.now())));
    }
    throw Error('Managed JavaScript Code page original deadline expired');
  };
  return {
    async open({owner, deadline: operationDeadline}) {
      check(owner, operationDeadline);
      need(active === null, 'Managed JavaScript source wizard already open');
      // An ambiguous opening is terminal: a second Setting could edit a draft.
      uncertain = true;
      const openingDeadline = Math.min(deadline, Date.now() + 90000);
      const opened = await driver.openManagedJavascriptExistingWizard({prepared, node, deadline: openingDeadline,
        targetOrigin, execute, record, receiptOptions, channel: channel(openingDeadline)});
      const task = opened.task;
      need(same(task.owner, {document_id: node.document_id, workflow_id: node.workflow_id, node_id: node.node_id}),
        'Managed JavaScript opened another node');
      const schema = await execute(driver.makeJavascriptSchemaContextCode(task.prepared));
      need(schema?.verified === true && schema.node_context?.verified === true
        && schema.node_context.surface === 'wizard'
        && ['document_id', 'workflow_id', 'node_id'].every(key => schema.node_context[key] === task.owner[key]),
      'Managed JavaScript source schema owner changed');
      const settings = javascriptManagedSourceSettings(schema);
      const next = await driver.dispatchManagedJavascriptNext({task, execute, record, receiptOptions});
      need(next?.status === 'SUCCEEDED' && next.output?.next_gesture_returned === true,
        'Managed JavaScript source Next refused');
      await codePage(task);
      active = {task, owner: {...owner}, settings};
      uncertain = false;
      return active;
    },
    async read(handle, {owner, deadline: operationDeadline}) {
      check(owner, operationDeadline);
      need(active === handle && same(handle.owner, owner), 'Managed JavaScript source handle changed');
      const observed = await execute(driver.makeJavascriptManagedSourceCode(handle.task));
      need(observed?.verified === true && observed.node_context?.verified === true
        && observed.node_context.surface === 'wizard'
        && ['document_id', 'workflow_id', 'node_id'].every(key => observed.node_context[key] === handle.task.owner[key])
        && typeof observed.source === 'string', 'Managed JavaScript source owner changed');
      return {owner: {...owner}, source: observed.source, settings: structuredClone(handle.settings)};
    },
    async discard(handle, {owner, deadline: operationDeadline}) {
      check(owner, operationDeadline);
      need(active === handle && same(handle.owner, owner), 'Managed JavaScript source handle changed');
      // The reader calls discard once after its third full read. Never retry an
      // uncertain Close/Yes result, even if the caller repeats discard.
      uncertain = true;
      const cleanupDeadline = Math.min(deadline, Date.now() + 60000);
      const closed = await driver.closeManagedJavascriptWizard({task: {...handle.task, cleanup_deadline: cleanupDeadline},
        execute, record, receiptOptions});
      need(closed?.verified === true && closed.closed === true && closed.node_id === node.node_id,
        'Managed JavaScript source discard unconfirmed');
      const {prepared: ignoredPrepared, allowDeactivation: ignoredDeactivation, ...selectionTask} = handle.task;
      await execute(driver.makeJavascriptManagedSelectionReadCode({...selectionTask, mode: 'dispose'}));
      active = null;
      uncertain = false;
      return {closed: true, owner: {...owner}};
    },
    get uncertain() { return uncertain; },
    get active() { return active !== null; }
  };
}
