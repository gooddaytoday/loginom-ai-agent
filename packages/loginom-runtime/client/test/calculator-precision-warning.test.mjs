import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatorPrecisionWarnings} from '../lib/calculator-precision-warning.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

function fixture(formula='Round(active * 100 / total, 2)') {
 const node={document_id:'doc',workflow_id:'wf',node_id:'calc'};
 return {node,configuration:{readback:{kind:'calculator',values_are:'observed_ui_values',
  scope:'observed_before_verified_finish',node:{...node},
  expressions:[{name:'percentage',type:'real',formula}],
  output_mapping:{fields:[{source_name:'percentage',name:'renamed_percentage',excluded:false}]}}}};
}
test('observed rounding is reported under its mapped name without changing settings or output',()=>{
 const node=fixture();node.output={ports:[]};const original=structuredClone(node);
 const r=compactNodeResult({operation_id:'op',outcome:{status:'SUCCEEDED',output:node}});
 assert.equal(r.limitations.length,1);assert.match(r.limitations[0],/renamed_percentage/);
 assert.match(r.limitations[0],/already rounded/);assert.match(r.limitations[0],/unrounded inputs/);
 assert.deepEqual(node,original);assert.deepEqual(r.configuration,node.configuration);
 assert.deepEqual(compactNodeResult({operation_id:'op',outcome:{status:'AMBIGUOUS',output:node}}).limitations,[]);
});
test('unobserved, foreign and excluded formulas cannot produce output precision claims',()=>{
 for(const mutate of [n=>{n.configuration.readback.values_are='request'},
  n=>{n.configuration.readback.node.node_id='other'},
  n=>{n.configuration.readback.scope='unverified'},
  n=>{n.configuration.readback.output_mapping.fields[0].excluded=true},
  n=>{n.configuration.readback.output_mapping.fields.push({...n.configuration.readback.output_mapping.fields[0]})}]){
  const n=fixture();mutate(n);assert.deepEqual(calculatorPrecisionWarnings(n),[]);
 }
});
test('only direct numeric Round calls are recognized, not strings or similar identifiers',()=>{
 for(const formula of ['active/total', 'RoundUp(active,2)', '"Round(active,2)"', "'Round(active,2)'", 'someRound(active)', 'Sum(Round(active,2))'])
  assert.deepEqual(calculatorPrecisionWarnings(fixture(formula)),[]);
 assert.equal(calculatorPrecisionWarnings(fixture('  rOuNd (active,2)')).length,1);
 const string=fixture();string.configuration.readback.expressions[0].type='string';
 assert.deepEqual(calculatorPrecisionWarnings(string),[]);
});
test('warning is bounded when a calculator has many rounded outputs',()=>{
 const n=fixture(),r=n.configuration.readback;
 r.expressions=Array.from({length:100},(_,i)=>({name:'f'+i,type:'real',formula:'Round(1,2)'}));
 r.output_mapping.fields=r.expressions.map(e=>({name:e.name,source_name:e.name,excluded:false}));
 const warnings=calculatorPrecisionWarnings(n);assert.equal(warnings.length,1);
 assert.ok(warnings[0].length<650);assert.match(warnings[0],/more fields/);assert.ok(!warnings[0].includes('f99'));
});
