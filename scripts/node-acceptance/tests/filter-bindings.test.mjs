import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {auditFilterBindings} from '../filter-bindings.mjs';
const root=new URL('../../../docs/node-development/variables/bindings/acceptance/filter/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),final=JSON.parse(readFileSync(new URL('expected.json',root)));
test('filter binding catalog uses the approved task, two phases, six CSVs and one input',()=>{
 const code=`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('filter-bindings')
assert c['input_files']==['filter.csv'] and c['export_count']==6
assert c['filter_initial']=='filter/expected-initial.json' and c['expected_name']=='filter/expected.json'
assert c['prompt'].name=='task-filter.md' and c['oracle'].is_file()
`;
 execFileSync('python3',['-B','-c',code],{cwd:new URL('../../../',import.meta.url)});
});
function history(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter'},source={...node,node_id:'user'};
 const vars=value=>[{name:'Limit',id:1,index:0,type:'integer',value},{name:'Sentinel',id:2,index:1,type:'string',value:'keep'}];
 const snapshot=value=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:source,configuration:{readback:{variables:vars(value)}}}});
 const binding={parameter:'/groups/0/0/value',mode:'variable',variable:{name:'Limit',type:'integer'},source:{ref:source,type:'variables.user',output:4},verified:true};
 const table=(want,id,config)=>({phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,configuration:config,execution:{status:'completed',execution_id:id},output:{ports:want.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:String(r[c.name]),precision:r[c.name]===null?'exact_null':'exact_integer'})))}))}}});
 return [snapshot(5),table(initial,'first',{bindings:[binding]}),{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'variables.user',ref:source},parameters:{variables:[{name:'Limit',type:'integer',value:8}]}}},snapshot(8),table(final,'second',{status:'not_requested'})];
}
test('the main oracle requires source-only update and fresh results on the same filter',()=>{
 assert.equal(auditFilterBindings(history(),initial,final).status,'PASS');
});
for(const fault of ['literal','second node','sentinel','identity','reconfigure','stale execution'])test('the main oracle rejects '+fault,()=>{
 const events=history();
 if(fault==='literal')delete events[1].result.configuration.bindings;
 if(fault==='second node')events[4].result.node={...events[4].result.node,node_id:'another'};
 if(fault==='sentinel')events[3].result.configuration.readback.variables[1].value='lost';
 if(fault==='identity')events[3].result.configuration.readback.variables[0].id=3;
 if(fault==='reconfigure')events.splice(4,0,{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'transform.filter_data',ref:events[1].result.node},mode:'conditions',parameters:{groups:[]}}});
 if(fault==='stale execution')events[4].result.execution.execution_id='first';
 assert.throws(()=>auditFilterBindings(events,initial,final),{literal:/FILTER_BINDING_INITIAL/,'second node':/FILTER_BINDING_FINAL_SAME_NODE/,sentinel:{code:'ERR_ASSERTION'},identity:{code:'ERR_ASSERTION'},reconfigure:/FILTER_BINDING_RECONFIGURED/,'stale execution':/FILTER_BINDING_FINAL_SAME_NODE/}[fault]);
});
test('native final column order may change while values and types stay exact',()=>{
 const events=history(),expected=structuredClone(final);
 for(const o of expected.outputs)o.column_order='any';
 for(const p of events[4].result.output.ports){p.schema.reverse();for(const row of p.sample)row.reverse();}
 assert.equal(auditFilterBindings(events,initial,expected).status,'PASS');
 events[4].result.output.ports[0].sample[0][0].value='100';
 assert.throws(()=>auditFilterBindings(events,initial,expected),/FILTER_BINDING_FINAL_SAME_NODE/);
});

