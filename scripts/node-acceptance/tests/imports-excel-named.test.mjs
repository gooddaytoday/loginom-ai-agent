import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkExcelNamedMain} from '../imports-excel-named.mjs';
import {parseExpectedOutputs} from '../expected-outputs.mjs';

const root=new URL('../../../docs/node-development/nodes/imports-excel/acceptance/excel-import-named/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),updated=JSON.parse(readFileSync(new URL('expected.json',root)));
test('C3 catalog uses only approved task/named.xlsx, initial CSV and final stock cold oracle',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('excel-import-named');e=m.expected_for(c,'/own/named.lgp')
assert c['prompt'].read_bytes()==(c['source'].parent/'capabilities/task-named-range.md').read_bytes()
assert (c['data']/'named.xlsx').read_bytes()==(c['source'].parent/'capabilities/fixtures/named.xlsx').read_bytes()
assert len(list(c['data'].iterdir()))==1 and c['excel_named_initial']=='expected-initial.json'
assert len(e['outputs'])==1 and len(e['outputs'][0]['rows'])==3
assert e['excel_named_range']==dict(name='SalesRange',extend_range=True,header_rows=1)
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(parseExpectedOutputs({...updated,package_path:'/own/named.lgp'}).outputs[0].columns.length,2);
 const oracle=spawnSync('python3',['-B',new URL('oracle.py',root).pathname],{encoding:'utf8'});
 assert.equal(oracle.status,0,oracle.stdout+oracle.stderr);
});
function evidence(){
 const round=(want,index)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,
  node:{document_id:'doc',workflow_id:'flow',node_id:'excel'},execution:{status:'completed',execution_id:'exec'+index},
  configuration:{readback:{kind:'excel_import',source:{source_path:'/own/named.xlsx',sheet_method:'Именованный диапазон',sheet:'SalesRange',named_range:'SalesRange',extend_range:index===1,header_rows:1}}},
  output:{ports:[{port:0,fresh:true,execution_id:'exec'+index,freshness_basis:'completed_execution_port_source',schema:want.outputs[0].columns.map((f,index)=>({...f,index})),
   row_count:want.outputs[0].rows.length,sample_complete:true,precision:{numbers_verified:true},
   sample:want.outputs[0].rows.map(row=>['Id','Amount'].map(name=>({type:'integer',is_null:false,value:String(row[name]),precision:'exact_integer'})))}]}}});
 return [{phase:'node_apply_prepared',request:{target:{kind:'new',type:'imports.excel'}}},round(initial,0),round(updated,1)];
}
test('C3 audit accepts two full typed native executions on one node',()=>{
 assert.equal(checkExcelNamedMain(initial,updated,evidence()).status,'PASS');
});
for(const fault of ['node','range','extension','type','value','order','freshness','execution','incomplete','path','substitute'])test('C3 audit rejects '+fault,()=>{
 const e=evidence(),r=e[2].result,p=r.output.ports[0];
 if(fault==='node')r.node.node_id='replacement';
 if(fault==='range')r.configuration.readback.source.named_range='SalesRangeOther';
 if(fault==='extension')r.configuration.readback.source.extend_range=false;
 if(fault==='type')p.schema[1].type='real';
 if(fault==='value')p.sample[2][0].value='99';
 if(fault==='order')p.sample.reverse();
 if(fault==='freshness')p.freshness_basis='grid';
 if(fault==='execution')r.execution.execution_id='exec0';
 if(fault==='incomplete')p.sample_complete=false;
 if(fault==='path')r.configuration.readback.source.source_path='/own/other.xlsx';
 if(fault==='substitute')e.push({phase:'node_apply_prepared',request:{target:{type:'transform.calculator',kind:'new'}}});
 assert.throws(()=>checkExcelNamedMain(initial,updated,e),/EXCEL_NAMED_/);
});
