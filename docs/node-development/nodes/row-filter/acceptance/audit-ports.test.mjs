import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPorts} from './audit-ports.mjs';

const expected = {columns: [{name: 'Id', label: 'Id', type: 'integer'}, {name: 'Text', label: 'Text', type: 'string'}],
  full_ports: [[{Id: 1, Text: ''}, {Id: 1, Text: ''}], [{Id: 2, Text: null}]]};
const binding = {node_id: 'filter', document_id: 'document', execution_id: 'new-run'};
function fixture() {
  return {node: {node_id: 'filter', document_id: 'document'}, execution: {execution_id: 'new-run',
    status: 'completed', verified: true, owner_verified: true}, ports: expected.full_ports.map((rows, port) =>
    ({port, port_guid: 'guid-' + port, execution_id: 'new-run', fresh: true,
      row_count: rows.length, sample_complete: true, precision: {numbers_verified: true}, schema: expected.columns,
      sample: rows.map(row => [{type: 'integer', is_null: false, value: String(row.Id)},
        {type: 'string', is_null: row.Text === null, value: row.Text}])}))};
}
test('both ports preserve duplicate multiplicity, NULL and empty with exact provenance', () => {
  assert.equal(auditPorts(fixture(), expected, binding).status, 'PASS');
});
test('wrong port, lost or duplicated row, stale execution, foreign node, partial read and schema drift refuse', () => {
  for (const mutate of [
    value => value.ports.reverse(),
    value => {value.ports[0].sample.pop(); value.ports[0].row_count--;},
    value => {value.ports[1].sample.push(value.ports[1].sample[0]); value.ports[1].row_count++;},
    value => value.ports[1].execution_id = 'old-run',
    value => value.execution.execution_id = 'old-run',
    value => value.node.node_id = 'other',
    value => value.ports[1].sample_complete = false,
    value => value.ports[0].sample[0][1] = {type: 'string', is_null: true, value: null},
    value => value.ports[1].schema.reverse(),
    value => value.ports[1].port_guid = value.ports[0].port_guid,
  ]) {
    const value = structuredClone(fixture()); mutate(value);
    assert.throws(() => auditPorts(value, expected, binding));
  }
});
