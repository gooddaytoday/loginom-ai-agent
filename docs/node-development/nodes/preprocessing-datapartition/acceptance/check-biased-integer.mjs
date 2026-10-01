import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {compareSamplingPartition} from './sampling-oracle.mjs';

const [directory,reportPath]=process.argv.slice(2);
assert(directory&&reportPath,'Evidence directory and report path required');
const packet=JSON.parse(await readFile(new URL('./biased-integer-expected.json',import.meta.url),'utf8'));
const imported=JSON.parse(await readFile(join(directory,'import.json'),'utf8'));
assert.equal(imported.status,'SUCCEEDED');
const source=imported.output.ports.find(port=>port.port===0);
assert.equal(source.sample_complete,true);
assert.equal(source.filter_enabled,false);
assert.equal(source.precision.numbers_verified,true);
assert.deepEqual(source.sample.map(row=>row.map(cell=>({type:cell.type,is_null:cell.is_null,value:cell.value}))),packet.cases[0].expected.source_rows);
const controls={
 value:result=>result.output.ports[1].sample[0][2].value='999',
 null:result=>{const cell=result.output.ports[1].sample.find(row=>row[1].is_null)[1];cell.is_null=false;cell.value='NULL';},
 port:result=>result.output.ports[1].port_guid='wrong',
 role:result=>result.output.ports[1].role='test',
 schema:result=>result.output.ports[1].schema[1].label='wrong',
 cached:result=>result.output.ports[1].schema[1].data_kind_source='cached',
 precision:result=>result.output.ports[1].precision.numbers_verified=false,
 stale:result=>result.output.ports[1].execution_id='old',
 partial:result=>result.output.ports[1].sample_complete=false,
 filtered:result=>result.output.ports[1].filter_enabled=true,
 member:result=>result.output.ports[0].sample[0][0].value=true,
 missing:result=>result.output.ports[1].sample.pop(),
 extra:result=>result.output.ports[1].sample.push(structuredClone(result.output.ports[1].sample[0])),
 class_quota:result=>{
  // Preserve total counts and membership while moving one B occurrence to A.
  // The independent class frequency must reject this plausible sample.
  const training=result.output.ports[1].sample,combined=result.output.ports[0].sample;
  const b=training.findIndex(row=>row[1].value==='B'),a=training.find(row=>row[1].value==='A');
  const id=training[b][0].value;
  const occurrence=combined.findIndex(row=>row[1].value===id&&!row[0].value);
  training[b]=structuredClone(a);combined[occurrence]=[combined[occurrence][0],...structuredClone(a)];
 },
 settings:result=>result.configuration.readback.parameters.seed.value=18,
};
const cases=[];
for(const entry of packet.cases){
 const result=JSON.parse(await readFile(join(directory,entry.id+'.json'),'utf8'));
 assert.equal(result.status,'SUCCEEDED');
 const mapping=result.configuration.readback.output_mappings;
 assert.equal(mapping.length,3);
 const binding={...result.configuration.readback.node,ports:mapping.map(port=>({index:port.port,guid:port.port_guid}))};
 assert.deepEqual(result.node,bindingNode(binding));
 const oracle=compareSamplingPartition(entry.expected,binding,result);
 assert.equal(oracle.status,'PASS',entry.id+': '+JSON.stringify(oracle));
 const negative=Object.entries(controls).map(([name,corrupt])=>{
  const changed=structuredClone(result);corrupt(changed);
  const verdict=compareSamplingPartition(entry.expected,binding,changed);
  assert.equal(verdict.status,'FAIL',entry.id+': corruption '+name+' accepted');
  return {name,...verdict};
 });
 cases.push({id:entry.id,oracle,negative_controls:negative,execution:result.execution});
}
await writeFile(reportPath,JSON.stringify({status:'PASS',scope:'independent full bias integer frequencies only',product_acceptance:'NOT_RUN',cases},null,2)+'\n');

function bindingNode(binding){return Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,binding[key]]));}
