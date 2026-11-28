import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCasePorts } from '../case-ports.mjs';
import { matchExpectedOutputs, selectColdOutputReads } from '../expected-outputs.mjs';

const output = {
  output_node_type: 'imports.text', output_port: 0, ordered: true,
  columns: [{name: 'Key', type: 'integer'}],
  rows: [{Key: 1}, {Key: 2}],
};
const expected = {package_path: '/test/import.lgp', nodes: [], outputs: [output]};
const observed = (values, complete = true) => ({
  node_id: 'selected-node', type: output.output_node_type, label: 'Orders with a long…', port: 0,
  data: {
    row_count: 2, sample_complete: complete, precision: {numbers_verified: true},
    schema: [{name: 'Key', label: 'Key', type: 'integer'}],
    sample: values.map(value => [{type: 'integer', value: String(value), is_null: false}]),
  },
});
const readback = data => ({
  outputs: [{node: {node_id: 'selected-node'}, output: {ports: [{...data, port: 0}]}}],
});

test('the latest partial sample requires a full cold read of its own node and port', () => {
  const finalSample = observed([1], false);
  assert.deepEqual(checkCasePorts(expected, [observed([1, 2]), finalSample]), [{
    node_id: finalSample.node_id,
    output,
  }]);
});

test('an independent full read checks rows beyond the model sample', () => {
  const partial = observed([1], false);
  const [target] = checkCasePorts(expected, [partial]);
  const nodeIds = [target.node_id];
  const saved = {ref: {node_id: target.node_id}, type: output.output_node_type, label: 'Orders with a long caption'};
  const other = {...saved, ref: {node_id: 'different-node'}};
  assert.deepEqual(selectColdOutputReads({nodes: [other, saved]}, [target.output], {nodeIds}),
    [{node: saved, ports: [{port: 0, content_candidate: false}]}]);
  const cold = values => [{
    node: saved.ref, type: saved.type, label: saved.label,
    output_port: 0, data: observed(values).data,
  }];
  assert.equal(matchExpectedOutputs(cold([1, 2]), [target.output], {nodeIds})[0].node.node_id, target.node_id);
  assert.throws(() => matchExpectedOutputs(cold([1, 9]), [target.output], {nodeIds}), /COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
  assert.throws(() => matchExpectedOutputs([{...cold([1, 2])[0], node: other.ref}], [target.output], {nodeIds}),
    /COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
});

test('complete mismatches and missing reads refuse without a cold fallback', () => {
  const partial = observed([1], false);
  assert.deepEqual(checkCasePorts(expected, [partial, observed([1, 2])]), []);
  assert.throws(() => checkCasePorts(expected, [partial, observed([1, 9])]), /CASE_PORT_OUTPUT_MISMATCH/);
  assert.throws(() => checkCasePorts(expected, [{...partial, port: 1}]), /CASE_PORT_OUTPUT_MISSING/);
});

test('a correct saved table cannot hide a different last partial read on an ordered port', () => {
  const saved = observed([1, 2]);
  assert.doesNotThrow(() => checkCasePorts(expected, [observed([1], false)], readback(saved.data)));
  for (const latest of [observed([9], false), observed([2], false), observed([], false)]) {
    assert.throws(() => checkCasePorts(expected, [saved, latest], readback(saved.data)), /CASE_PORT_SAMPLE_MISMATCH/);
  }
  const differentCount = observed([1], false);
  differentCount.data.row_count = 3;
  assert.throws(() => checkCasePorts(expected, [differentCount], readback(saved.data)), /CASE_PORT_SAMPLE_MISMATCH/);
});

test('an unordered sample can start anywhere but must respect row multiplicities', () => {
  const unordered = {...expected, outputs: [{
    ...output, ordered: false, rows: [{Key: 1}, {Key: 1}, {Key: 2}],
  }]};
  const rows = (values, complete) => {
    const port = observed(values, complete);
    port.data.row_count = 3;
    return port;
  };
  const saved = readback(rows([1, 2, 1], true).data);
  assert.doesNotThrow(() => checkCasePorts(unordered, [rows([2, 1], false)], saved));
  assert.throws(() => checkCasePorts(unordered, [rows([2, 2], false)], saved), /CASE_PORT_SAMPLE_MISMATCH/);
});

test('partial rows compare typed values across native and cold display formats', () => {
  const realOutput = {...expected, outputs: [{
    ...output, columns: [{name: 'Key', type: 'real'}], rows: [{Key: 14742.29}, {Key: 0}],
  }]};
  const convert = (values, complete) => {
    const port = observed([], complete);
    port.data.schema[0].type = 'real';
    port.data.sample = values.map(decimal => [{
      type: 'real', value: Number(decimal), decimal, is_null: false, precision: '17_significant_digits',
    }]);
    return port;
  };
  const saved = readback(convert(['1.474229E+04', '0E+00'], true).data);
  assert.doesNotThrow(() => checkCasePorts(realOutput, [convert(['14742.29'], false)], saved));
  const negativeZero = readback(convert(['-0E+00', '0E+00'], true).data);
  const zeroOutput = {...realOutput, outputs: [{...realOutput.outputs[0], rows: [{Key: 0}, {Key: 0}]}]};
  assert.throws(() => checkCasePorts(zeroOutput, [convert(['0'], false)], negativeZero), /CASE_PORT_SAMPLE_MISMATCH/);
});
