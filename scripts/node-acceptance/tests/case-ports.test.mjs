import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCasePorts } from '../case-ports.mjs';
import { matchExpectedOutputs } from '../expected-outputs.mjs';

const output = {
  output_node_type: 'imports.text', output_port: 0, ordered: true,
  columns: [{name: 'Key', type: 'integer'}],
  rows: [{Key: 1}, {Key: 2}],
};
const expected = {package_path: '/test/import.lgp', nodes: [], outputs: [output]};
const observed = (values, complete = true) => ({
  node_id: 'selected-node', type: output.output_node_type, label: 'Orders', port: 0,
  data: {
    row_count: 2, sample_complete: complete, precision: {numbers_verified: true},
    schema: [{name: 'Key', label: 'Key', type: 'integer'}],
    sample: values.map(value => [{type: 'integer', value: String(value), is_null: false}]),
  },
});

test('the latest partial sample requires a full cold read of its own node and port', () => {
  const finalSample = observed([1], false);
  assert.deepEqual(checkCasePorts(expected, [observed([1, 2]), finalSample]), [{
    node_id: finalSample.node_id,
    output: {...output, output_node_label: finalSample.label},
  }]);
});

test('an independent full read checks rows beyond the model sample', () => {
  const partial = observed([1], false);
  const [target] = checkCasePorts(expected, [partial]);
  const cold = values => [{
    node: {node_id: target.node_id}, type: output.output_node_type, label: partial.label,
    output_port: 0, data: observed(values).data,
  }];
  assert.equal(matchExpectedOutputs(cold([1, 2]), [target.output])[0].node.node_id, target.node_id);
  assert.throws(() => matchExpectedOutputs(cold([1, 9]), [target.output]), /COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
});

test('complete mismatches and missing reads refuse without a cold fallback', () => {
  const partial = observed([1], false);
  assert.deepEqual(checkCasePorts(expected, [partial, observed([1, 2])]), []);
  assert.throws(() => checkCasePorts(expected, [partial, observed([1, 9])]), /CASE_PORT_OUTPUT_MISMATCH/);
  assert.throws(() => checkCasePorts(expected, [{...partial, port: 1}]), /CASE_PORT_OUTPUT_MISSING/);
});
