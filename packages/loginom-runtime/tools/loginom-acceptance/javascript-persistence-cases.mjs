import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {javascriptExecutionProbes} from './javascript-execution-probes.mjs';

export const javascriptPersistenceMarker = 'JS_G7_FINAL_V2 — Сумма & <tag> "quotes" \'single\' \\ backslash 😀';

// Fixed operator fixtures, never caller-provided JavaScript. The cold reader
// must not import this module: expectations belong to the writer and auditor.
export function javascriptPersistenceCase(mode) {
  if (!['code', 'declared'].includes(mode)) throw Error('Persistence schema mode refused');
  const initial = javascriptExecutionProbes('RowID').find(item => item.id === mode + '-table-v1');
  const oldMarker = JSON.stringify('JS_G2_TABLE_V1');
  if (initial.source.split(oldMarker).length !== 2) throw Error('Persistence baseline marker differs');
  const finalSource = '// Сохранённая редакция 2: & < > " \' \\ 😀\n'
    + initial.source.replace(oldMarker, JSON.stringify(javascriptPersistenceMarker));
  return Object.freeze({
    id: 'persistence-' + mode, schema_mode: mode,
    revisions: Object.freeze([initial.source, finalSource].map((source, index) => Object.freeze({
      revision: index + 1, source, ...javascriptSourceIdentity(source),
    }))),
    input_sha256: '4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e',
    writer_budget_ms: 1800000, reader_budget_ms: 600000,
  });
}
