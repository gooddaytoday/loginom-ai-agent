import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { matchesExpectedOutput, parseExpectedOutputs } from './expected-outputs.mjs';

export function checkCasePorts(expected, candidates, verified) {
  const {outputs} = parseExpectedOutputs(expected);
  const readback = [];
  for (const want of outputs) {
    // Compare the final read on the intended node port. Earlier good values
    // cannot hide a later re-run with the wrong settings.
    const observed = candidates.findLast(row => row.type === want.output_node_type
      && (want.output_node_label === undefined || row.label === want.output_node_label)
      && row.port === (want.output_port ?? 0));
    if (!observed) throw Error('CASE_PORT_OUTPUT_MISSING: ' + want.output_node_type);
    if (observed.data.sample_complete === false) {
      if (verified !== undefined) {
        const output = verified.outputs?.[readback.length];
        const full = output?.output?.ports?.find(port => port.port === observed.port);
        if (output?.node?.node_id !== observed.node_id || !full) {
          throw Error('CASE_PORT_READBACK_NODE_CHANGED: ' + want.output_node_type);
        }
        if (!matchesPartialSample(observed.data, full, want)) {
          throw Error('CASE_PORT_SAMPLE_MISMATCH: ' + want.output_node_type);
        }
      }
      readback.push({node_id: observed.node_id, output: want});
      continue;
    }
    if (!matchesExpectedOutput(observed.data, want)) throw Error('CASE_PORT_OUTPUT_MISMATCH: ' + want.output_node_type);
  }
  return readback;
}

function matchesPartialSample(sampled, full, want) {
  if (full.sample_complete !== true || sampled.row_count !== full.row_count
      || !Array.isArray(sampled.sample) || !Array.isArray(full.sample)
      || full.sample.length !== full.row_count || sampled.sample.length > full.sample.length
      || (full.row_count > 0 && sampled.sample.length === 0)
      || !Array.isArray(sampled.schema) || sampled.schema.length !== full.schema?.length) return false;

  const indices = full.schema.map((field, index) => sampled.schema.findIndex((source, i) =>
    field.name === source.name && field.type === source.type && (want.column_order !== 'exact' || i === index)));
  if (indices.includes(-1) || new Set(indices).size !== indices.length) return false;

  const rowKey = (row, sourceIndices) => {
    if (!Array.isArray(row) || row.length !== full.schema.length) return undefined;
    const values = full.schema.map((field, i) => cellValue(row[sourceIndices?.[i] ?? i], field.type));
    return values.includes(undefined) ? undefined : JSON.stringify(values);
  };
  const allRows = full.sample.map(row => rowKey(row));
  const sampleRows = sampled.sample.map(row => rowKey(row, indices));
  if (allRows.includes(undefined) || sampleRows.includes(undefined)) return false;
  if (want.ordered) return sampleRows.every((row, i) => row === allRows[i]);

  const counts = new Map();
  for (const row of allRows) counts.set(row, (counts.get(row) ?? 0) + 1);
  for (const row of sampleRows) {
    const count = counts.get(row);
    if (!count) return false;
    counts.set(row, count - 1);
  }
  return true;
}

function cellValue(cell, columnType) {
  if (cell?.type !== columnType || cell.precision === 'unverified') return undefined;
  if (cell.is_null === true && cell.value === null) return null;
  if (cell.is_null !== false) return undefined;

  const type = columnType === 'variant' ? cell.cell_type : columnType;
  const value = cell.value;
  // The native reader and the cold Table can emit different decimal spellings.
  if (cell.precision === 'exact_non_finite' && value === null
      && ['real', 'variant'].includes(columnType) && ['NaN', 'Infinity', '-Infinity'].includes(cell.non_finite)) {
    return ['real', cell.non_finite];
  }
  if (type === 'real') {
    const decimal = cell.decimal ?? value;
    if (typeof decimal !== 'number' && (typeof decimal !== 'string' || !decimal.trim())) return undefined;
    const real = Number(decimal);
    if (!Number.isFinite(real) || (typeof value === 'number' && real !== value)) return undefined;
    return [type, Object.is(real, -0) ? '-0' : String(real)];
  }
  if (type === 'integer' && typeof value === 'string' && /^-?[0-9]+$/.test(value)) return [type, BigInt(value).toString()];
  if (type === 'datetime' && typeof value === 'string') return [type, cell.native?.bytes_le ?? value];
  if (['string', 'boolean'].includes(type) && typeof value === type) return [type, value];
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [expected, candidates, verified] = process.argv.slice(2).map(path => JSON.parse(readFileSync(path, 'utf8')));
  console.log(JSON.stringify(checkCasePorts(expected, candidates, verified)));
}
