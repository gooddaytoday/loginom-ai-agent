import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDiagnosticUsage as normalize, summarizeDiagnosticUsage as summarize, formatCacheSummary } from '../lib/diagnostic-usage.mjs';
import { createRedactor } from '../lib/redact.mjs';

test('OpenAI cached input is subtracted once and absent writes stay unknown', () => {
  assert.deepEqual(normalize({ prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 80 } }),
    { input_tokens: 20, output_tokens: 10, cache_read_tokens: 80, cache_write_tokens: null, total_tokens: 110 });
  assert.equal(normalize({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 } }).cache_read_tokens, 0);
  assert.equal(normalize({ prompt_tokens: 100 }).cache_read_tokens, null);
});
test('Anthropic input excludes both cache counters', () => {
  assert.deepEqual(normalize({ input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 80, cache_creation_input_tokens: 5 }, { format: 'anthropic' }),
    { input_tokens: 20, output_tokens: 10, cache_read_tokens: 80, cache_write_tokens: 5, total_tokens: 115 });
});
test('Hermes defaults do not establish provider availability', () => {
  const raw = { input_tokens: 20, output_tokens: 10, cache_read_tokens: 80, cache_write_tokens: 0, total_tokens: 110 };
  assert.equal(normalize(raw, { format: 'hermes-canonical' }).cache_write_tokens, null);
  assert.equal(normalize(raw, { format: 'hermes-canonical', reported: { cache_write_tokens: true } }).cache_write_tokens, 0);
  assert.equal(normalize({ ...raw, cache_read_tokens: 0 }, { format: 'hermes-canonical' }).cache_read_tokens, null);
});
test('duplicate deliveries do not double count; interrupted requests keep partial totals', () => {
  const end = { event: 'model.end', api_request_id: 'one', usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 80 } }, duration_ms: 120 };
  const full = summarize([{ event: 'model.start', api_request_id: 'one' }, end, end]);
  assert.equal(full.requests, 1);
  assert.equal(full.totals.total_tokens, 110);
  assert.equal(formatCacheSummary(full), 'Из кеша: 80 токенов; записано в кеш: не сообщается провайдером');
  const partial = summarize([end, { event: 'model.start', api_request_id: 'two' }]);
  assert.equal(partial.incomplete_requests, 1);
  assert.equal(partial.totals.total_tokens, null);
  assert.equal(partial.known_totals.total_tokens, 110);
});
test('numeric usage survives redaction while authorization is removed', () => {
  const result = createRedactor().redact({ cache_read_tokens: 123, cache_write_tokens: 0, input_tokens: 3, output_tokens: 4,
    total_tokens: 130, access_token: 'secret-value', authorization: 'Bearer hidden-value' });
  assert.equal(result.cache_read_tokens, 123);
  assert.equal(result.cache_write_tokens, 0);
  assert.equal(result.total_tokens, 130);
  assert.equal(result.access_token, '[redacted]');
  assert.equal(result.authorization, '[redacted]');
  const invalid = createRedactor().redact({ cache_read_tokens: 'unlabelled-secret', echoed: 'unlabelled-secret', token: 12345 });
  assert.equal(invalid.cache_read_tokens, '[redacted]');assert.equal(invalid.echoed, '[redacted]');assert.equal(invalid.token, '[redacted]');
});
test('failed ancillary request retains its error but cannot fabricate usage totals', () => {
  const result = summarize([{ event: 'model.start', api_request_id: 'failed', task_id: 'ancillary', started_at: 1 },
    { event: 'model.error', api_request_id: 'failed', error_type: 'CancelledError', ended_at: 1.25, duration_ms: 250 }]);
  assert.equal(result.incomplete_requests, 1);
  assert.equal(result.totals.total_tokens, null);
  assert.equal(result.measurements[0].error_type, 'CancelledError');
  assert.equal(result.measurements[0].duration_ms, 250);
});
