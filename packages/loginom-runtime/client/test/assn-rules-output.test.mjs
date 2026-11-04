import test from 'node:test';
import assert from 'node:assert/strict';
import {assnRulesOutputColumns,alignAssnRulesOutput,readAssnRulesOutputs} from '../lib/assn-rules-output.mjs';
test('FP-Growth binds exact native names, types and order on both supported ports',()=>{
 for(const port of [0,1]){
  const expected=assnRulesOutputColumns({},port);
  assert.equal(alignAssnRulesOutput(expected,expected),expected);
  for(const columns of [expected.slice(1),[...expected].reverse(),expected.map((f,i)=>i===0?{...f,type:'real'}:f)])
   assert.throws(()=>alignAssnRulesOutput(columns,expected),/field order or types/);
 }
 assert.deepEqual(assnRulesOutputColumns({},0).map(f=>f.name),['ItemsetID','Width','Support','Item_0','Item_1']);
 assert.deepEqual(assnRulesOutputColumns({},1).map(f=>f.name),['RuleID','Support','Confidence','Lift','Item_0_A','Item_0_C']);
});
test('both outputs retain native precision, NULL padding and completed execution binding',async()=>{
 const calls=[],ctx={portExecution:{execution_id:'apply'},execution:{execution_id:'apply'},receipt_id:'read'};
 const channel={async readOutputPort(options){calls.push(options);return {output:{port:options.port,port_guid:'port'+options.port,schema:assnRulesOutputColumns({},options.port),sample_complete:true,sample:options.port===0?[[1,1,0.75,'A',null]]:[[1,0.5,2/3,8/9,'A','B']]}};}};
 const mapped={ports:[0,1].map(port=>({port,schema:assnRulesOutputColumns({},port)}))};
 const result=await readAssnRulesOutputs(channel,{ports:[0,1],sample_rows:100,require_exact_numbers:true},ctx,mapped);
 assert.equal(result.ports[0].sample[0][4],null);assert.equal(result.ports[1].sample[0][2],2/3);
 assert.ok(calls.every(c=>c.execution===ctx.portExecution&&c.requireExactNumbers===true));
 await assert.rejects(readAssnRulesOutputs(channel,{ports:[2]},ctx,mapped),/not supported yet/);
});
