import test from 'node:test';
import assert from 'node:assert/strict';
import {alignFactorSigns,matchExpectedOutputs} from '../expected-outputs.mjs';

const factorSigns={columns:['Factor1'],ports:[0,1]};
const columns=[{name:'Factor1',type:'real',label_any:true,tolerance:{abs:1e-8}}];
// LAB-848 model.stdout:74 and main.execution-events.jsonl:948-949:
// the same execution, compact decimal-only cells and full binary64 cells.
const decimals=['0.9999999999999994','0.9578262852211514'];
const outputs=[0,1].map(output_port=>({output_node_type:'research.factor_analysis',output_port,
 ordered:true,column_order:'exact',columns,rows:[{Factor1:Number(decimals[output_port])}]}));
const actual=form=>[0,1].map(output_port=>({node:{node_id:'factor'},type:'research.factor_analysis',output_port,
 data:{schema:columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},
 sample:[[{type:'real',is_null:false,precision:'17_significant_digits',
  ...(form==='compact'?{}:{value:Number(decimals[output_port]),representation:'binary64'}),
  ...(form==='legacy'?{}:{decimal:decimals[output_port]})}]]}}));

for(const form of ['compact','full','legacy']){
 test(`factor sign anchor reads LAB-848 ${form} cells`,()=>{
  const rows=actual(form),before=structuredClone(rows);
  assert.deepEqual(alignFactorSigns(rows,outputs,factorSigns),outputs);
  assert.deepEqual(rows,before);
  const anchor=rows[1].data.sample[0][0];
  if(form==='legacy')anchor.value=-anchor.value;
  else anchor.decimal='-'+anchor.decimal;
  const aligned=alignFactorSigns(rows,outputs,factorSigns);
  assert.deepEqual(aligned.map(o=>o.rows[0].Factor1),outputs.map(o=>-o.rows[0].Factor1));
 });
}

test('factor sign anchor keeps decimal authoritative when value has the opposite sign',()=>{
 const rows=actual('full');
 rows[1].data.sample[0][0].value=-Number(decimals[1]);
 assert.deepEqual(alignFactorSigns(rows,outputs,factorSigns),outputs);
});

for(const form of ['compact','full'])test(`factor-signs matches both LAB-848 ${form} ports after alignment`,()=>{
 const rows=actual(form);
 assert.equal(matchExpectedOutputs(rows,outputs,{factorSigns}).length,2);
 for(const row of rows){
  const cell=row.data.sample[0][0];cell.decimal='-'+cell.decimal;
  if(form==='full')cell.value=-cell.value;
 }
 assert.equal(matchExpectedOutputs(rows,outputs,{factorSigns}).length,2);
 const inconsistent=structuredClone(rows);inconsistent[0].data.sample[0][0].decimal=decimals[0];
 if(form==='full')inconsistent[0].data.sample[0][0].value=Number(decimals[0]);
 assert.throws(()=>matchExpectedOutputs(inconsistent,outputs,{factorSigns}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 for(const change of [{decimal:'NaN'},{decimal:'Infinity'},{decimal:'0'},{decimal:''},
  {decimal:null},{decimal:1},{is_null:true},
  ...(form==='compact'?[{precision:'display_only'},{representation:'binary64'}]:[])]){
  const bad=structuredClone(rows);Object.assign(bad[0].data.sample[0][0],change);
  assert.throws(()=>matchExpectedOutputs(bad,outputs,{factorSigns}),/COLD_OUTPUT_NOT_UNIQUELY_MATCHED/);
 }
});

test('factor sign anchor still rejects wrong type, NULL, nonfinite and zero values',()=>{
 for(const form of ['compact','full','legacy']){
  for(const change of [{type:'string'},{is_null:true},{is_null:undefined},
   ...['NaN','Infinity','-Infinity','0','-0',''].map(value=>form==='legacy'?{value}:{decimal:value})]){
   const rows=actual(form);
   Object.assign(rows[1].data.sample[0][0],change);
   assert.throws(()=>alignFactorSigns(rows,outputs,factorSigns),/FACTOR_SIGN_ANCHOR_INVALID/);
  }
 }
});
