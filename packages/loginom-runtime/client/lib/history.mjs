import { readFile, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { extractPartsFromPayload } from '../../examples/memory-plugin-shared/lib/capture-utils.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const visibleText = content => typeof content === 'string' ? content : (Array.isArray(content)
  ? content.filter(part => ['text', 'input_text', 'output_text'].includes(part.type)).map(part => part.text || '').join('\n') : '');
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; } };
const archiveTool = name => /(?:^|[_-])dock[_-](?:archive|capture|flush)(?:$|[_-])/.test(name || '');

export function unwrapHermesResult(value) {
  if (typeof value !== 'string' || !/^<untrusted_tool_result\b[^>]*>\n/.test(value)) return value;
  const start = value.indexOf('\n\n'), end = value.lastIndexOf('\n</untrusted_tool_result>');
  if (start < 0 || end < start || value.slice(end).trim() !== '</untrusted_tool_result>') return value;
  return value.slice(start + 2, end);
}

export async function codexHistory(path, startTurn, { startLine, triggerCall } = {}) {
  if ((await stat(path)).size > 256 * 1024 * 1024) throw new Error('Dock transcript exceeds supported size');
  const bytes = await readFile(path);
  if (bytes.length > 256 * 1024 * 1024) throw new Error('Dock transcript exceeds supported size');
  const lines = bytes.toString('utf8').split('\n');
  const records = [];
  const names = {};
  const nativeMcp = new Set();
  let turn = null, start = -1;
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    let entry;
    try { entry = JSON.parse(lines[index]); }
    catch {
      if (index === lines.length - 1) continue; // The active writer may be midway through this line.
      throw new Error('Unsupported or damaged Dock transcript');
    }
    const p = entry.payload;
    if (entry.type === 'turn_context') turn = p?.turn_id ?? p?.id ?? turn;
    if (p?.type === 'task_started') turn = p.turn_id ?? turn;
    if (turn === startTurn && p?.role === 'user' && p?.type === 'message' && start < 0) start = records.length;
    records.push({ entry, index, turn });
    if (p?.type === 'mcp_tool_call_end') nativeMcp.add(p.call_id);
    if (p?.name && (p.call_id || p.id)) names[p.call_id || p.id] = p.name;
  }
  if (startLine != null) start = records.findIndex(record => record.index === startLine);
  else if (triggerCall) {
    const called = records.findIndex(({ entry }) => (entry.payload?.call_id || entry.payload?.id) === triggerCall);
    for (let index = called; index >= 0; index--) {
      const p = records[index].entry.payload;
      if (p?.type === 'message' && p.role === 'user') { start = index; break; }
    }
  }
  if (start < 0) throw new Error('The triggering user message is not yet available in the transcript');
  const result = [];
  for (const { entry, index, turn: recordedTurn } of records.slice(start)) {
    const current = recordedTurn || startTurn;
    const p = entry.payload;
    if (!p || !current || ['analysis', 'summary'].includes(p.channel)) continue;
    if (entry.type === 'response_item' && p.type === 'message' && ['user', 'assistant'].includes(p.role)) {
      const text = visibleText(p.content);
      if (text) result.push({ event: `line-${index}`, turn: current, role: p.role,
        parts: [{ type: 'text', text }], createdAt: entry.timestamp });
      continue;
    }
    if (p.type === 'mcp_tool_call_end') {
      const name = p.invocation?.tool, id = p.call_id;
      if (!name || !id || archiveTool(name)) continue;
      const raw = p.result?.Ok ?? p.result?.Err;
      const output = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const success = p.result?.Ok != null && !p.result.Ok.isError;
      result.push({ event: 'call-' + hash(id), turn: current, role: 'assistant', kind: 'tool_transport',
        parts: [{ type: 'tool', tool_id: id, tool_name: name, tool_input: p.invocation.arguments || {}, tool_status: 'running' }] });
      result.push({ event: 'result-' + hash(id), turn: current, role: 'user', kind: 'tool_transport',
        parts: [{ type: 'tool', tool_id: id, tool_name: name, tool_output: output, tool_status: success ? 'completed' : 'error' }] });
      continue;
    }
    const id = p.call_id || p.id;
    if (!id || nativeMcp.has(id) || archiveTool(p.name || names[id])) continue;
    if (['function_call', 'custom_tool_call', 'function_call_output', 'custom_tool_call_output'].includes(p.type)) {
      const normalized = p.type === 'custom_tool_call' ? { ...p, type: 'function_call', arguments: { value: p.input } }
        : p.type === 'custom_tool_call_output' ? { ...p, type: 'function_call_output' } : p;
      const parts = extractPartsFromPayload(normalized, { toolNameById: names, toolMaxChars: Number.MAX_SAFE_INTEGER });
      const isResult = p.type.endsWith('output');
      if (parts.length) result.push({ event: (isResult ? 'result-' : 'call-') + hash(id), turn: current,
        role: isResult ? 'user' : 'assistant', kind: 'tool_transport', parts, createdAt: entry.timestamp });
    }
  }
  return { startLine: records[start].index, events: result };
}

