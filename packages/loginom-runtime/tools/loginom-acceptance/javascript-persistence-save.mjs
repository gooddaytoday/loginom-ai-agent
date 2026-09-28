import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

// Private operator scope only. Never broaden the shipped save catalog.
export function javascriptPersistenceSaveAction(action, storage) {
  requireStorage(storage);
  if (action?.action_key !== 'package.save_checkpoint') throw Error('Persistence save scope refused');
  const scoped = structuredClone(action);
  if (scoped.effect?.kind !== 'persist' || scoped.effect.resource !== 'package')
    throw Error('Persistence save effect differs');
  scoped.effect.allowed_roots = [storage];
  return scoped;
}

// Owns exactly two writes to one new destination. A lost reply or failed
// continuation check retires the writer; it cannot authorize replacement.
export function createJavascriptPersistenceSaver({runtime, storage, prepared, deadline, record}) {
  requireStorage(storage);
  if (prepared?.status !== 'READY' || prepared.package_ref?.persisted !== false
    || typeof prepared.document_id !== 'string' || !prepared.document_id
    || !Number.isSafeInteger(deadline) || deadline <= Date.now()) throw Error('Persistence draft admission refused');
  const documentId = prepared.document_id;
  let workflow = structuredClone(prepared.workflow_ref);
  requireWorkflow(workflow);
  const path = storage + '/JavaScript-' + randomUUID() + '.lgp';
  let next = 1;
  return {
    path,
    async save(revision) {
      if (revision !== next || ![1, 2].includes(revision)) throw Error('Persistence save order or uncertain prior write');
      if (Date.now() >= deadline) throw Error('Persistence original deadline expired');
      next = null; // Reserve before any await, including the evidence writer.
      const previous = structuredClone(workflow);
      const operationId = 'js-persistence-save-' + revision + '-' + randomUUID();
      const parameters = {path, conflict_policy: revision === 1 ? 'fail' : 'replace'};
      await record({phase: 'persistence_save_reserved', revision, operation_id: operationId,
        document_id: documentId, workflow_ref: structuredClone(previous), parameters: {...parameters}, deadline});
      if (Date.now() >= deadline) throw Error('Persistence original deadline expired');
      const receipt = structuredClone(await runtime.run('package.save_checkpoint', parameters,
        {operationId, deadlineAt: deadline, signal: AbortSignal.timeout(deadline - Date.now())}));
      if (Date.now() >= deadline || receipt.status !== 'SUCCEEDED' || receipt.operation_id !== operationId
        || receipt.action_key !== 'package.save_checkpoint' || receipt.phase !== 'verified' || receipt.error != null
        || receipt.output?.save_completed !== true || receipt.output.reopened !== false
        || receipt.output.workflow_preserved !== true || receipt.output.package_ref?.path !== path
        || receipt.output.package_ref?.active_identity !== path)
        throw Error('Persistence save receipt unconfirmed');
      const matches = receipt.output.workflow_continuations?.filter(item => item.document_id === documentId
        && isDeepStrictEqual(item.previous_workflow_ref, previous));
      if (matches?.length !== 1) throw Error('Persistence exact workflow continuation unavailable');
      const continued = structuredClone(matches[0].workflow_ref);
      requireWorkflow(continued);
      if (continued.workflow_id !== previous.workflow_id || continued.tab_tid !== previous.tab_tid
        || continued.prefix !== previous.prefix) throw Error('Persistence workflow identity changed');
      const result = {revision, path, document_id: documentId, workflow_ref: continued, receipt};
      // Do not claim cold content verification or clean dirty state from Save As.
      await record({phase: 'persistence_save_confirmed', ...structuredClone(result)});
      if (Date.now() >= deadline) throw Error('Persistence original deadline expired');
      workflow = structuredClone(continued);
      next = revision + 1;
      return result;
    },
  };
}

function requireStorage(storage) {
  if (typeof storage !== 'string'
    || !/^\/jsteach\/js-g2-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(storage))
    throw Error('Persistence save scope refused');
}

function requireWorkflow(workflow) {
  if (!workflow || ['workflow_id', 'tab_tid', 'prefix'].some(key => typeof workflow[key] !== 'string' || !workflow[key])
    || !Array.isArray(workflow.navigation_path) || !workflow.navigation_path.length
    || workflow.navigation_path.some(part => !part || ['tid', 'label'].some(key => typeof part[key] !== 'string' || !part[key])))
    throw Error('Persistence workflow reference incomplete');
}
