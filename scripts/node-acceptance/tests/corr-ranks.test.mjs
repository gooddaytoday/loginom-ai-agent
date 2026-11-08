import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkCorrRanksMain} from '../corr-ranks.mjs';

test('corr-ranks isolates the approved task/data and selects final Kendall for CSV/cold',()=>{
 const script=`import importlib.util
from pathlib import Path
p=Path('scripts/node-acceptance/run-check.py'); s=importlib.util.spec_from_file_location('r',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
c=m.scenario('corr-ranks'); e=m.expected_for(c,'/own/ranks.lgp')
assert c['prompt'].name=='task-ranks.md' and c['prompt'].is_file()
assert c['input_files']==['ranks.csv'] and (c['data']/'ranks.csv').is_file()
assert c['corr_ranks'] and (c['source']/'oracle.py').is_file()
assert e['package_path']=='/own/ranks.lgp'
assert [n['type'] for n in e['nodes']]==['imports.text','research.corr_analysis','exports.text']
o=e['outputs'][0]
assert o['ordered'] and o['column_order']=='exact' and o['output_port']==0
assert [c['name'] for c in o['columns']]==['ColSet1','ColSet1_Label','ColSet2','ColSet2_Label','TauBKendall']
assert o['columns'][-1]['tolerance']==dict(abs=1e-8,rel=1e-10)
assert m.expected_for(c,'/own/ranks.lgp',cold=True)==e
`;
 const r=spawnSync('python3',['-B','-c',script],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('rank audit requires ordered fresh typed executions on the same native node',async()=>{
 const expected=JSON.parse(await readFile(new URL('../../../docs/node-development/nodes/research-corranalysis/acceptance/modes/expected.json',import.meta.url)));
 const round=(mode)=>{
  const o=expected.cases[mode].outputs[0],execution_id=mode+'-exec';
  return {phase:'node_checkpoint',result:{status:'SUCCEEDED',cleanup_complete:true,node:{document_id:'doc',workflow_id:'wf',node_id:'corr'},
   execution:{status:'completed',execution_id},configuration:{readback:{kind:'corr_analysis',mode,coefficients:[mode],first_set:['X'],second_set:['Y']}},
   output:{ports:[{port:0,fresh:true,execution_id,freshness_basis:'completed_execution_port_source',schema:o.columns.map((c,index)=>({...c,index})),
    row_count:o.rows.length,sample_complete:true,precision:{numbers_verified:true},sample:o.rows.map(r=>o.columns.map(c=>({type:c.type,is_null:false,value:r[c.name],
     precision:c.type==='real'?'17_significant_digits':'source_text',...(c.type==='real'?{representation:'binary64',decimal:String(r[c.name])}:{})}))) }]}}};
 };
 const events=[{phase:'node_apply_prepared',request:{target:{type:'research.corr_analysis',kind:'new'}}},round('spearman'),round('kendall')];
 assert.equal(checkCorrRanksMain(expected,events).status,'PASS');
 for(const fault of ['values','type','order','stale','fresh','node','mode','extra','substitute','reversed','recreated','missing']){
  const bad=structuredClone(events),r=bad[2].result,p=r.output.ports[0];
  if(fault==='values')p.sample[0][4].value=0.8;
  if(fault==='type')p.schema[4].type='integer';
  if(fault==='order')p.schema.reverse();
  if(fault==='stale')p.execution_id='old';
  if(fault==='fresh')p.fresh=false;
  if(fault==='node')r.node.node_id='other';
  if(fault==='mode')r.configuration.readback.coefficients=['kendall','spearman'];
  if(fault==='extra')p.schema.push({name:'Spearman',type:'real'});
  if(fault==='substitute')bad.push({phase:'node_apply_prepared',request:{target:{type:'programming.javascript',kind:'new'}}});
  if(fault==='reversed')bad.reverse();
  if(fault==='recreated')bad.push(bad[0]);
  if(fault==='missing')bad.splice(1,1);
  assert.throws(()=>checkCorrRanksMain(expected,bad),/CORR_RANKS_/,fault);
 }
});
