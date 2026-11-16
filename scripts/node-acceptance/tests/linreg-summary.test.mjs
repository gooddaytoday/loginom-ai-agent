import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const {auditLinregSummaryHistory}=await import('../expected-outputs.mjs');

const approved=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/datamining-linregression/acceptance/modes/summary/expected.json',import.meta.url),'utf8'));

test('C8 catalog delivers the original task and design.csv, retaining all independent expectations',()=>{
 const value=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('linreg-summary');e=m.expected_for(c,'/worker/c8.lgp')
print(json.dumps(dict(task=c['prompt'].name,files=c['input_files'],summary=c['linreg_summary'],expected=e)))`],{encoding:'utf8'}));
 assert.equal(value.task,'task-summary.md');assert.deepEqual(value.files,['design.csv']);assert.equal(value.summary,true);
 assert.deepEqual(value.expected.variable_inventory,approved.variable_inventory);
 assert.equal(value.expected.variable_inventory.outputs[0].port,0,'variable ordinals are separate from the two table outputs');
 assert.equal(value.expected.package_path,'/worker/c8.lgp');
 assert.deepEqual(value.expected.outputs.map(o=>o.rows),approved.outputs.map(o=>o.rows));
 assert.equal(value.expected.outputs[0].columns[0].label,'Y|Регрессия');
 assert.equal(value.expected.outputs[1].columns[0].label,'Имена входных полей');
 assert.equal(value.expected.outputs[1].columns[1].label,'Y|Коэффициенты');
 assert.equal(value.expected.variable_inventory.outputs[0].variables.length,15);
});

function events(){
 const want=approved.variable_inventory.outputs[0];
 const node={document_id:'document',workflow_id:'workflow',node_id:'regression'};
 const variable={kind:'variables',port:0,complete:true,fresh:true,read_id:'read',source:'execution',native_source:'VariablesForm',execution_id:'execute',count:15,
  completeness:{loaded:true,count:15,store_count:15,unique_ids:15},
  variables:want.variables.map((v,index)=>({id:index,index,name:v.name,type:v.type,cell:{type:v.type,is_null:false,value:v.type==='integer'?String(v.value):v.value,precision:v.type==='integer'?'exact_integer':'17_significant_digits'}}))};
 return [{phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node,
  configuration:{readback:{kind:'lin_regression',node:{...node}}},execution:{status:'completed',execution_id:'execute'},output:{variable_ports:[variable]}}}];
}

test('C8 requires the complete fresh native summary from the accepted regression execution',()=>{
 const original=events();
 assert.equal(auditLinregSummaryHistory(original,approved).status,'PASS');
 for(const mutate of [
  e=>{e[0].result.output.variable_ports=[];},
  e=>{e[0].result.status='FAILED';},
  e=>{e[0].result.cleanup_complete=false;},
  e=>{e[0].result.execution.execution_id='another-execution';},
  e=>{e[0].result.configuration.readback.kind='calculator';},
  e=>{e[0].result.node.node_id='another-node';},
  e=>{e[0].result.output.variable_ports[0].port=2;},
  e=>{e[0].result.output.variable_ports[0].fresh=false;},
  e=>{e[0].result.output.variable_ports[0].variables.pop();},
  e=>{e[0].result.output.variable_ports[0].variables.reverse();},
  e=>{e[0].result.output.variable_ports[0].variables[0].type='real';},
  e=>{e[0].result.output.variable_ports[0].variables.find(v=>v.name==='R2').cell.value=0;},
 ]){
  const changed=structuredClone(original);mutate(changed);
  assert.throws(()=>auditLinregSummaryHistory(changed,approved),/LINREG_SUMMARY/);
 }
});

test('C8 node guidance gives the separate variable ordinal within the unchanged reference budget',()=>{
 const text=readFileSync(new URL('../../../packages/product/skills/loginom-automation/references/nodes/datamining.lin_regression.md',import.meta.url),'utf8');
 assert.ok(Buffer.byteLength(text)<=6000);
 assert.match(text,/variable_ports:\[0\]/);
 assert.match(text,/VariablesForm/);
});
