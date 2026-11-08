import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {auditBooleanBindings} from '../bindings-grouping-sort.mjs';
const root=new URL('../../../docs/node-development/variables/bindings/acceptance/cycle3/grouping/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),final=JSON.parse(readFileSync(new URL('expected.json',root)));
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter'},source={...node,node_id:'user'};
 const vars=value=>[{name:'Flag',id:1,index:0,type:'boolean',value},{name:'Sentinel',id:2,index:1,type:'string',value:'keep'}];
 const snapshot=value=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:source,configuration:{readback:{variables:vars(value)}}}});
 const binding={parameter:'/sort_result',mode:'variable',variable:{name:'Flag',type:'boolean'},source:{ref:source,type:'variables.user',output:4},verified:true};
 const table=(want,id,config)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,configuration:config,execution:{status:'completed',execution_id:id},output:{ports:want.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:String(r[c.name]),precision:r[c.name]===null?'exact_null':c.type==='real'?'exact_native':'exact_integer'})))}))}}});
 return [snapshot(false),table(initial,'first',{bindings:[binding]}),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.user',ref:source},parameters:{variables:[{name:'Flag',type:'boolean',value:true}]}}},snapshot(true),table(final,'second',{status:'not_requested'})];
}
test('the main oracle requires source-only update and fresh results on the same grouping',()=>{
 assert.equal(auditBooleanBindings(history(),initial,final).status,'PASS');
});
for(const fault of ['literal','second node','sentinel','identity','reconfigure','stale execution'])test('the main oracle rejects '+fault,()=>{
 const events=history();
 if(fault==='literal')delete events[1].result.configuration.bindings;
 if(fault==='second node')events[4].result.node={...events[4].result.node,node_id:'another'};
 if(fault==='sentinel')events[3].result.configuration.readback.variables[1].value='lost';
 if(fault==='identity')events[3].result.configuration.readback.variables[0].id=3;
 if(fault==='reconfigure')events.splice(4,0,{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'transform.group_data',ref:events[1].result.node},mode:'conditions',parameters:{groups:[]}}});
 if(fault==='stale execution')events[4].result.execution.execution_id='first';
 assert.throws(()=>auditBooleanBindings(events,initial,final),{literal:/BOOLEAN_BINDING_INITIAL/,'second node':/BOOLEAN_BINDING_FINAL_SAME_NODE/,sentinel:{code:'ERR_ASSERTION'},identity:{code:'ERR_ASSERTION'},reconfigure:/BOOLEAN_BINDING_RECONFIGURED/,'stale execution':/BOOLEAN_BINDING_FINAL_SAME_NODE/}[fault]);
});
test('cycle3 scenarios register unchanged tasks, fixtures, two phases and three exports',()=>{
 execFileSync('python3',['-B','-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for name,node in [('bindings-grouping-sort','grouping'),('bindings-sorting-locale','sorting')]:
 c=m.scenario(name)
 assert c['input_files']==['modes.csv'] and c['export_count']==3
 assert c['binding_initial']==node+'/expected-initial.json' and c['expected_name']==node+'/expected.json'
 assert c['prompt'].name=='task-'+node+'.md' and c['oracle'].is_file()
 assert c['data'].name=='fixtures' and c['data'].parent.name==node
`],{cwd:new URL('../../../',import.meta.url)});
});
