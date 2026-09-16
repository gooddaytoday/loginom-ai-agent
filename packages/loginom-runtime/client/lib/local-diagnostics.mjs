import { mkdir, open, readdir, lstat, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRedactor } from './redact.mjs';
import { summarizeDiagnosticUsage, formatCacheSummary } from './diagnostic-usage.mjs';

const id = value => createHash('sha256').update(value).digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const limits = { days: 30, bytes: 2 * 1024 ** 3, sessionBytes: 256 * 1024 ** 2, eventBytes: 1024 ** 2 };

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Invalid diagnostic directory');
}

async function append(path, text) {
  const file = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077)) throw Error('Invalid diagnostic file');
    await file.writeFile(text);
  } finally { await file.close(); }
}

export async function recordLocalDiagnostics(root, sessionId, events, { knownSecrets = [], policy = limits } = {}) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 1000 || !Array.isArray(events)) throw Error('Invalid diagnostic batch');
  const directory = join(root, 'diagnostics', id(sessionId));
  await privateDirectory(join(root, 'diagnostics'));
  await privateDirectory(directory);
  const path = join(directory, 'events.jsonl');
  const redactor = createRedactor(knownSecrets);
  redactor.prime(events);
  let size = (await lstat(path).catch(e => { if (e.code === 'ENOENT') return { size: 0 }; throw e; })).size;
  for (const event of events) {
    let line = JSON.stringify({ version: 1, recorded_at: new Date().toISOString(), ...redactor.redact(event) }) + '\n';
    if (Buffer.byteLength(line) > policy.eventBytes) line = JSON.stringify({ version: 1, event: 'diagnostic.truncated', original_event: event.event, reason: 'event_size_limit' }) + '\n';
    if (size + Buffer.byteLength(line) > policy.sessionBytes) {
      const marker = await open(join(directory, 'records-lost'), 'wx', 0o600).catch(e => { if (e.code !== 'EEXIST') throw e; });
      if (marker) await marker.close();
      break;
    }
    await append(path, line);
    size += Buffer.byteLength(line);
  }
  return directory;
}

