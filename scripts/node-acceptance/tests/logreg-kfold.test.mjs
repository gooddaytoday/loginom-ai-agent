import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkLogregKfold} from '../logreg-normalization.mjs';

test('K-fold evidence requires a completed native validation on the training execution',()=>{
 const expected={outputs:[{columns:[{name:'X',type:'real'}]}]},reply={status:'SUCCEEDED',cleanup_complete:true,node:{node_id:'model'},execution:{status:'completed',execution_id:'execute'},
  configuration:{readback:{kind:'log_regression',mode:'enter',input_fields:['X'],target_field:'Target',event:'yes',threshold:0.8,normalization:'none',train_percent:100,validation:{method:'kfold',folds:3,sampling:'sequential'},training:{status:'trained',execution_id:'teach',validation:{status:'completed',source:'native_validation_summary',execution_id:'teach',read_id:'read',folds:3,samples_per_fold:32}}}},
  output:{ports:[{port:0,fresh:true,execution_id:'execute',sample_complete:true,row_count:96,schema:expected.outputs[0].columns}]}};
 assert.equal(checkLogregKfold(expected,[reply]).training.validation.folds,3);
 // Live retry-kfold-1: the Enter reply samples five rows, while the stock
 // full CSV oracle runs before this evidence audit and cold checks all rows.
 // Validation proof belongs to Teach, independently of the requested sample.
 const sampled=structuredClone(reply);sampled.output.ports[0].sample_complete=false;sampled.output.ports[0].sample_rows=5;
 assert.equal(checkLogregKfold(expected,[sampled]).training.validation.samples_per_fold,32);
 for(const change of [r=>delete r.configuration.readback.training.validation,r=>r.configuration.readback.training.validation.execution_id='stale',r=>r.configuration.readback.training.validation.samples_per_fold=0,r=>r.configuration.readback.training.validation.folds=5,r=>r.configuration.readback.validation.sampling='random',r=>r.configuration.readback.training.execution_id='execute',r=>r.output.ports[0].row_count=95,r=>r.output.ports[0].schema.push({name:'Extra',type:'real'}),r=>r.output.ports[0].schema[0].type='string']){
  const r=structuredClone(reply);change(r);assert.throws(()=>checkLogregKfold(expected,[r]));
 }
});

test('K-fold catalog keeps the original task/data and exact cold expected',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
c=r.scenario('logreg-validation-kfold');e=r.expected_for(c,'/own/kfold.lgp');cold=r.expected_for(c,'/own/kfold.lgp',cold=True)
assert c['prompt'].name=='task-validation-kfold.md' and c['input_files']==['validation.csv'] and c['base'] is None
assert c['oracle'].is_file() and (c['data']/'validation.csv').is_file()
assert e['logreg_kfold'] is True and cold['logreg_kfold'] is True
assert e['outputs']==cold['outputs']==json.loads((c['source']/'expected.json').read_text())['outputs']
assert e['outputs'][0]['column_order']=='exact' and len(e['outputs'][0]['rows'])==96
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});

test('owner-approved K-fold CSV permutation preserves exact columns and values; other scenarios retain order',()=>{
 const result=spawnSync('python3',['-B','-c',`import importlib.util,tempfile,csv
from pathlib import Path
s=importlib.util.spec_from_file_location('runner',Path('scripts/node-acceptance/run-check.py'))
r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
expected=dict(columns=[dict(name='RowID',type='integer'),dict(name='X',type='real')],rows=[dict(RowID=1,X=2.5)],ordered=True,column_order='exact')
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'out.csv'
 def write(headers,values):
  with p.open('w',newline='') as f:
   w=csv.writer(f);w.writerow(headers);w.writerow(values)
 def fails(scenario):
  try:r.check_csv(p,expected,scenario_name=scenario)
  except AssertionError:return
  raise AssertionError('invalid CSV accepted for '+str(scenario))
 write(['X','RowID'],[2.5,1])
 for name in ['logreg-validation-kfold','logreg-partition-sequential']:r.check_csv(p,expected,scenario_name=name)
 for name in [None,'logreg-enter','logreg-elastic-net','other']:fails(name)
 for headers,values in [(['X'],[2.5]),(['X','RowID','Extra'],[2.5,1,9]),(['X','X'],[2.5,1]),(['X','Missing'],[2.5,1]),(['X','RowID'],[3.5,1]),(['X','RowID'],[2.5,2])]:
  write(headers,values)
  for name in ['logreg-validation-kfold','logreg-partition-sequential']:fails(name)
`],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
