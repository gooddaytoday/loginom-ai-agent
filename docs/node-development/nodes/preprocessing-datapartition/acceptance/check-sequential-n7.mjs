import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareSequentialPartition} from './sequential-oracle.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const frozen=JSON.parse(await readFile(join(root,'sequential-n7-rows-expected.json'),'utf8'));
const original=JSON.parse(await readFile(join(root,'sequential-rows-expected.json'),'utf8'));
const [directory,output,sourceSha,packagePath]=process.argv.slice(2);
if(!directory||!output||!/^[a-f0-9]{40}$/.test(sourceSha??'')||!packagePath)throw Error('Usage: node check-sequential-n7.mjs EVIDENCE OUT SOURCE_SHA PACKAGE_PATH');
const first=JSON.parse(await readFile(join(directory,'seq-percent-50-25.json'),'utf8'));
const binding={document_id:first.node.document_id,owner:{source_sha:sourceSha,package_path:packagePath,node_id:first.node.node_id,workflow_id:first.node.workflow_id},ports:first.output.ports.map(port=>({index:port.port,guid:port.port_guid}))};
const report={product_acceptance:'NOT_RUN',source_sha:binding.owner.source_sha,independent_expected_frozen_at:frozen.frozen_at,binding,cases:[]};
for(const [id,rows] of Object.entries(frozen.cases)){
 let result;
 try{result=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'))}catch(error){if(error.code==='ENOENT')continue;throw error}
 const parameters={mode:'sequential',training:{unit:'rows',value:id.startsWith('seq-overflow')?9:2},test:{unit:'rows',value:id.startsWith('seq-overflow')?9:3},priority:id==='seq-overflow-training'||id==='seq-order-unused-test-training'?'training':'test',test_position:id==='seq-test-start'?'start':id==='seq-test-end'||id==='seq-order-unused-test-training'?'end':'algorithm',seed:{policy:'fixed',value:17},sequential:{order:id==='seq-order-unused-test-training'?['unused','test','training']:['training','test','unused']}};
 const expected={version:'data-partition-independent-v1',settings:parameters,ports:original.ports.map(port=>({...port,rows:rows[port.role==='combined'?'expected_combined':port.role==='training'?'expected_training':'expected_test']}))};
 const verdict=compareSequentialPartition(expected,binding,result);
 const controls=[];
 if(verdict.status==='PASS')for(const [name,change] of [
  ['precision',r=>r.output.ports[0].precision.numbers_verified=false],
  ['precision-limit',r=>r.output.ports[0].precision.limitations=['unverified']],
  ['port',r=>r.output.ports[0].port_guid='wrong'],
  ['schema',r=>r.output.ports[0].schema[0].type='string'],
  ['cached',r=>r.output.ports[0].schema[0].data_kind_source='cached'],
  ['stale',r=>r.output.ports[0].execution_id='old'],
  ['filtered',r=>r.output.ports[0].filter_enabled=true],
  ['partial',r=>r.output.ports[0].sample_complete=false],
  ['NULL',r=>r.output.ports[0].sample[0][1]={type:'integer',is_null:true,value:null}],
  ['value',r=>r.output.ports[0].sample[0][1].value='999'],
  ['membership',r=>r.output.ports[0].sample[0][0].value=!r.output.ports[0].sample[0][0].value],
  ['lost-occurrence',r=>{r.output.ports[0].sample.pop();r.output.ports[0].row_count--}],
  ['extra-occurrence',r=>{r.output.ports[0].sample.push(structuredClone(r.output.ports[0].sample[0]));r.output.ports[0].row_count++}],
  ['same-count-duplicate',r=>r.output.ports[0].sample[1]=structuredClone(r.output.ports[0].sample[0])]
 ]){const changed=structuredClone(result);change(changed);const control=compareSequentialPartition(expected,binding,changed);if(control.status!=='FAIL')throw Error('Accepted corruption '+name);controls.push({name,...control})}
 report.cases.push({id,verdict,controls});
}
report.status=report.cases.length===Object.keys(frozen.cases).length&&report.cases.every(x=>x.verdict.status==='PASS')?'PASS':report.cases.some(x=>x.verdict.status==='FAIL')?'FAIL':'PARTIAL';
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.cases.map(x=>({id:x.id,verdict:x.verdict,controls:x.controls.length}))));
