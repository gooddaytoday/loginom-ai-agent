import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {adaptRead,nativeUserPort,temporalProfile} from '../lib/variant-native-values.mjs';
import {nativeCellSchema} from '../lib/variant-native-schema.mjs';
import {nodeApplyResultSchema,nodeJobResultSchema} from '../lib/node-result-schema.mjs';
import {compactNodeResult,userResultSchema} from '../lib/user-results.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
const provider=new AjvJsonSchemaValidator();
const observed=JSON.parse(readFileSync(new URL('../../tools/loginom-acceptance/collapse/variant-contract/observed.json',import.meta.url)));
function result(){
 const raw={read_id:'read',document_id:'doc',workflow_id:'flow',package_id:'package',node_id:'node',port_guid:'port',port:0,
  source:{owner:0,object:3},method:321,interface:116,execution:{status:'completed',execution_id:'doc:1:1'},row_count:15,
  schema:[{name:'Values',label:'Значение',type:6}],owner_rechecked:true,cache_identity_rechecked:true,
  cells:observed[0].cells.slice(0,15).map((c,row)=>({...c,row,column:0,message_id:row}))};
 const table=adaptRead(raw,{expected:structuredClone(raw),dateProfile:temporalProfile,
  lifecycle:{id:'read',status:'completed',published:true,retired:false,pending:0,requests:15,releasedRequests:15,releasedResponses:15},
  consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 const node={operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node:{document_id:'doc',workflow_id:'flow',node_id:'node'},execution:raw.execution,
  output:{status:'complete',evidence_ref:'read',execution_id:raw.execution.execution_id,ports:[{...nativeUserPort(table),port:0,port_guid:'port',fresh:true,execution_id:raw.execution.execution_id,
   precision:{numbers_verified:true,limitations:[],strings:'exact_native'}}]},package_saved:false,cleanup_complete:true,warnings:[]};
 return {operation_id:'op',attempt:1,state:'settled',cancel_requested:false,server_stop_requested:false,progress:null,error:null,
  outcome:{status:'SUCCEEDED',action_key:'node.apply',action_revision:'1.0.0',operation_id:'op',phase:'completed',effect_possible:true,cleanup_complete:true,output:node,error:null,trace:[]}};
}
test('actual strict node schemas, compactor and MCP envelope preserve 15 native rows beyond sample10',()=>{
 const r=result();for(const [schema,value] of [[nodeApplyResultSchema,r.outcome.output],[nodeJobResultSchema,r]]){
  const check=provider.getValidator(schema)(value);assert.equal(check.valid,true,JSON.stringify(check));
 }
 const compact=compactNodeResult(r),port=compact.output.ports[0];
 const userCheck=provider.getValidator(userResultSchema)(compact);assert.equal(userCheck.valid,true,JSON.stringify(userCheck));
 assert.equal(port.sample.length,10);assert.equal(port.sample_complete,false);assert.equal(port.exact_table.rows.length,15);
 assert.deepEqual(port.exact_table,r.outcome.output.output.ports[0].exact_table);
 assert.deepEqual(port.sample,r.outcome.output.output.ports[0].sample);
 for(const userProfile of [true,false]){
  const reply=nodeResultReply(r,{userProfile});assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
  assert.equal(JSON.parse(JSON.stringify(reply)).structuredContent.output?.ports?.[0]?.exact_table?.rows?.length??15,15);
 }
});
test('native union rejects fabricated subtype, unknown/reserved fields and false time semantics',()=>{
 const cells=result().outcome.output.output.ports[0].exact_table.rows.flat(),check=provider.getValidator(nativeCellSchema);
 for(const c of cells)assert.equal(check(c).valid,true,JSON.stringify(c));
 const integer=cells.find(c=>c.cell_type==='integer'),date=cells.find(c=>c.cell_type==='datetime');
 for(const change of [c=>c.cell_type='string',c=>c.native.tag=3,c=>c.native.bits=32,c=>c.native.padding='00',c=>c.value=9007199254740993,c=>delete c.native]){
  const bad=structuredClone(integer);change(bad);assert.equal(check(bad).valid,false);
 }
 for(const change of [c=>c.value='2024-01-01',c=>c.timezone='UTC',c=>c.native.epoch_verified=true,c=>c.native.semantic_scope='civil_time']){
  const bad=structuredClone(date);change(bad);assert.equal(check(bad).valid,false);
 }
});
test('default read remains compatible and full does not admit provenance assertions',()=>{
 const check=provider.getValidator(nodeApplyInputSchema.properties.read),old={ports:[0],sample_rows:10,require_exact_numbers:false};
 assert.equal(check(old).valid,true);assert.equal(check({...old,coverage:'full'}).valid,true);
 for(const extra of [{coverage:'all'},{owned_static:true},{expected:{verified:true}},{sample_rows:101}])assert.equal(check({...old,...extra}).valid,false);
});
test('1 MiB is checked on the actual escaped MCP envelope and never truncates or alters the checkpoint',()=>{
 const r=result();r.outcome.output.output.ports[0].exact_table.rows[0][0].value='"'.repeat(180000);
 assert.ok(Buffer.byteLength(JSON.stringify(compactNodeResult(r)))<1048576);
 const before=JSON.stringify(r);
 for(const userProfile of [true,false])assert.throws(()=>nodeResultReply(r,{userProfile}),e=>e.code==='EXACT_FULL_SERIALIZATION_LIMIT');
 assert.equal(JSON.stringify(r),before);
});
