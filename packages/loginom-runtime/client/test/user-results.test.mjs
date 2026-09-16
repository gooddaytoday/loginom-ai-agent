import test from 'node:test';
import assert from 'node:assert/strict';
import { compactNodeResult, compactActionResult, compactKnowledgeBundle, userResultSchema } from '../lib/user-results.mjs';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
const validate = new AjvJsonSchemaValidator().getValidator(userResultSchema);

test('compact node result keeps references, precision and errors without configuration traces', () => {
  const raw = { operation_id: 'job', attempt: 1, state: 'settled', progress: null, error: null,
    outcome: { status: 'SUCCEEDED', cleanup_complete: true, effect_possible: true, trace: [{ large: 'trace' }],
      output: { node: { document_id: 'doc', workflow_id: 'wf', node_id: 'node' }, package_saved: false,
        configuration: { readback: { node: { document_id: 'doc', workflow_id: 'wf', node_id: 'node' }, receipt_ids: ['job:configure'], source: { source_path: '/test/data.csv' }, values_are: 'observed_ui_values' } }, output: { status: 'partial', evidence_ref: 'receipt', ports: [
          { port: 0, port_guid: 'port', fresh: true, row_count: 12, schema: [{ index: 0, name: 'amount', label: 'Amount', type: 'real', header_tid: 'internal' }],
            sample: [[{ display_text: '1.2', precision: 'unverified' }]], sample_rows: 1, sample_complete: false,
            precision: { numbers_verified: false, limitations: ['numeric_display_precision'] } },
        ] } } } };
  const before = JSON.stringify(raw), result = compactNodeResult(raw);
  assert.equal(validate(result).valid, true);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(result.node.node_id, 'node');assert.equal(result.package_saved, false);
  assert.equal(result.output.ports[0].precision.numbers_verified, false);
  assert.equal(result.output.ports[0].row_count, 12);
  assert.deepEqual(result.configuration, raw.outcome.output.configuration);
  assert.ok(!JSON.stringify(result).includes('internal'));
  const port = raw.outcome.output.output.ports[0];
  port.sample = Array.from({length:6},(_,i)=>[{value:String(i),precision:'exact_integer',is_null:false}]);
  port.sample_complete = true;
  const complete = compactNodeResult(raw).output.ports[0];
  assert.equal(complete.sample.length,6); assert.equal(complete.sample_complete,true);
  raw.outcome.status = 'AMBIGUOUS';raw.outcome.error = { code: 'UNCERTAIN', message: 'inspect same ID' };
  assert.equal(compactNodeResult(raw).error.code, 'UNCERTAIN');
});
test('compact actions retain navigation and issued UI controls needed for recovery', () => {
  const raw = { operation_id: 'save', status: 'SUCCEEDED', output: { workflow_ref: { workflow_id: 'new' },
    observation_id: 'obs', ui: { elements: [{ ref: 'visible', allowed_actions: ['click'] }] } }, trace: ['internal'] };
  const result = compactActionResult(raw);
  assert.deepEqual(result.output, raw.output);assert.equal(result.trace, undefined);assert.equal(raw.trace.length, 1);
});
test('knowledge bundle retains parameter schemas and revision pins', () => {
  const schema = { type: 'object', required: ['keys'] };
  const result = compactKnowledgeBundle({ session_manifest: { digest: 'pin' }, actions: [{ action_key: 'save', input_schema: schema, revision: '2' }],
    node_types: [{ type: 'transform.sorting', modes: ['keys'], parameter_schema: schema, cache_key: 'cache', source: 'internal references' }] });
  assert.equal(result.session_manifest.digest, 'pin');assert.deepEqual(result.node_types[0].parameter_schema, schema);
  assert.equal(result.node_types[0].cache_key, 'cache');assert.equal(result.node_types[0].source, undefined);
});

test('user-v1 retains exact scalar representation and an explicitly unverified variant without type guessing',()=>{
 const sample=[[{type:'integer',value:'9223372036854775807',representation:'decimal_integer',precision:'exact_integer',is_null:false},{type:'real',value:1,decimal:'1E+00',representation:'binary64',precision:'17_significant_digits',is_null:false},{type:'variant',display_text:'1',representation:'formatted_display',precision:'unverified',is_null:false}]];
 const r=compactNodeResult({operation_id:'x',outcome:{status:'SUCCEEDED',output:{output:{ports:[{sample,schema:[]}]}}}});assert.deepEqual(r.output.ports[0].sample,sample);assert.equal(validate(r).valid,true);
});

test('export result retains byte evidence but excludes host paths and private binding',()=>{
 const file={artifact_id:'file',destination:'/test-2/file.csv',bytes:12,sha256:'a'.repeat(64),execution_id:'run',verification_id:'download',freshness_basis:'native_absence_check_and_completed_execution',path:'/private/host/file.csv',session_id:'private-session'};
 const r=compactNodeResult({operation_id:'export',state:'settled',outcome:{status:'SUCCEEDED',output:{output:{status:'complete',ports:[],file_artifacts:[file]}}}});
 assert.equal(r.output.file_artifacts[0].sha256,file.sha256);assert.equal(r.output.file_artifacts[0].destination,file.destination);
 assert.equal(r.output.file_artifacts[0].path,undefined);assert.equal(r.output.file_artifacts[0].session_id,undefined);assert.equal(validate(r).valid,true);
});

test('installed import discovery supplies its complete parameter vocabulary in compact knowledge', async () => {
  const { createCandidateNodeSupport } = await import('../lib/node-support.mjs');
  const { describeNodeTypes } = await import('../lib/node-contracts.mjs');
  const { nodeApplyInputSchema } = await import('../lib/node-api.mjs');
  const support = createCandidateNodeSupport({ targetOrigin: 'http://example.test', targetBuild: '7.4.2' });
  const cards = describeNodeTypes([...support.nodeApplyHandlers.keys()], { runtime: 'pin' }, new Map(), support.nodeApplyHandlers);
  const knowledge = compactKnowledgeBundle({ session_manifest: { runtime: 'pin' }, actions: [], node_types: cards });
  for (const card of knowledge.node_types) assert.ok(card.parameter_schema, card.type);
  const schema = knowledge.node_types.find(card => card.type === 'imports.text').parameter_schema;
  assert.deepEqual(schema.required, ['source', 'settings']);
  for (const key of ['source', 'settings']) {
    const { description, ...shape } = schema.properties[key];
    assert.deepEqual(shape, nodeApplyInputSchema.properties.parameters.properties[key]);
  }
  assert.deepEqual(Object.keys(schema.properties.settings.properties), ['source', 'format', 'columns']);
  schema.properties.settings.properties.columns.maxItems = 0;
  const fresh = describeNodeTypes(['imports.text'], {}, new Map(), support.nodeApplyHandlers)[0];
  assert.equal(fresh.parameter_schema.properties.settings.properties.columns.maxItems, 1000);
  assert.equal(nodeApplyInputSchema.properties.parameters.properties.settings.properties.columns.maxItems, 1000);
});
