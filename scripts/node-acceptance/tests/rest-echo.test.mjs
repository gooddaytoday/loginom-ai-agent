import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sameRestEchoValues} from '../tree-conversion.mjs';
import {matchesExpectedOutput,parseExpectedOutputs,selectColdOutputReads,resolveExportInput,matchExpectedOutputs} from '../expected-outputs.mjs';
const want=JSON.stringify({method:'POST',data:'{"note":"Привет & + /"}'});
test('REST echo compares actual method and raw UTF-8 body while ignoring unstable metadata',()=>{
 assert.ok(sameRestEchoValues(JSON.stringify({origin:'dynamic',headers:{Date:'now'},data:JSON.parse(want).data,method:'POST'}),want));
 for(const value of ['null','[]','{}','{"method":"POST","data":null}','{"method":"POST","data":{}}',
  '{"method":"PUT","data":"x"}', '{"method":"POST","method":"POST","data":"x"}',
  JSON.stringify({method:'POST',data:'{"note":"Привет & + /"} '}),JSON.stringify({method:'POST',data:'{"note":"Привет%20%26%20%2B%20%2F"}'})])assert.equal(sameRestEchoValues(value,want),false);
 assert.ok(sameRestEchoValues('{"method":"DELETE","data":""}','{"method":"DELETE","data":""}'));
 assert.equal(sameRestEchoValues('{"method":"DELETE","data":null}','{"method":"DELETE","data":""}'),false);
});
for(const name of ['post-body','put-body','patch-body','delete'])test(`single REST ${name} cold reads raw response and status on the same native node`,()=>{
 const expected=JSON.parse(readFileSync(new URL(`../../../docs/node-development/nodes/integration-restrequest/acceptance/modes/${name}/expected.json`,import.meta.url)));
 expected.package_path='/own/single.lgp';expected.outputs[0].export_destination='/own/'+name+'.csv';
 const outputs=parseExpectedOutputs(expected).outputs;
 const rest={ref:{node_id:'rest'},type:'integration.rest_request',outputs:[0,1]};
 const graph={complete:true,nodes:[rest,{ref:{node_id:'export'},type:'exports.text',outputs:[]}],links:[{source:'rest',output:0,target:'export',input:0}]};
 const exportInput=resolveExportInput(graph),reads=selectColdOutputReads(graph,outputs,{exportInput});
 assert.equal(reads.length,1);assert.deepEqual(reads[0].ports.map(p=>p.port),[1,0]);
 const actual=outputs.map((o,i)=>({node:rest.ref,type:rest.type,output_port:i,execution:{execution_id:'own'},data:{schema:o.columns,row_count:2,sample_complete:true,precision:{numbers_verified:true},
  sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:c.type==='integer'?String(r[c.name]):r[c.name]})))}}));
 assert.equal(matchExpectedOutputs(actual,outputs,{exportInput}).length,2);
 const bad=structuredClone(actual);bad[1].data.sample[0][3].value='500';assert.throws(()=>matchExpectedOutputs(bad,outputs,{exportInput}));
 const wrong=structuredClone(actual);const echo=JSON.parse(wrong[0].data.sample[0][1].value);echo.method='GET';wrong[0].data.sample[0][1].value=JSON.stringify(echo);
 assert.throws(()=>matchExpectedOutputs(wrong,outputs,{exportInput}));
});
test('C1 raw echo uses stock typed cold matcher, retaining row identities and NULL distinctions',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/integration-restrequest/acceptance/modes/methods-body/expected.json',import.meta.url)));
 fixture.package_path='/own/c1.lgp';fixture.outputs[0].export_destination='/own/methods-body.csv';const expected=parseExpectedOutputs(fixture).outputs[0];
 const data={schema:expected.columns,row_count:8,sample_complete:true,precision:{numbers_verified:true},sample:expected.rows.map(row=>expected.columns.map(c=>({type:c.type,is_null:false,value:c.type==='integer'?String(row[c.name]):c.name==='Response'?JSON.stringify({...JSON.parse(row[c.name]),origin:'random'}):row[c.name]})))};
 assert.ok(matchesExpectedOutput(data,expected));
 for(const mutate of [d=>d.sample[0][0].value='99',d=>d.sample[0][3].is_null=true,d=>d.schema[0].type='string',d=>d.sample.pop(),d=>d.sample[0][3].value='{}']){
  const bad=structuredClone(data);mutate(bad);assert.equal(matchesExpectedOutput(bad,expected),false);
 }
});
