import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesExpectedOutput,parseExpectedOutputs} from '../expected-outputs.mjs';

const fixture=new URL('../../../docs/testing/loginom-ai-agent/stability-2026-10-20/p17/',import.meta.url);
const expected=()=>parseExpectedOutputs(JSON.parse(readFileSync(new URL('expected-demo.json',fixture)))).outputs[0];
// Exact downloaded CSV from LAB-158 p17-baseline2. Its native Table used
// technical Revenue and label Выручка; the business prompt prescribes neither.
const csv=`Region,Category,Revenue
Центр,Техника,80193
Юг,Техника,60272
Север,Техника,54400
Центр,Офис,8895
Юг,Офис,6839
Север,Офис,6182
`;
const observed=(text=csv)=>{
 const [header,...rows]=text.trim().split('\n').map(line=>line.split(','));
 return {schema:header.map((name,i)=>({name,label:i===2?'Выручка':name,type:i===2?'real':'string'})),
  row_count:rows.length,sample_complete:true,precision:{numbers_verified:true},
  sample:rows.map(row=>row.map((value,i)=>({type:i===2?'real':'string',value:i===2?Number(value):value,is_null:false})))};
};
test('p17 saved CSV and unprescribed native labels retain exact values, order and types',()=>{
 assert.match(readFileSync(new URL('prompt.md',fixture),'utf8'),/Посчитай выручку Quanity×Price по регионам и категориям с возвратами, покажи по убыванию/);
 const want=expected();assert.equal(want.ordered,true);
 assert.deepEqual(want.columns.map(c=>c.type),['string','string','real']);
 assert.equal(matchesExpectedOutput(observed(),want),true);
 const renamed=observed();renamed.schema.forEach((f,i)=>{f.name=['Регион','Категория','Доход'][i];f.label=f.name;});
 assert.equal(matchesExpectedOutput(renamed,want),true);
 for(const bad of [observed(csv.replace('80193','80194')),observed(csv.replace('Центр,Техника','Юг,Техника'))])
  assert.equal(matchesExpectedOutput(bad,want),false);
 for(const mutate of [d=>d.sample.reverse(),d=>d.schema[2].type='integer',d=>d.sample.pop(),
  d=>d.row_count++,d=>d.schema[0].name=d.schema[1].name,d=>d.sample_complete=false,
  d=>d.precision.numbers_verified=false]){
  const bad=observed();mutate(bad);assert.equal(matchesExpectedOutput(bad,want),false);
 }
});
