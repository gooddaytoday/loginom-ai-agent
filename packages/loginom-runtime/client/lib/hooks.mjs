import { readFile, writeFile, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { openArchive } from './archive.mjs';
import { codexHistory, hermesHistory, hermesLineage, unwrapHermesResult } from './history.mjs';
import { privatePath } from './platform.mjs';

const digest = value => createHash('sha256').update(String(value)).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const prepareName = name => /loginom[_-]dock/.test(name || '') && /(?:__|_)dock_prepare$/.test(name || '');

export function preparation(value, depth = 0) {
  if (depth > 8 || value?.isError === true) return null;
  if (typeof value === 'string') {
    const unwrapped = unwrapHermesResult(value);
    if (unwrapped !== value) return preparation(unwrapped, depth + 1);
    try { return preparation(JSON.parse(value), depth + 1); }
    catch {
      // Hermes combines MCP text blocks into one result string. The first block
      // is Dock's single-line JSON receipt, followed by the full Markdown skill.
      const firstLine = value.split('\n', 1)[0];
      if (firstLine !== value) {
        try { return preparation(JSON.parse(firstLine), depth + 1); } catch {}
      }
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  if (value.prepared === true && uuid(value.sessionId) && /^[a-f0-9]{64}$/.test(value.skillRevision || '')) return value;
  for (const item of Array.isArray(value) ? value : [value.content, value.text, value.result, value.Ok]) {
    const found = preparation(item, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function handleHook(config, input, { knownSecrets = [] } = {}) {
  const agent = config.agent;
  const conversation = input.session_id;
  if (!conversation || typeof conversation !== 'string') return { active: false };
  const queue = await openArchive(config, { knownSecrets });
  try {
    let owner = conversation;
    let active = queue.active(agent, owner);
    let lineage = [conversation];
    const dbPath = agent === 'hermes' && typeof input.hermes_home === 'string' && isAbsolute(input.hermes_home)
      ? join(input.hermes_home, 'state.db') : null;
    if (dbPath) {
      try {
        lineage = hermesLineage(dbPath, conversation);
        const previous = lineage.find(id => queue.active(agent, id));
        if (previous) { owner = previous; active = queue.active(agent, owner); }
      } catch { /* Fresh sessions may not have been persisted yet. */ }
    }
    const response = input.tool_response ?? input.result;
    const prepared = prepareName(input.tool_name) ? preparation(response) : null;
    if (prepared) {
      const directory = join(config.stateDir, 'sessions', prepared.sessionId);
      const stat = await lstat(directory);
      if (!stat.isDirectory() || !privatePath(stat)) throw new Error('Invalid Dock preparation origin');
      const metadata = JSON.parse(await readFile(join(directory, 'session.json'), 'utf8'));
      if (metadata.agent !== agent || metadata.sessionId !== prepared.sessionId
          || metadata.skillRevision !== prepared.skillRevision || metadata.adapterRevision !== config.adapterRevision) {
        throw new Error('Dock preparation does not belong to this adapter');
      }
      const call = input.tool_use_id || input.tool_call_id;
      if (!call) throw new Error('Missing Dock triggering tool identity');
      if (!active) active = queue.activate({ agent, conversation, turn: input.turn_id || 'prepare-' + digest(call), metadata: {
        ...metadata, transcriptPath: input.transcript_path, dbPath, lineage, triggerCall: call,
        activatedAt: new Date().toISOString(), complete: false,
      } });
      else queue.updateMetadata(agent, owner, { ...metadata, transcriptPath: input.transcript_path,
        dbPath, lineage, complete: false });
      active = queue.active(agent, owner);
    }
    if (!active) return { active: false };
    const metadata = JSON.parse(active.metadata);
    let outcome = 'captured';
    try {
      const history = agent === 'codex'
        ? await codexHistory(input.transcript_path || metadata.transcriptPath, active.start_turn,
          { startLine: metadata.startLine, triggerCall: metadata.triggerCall })
        : hermesHistory(dbPath || metadata.dbPath, lineage, { startRow: metadata.startRow, triggerCall: metadata.triggerCall });
      // Discover credential fields in the entire authorized history before any
      // event is persisted, including a value echoed before its labelled field.
      queue.primeRedaction(history.events);
      for (const event of history.events) queue.enqueue({ ...event, agent, conversation: owner });
      queue.updateMetadata(agent, owner, { startLine: history.startLine, startRow: history.startRow,
        lineage, lastCaptureAt: new Date().toISOString(), complete: false });
    } catch {
      outcome = 'incomplete: history reconciliation pending';
      queue.enqueue({ agent, conversation: owner, turn: input.turn_id || active.start_turn,
        event: 'history-gap-' + digest(input.hook_event_name + '/' + (input.turn_id || '')),
        role: 'assistant', kind: 'checkpoint', parts: [{ type: 'text', text: '[Dock archive incomplete: source history is not yet readable. Missing streaming fragments have not been recovered.]' }] });
    }
    const terminal = ['Stop', 'SessionEnd', 'PreCompact', 'on_session_end', 'on_session_finalize'].includes(input.hook_event_name);
    if (terminal) queue.enqueue({ agent, conversation: owner, turn: input.turn_id || active.start_turn,
      event: 'status-' + digest(input.hook_event_name + '/' + (input.turn_id || '')),
      role: 'assistant', kind: 'checkpoint', parts: [{ type: 'text', text: JSON.stringify({
        event: input.hook_event_name, completed: input.completed, interrupted: input.interrupted,
        failed: input.failed, turnExitReason: input.turn_exit_reason,
        archiveStatus: outcome, streamingFragments: 'only persisted visible messages are recoverable',
      }) }] });
    if (terminal) queue.requestCommit(agent, owner);
    const marker = { active: true, serverSession: active.server_session, status: outcome,
      updatedAt: new Date().toISOString(), complete: false };
    // A marker describes the browser session that was verified during prepare.
    await writeFile(join(config.stateDir, 'sessions', metadata.sessionId, 'archive.json'), JSON.stringify(marker), { mode: 0o600 });
    return { active: true, pending: queue.pendingCount(), workRemaining: queue.workRemaining(), status: outcome };
  } finally { queue.close(); }
}