export function hermesLineage(path, sessionId) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const lineage = [];
    let id = sessionId;
    for (let depth = 0; id && depth < 64; depth++) {
      if (lineage.includes(id)) throw new Error('Invalid Hermes compression lineage');
      lineage.push(id);
      const row = db.prepare('SELECT parent_session_id,model_config FROM sessions WHERE id=?').get(id);
      if (!row) throw new Error('Hermes session is not available');
      const config = parse(row.model_config) || {};
      if (config._branched_from || config._reset_from || config._delegate_from) { id = null; break; }
      const parent = row.parent_session_id && db.prepare('SELECT end_reason FROM sessions WHERE id=?').get(row.parent_session_id);
      id = parent?.end_reason === 'compression' ? row.parent_session_id : null;
    }
    if (id) throw new Error('Hermes compression lineage exceeds supported size');
    return lineage.reverse();
  } finally { db.close(); }
}

export function hermesHistory(path, lineage, { startRow, triggerCall } = {}) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    // Deliberately omit reasoning, system prompts, API prompt snapshots, and all
    // other conversations. Compacted original messages remain readable here.
    const rows = lineage.flatMap(session => db.prepare(`SELECT id,session_id,role,content,tool_call_id,tool_calls,tool_name,timestamp,_compressed_summary
      FROM messages WHERE session_id=? AND role IN ('user','assistant','tool') ORDER BY id`).all(session));
    let begin = startRow ? rows.findIndex(row => row.id === startRow) : -1;
    if (!startRow && triggerCall) {
      const call = rows.findIndex(row => row.tool_call_id === triggerCall
        || (Array.isArray(parse(row.tool_calls)) && parse(row.tool_calls).some(item => item.id === triggerCall)));
      for (let index = call; index >= 0; index--) {
        if (rows[index].role === 'user' && !rows[index]._compressed_summary) { begin = index; break; }
      }
    }
    if (begin < 0) throw new Error('The triggering Hermes user message is not yet available');
    const result = [];
    let turn = 'row-' + rows[begin].id;
    for (const row of rows.slice(begin)) {
      if (row._compressed_summary) continue;
      if (row.role === 'user') turn = 'row-' + row.id;
      if (row.role !== 'tool') {
        const content = parse(row.content);
        const text = Array.isArray(content) && content.every(part => part && typeof part.type === 'string')
          ? visibleText(content) : row.content || '';
        if (text) result.push({ event: 'message-' + row.id, turn, role: row.role,
          parts: [{ type: 'text', text }], createdAt: new Date(row.timestamp * 1000).toISOString() });
        const calls = parse(row.tool_calls);
        for (const call of Array.isArray(calls) ? calls : []) {
          const name = call.function?.name;
          if (archiveTool(name)) continue;
          result.push({ event: 'call-' + hash(call.id), turn, role: 'assistant', kind: 'tool_transport', parts: [{
            type: 'tool', tool_id: call.id, tool_name: name || 'unknown', tool_input: parse(call.function?.arguments) || {}, tool_status: 'running',
          }] });
        }
      } else if (!archiveTool(row.tool_name)) {
        result.push({ event: 'result-' + hash(row.tool_call_id || String(row.id)), turn, role: 'user', kind: 'tool_transport', parts: [{
          type: 'tool', tool_id: row.tool_call_id || String(row.id), tool_name: row.tool_name || 'unknown', tool_output: unwrapHermesResult(row.content || ''),
          tool_status: parse(unwrapHermesResult(row.content))?.isError || parse(unwrapHermesResult(row.content))?.error ? 'error' : 'completed',
        }] });
      }
    }
    return { startRow: rows[begin].id, events: result };
  } finally { db.close(); }
}
