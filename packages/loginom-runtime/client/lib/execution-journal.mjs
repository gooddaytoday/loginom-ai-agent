import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createRedactor } from './redact.mjs';

// Private process-local evidence: never serialized into the acknowledged record.
const acknowledgements = new WeakMap();
export const executionJournalAcknowledgement = record => acknowledgements.get(record);

// The caller awaits this record before applying a mutation. This is independent
// of native transcript capture, which may arrive after the browser response.
export function createExecutionJournal({ directory, metadata, knownSecrets = [],
  io = { open }, monotonicNow = () => performance.now() }) {
  const path = join(directory, 'execution-events.jsonl');
  const redactor = createRedactor(knownSecrets);
  let pending = Promise.resolve();
  return async record => {
    const origin = monotonicNow(), timing = { queued_ms: 0 };
    const mark = phase => { timing[phase] = monotonicNow() - origin; };
    const write = async () => {
      mark('dequeued_ms');
      const cleaned = redactor.redact({
        recorded_at: new Date().toISOString(), session_id: metadata.sessionId,
        runtime_revision: metadata.clientRevision,
        manifest_sha256: metadata.actionManifestDigest,
        target: metadata.targetIdentity ?? null, ...record,
      });
      mark('redacted_ms');
      const bytes = JSON.stringify(cleaned) + '\n';
      mark('serialized_ms');
      mark('open_started_ms');
      const handle = await io.open(path,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
      mark('opened_ms');
      let failure;
      try {
        mark('write_started_ms');
        await handle.writeFile(bytes);
        mark('written_ms');
        mark('sync_started_ms');
        await handle.sync();
        mark('synced_ms');
      } catch (error) { failure = { error }; }
      // Cleanup must not replace the first rejected value, including falsy values.
      try {
        mark('close_started_ms');
        await handle.close();
        mark('closed_ms');
      } catch (error) { failure ??= { error }; }
      if (failure) throw failure.error;
      if (cleaned.type === 'redaction_failure') throw new Error('Execution evidence could not be redacted');
      mark('acknowledged_ms');
      acknowledgements.set(cleaned, Object.freeze({ ...timing }));
      return cleaned;
    };
    const next = pending.then(write);
    pending = next.catch(() => {});
    return next;
  };
}
