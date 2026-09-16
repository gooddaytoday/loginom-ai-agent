import { DatabaseSync } from 'node:sqlite';
import { mkdir, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRedactor } from './redact.mjs';
import { acquireClipboard } from './clipboard.mjs';
import { privatePath, protectWindowsDirectory } from './platform.mjs';
import { sendSessionMessages } from '../../examples/memory-plugin-shared/lib/batch-send.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const archivePolicy = { self: { enabled: true }, peer: { enabled: false },
  memory_types: ['events', 'experiences'], working_memory: { enabled: false } };

export async function openArchive(config, { knownSecrets = [], deliveryPort = 46420 } = {}) {
  const root = join(config.stateDir, 'archive');
  await mkdir(root, { recursive: true, mode: 0o700 });
  protectWindowsDirectory(root);
  const info = await lstat(root);
  if (!info.isDirectory() || !privatePath(info)) throw new Error('Unsafe Dock archive directory');
  const file = join(root, 'queue.sqlite');
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || !privatePath(stat)) throw new Error('Unsafe Dock queue');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const db = new DatabaseSync(file);
  await chmod(file, 0o600);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS installation (id INTEGER PRIMARY KEY CHECK(id=1), uuid TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activations (agent TEXT NOT NULL, conversation TEXT NOT NULL,
      start_turn TEXT NOT NULL, server_session TEXT NOT NULL, metadata TEXT NOT NULL,
      PRIMARY KEY(agent, conversation));
    CREATE TABLE IF NOT EXISTS events (ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL, server_session TEXT NOT NULL, payload TEXT NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS delivery (server_session TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS commits (server_session TEXT PRIMARY KEY, requested INTEGER NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS pending_events ON events(delivered, ordinal);`);
  db.prepare('INSERT OR IGNORE INTO installation VALUES (1, ?)').run(randomUUID());
  const installation = db.prepare('SELECT uuid FROM installation WHERE id=1').get().uuid;
  const redactor = createRedactor([config.apiKey, ...knownSecrets]);
  const activeQuery = db.prepare('SELECT * FROM activations WHERE agent=? AND conversation=?');
  function active(agent, conversation) { return activeQuery.get(agent, conversation); }
  function activate({ agent, conversation, turn, metadata }) {
    if (!['codex', 'hermes'].includes(agent) || !identity(conversation) || !identity(turn)) throw new Error('Invalid Dock archive identity');
    const serverSession = 'dock-' + digest(`${installation}/${agent}/${conversation}`).slice(0,48);
    db.prepare('INSERT OR IGNORE INTO activations VALUES (?, ?, ?, ?, ?)')
      .run(agent, conversation, turn, serverSession, JSON.stringify(redactor.redact(metadata)));
    return active(agent, conversation);
  }
  function enqueue({ agent, conversation, event, turn, role, parts, kind, createdAt }) {
    const activation = active(agent, conversation);
    if (!activation) return false;
    if (!identity(turn) || !identity(event) || !['user', 'assistant'].includes(role)
        || !Array.isArray(parts)) throw new Error('Invalid Dock archive event');
    const eventId = 'dock-event-' + digest(`${installation}/${agent}/${conversation}/${turn}/${event}`);
    const cleaned = redactor.redact({ parts });
    const payload = { role, parts: cleaned.parts || [{ type: 'text', text: '[Content omitted: redaction failed]' }],
      turn_id: turn, message_kind: kind || (role === 'user' ? 'user_query' : 'assistant_step'),
      deduplication_key: eventId, source_message_ids: [eventId],
      ...(createdAt ? { created_at: new Date(createdAt).toISOString() } : {}) };
    db.prepare('INSERT OR IGNORE INTO events (event_id,server_session,payload) VALUES (?,?,?)')
      .run(eventId, activation.server_session, JSON.stringify(payload));
    return true;
  }
  function status(serverSession, state) {
    db.prepare('INSERT INTO delivery VALUES (?,?,?) ON CONFLICT(server_session) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at')
      .run(serverSession, state, new Date().toISOString());
  }
  function pendingCount() { return db.prepare('SELECT count(*) AS n FROM events WHERE delivered=0').get().n; }
  function workRemaining() {
    return pendingCount() + db.prepare('SELECT count(*) AS n FROM commits WHERE requested>acknowledged').get().n;
  }
  function requestCommit(agent, conversation) {
    const current = active(agent, conversation);
    if (!current) return;
    const last = db.prepare('SELECT max(ordinal) AS n FROM events WHERE server_session=?').get(current.server_session).n;
    if (last) db.prepare('INSERT INTO commits(server_session,requested) VALUES (?,?) ON CONFLICT(server_session) DO UPDATE SET requested=max(commits.requested,excluded.requested)')
      .run(current.server_session, last);
  }
  async function flush(fetcher = fetch) {
    // Kernel ownership prevents two hook processes from sending the same pending
    // batches concurrently; a crash releases this lease without stale-lock repair.
    const lease = await acquireClipboard({ port: deliveryPort, timeoutMs: 1000 });
    try {
      const rows = db.prepare('SELECT * FROM events WHERE delivered=0 ORDER BY ordinal LIMIT 500').all();
      if (!workRemaining()) return { sent: 0, pending: 0, workRemaining: 0 };
      const base = new URL(config.endpoint).origin;
      async function request(path, init = {}) {
        try {
          const response = await fetcher(new URL(path, base), {
            ...init, redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          });
          if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status }; }
          // These administrative acknowledgements have bounded, small shapes.
          const value = await response.json();
          return { ok: true, status: response.status, result: value.result ?? value };
        } catch { return { ok: false, status: 0 }; }
      }
      const schema = await request('/openapi.json');
      if (!schema.result?.components?.schemas?.AddMessageRequest?.properties?.deduplication_key) {
        for (const row of rows) status(row.server_session, 'waiting: server delivery identity unavailable');
        return { sent: 0, pending: pendingCount(), workRemaining: workRemaining() };
      }
      let sent = 0;
      for (const serverSession of new Set(rows.map(row => row.server_session))) {
        const batch = rows.filter(row => row.server_session === serverSession);
        const created = await request('/api/v1/sessions', { method: 'POST', body: JSON.stringify({
          session_id: serverSession, memory_policy: archivePolicy,
          auto_commit_policy: { message_count_threshold: 100, min_commit_interval_seconds: 300, keep_recent_count: 10 },
          memory_extraction_config: { events: { tags: ['project=loginom-dock'] } },
        }) });
        if (!created.ok) {
          // Creation can have succeeded on an earlier flush (or before a lost
          // acknowledgement). Reuse only this exact session with Dock's policy.
          const existing = created.status === 409
            ? await request(`/api/v1/sessions/${encodeURIComponent(serverSession)}`) : null;
          const policy = existing?.result?.memory_policy;
          const types = policy?.memory_types;
          if (!existing?.ok || existing.result.session_id !== serverSession
              || policy?.self?.enabled !== true || policy?.peer?.enabled !== false
              || policy?.working_memory?.enabled !== false || !Array.isArray(types)
              || !types.includes('events') || !types.includes('experiences')
              || types.some(type => !['events', 'experiences', 'cases', 'trajectories'].includes(type))) {
            status(serverSession, `waiting: session unavailable or policy mismatch (HTTP ${created.status})`);
            continue;
          }
        }
        // A second redaction pass occurs immediately before HTTP, including any
        // credentials added to the configuration since the event was queued.
        const payloads = batch.map(row => redactor.redact(JSON.parse(row.payload)));
        const result = await sendSessionMessages(request, serverSession, payloads, {
          enqueueOnRetryable: false,
          onSent(count) {
            db.exec('BEGIN IMMEDIATE');
            try {
              for (const row of batch.splice(0, count)) db.prepare('UPDATE events SET delivered=1 WHERE event_id=?').run(row.event_id);
              db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
          },
        });
        sent += result.sent;
        status(serverSession, result.failed ? 'waiting: delivery not acknowledged' : 'delivered');
      }
      for (const commit of db.prepare('SELECT * FROM commits WHERE requested>acknowledged').all()) {
        if (db.prepare('SELECT 1 FROM events WHERE server_session=? AND delivered=0 LIMIT 1').get(commit.server_session)) continue;
        // Native commit archives under the same session lock before acknowledging;
        // extraction continues on the server. A lost reply can safely retry an
        // already empty session, without appending duplicate messages.
        const response = await request(`/api/v1/sessions/${encodeURIComponent(commit.server_session)}/commit`, {
          method: 'POST', body: JSON.stringify({ keep_recent_count: 0 }),
        });
        if (response.ok) {
          db.prepare('UPDATE commits SET acknowledged=max(acknowledged,?) WHERE server_session=?').run(commit.requested, commit.server_session);
          status(commit.server_session, 'archived: extraction delegated to server');
        } else status(commit.server_session, `waiting: commit HTTP ${response.status}`);
      }
      return { sent, pending: pendingCount(), workRemaining: workRemaining() };
    } finally { await lease.release(); }
  }
  return { installation, active, activate, enqueue, flush, requestCommit, pendingCount, workRemaining, close: () => db.close(),
    primeRedaction: value => redactor.prime(value),
    deliveryStatus(serverSession) {
      const delivery = db.prepare('SELECT * FROM delivery WHERE server_session=?').get(serverSession) || null;
      const pending = db.prepare(`SELECT count(*) AS pending_events,
        min(json_extract(payload, '$.created_at')) AS oldest_event_created_at,
        count(*) - count(json_extract(payload, '$.created_at')) AS events_without_timestamps
        FROM events WHERE delivered=0 AND server_session=?`).get(serverSession);
      const oldest = pending.oldest_event_created_at ? Date.parse(pending.oldest_event_created_at) : NaN;
      return { ...delivery, ...pending,
        oldest_event_age_seconds: Number.isFinite(oldest) ? Math.max(0, Math.round((Date.now() - oldest) / 1000)) : null };
    },
    updateMetadata(agent, conversation, patch) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = active(agent, conversation);
        if (current) db.prepare('UPDATE activations SET metadata=? WHERE agent=? AND conversation=?')
          .run(JSON.stringify(redactor.redact({ ...JSON.parse(current.metadata), ...patch })), agent, conversation);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    pending: () => db.prepare('SELECT payload FROM events WHERE delivered=0 ORDER BY ordinal').all().map(row => JSON.parse(row.payload)),
  };
}