test('Top-N audits the saved row-number condition and source-only 3 to 5 update',()=>{
 const topRoot=new URL('../../../docs/node-development/nodes/row-filter/acceptance/typed/',import.meta.url);
 const first=JSON.parse(readFileSync(new URL('expected-top-initial.json',topRoot))),last=JSON.parse(readFileSync(new URL('expected-top-final.json',topRoot)));
 const events=history();
 for(const index of [0,3])events[index].result.configuration.readback.variables=[{name:'TopN',id:1,index:0,type:'integer',cell:{type:'integer',is_null:false,value:index===0?'3':'5',precision:'exact_integer'}}];
 events[1].result.configuration.bindings[0].variable.name='TopN';
 events[1].result.configuration.readback={groups:[[{field:{kind:'row_number'},type:'integer',operator:'<=',value:{kind:'variable',name:'TopN'}}]]};
 events[2].request.parameters.variables=[{name:'TopN',type:'integer',value:5}];
 for(const [index,want] of [[1,first],[4,last]])events[index].result.output.ports=want.outputs.map(o=>({port:o.output_port,fresh:true,
  execution_id:events[index].result.execution.execution_id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},
  schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,
   value:r[c.name]===null?null:String(r[c.name]),precision:r[c.name]===null?'exact_null':c.type==='real'?'exact_native':c.type==='datetime'?'millisecond':'exact_integer',
   ...(c.type==='datetime'?{representation:'local_datetime',timezone:'unspecified'}:{})})))}));
 assert.equal(auditFilterBindings(events,first,last).status,'PASS');
 events[1].result.configuration.readback.groups[0][0].field={kind:'input_field',name:'RowID'};
 assert.throws(()=>auditFilterBindings(events,first,last),/FILTER_TOP_N_CONDITION/);
});
for(const typed of [true,false])test('typed oracle checks '+(typed?'two source thresholds and same-node update':'NULL reference and empty/full partition'),()=>{
 const root=new URL('../../../docs/node-development/nodes/row-filter/acceptance/typed/',import.meta.url);
 const initial=JSON.parse(readFileSync(new URL(typed?'expected-typed-initial.json':'expected-null.json',root)));
 const final={...JSON.parse(readFileSync(new URL(typed?'expected-typed-final.json':'expected-null.json',root))),[typed?'row_filter_typed':'row_filter_null']:true};
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter'},source={...node,node_id:'vars'};
 const conditions=[{field:{kind:'input_field',name:'Score'},type:'real',operator:'>=',value:{kind:'variable',name:'MinScore'}},
  ...(typed?[{field:{kind:'input_field',name:'Seen'},type:'datetime',operator:'>=',value:{kind:'variable',name:'Since'}}]:[])];
 const vars=updated=>conditions.map((c,i)=>({name:c.value.name,id:i+1,index:i,type:c.type,
  cell:{type:c.type,is_null:!typed,value:!typed?null:i===0?updated?0.5:2.5:updated?'2024-02-29T00:00:00.000':'2024-03-01T00:00:00.000'}}));
 const snapshot=updated=>({phase:'node_checkpoint',result:{node:source,status:'SUCCEEDED',cleanup_complete:true,configuration:{readback:{variables:vars(updated)}}}});
 const table=(want,id)=>({phase:'node_checkpoint',result:{node,status:'SUCCEEDED',cleanup_complete:true,
  configuration:{readback:{groups:[conditions]},bindings:conditions.map((c,i)=>({parameter:`/groups/0/${i}/value`,mode:'variable',verified:true,
   variable:{name:c.value.name,type:c.type,is_null:!typed},source:{type:'variables.user',output:4,ref:source}}))},execution:{status:'completed',execution_id:id},
  output:{ports:want.outputs.map(o=>({port:o.output_port,fresh:true,execution_id:id,row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},
   schema:o.columns.map(c=>({...c,label:c.name})),sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:r[c.name]===null,value:r[c.name]===null?null:String(r[c.name]),
    precision:r[c.name]===null?'exact_null':c.type==='real'?'exact_native':c.type==='datetime'?'millisecond':'exact_integer',
    ...(c.type==='datetime'?{representation:'local_datetime',timezone:'unspecified'}:{})})))}))}}});
 const events=[snapshot(false),table(initial,'first'),...(typed?[{phase:'node_apply_prepared',request:{target:{type:'variables.user',ref:source},
  parameters:{variables:[{name:'MinScore',type:'real',value:0.5},{name:'Since',type:'datetime',value:'2024-02-29T00:00:00'}]}}},snapshot(true),table(final,'last')]:[])];
 assert.equal(auditFilterBindings(events,initial,final).status,'PASS');
 const bad=structuredClone(events);bad[1].result.configuration.readback.groups[0][0].value=typed?2.5:0;
 assert.throws(()=>auditFilterBindings(bad,initial,final),/FILTER_TYPED_CONDITIONS/);
 const stale=structuredClone(events);stale[1].result.configuration.bindings[0].variable.is_null=typed;
 assert.throws(()=>auditFilterBindings(stale,initial,final));
 if(typed){
  const reconfigured=structuredClone(events);reconfigured.splice(4,0,{phase:'node_apply_prepared',request:{target:{kind:'existing',type:'transform.filter_data',ref:node},parameters:{groups:[conditions]},inputs:[],mappings:[]}});
  assert.throws(()=>auditFilterBindings(reconfigured,initial,final),/FILTER_TYPED_RECONFIGURED/);
  const moved=structuredClone(events);moved[3].result.configuration.readback.variables[0].id=3;
  assert.throws(()=>auditFilterBindings(moved,initial,final),/FILTER_TYPED_IDENTITY/);
 }
});
