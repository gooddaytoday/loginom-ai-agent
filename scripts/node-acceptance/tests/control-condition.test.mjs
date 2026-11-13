import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {checkConditionBranches,checkColdConditionActivity,inspectColdConditionBranches} from '../control-condition.mjs';
import {matchesExpectedOutput} from '../expected-outputs.mjs';

const root=new URL('../../../docs/node-development/nodes/control-condition/acceptance/',import.meta.url);
const initial=JSON.parse(readFileSync(new URL('expected-initial.json',root))),final=JSON.parse(readFileSync(new URL('expected.json',root)));

test('condition-variable: detailed.csv uses expected-initial.json, other.csv and cold use expected.json',()=>{
 const r=spawnSync('python3',['-B','-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('condition-variable')
assert c['prompt']==c['source']/'task.md' and c['input_files']==['orders.csv'] and (c['data']/'orders.csv').is_file()
assert c['export_count']==2 and c['condition_initial']=='expected-initial.json'
assert m.read(c['source']/c['condition_initial'])['outputs'][0]['output_port']==0
for cold in (False,True):
    e=m.expected_for(c,'/own/condition.lgp',cold=cold)
    assert e['package_path']=='/own/condition.lgp' and [o['output_port'] for o in e['outputs']]==[1], e
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});

const cell=(type,v)=>v===null?{type,is_null:true,value:null,precision:'exact_null'}
 :type==='integer'?{type,is_null:false,value:String(v),precision:'exact_integer'}
 :type==='real'?{type,is_null:false,value:v,precision:'17_significant_digits',decimal:String(v)}
 :type==='boolean'?{type,is_null:false,value:v,precision:'exact_boolean'}:{type,is_null:false,value:v,precision:'source_text'};
const port=(want,port,execution_id)=>({port,fresh:true,execution_id,freshness_basis:'completed_execution_port_source',sample_complete:true,
 schema:want.columns.map((c,index)=>({index,name:c.name,label:c.name,type:c.type})),row_count:want.rows.length,precision:{numbers_verified:true},
 sample:want.rows.map(row=>want.columns.map(c=>cell(c.type,row[c.name])))});
const node={document_id:'doc',workflow_id:'flow',node_id:'cond'};
const round=(read,active,execution_id,variable)=>({phase:'node_checkpoint',recorded_at:execution_id,result:{status:'SUCCEEDED',cleanup_complete:true,node:{...node},
 execution:{status:'completed',execution_id},
 configuration:{readback:{kind:'control_condition',branches:[{name:'Detailed',output_port:0,conditions:[{variable,relation:'=',value:1}]},{name:'Иначе',output_port:1,conditions:null}]}},
 output:{ports:[port(read===0?initial.outputs[0]:final.outputs[0],read,execution_id)],
  branch_activity:active.map((executed,port)=>({port,label:['Detailed','Иначе'][port]+' - Порт1',executed}))}}});
const request=(type,kind,extra={})=>({phase:'node_apply_prepared',request:{target:{type,kind,...(kind==='existing'?{ref:{...node}}:{})},parameters:{},inputs:[],mappings:[],...extra}});
function evidence(){
 return [request('imports.text','new'),request('variables.user','existing',{mode:'values',parameters:{variables:[{name:'Mode',type:'integer',value:1}]}}),
  request('control.condition','new',{mode:'ports'}),request('control.condition','existing',{mode:'variable_branch',parameters:{branches:[{name:'Detailed',variable:'Mode',operator:'=',value:1}]}}),
  round(0,[true,false],'e2','Mode'),request('exports.text','new'),
  request('variables.user','existing',{mode:'values',parameters:{variables:[{name:'Mode',type:'integer',value:0}]}}),
  request('control.condition','existing',{mode:'variable_branch'}),round(1,[false,true],'e4',null),request('exports.text','new')];
}

test('the CSV comparison alone cannot tell the branches apart',()=>{
 // Same rows and columns; only output_port differs, and CSV export carries no port.
 assert.deepEqual({...initial.outputs[0],output_port:null},{...final.outputs[0],output_port:null});
 assert.equal(matchesExpectedOutput(port(final.outputs[0],1,'e'),initial.outputs[0]),true);
});

test('branch checker accepts Detailed then Иначе on one node without reconfiguration',()=>{
 assert.deepEqual(checkConditionBranches(initial,final,evidence()),{status:'PASS',node,executions:['e2','e4'],branch_activity:[[true,false],[false,true]]});
});

for(const fault of ['always-else','initial-activity','final-activity','both-ports','no-update','other-node','same-execution','reconfigured','relinked','substitute','second-condition','stale','incomplete','other-value'])
 test('branch checker rejects '+fault,()=>{
  const e=evidence(),first=e[4].result,second=e[8].result;
  if(fault==='always-else')e[4]=round(1,[false,true],'e2','Mode');
  if(fault==='initial-activity')first.output.branch_activity[1].executed=true;
  if(fault==='final-activity')second.output.branch_activity[0].executed=true;
  if(fault==='both-ports')second.output.ports.unshift(port(initial.outputs[0],0,'e4'));
  if(fault==='no-update')e[6].request.parameters.variables[0].value=1;
  if(fault==='other-node')second.node.node_id='replacement';
  if(fault==='same-execution'){second.execution.execution_id='e2';second.output.ports[0].execution_id='e2';}
  if(fault==='reconfigured')e[7].request.parameters={branches:[{name:'Detailed',variable:'Mode',operator:'=',value:0}]};
  if(fault==='relinked')e[7].request.variable_inputs=[{source:{...node},output:4,input:0,kind:'variables'}];
  if(fault==='substitute')e.push(request('transform.filter','new'));
  if(fault==='second-condition')e.push(request('control.condition','new',{mode:'ports'}));
  if(fault==='stale')second.output.ports[0].fresh=false;
  if(fault==='incomplete')first.output.ports[0].sample.pop();
  if(fault==='other-value')second.configuration.readback.branches[0].conditions[0].value=0;
  assert.throws(()=>checkConditionBranches(initial,final,e),/^Error: CONDITION_/);
 });

test('cold: exactly the read branch port is active after Execute of the saved Condition',async()=>{
 const outputs=active=>({verified:true,surface:'graph',ports:active.map((a,index)=>({index,label:['Detailed','Иначе'][index]+' - Порт1',active:a}))});
 assert.deepEqual(checkColdConditionActivity(outputs([false,true]),1),[{port:0,label:'Detailed - Порт1',executed:false},{port:1,label:'Иначе - Порт1',executed:true}]);
 for(const [active,message] of [[[true,false],/ACTIVITY/],[[true,true],/ACTIVITY/],[[false,false],/ACTIVITY/],[[false],/PORTS/]])
  assert.throws(()=>checkColdConditionActivity(outputs(active),1),message);
 assert.throws(()=>checkColdConditionActivity({...outputs([false,true]),surface:'views'},1),/PORTS/);
 const seen=[];
 const channel={observe:async({readOutputs,ready})=>{assert.equal(readOutputs,true);
  for(const s of [outputs([false,false]),outputs([false,true])])seen.push(ready({node_outputs:s}));return {node_outputs:outputs([false,true])};}};
 assert.equal((await inspectColdConditionBranches(channel,1)).length,2);
 assert.deepEqual(seen,[false,true]);
});
