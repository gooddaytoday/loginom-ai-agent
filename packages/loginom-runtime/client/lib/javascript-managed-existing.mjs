import {randomUUID} from 'node:crypto';
import {makeJavascriptManagedSelectionReadCode, dispatchManagedJavascriptBody, dispatchManagedJavascriptSetting} from './javascript-managed-selection.mjs';
import {waitManagedJavascriptWizardSettlement} from './javascript-managed-opening.mjs';
import {dispatchManagedJavascriptDeactivation} from './javascript-managed-deactivation.mjs';

// Host-only entry into an existing JavaScript node. The caller owns workflow
// activation and the enclosing operation gate. Keep the lease until source
// delivery has completed and the wizard has been explicitly discarded.
export async function openManagedJavascriptExistingWizard({prepared, node, deadline, targetOrigin, execute, record, receiptOptions, channel,
  onSettingPrepared = async () => {}}) {
  if (node?.document_id !== prepared?.document_id || node.workflow_id !== prepared.workflow_ref?.workflow_id
    || !Number.isSafeInteger(deadline) || deadline <= Date.now())
    throw Error('Managed JavaScript existing owner unavailable');
  const task = {operation_id: 'managed-js-' + randomUUID(),
    owner: {document_id: node.document_id, workflow_id: node.workflow_id, node_id: node.node_id},
    workflow_ref: {tab_tid: prepared.workflow_ref.tab_tid, prefix: prepared.workflow_ref.prefix},
    targetOrigin, targetBuild: '7.4.2', deadline};
  const graph = await channel.observe({condition: 'owned existing JavaScript graph before Setting',
    ready: state => state.prepared_node_context?.surface === 'graph' && state.wizard?.status === 'absent'});
  const context = graph.prepared_node_context;
  if(context?.verified!==true||context.surface!=='graph'||graph.wizard?.status!=='absent'
    ||!['document_id','workflow_id','node_id'].every(key=>context[key]===task.owner[key])
    ||typeof context.tid!=='string'||!context.tid.startsWith(task.workflow_ref.prefix+';Graph;'))
    throw Error('Managed JavaScript existing graph owner unavailable');
  const before = await execute(makeJavascriptManagedSelectionReadCode({...task, mode: 'capture'}));
  const selected = before.ready === true ? before
    : (await dispatchManagedJavascriptBody({task, before, execute, record, receiptOptions})).output?.selection;
  if (selected?.ready !== true || selected.node_tid!==context.tid || Date.now() >= deadline)
    throw Error('Managed JavaScript existing selection unconfirmed');
  const confirmation = {kind: 'deactivation', node: task.owner, graph_tid: selected.node_tid};
  const gesture = await dispatchManagedJavascriptSetting({task, before: selected, confirmation,
    execute, record, receiptOptions, onPrepared: onSettingPrepared});
  if (gesture.status !== 'SUCCEEDED') throw Error('Managed JavaScript existing Setting refused');
  const wizardTask = {...task, prepared: {document_id: prepared.document_id,
    workflow_ref: prepared.workflow_ref, node: task.owner}, allowDeactivation: true};
  const settled = await waitManagedJavascriptWizardSettlement({task: wizardTask, execute, record});
  if (settled.surface === 'deactivation') {
    const result = await dispatchManagedJavascriptDeactivation({task: wizardTask, execute, record, receiptOptions});
    if (result.status !== 'SUCCEEDED' || result.output?.deactivation_gesture_returned !== true)
      throw Error('Managed JavaScript existing deactivation refused');
  }
  const opened = settled.surface === 'wizard' ? settled
    : await waitManagedJavascriptWizardSettlement({task: {...wizardTask, allowDeactivation: false}, execute, record});
  if (opened.surface !== 'wizard' || opened.native_owner_verified !== true || Date.now() >= deadline)
    throw Error('Managed JavaScript existing wizard unconfirmed');
  return {task: wizardTask, opened};
}
