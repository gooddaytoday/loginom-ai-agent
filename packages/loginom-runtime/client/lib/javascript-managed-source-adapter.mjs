import {openManagedJavascriptExistingWizard} from './javascript-managed-existing.mjs';
import {dispatchManagedJavascriptNext, dispatchManagedJavascriptGeneration} from './javascript-managed-next.mjs';
import {makeJavascriptManagedPageCode} from './javascript-managed-page.mjs';
import {makeJavascriptManagedSourceCode} from './javascript-managed-source.mjs';
import {closeManagedJavascriptWizard} from './javascript-managed-close.mjs';
import {makeJavascriptManagedSelectionReadCode} from './javascript-managed-selection.mjs';
import {makeJavascriptSchemaContextCode} from './javascript-schema-context.mjs';
import {makeJavascriptExistingGraphTypeCode} from './javascript-existing-type.mjs';
import {replaceManagedJavascriptSource} from './javascript-managed-source-write.mjs';
import {dispatchManagedJavascriptCodeNext} from './javascript-managed-code-next.mjs';
import {dispatchManagedJavascriptDone} from './javascript-managed-done.mjs';
import {dispatchManagedJavascriptDeclared,validateJavascriptDeclaredPrimitiveColumns} from './javascript-managed-declared.mjs';
import {javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';

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
  openingBudgetMs = 90000,
  driver = {openManagedJavascriptExistingWizard, dispatchManagedJavascriptNext, dispatchManagedJavascriptGeneration,
    dispatchManagedJavascriptCodeNext, dispatchManagedJavascriptDone, dispatchManagedJavascriptDeclared,
    closeManagedJavascriptWizard, makeJavascriptManagedPageCode, makeJavascriptManagedSourceCode,
    makeJavascriptManagedSelectionReadCode, makeJavascriptSchemaContextCode,
    makeJavascriptExistingGraphTypeCode, replaceManagedJavascriptSource}}) {
  need(page && prepared?.document_id === node?.document_id
    && prepared.workflow_ref?.workflow_id === node.workflow_id && node.node_id
    && Number.isSafeInteger(uiEpoch) && uiEpoch >= 0
    && Number.isSafeInteger(deadline) && deadline > Date.now()
    && typeof targetOrigin === 'string' && targetOrigin.length > 0
    && typeof execute === 'function' && typeof record === 'function'
    && typeof receiptOptions === 'function' && typeof channel === 'function',
  'Managed JavaScript source adapter dependencies unavailable');
  need(Number.isSafeInteger(openingBudgetMs) && openingBudgetMs >= 1 && openingBudgetMs <= 180000,
    'Managed JavaScript opening budget unavailable');
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
    async open({owner, deadline: operationDeadline, schemaMode = 'preserve', columns}) {
      check(owner, operationDeadline);
      need(['preserve', 'code', 'declared'].includes(schemaMode), 'Managed JavaScript schema mode unavailable');
      if(schemaMode==='declared')validateJavascriptDeclaredPrimitiveColumns(columns);
      if(schemaMode!=='declared')need(columns===undefined,'Managed JavaScript unexpected columns');
      need(active === null, 'Managed JavaScript source wizard already open');
      const type = await execute(driver.makeJavascriptExistingGraphTypeCode({document_id: prepared.document_id,
        workflow_ref: prepared.workflow_ref, node}));
      need(type?.verified === true && type.node_id === node.node_id
        && type.icon_class === 'bg-vendor-icon-javascript',
      'Managed JavaScript source node type unconfirmed');
      // An ambiguous opening is terminal: a second Setting could edit a draft.
      uncertain = true;
      const openingDeadline = Math.min(deadline, Date.now() + openingBudgetMs);
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
      const generation = schemaMode === 'code'
        ? await driver.dispatchManagedJavascriptGeneration({task, execute, record, receiptOptions}) : null;
      if (generation) need(generation.status === 'SUCCEEDED'
        && generation.output?.generation_readback_verified === true
        && generation.output.schema?.generation?.checked === true,
      'Managed JavaScript generation transition unconfirmed');
      const declared=schemaMode==='declared'
        ?await driver.dispatchManagedJavascriptDeclared({task,columns,execute,record,receiptOptions}):null;
      if(declared)need(declared.verified===true&&declared.generation===false,
        'Managed JavaScript declared schema unconfirmed');
      const settings = javascriptManagedSourceSettings(declared?.schema??generation?.output.schema??schema);
      // Private bounded metadata evidence identifies native normalization across
      // Done/reopening. It contains no script and never relaxes drift checks.
      const observed = {phase: 'javascript_managed_source_settings_observed',
        operation_id: owner.operation_id, owner: {...owner}, schema_mode: schemaMode,
        settings: structuredClone(settings), settings_sha256: javascriptSourceSettingsDigest(settings),
        effect_possible: false};
      const saved = await record(structuredClone(observed));
      need(same(Object.fromEntries(Object.keys(observed).map(key => [key, saved?.[key]])), observed),
        'Managed JavaScript source settings journal ACK differs');
      need(Date.now() < operationDeadline, 'Managed JavaScript source deadline changed');
      const next = await driver.dispatchManagedJavascriptNext({task, execute, record, receiptOptions});
      need(next?.status === 'SUCCEEDED' && next.output?.next_gesture_returned === true,
        'Managed JavaScript source Next refused');
      await codePage(task);
      active = {task, owner: {...owner}, settings,
        ...(declared?{declaredColumns:structuredClone(declared.columns)}:{})};
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
    async replace(handle, {owner, deadline: operationDeadline, expected_source_sha256, source_text}) {
      check(owner, operationDeadline);
      need(active === handle && same(handle.owner, owner) && handle.writeAttempted !== true,
        'Managed JavaScript source write handle changed or already used');
      handle.writeAttempted = true;
      const written = await driver.replaceManagedJavascriptSource({task: handle.task, handle, owner,
        deadline: operationDeadline, expected_source_sha256, source_text,
        read: (sourceHandle, request) => this.read(sourceHandle, request),
        execute, record, receiptOptions, markUncertain: value => { uncertain = value; }});
      need(written?.draft_exact === true && /^[a-f0-9]{64}$/.test(written.source_sha256),
        'Managed JavaScript source replacement digest unavailable');
      handle.draftSha256 = written.source_sha256;
      return written;
    },
    async commit(handle, {owner, deadline: operationDeadline}) {
      check(owner, operationDeadline);
      need(active === handle && same(handle.owner, owner) && handle.writeAttempted === true
        && /^[a-f0-9]{64}$/.test(handle.draftSha256) && handle.commitAttempted !== true,
        'Managed JavaScript commit handle unavailable or already used');
      handle.commitAttempted = true;
      uncertain = true;
      const next = await driver.dispatchManagedJavascriptCodeNext({task: handle.task,
        expected_source_sha256: handle.draftSha256, execute, record, receiptOptions});
      need(next?.status === 'SUCCEEDED' && next.output?.next_gesture_returned === true
        && next.output.transition_verified === false, 'Managed JavaScript Code Next unconfirmed');
      let donePage = null;
      while (Date.now() < handle.task.deadline) {
        const current = await execute(driver.makeJavascriptManagedPageCode(handle.task)).catch(error => {
          if (error?.message === 'Managed JavaScript page not ready') return null;
          throw error;
        });
        if (current?.ready === true) {
          need(current.node_guid === node.node_id && current.page?.indicator_count === 4,
            'Managed JavaScript Done page owner changed');
          if (current.page.tid === handle.task.workflow_ref.prefix + ';WizrdMCF;DoneWizard'
            && current.page.index === 3 && current.page.visible_editors === 0) {
            donePage = current; break;
          }
          need([1,2].includes(current.page.index), 'Managed JavaScript unexpected page after Code Next');
        }
        await wait(Math.min(100, Math.max(1, handle.task.deadline - Date.now())));
      }
      need(donePage !== null && Date.now() < handle.task.deadline,
        'Managed JavaScript Done page original deadline expired');
      const done = await driver.dispatchManagedJavascriptDone({task: handle.task,
        expected_source_sha256: handle.draftSha256, execute, record, receiptOptions});
      need(done?.status === 'SUCCEEDED' && done.output?.done_gesture_returned === true
        && done.output.wizard_commit_verified === false && done.output.execution_started === null,
        'Managed JavaScript Done gesture unconfirmed');
      let graph = null;
      for (let attempt = 0; attempt < 60 && Date.now() < handle.task.deadline; attempt++) {
        try {
          graph = await channel(handle.task.deadline).observe({condition: 'owned JavaScript graph after Done',
            ready: state => state.prepared_node_context?.verified === true
              && state.prepared_node_context.surface === 'graph' && state.wizard?.status === 'absent'
              && ['document_id','workflow_id','node_id'].every(key =>
                state.prepared_node_context[key] === node[key])});
          break;
        } catch (error) {
          // The Done click can briefly unmount both wizard and graph. Retry
          // only this read-only transition, never a changed owner or gesture.
          if (error?.nodeObservationRefusal?.error?.code !== 'PREPARED_NODE_CONTEXT_CHANGED'
            || error.nodeObservationRefusal.binding_reason !== 'surface_unavailable') throw error;
          await wait(Math.min(250, Math.max(1, handle.task.deadline - Date.now())));
        }
      }
      need(graph?.prepared_node_context?.verified === true
        && graph.prepared_node_context.surface === 'graph' && graph.wizard?.status === 'absent'
        && ['document_id','workflow_id','node_id'].every(key => graph.prepared_node_context[key] === node[key]),
      'Managed JavaScript Done graph owner unconfirmed');
      const {prepared: ignoredPrepared, allowDeactivation: ignoredDeactivation, ...selectionTask} = handle.task;
      await execute(driver.makeJavascriptManagedSelectionReadCode({...selectionTask, mode: 'dispose'}));
      active = null;
      uncertain = false;
      return {graph_owner_verified: true, owned_done_settled: true,
        done_gesture_returned: true, execution_started: null, explicit_execute_requested: false,
        source_sha256: handle.draftSha256};
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
