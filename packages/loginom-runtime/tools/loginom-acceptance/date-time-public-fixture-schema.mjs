// Model-free validation of synthetic test fixtures against the actual public API.
// Schema validity is not proof of live execution or independent business success.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {nodeJobResultSchema} from '../../client/lib/node-result-schema.mjs';
import {nodeApplyInputSchema} from '../../client/lib/node-api.mjs';

const validator = new AjvJsonSchemaValidator();
const validateResult = validator.getValidator(nodeJobResultSchema);
const validateRead = validator.getValidator(nodeApplyInputSchema.properties.read);
const envelope = port => ({operation_id:'fixture-op',attempt:1,state:'settled',cancel_requested:false,
  server_stop_requested:false,progress:null,error:null,outcome:{status:'SUCCEEDED',action_key:'node.apply',
    action_revision:'1.0.0',operation_id:'fixture-op',phase:'node_ready',effect_possible:true,cleanup_complete:true,
    error:null,trace:[],output:{operation_id:'fixture-op',status:'SUCCEEDED',effect_possible:true,phases:[],
      node:{document_id:'fixture-document',workflow_id:'fixture-workflow',node_id:'fixture-node'},
      execution:{status:'completed',execution_id:'fixture-execution'},
      output:{status:'complete',evidence_ref:'fixture-read',ports:[port]},
      package_saved:false,cleanup_complete:true,warnings:[]}}});
const ports = JSON.parse(fs.readFileSync(0,'utf8'));
assert.ok(Array.isArray(ports) && ports.length > 0);
for (const port of ports) {
  const r = validateResult(envelope(port));
  assert.equal(r.valid,true,r.errorMessage);
  const read = validateRead({ports:[port.port],sample_rows:port.sample_rows,require_exact_numbers:true});
  assert.equal(read.valid,true,read.errorMessage);
}
let rejected = 0;
// RC9 public limit: sample/sample_rows are bounded by 100 in node-result-schema
// and node-api read; the first two oversize values must still be refused.
for (const size of [101,102]) {
  const bad = structuredClone(ports.find(p => p.sample.length));
  bad.sample = Array.from({length:size},()=>structuredClone(bad.sample[0]));
  bad.sample_rows = bad.row_count = size;
  assert.equal(validateResult(envelope(bad)).valid,false,'Oversized result must be rejected');
  assert.equal(validateRead({ports:[0],sample_rows:size,require_exact_numbers:true}).valid,false,'Oversized read must be rejected');
  rejected += 2;
}
console.log(JSON.stringify({positive_results:ports.length,positive_reads:ports.length,oversize_rejections:rejected,live_evidence:false}));
