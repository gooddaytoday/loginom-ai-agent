import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const python=code=>spawnSync('python3',['-B','-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
${code}`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});

test('node-delete kits register task, data and frozen expected graph',()=>{
 const r=python(`for name,data,nodes,absent in [('node-delete','sales.csv',['imports.text','transform.sorting','exports.text'],['transform.filter_data']),
  ('node-delete-refused','numbers.csv',['imports.text','programming.javascript','exports.text'],[])]:
    c=m.scenario(name)
    assert c['prompt']==c['source']/'task.md' and (c['data']/data).is_file() and c['node_delete']==name
    e=m.expected_for(c,'/own/p.lgp')
    assert e['package_path']=='/own/p.lgp' and [n['type'] for n in e['nodes']]==nodes and e.get('absent_node_types',[])==absent, e
    assert len(e['outputs'])==1 and e['outputs'][0]['output_node_type']=='export_input'
rows=m.expected_for(m.scenario('node-delete'),'/p.lgp')['outputs'][0]['rows']
assert [r['ID'] for r in rows]==[3,5,1,6,2,4], rows`);
 assert.equal(r.status,0,r.stdout+r.stderr);
});

const event=(output,status='completed',tool='loginom_dock_node_delete')=>({type:'tool_use',part:{tool,state:{status,[status==='error'?'error':'output']:JSON.stringify(output)}}});
const deleted={status:'SUCCEEDED',effect_possible:true,output:{status:'deleted'}};
const refused={status:'NOT_APPLIED',effect_possible:false,error:{code:'NODE_OPERATION_RUNNING',message:'x'}};
for(const [name,events,refusal,error] of [
 ['one verified deletion',[event(deleted)],false,null],
 ['no deletion request',[event(deleted,'completed','loginom_dock_node_apply')],false,'NODE_DELETE_NOT_REQUESTED'],
 ['two deletions',[event(deleted),event(deleted)],false,'NODE_DELETE_NOT_VERIFIED'],
 ['ambiguous retry',[event({status:'AMBIGUOUS'}),event(deleted)],false,'NODE_DELETE_AMBIGUOUS'],
 ['running refusal',[event(refused)],true,null],
 ['refusal then deletion',[event(refused),event(deleted)],true,'NODE_DELETE_REFUSAL_MUTATED'],
 ['other refusal only',[event({...refused,error:{code:'X'}})],true,'NODE_DELETE_RUNNING_REFUSAL_MISSING'],
])test('check_node_delete: '+name,()=>{
 const r=python(`m.check_node_delete(list(enumerate(json.loads(${JSON.stringify(JSON.stringify(events))}))),${refusal?'True':'False'})`);
 if(error)assert.match(r.stderr,new RegExp(error));else assert.equal(r.status,0,r.stderr);
});
