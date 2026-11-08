import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {auditImportBindings} from '../import-bindings.mjs';
const root=new URL('../../../docs/node-development/variables/bindings/acceptance/import/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),final=JSON.parse(readFileSync(new URL('expected.json',root)));
test('Import binding scenario uses both approved files and three independent exports',()=>{
 execFileSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('import-bindings')
assert c['input_files']==['import-a.csv','import-b.csv'] and c['export_count']==3
assert c['import_initial']=='import/expected-initial.json' and c['prompt'].name=='task-import.md'
`],{cwd:new URL('../../../',import.meta.url)});
});
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},source={...node,node_id:'user'};
 const vars=value=>[{name:'CsvPath',id:1,index:0,type:'string',value},{name:'Sentinel',id:2,index:1,type:'string',value:'keep'}];
 const snapshot=value=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:source,configuration:{readback:{variables:vars(value)}}}});
 const binding={parameter:'/settings/source/source_path',mode:'variable',variable:{name:'CsvPath',type:'string',kind:'variables'},source:{ref:source,type:'variables.user',output:4},verified:true};
 const table=(want,id)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,configuration:{bindings:[binding]},execution:{status:'completed',execution_id:id},output:{ports:want.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:String(r[c.name]),precision:r[c.name]===null?'exact_null':'exact_integer'})))}))}}});
 const value=final.variable_inventory.outputs[0].variables[0].value;
 return [snapshot('/own/a.csv'),table(initial,'first'),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.user',ref:source},parameters:{variables:[{name:'CsvPath',type:'string',value}]}}},snapshot(value),table(final,'second')];
}
test('source-only update preserves the Import GUID, variable IDs, Sentinel and field order',()=>{
 assert.equal(auditImportBindings(history(),initial,final).status,'PASS');
});
for(const fault of ['literal','second node','sentinel','variable identity','reconfigure','stale execution'])test('Import oracle refuses '+fault,()=>{
 const e=history();
 if(fault==='literal')delete e[1].result.configuration.bindings;
 if(fault==='second node')e[4].result.node={...e[4].result.node,node_id:'another'};
 if(fault==='sentinel')e[3].result.configuration.readback.variables[1].value='lost';
 if(fault==='variable identity')e[3].result.configuration.readback.variables[0].id=99;
 if(fault==='stale execution')e[4].result.execution.execution_id='first';
 if(fault==='reconfigure')e.splice(4,0,{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'imports.text',ref:e[1].result.node},parameters:{settings:{source:{source_path:'/own/b.csv'}}},inputs:[],mappings:[]}});
 assert.throws(()=>auditImportBindings(e,initial,final));
});
