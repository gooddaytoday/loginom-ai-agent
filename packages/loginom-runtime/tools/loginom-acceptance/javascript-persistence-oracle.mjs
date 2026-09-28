import {javascriptPersistenceMarker} from './javascript-persistence-cases.mjs';

// Independent of Loginom configuration/execute drivers. Do not construct the
// expected table by evaluating the source or copying a prior preview result.
export function verifyJavascriptPersistenceOutput(table, revision) {
  if (revision !== 1 && revision !== 2) throw Error('Persistence revision refused');
  const ids = ['1', '2', '3', '4', '5', '6'];
  const marker = revision === 1 ? 'JS_G2_TABLE_V1' : javascriptPersistenceMarker;
  const columns = [{name: 'ObservedID', type: 'integer'}, {name: 'PhaseMarker', type: 'string'}];
  if (table?.sample_complete !== true || table.row_count !== 6 || table.sample_rows !== 6
    || table.truncated === true || table.sample?.length !== 6 || table.schema?.length !== 2
    || !table.schema.every((field, index) => field.name === columns[index].name
      && field.label === columns[index].name && field.type === columns[index].type)
    || !table.sample.every((row, index) => Array.isArray(row) && row.length === 2
      && row[0]?.type === 'integer' && row[0].is_null === false && row[0].precision === 'exact_integer'
      && row[0].value === ids[index] && row[1]?.type === 'string' && row[1].is_null === false
      && row[1].value === marker)) throw Error('Persistence typed output differs');
  return Object.freeze({verified: true, revision, rows: 6, columns: 2, numeric_tolerance: 0});
}
