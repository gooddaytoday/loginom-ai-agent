import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createRedactor } from './redact.mjs';

// The caller awaits this record before applying a mutation. This is independent
// of native transcript capture, which may arrive after the browser response.
export function createExecutionJournal({ directory, metadata, knownSecrets = [] }, { openFile = open } = {}) {
  const path = join(directory, 'execution-events.jsonl');
  const redactor = createRedactor(knownSecrets);
  let pending = Promise.resolve();
  const enqueue = write => {
    const next = pending.then(write);
    pending = next.catch(() => {});
    return next;
  };
  const write = async (records, signal, pair = false) => {
    signal?.throwIfAborted();
    // Prime both records before either line can reach disk. A completed
    // payload must not reveal a secret already present in its sample.
    if(pair)try { for(const record of records)redactor.prime(record); }
    catch { throw new Error('Execution evidence could not be redacted'); }
    const cleaned = records.map(record => redactor.redact({
      recorded_at: new Date().toISOString(), session_id: metadata.sessionId,
      runtime_revision: metadata.clientRevision,
      manifest_sha256: metadata.actionManifestDigest,
      target: metadata.targetIdentity ?? null, ...record,
    }));
    if(pair && cleaned.some(r=>r.type==='redaction_failure'))throw new Error('Execution evidence could not be redacted');
    const lines=cleaned.map(r=>JSON.stringify(r)+'\n');
    signal?.throwIfAborted();
    const handle = await openFile(path,
      constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      for(const line of lines) {
        signal?.throwIfAborted();
        await handle.writeFile(line);
      }
      signal?.throwIfAborted();
      await handle.sync();
    } finally { await handle.close(); }
    signal?.throwIfAborted();
    if (cleaned.some(r=>r.type==='redaction_failure')) throw new Error('Execution evidence could not be redacted');
    return cleaned;
  };
  const record = async value => (await enqueue(()=>write([value])))[0];
  // Private capability, not a general batch API or a CLI/model parameter.
  // Failures may leave unacknowledged forensic bytes; never erase that tail.
  Object.defineProperty(record,'observationPair',{value:async (sample,completed,{signal}={})=>{
    if(sample?.phase!=='node_observation_sample'||completed?.phase!=='node_observation_completed'
      || sample.internal_provenance!=='client_node_procedure_v1'
      || !Number.isInteger(sample.step)||sample.step<1||!Number.isInteger(sample.sample)||sample.sample<0||sample.readiness?.satisfied!==true
      || sample.readiness.policy!=='semantic_condition_v2'
      || ![1,2].includes(sample.readiness.required_samples)
      || !Number.isFinite(sample.readiness.elapsed_ms)||sample.readiness.elapsed_ms<0
      || !Number.isFinite(sample.readiness.timeout_ms)||sample.readiness.timeout_ms>15000
      || sample.readiness.elapsed_ms>=sample.readiness.timeout_ms
      || !sample.outcome?.output||!completed.outcome?.output
      || ['operation_id','action_key','action_revision','internal_provenance','step','internal_operation_id'].some(k=>sample[k]===undefined||sample[k]!==completed[k])
      || JSON.stringify(sample.readiness)!==JSON.stringify(completed.readiness)
      || JSON.stringify(sample.outcome)!==JSON.stringify(completed.outcome))throw new Error('Only a matching admitting observation pair is allowed');
    const records=structuredClone([sample,completed]);
    return enqueue(()=>write(records,signal,true));
  }});
  return record;
}