export async function readLocalDiagnosticReport(root, sessionId) {
  const directory = join(root, 'diagnostics', id(sessionId));
  const file = await open(join(directory, 'events.jsonl'), constants.O_RDONLY | constants.O_NOFOLLOW)
    .catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
  let source = '';
  if (file) { try { source = await file.readFile('utf8'); } finally { await file.close(); } }
  const events = []; let malformed = 0;
  for (const line of source.split('\n').filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { malformed++; }
  }
  const usage = summarizeDiagnosticUsage(events);
  const tasks = [...new Set(events.map(e => e.task_id || e.turn_id).filter(Boolean))].map(task => {
    const selected = events.filter(e => (e.task_id || e.turn_id) === task);
    const usage = summarizeDiagnosticUsage(selected);
    return { task_id: task, usage, cache_summary: formatCacheSummary(usage) };
  });
  const times = events.map(e => e.observed_at ?? e.started_at).filter(value => typeof value === 'number' && Number.isFinite(value));
  const pendingTools = new Set();
  for (const event of events) {
    if (!event.tool_call_id) continue;
    if (event.event === 'tool.start') pendingTools.add(event.tool_call_id);
    if (event.event === 'tool.end' || event.event === 'preparation.not_ready') pendingTools.delete(event.tool_call_id);
  }
  const unclosedTask = events.some(e => e.event === 'task.prepared') && !events.some(e => ['task.end', 'task.finalize'].includes(e.event));
  const toolCalls = new Map(events.filter(e => e.event === 'tool.end' && e.tool_call_id).map(e => [e.tool_call_id, e]));
  const dockSessions = [];
  for (const dockId of new Set(events.filter(e => e.event === 'task.prepared' && /^[a-f0-9-]{36}$/.test(e.dock_session_id ?? '')).map(e => e.dock_session_id))) {
    const journal = join(root, 'sessions', dockId, 'execution-events.jsonl');
    const steps = new Set(), saves = new Map(), nodes = new Set(); let missing = false, malformed = 0;
    const handle = await open(journal, constants.O_RDONLY | constants.O_NOFOLLOW).catch(e => { if (e.code !== 'ENOENT') throw e; missing = true; return null; });
    if (handle) {
      try {
        for await (const line of handle.readLines()) {
          let event; try { event = JSON.parse(line); } catch { malformed++; continue; }
          if (event.phase === 'node_step_completed' && event.outcome?.status === 'SUCCEEDED') steps.add(event.internal_operation_id);
          if (event.phase === 'node_checkpoint') nodes.add(event.operation_id);
          if (event.phase === 'completed' && ['package.save_checkpoint', 'package.save_as'].includes(event.action_key) && event.outcome?.status === 'SUCCEEDED') {
            saves.set(event.operation_id, { operation_id: event.operation_id, action_key: event.action_key,
              package_ref: event.outcome.output?.package_ref, reopened: event.outcome.output?.reopened });
          }
        }
      } finally { await handle.close(); }
    }
    dockSessions.push({ session_id: dockId, execution_journal: journal, diagnostic_directory: join(root, 'diagnostics', id('dock:' + dockId)),
      completed_node_operations: nodes.size, completed_handler_steps: steps.size, saves: [...saves.values()], missing_journal: missing, malformed_records: malformed });
  }
  return { version: 1, session_id: sessionId, directory, usage, cache_summary: formatCacheSummary(usage),
    tasks, elapsed_ms: times.length > 1 ? (times.reduce((a,b)=>Math.max(a,b),-Infinity) - times.reduce((a,b)=>Math.min(a,b),Infinity)) * 1000 : null,
    tool_calls: toolCalls.size, knowledge_calls: [...toolCalls.values()].filter(e => /(?:^|_)(?:find|search|read|grep|glob|dock_action_describe)$/.test(e.tool_name ?? '')).length,
    preparation_calls: [...toolCalls.values()].filter(e => /dock_prepare$/.test(e.tool_name ?? '')).length,
    dock_sessions: dockSessions,
    pending_tools: [...pendingTools], unclosed_task: unclosedTask, missing_events: !file,
    incomplete: !file || usage.incomplete_requests > 0 || usage.incomplete_usage_requests > 0 || pendingTools.size > 0 || unclosedTask || malformed > 0
      || dockSessions.some(s => s.missing_journal || s.malformed_records) || events.some(e => e.event === 'diagnostic.truncated')
      || await lstat(join(directory, 'records-lost')).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; }),
    malformed_records: malformed, events };
}

// This root contains new diagnostics only. Existing receipts and archive queues
// live elsewhere and are never enumerated or removed by this policy.
export async function pruneLocalDiagnostics(root, { now = Date.now(), policy = limits } = {}) {
  const directory = join(root, 'diagnostics');
  const entries = await readdir(directory, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const path = join(directory, entry.name);
    const files = await readdir(path, { withFileTypes: true });
    let bytes = 0, updated = 0, active = false;
    for (const item of files) {
      const stat = await lstat(join(path, item.name));
      bytes += stat.size; updated = Math.max(updated, stat.mtimeMs);
      if (item.name === 'events.jsonl' && item.isFile()) {
        // A bounded prefix carries the host process identity; do not read a large journal for cleanup.
        const handle = await open(join(path, item.name), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const buffer = Buffer.alloc(65536); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          active = buffer.subarray(0, bytesRead).toString().split('\n').some(line => {
            try { const e = JSON.parse(line); return Number.isInteger(e.host_pid) && e.host_pid > 0 && alive(e.host_pid); } catch { return false; }
          });
        } finally { await handle.close(); }
      }
    }
    sessions.push({ path, bytes, updated, active });
  }
  let total = sessions.reduce((n, s) => n + s.bytes, 0); const removed = [];
  for (const session of sessions.sort((a, b) => a.updated - b.updated)) {
    if (session.active || (now - session.updated <= policy.days * 86400000 && total <= policy.bytes)) continue;
    await rm(session.path, { recursive: true }); total -= session.bytes; removed.push(session.path);
  }
  return { removed, remaining_bytes: total, protected_over_limit: total > policy.bytes };
}
