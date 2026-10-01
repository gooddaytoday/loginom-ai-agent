import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compareSamplingPartition} from '../../../../docs/node-development/nodes/preprocessing-datapartition/acceptance/sampling-oracle.mjs';

const source=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/preprocessing-datapartition/acceptance/random-base-expected.json',import.meta.url),'utf8'));
function fixture(){
 const expected=structuredClone(source);
 expected.settings.mode='biased';
 expected.settings.biased={field:'Group',adjustments:[{value:{type:'string',is_null:false,value:'A'},factor:1},{value:{type:'string',is_null:false,value:'B'},factor:2}]};
 const binding={document_id:'doc',node_id:'node',workflow_id:'workflow',ports:[0,1,2].map(index=>({index,guid:'port-'+index}))};
 const rows=[source.source_rows.slice(0,6),source.source_rows.slice(6,9)];
 const combined=[...rows[0].map(row=>[{type:'boolean',is_null:false,value:false},...row]),...rows[1].map(row=>[{type:'boolean',is_null:false,value:true},...row])];
 const result={node:{document_id:'doc',node_id:'node',workflow_id:'workflow'},execution:{status:'completed',execution_id:'execution'},configuration:{status:'applied',readback:{mode:'biased',parameters:Object.fromEntries(Object.entries(expected.settings).filter(([key])=>key!=='mode'))}},output:{ports:[combined,...rows].map((sample,port)=>({port,role:['combined','training','test'][port],port_guid:'port-'+port,execution_id:'execution',fresh:true,precision:{numbers_verified:true,limitations:[]},sample_complete:true,filter_enabled:false,row_count:sample.length,sample,schema:expected.schemas[port].map(field=>({...field,data_kind_source:'fresh_native'}))}))}};
 return {expected,binding,result};
}

test('sampling settings compare typed bias keys independently of native row order',()=>{
 const {expected,binding,result}=fixture();
 result.configuration.readback.parameters=structuredClone(result.configuration.readback.parameters);
 result.configuration.readback.parameters.biased.adjustments.reverse();
 assert.equal(compareSamplingPartition(expected,binding,result).status,'PASS');
 assert.equal(expected.settings.biased.adjustments[0].value.value,'A');
});

test('canonical bias order preserves exact factors, typed keys and adjustment multiplicity',()=>{
 for(const corrupt of [settings=>settings.biased.adjustments[0].factor=1.01,settings=>settings.biased.adjustments[0].value={type:'string',is_null:true,value:null},settings=>settings.biased.adjustments.push(structuredClone(settings.biased.adjustments[0]))]){
  const {expected,binding,result}=fixture();
  result.configuration.readback.parameters=structuredClone(result.configuration.readback.parameters);
  corrupt(result.configuration.readback.parameters);
  assert.deepEqual(compareSamplingPartition(expected,binding,result),{status:'FAIL',error:'EFFECTIVE_SETTINGS_CHANGED'});
 }
});
