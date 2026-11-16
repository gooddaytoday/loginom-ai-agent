import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {checkExcelAutoMain} from '../imports-excel-auto.mjs';

for(const kind of ['none','new','columns','types'])test('C8 '+kind+' resolves original task/books and unchanged proposed case',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('excel-import-auto-${kind}');assert c['prompt'].name=='task-auto-${kind}.md'
assert len(c['input_files'])==2 and all((c['data']/f).is_file() for f in c['input_files'])
e=m.expected_for(c,'/worker/test.lgp');assert e['package_path']=='/worker/test.lgp'
assert e['excel_auto']['file']==c['input_files'][1]
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/imports-excel/acceptance/auto-schema/expected-new.json',import.meta.url)));
const node={document_id:'doc',workflow_id:'wf',node_id:'excel'};
function events(){
 const policy=expected.excel_auto;
 const checkpoint=(file,want,execution_id)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,
  execution:{status:'completed',execution_id},configuration:{readback:{kind:'excel_import',auto_detect:policy.mode,source:{source_path:'/own/prefix-'+file}}},
  output:{ports:[{port:0,fresh:true,execution_id,row_count:want.rows.length,schema:want.columns.map((f,index)=>({...f,index})),sample_complete:true,precision:{numbers_verified:true},
   sample:want.rows.map(row=>want.columns.map(f=>({type:f.type,is_null:false,value:f.type==='integer'?String(row[f.name]):row[f.name]})))}]}}});
 return [checkpoint(policy.initial,policy.initial_output,'one'),checkpoint(policy.file,expected.outputs[0],'two'),
  {phase:'node_apply_prepared',request:{target:{type:'imports.excel',kind:'new'}}},
  {phase:'node_apply_prepared',request:{target:{type:'imports.excel',kind:'existing',ref:node},parameters:{excel:{source_path:'/own/prefix-'+policy.file,auto_detect:'new'}},mappings:[]}}];
}
test('C8 main audit needs two typed rounds on the same node and a native path-only policy patch',()=>{
 const e=events();assert.equal(checkExcelAutoMain(expected,e).status,'PASS');
 for(const mutate of [e=>e[1].result.node={...node,node_id:'replacement'},e=>e[1].result.execution.execution_id='one',
  e=>e.at(-1).request.parameters.excel.columns=[],e=>e[1].result.output.ports[0].schema.pop()]){
  const changed=events();mutate(changed);assert.throws(()=>checkExcelAutoMain(expected,changed));
 }
});
