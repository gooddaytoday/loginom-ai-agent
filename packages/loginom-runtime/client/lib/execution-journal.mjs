import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createRedactor } from './redact.mjs';

// The caller awaits this record before applying a mutation. This is independent
// of native transcript capture, which may arrive after the browser response.
export function createExecutionJournal({ directory, metadata, knownSecrets = [] }) {
  const path = join(directory, 'execution-events.jsonl');
  const redactor = createRedactor(knownSecrets);
  let pending = Promise.resolve();
  return async record => {
    const write = async () => {
      const cleaned = redactor.redact({
        recorded_at: new Date().toISOString(), session_id: metadata.sessionId,
        runtime_revision: metadata.clientRevision,
        manifest_sha256: metadata.actionManifestDigest,
        target: metadata.targetIdentity ?? null, ...record,
      });
      const handle = await open(path,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
      try {
        await handle.writeFile(JSON.stringify(cleaned) + '\n');
        await handle.sync();
      } finally { await handle.close(); }
      if (cleaned.type === 'redaction_failure') throw new Error('Execution evidence could not be redacted');
      return cleaned;
    };
    const next = pending.then(write);
    pending = next.catch(() => {});
    return next;
  };
}
