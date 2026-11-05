import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceVariablesCalculatorConfiguration} from '../lib/variables-calculator-procedure.mjs';
function fixture({foreign=false,syntaxError=false,drift=false}={}) {
 const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'},expressions=[{name:'limit',formula:'120'}];
 let stage='variables_calculator';const calls=[];
 const channel={observe:async({ready})=>{
  const state={prepared_node_context:{...owner,...(foreign?{node_id:'other'}:{})},wizard:{stage,root_tid:'MF;TF;WizrdMCF'},
   node_variables_calculator:{verified:true,expressions:drift?[]:expressions},ui:{elements:[{tid:'MF;TF;WizrdMCF;btnNext',ref:'next',allowed_actions:['wizard_step']}]}};
  if(!ready(state))throw Error('observation refused');return state;
 },perform:async({resolve,initialObservation})=>{
  calls.push(resolve(initialObservation));if(syntaxError)throw Error('Неправильное выражение');stage='done';
 }};
 const changed={verified:true,configuration:{node_context:owner,expressions}};
 return {calls,run:()=>advanceVariablesCalculatorConfiguration(channel,changed)};
}
test('only native Next reaching the same owned Done page confirms syntax',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.syntax_validation.status,'accepted_by_loginom_next');
 assert.deepEqual(f.calls,[{verb:'wizard_step',ref:'next',expected_stage:'done'}]);
});
test('a foreign owner or changed formulas cannot authorize Next',async()=>{
 for(const options of [{foreign:true},{drift:true}]){const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.calls,[]);}
});
test('native syntax failure propagates without clicking through or retrying',async()=>{
 const f=fixture({syntaxError:true});await assert.rejects(f.run(),/Неправильное выражение/);assert.equal(f.calls.length,1);
});
