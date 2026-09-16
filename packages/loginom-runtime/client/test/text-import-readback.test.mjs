import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
const check=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration);
test('projects complete observed settings and native source mapping without UI references or request values',()=>{
 const input=fixture(),readback=textImportConfigurationReadback(input);
 assert.equal(readback.source.encoding,'UTF-8 (65001)');
 assert.equal(readback.format.delimiter,'Точка с запятой');
 assert.equal(readback.format.null_marker,'\\N');
 assert.equal(readback.columns.length,5);assert.equal(readback.output_mapping.autosync,false);
 assert.deepEqual(readback.output_mapping.fields.map(f=>[f.name,f.source_name]),
  [['Price','UnitPrice'],['Id','Id'],['Region','Region'],['Quantity','Quantity'],['Comment','Comment']]);
 assert.equal(check({status:'applied',readback}).valid,true);
 assert.equal(readback.package_persistence_verified,false);
 input.node.node_id='other';input.phases[0].value.columns[0].name='changed';
 assert.equal(readback.node.node_id,'sales');assert.equal(readback.columns[0].name,'Id');
 assert.ok(!JSON.stringify(readback).includes('record_id'));
});
for(const [name,mutate] of Object.entries({
 truncated:x=>x.phases[0].value.source.fields.encoding.truncated=true,
 unobserved:x=>x.phases[0].value.format.fields.delimiter.status='unknown',
 wrongReceipt:x=>x.phases[0].receipt_id='other:configure',
 unverified:x=>x.phases[0].value.verified=false,
 incompleteColumns:x=>x.phases[0].value.columns.splice(0,1),
 foreignMapping:x=>x.phases[1].value.native_mapping.target_fields[0].source.record_id='foreign',
 sourceMismatch:x=>x.phases[1].value.native_mapping.target_fields[0].source.name='foreign',
 unknownInventory:x=>x.phases[1].value.native_mapping.inventory_complete=false,
 unverifiedSource:x=>x.phases[1].value.source_identity_verified=false,
 unapplied:x=>x.phases[2].value.settings_applied=false,
 close:x=>x.phases[2].value.mode='close',
 duplicateReceipt:x=>x.phases.push(structuredClone(x.phases[0])),
}))test('readback rejects '+name,()=>{const x=fixture();mutate(x);assert.throws(()=>textImportConfigurationReadback(x),/Import readback/)});
test('public readback cannot claim package persistence or lose identity',()=>{
 const readback=textImportConfigurationReadback(fixture());
 for(const patch of [{package_persistence_verified:true},{node:null},{receipt_ids:[]},{scope:'saved_package'}])
  assert.equal(check({status:'applied',readback:{...readback,...patch}}).valid,false);
});
