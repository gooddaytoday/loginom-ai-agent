// Only provider-reported counters enter this module. Missing is different from zero.
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const first = (...values) => values.map(count).find(value => value !== null) ?? null;
export const USAGE_FIELDS = Object.freeze([
  'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'total_tokens',
]);

export function normalizeDiagnosticUsage(raw, { format = 'openai', reported = {} } = {}) {
  if (!raw || typeof raw !== 'object') return Object.fromEntries(USAGE_FIELDS.map(key => [key, null]));
  let input, read, write;
  const output = first(raw.output_tokens, raw.completion_tokens);
  if (format === 'hermes-canonical') {
    input = count(raw.input_tokens);
    // Hermes supplies default zeros, even when the provider omitted a field.
    read = (reported.cache_read ?? reported.cache_read_tokens) === true || count(raw.cache_read_tokens) > 0 ? count(raw.cache_read_tokens) : null;
    write = (reported.cache_write ?? reported.cache_write_tokens) === true || count(raw.cache_write_tokens) > 0 ? count(raw.cache_write_tokens) : null;
  } else if (format === 'anthropic') {
    input = count(raw.input_tokens);
    read = count(raw.cache_read_input_tokens);
    write = count(raw.cache_creation_input_tokens);
  } else {
    const prompt = first(raw.input_tokens, raw.prompt_tokens);
    read = first(raw.input_tokens_details?.cached_tokens, raw.prompt_tokens_details?.cached_tokens);
    write = count(raw.cache_write_tokens);
    // OpenAI prompt counts include cached input. Do not add it a second time.
    input = prompt !== null && read !== null && prompt >= read + (write ?? 0) ? prompt - read - (write ?? 0) : null;
  }
  const total = count(raw.total_tokens);
  return {
    input_tokens: input, output_tokens: output, cache_read_tokens: read, cache_write_tokens: write,
    total_tokens: total ?? (format === 'openai' && first(raw.input_tokens, raw.prompt_tokens) !== null && output !== null
      ? first(raw.input_tokens, raw.prompt_tokens) + output
      : [input, read, write, output].every(value => value !== null) ? input + read + write + output : null),
  };
}

export function summarizeDiagnosticUsage(events) {
  const requests = new Map();
  for (const event of events) {
    if (typeof event.api_request_id !== 'string' || !event.api_request_id) continue;
    const current = requests.get(event.api_request_id) ?? { api_request_id: event.api_request_id };
    for (const key of ['model', 'provider', 'task_id', 'turn_id']) if (typeof event[key] === 'string') current[key] ??= event[key];
    if (event.event === 'model.start') current.started_at ??= event.started_at;
    if (event.event === 'model.error' && !current.finished) {
      current.error_type = typeof event.error_type === 'string' ? event.error_type : null;
      current.ended_at = event.ended_at ?? null;
      current.duration_ms = typeof event.duration_ms === 'number' && Number.isFinite(event.duration_ms) && event.duration_ms >= 0 ? event.duration_ms : null;
    }
    if (event.event === 'model.end' && !current.finished) {
      current.finished = true;
      current.ended_at = event.ended_at ?? null;
      current.usage = normalizeDiagnosticUsage(event.usage, { format: event.usage_format, reported: event.reported });
      current.duration_ms = typeof event.duration_ms === 'number' && Number.isFinite(event.duration_ms) && event.duration_ms >= 0 ? event.duration_ms : null;
    }
    requests.set(event.api_request_id, current);
  }
  const rows = [...requests.values()];
  const totals = {};
  const knownTotals = {};
  for (const key of USAGE_FIELDS) {
    const values = rows.map(row => row.usage?.[key] ?? null);
    const available = values.filter(value => value !== null);
    knownTotals[key] = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
    totals[key] = values.length && values.every(value => value !== null) ? knownTotals[key] : null;
  }
  return { requests: rows.length, incomplete_requests: rows.filter(row => !row.finished).length,
    incomplete_usage_requests: rows.filter(row => row.finished && ['input_tokens', 'output_tokens', 'total_tokens'].some(key => row.usage?.[key] == null)).length,
    totals, known_totals: knownTotals, measurements: rows };
}

export function formatCacheSummary(summary) {
  const show = value => value === null ? 'не сообщается провайдером' : `${value} токенов`;
  return `Из кеша: ${show(summary.totals.cache_read_tokens)}; записано в кеш: ${show(summary.totals.cache_write_tokens)}`;
}
