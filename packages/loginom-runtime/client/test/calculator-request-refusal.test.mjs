import test from 'node:test';
import assert from 'node:assert/strict';
import {createRedactor} from '../lib/redact.mjs';
import {rejectUnchangedCalculatorDraft,verifiedCalculatorRequestRefusal,verifiedCalculatorSyntaxFailure} from '../lib/calculator-request-refusal.mjs';
const node={document_id:'d',workflow_id:'w',node_id:'n'};
const state=()=>({prepared_node_context:{verified:true,...node},wizard:{stage:'calculator'},node_calculator:{verified:true,inventory_complete:true,mode:'expression',input_fields:[{name:'X',label:'X',type:'integer'}],expressions:[{name:'E',label:'E',formula:'X*2',type:'real',replace:false,intermediate:false,cached:false,description:''}]}});
function fixture(failure){
 const calls=[],baseline=state(),after=state(),error=Error('name collision');
 if(failure==='formula')after.node_calculator.expressions[0].formula='X*3';
 if(failure==='owner')after.prepared_node_context.node_id='other';
 if(failure==='incomplete')after.node_calculator.inventory_complete=false;
 let n=0;
 return {calls,error,baseline,channel:{observe:async()=>{calls.push('read');if(failure==='read')throw Error('lost read');return after;}},
  ops:{select:async()=>{calls.push('select');if(failure==='select')throw Error('lost selection');},open:async()=>{calls.push('open');if(failure==='open')throw Error('lost open');},close:async()=>{
   calls.push('close');n++;if(failure==='close'+n)throw Error('lost close');
   return {verified:true,cleanup_complete:true,draft_discarded:true,settings_applied:false,node_context:{verified:true,...node}};
  }}};
}
test('request rejection reopens and verifies retained settings before releasing the gate',async()=>{
 const f=fixture();await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>e===f.error);
 assert.deepEqual(f.calls,['close','select','open','read','close']);
 assert.equal(verifiedCalculatorRequestRefusal(f.error.nodePhaseRefusal,node),true);
 for(const change of [r=>r.proof.after.expressions[0].formula='changed',r=>r.proof.closed.settings_applied=true,r=>r.proof.first_close.node_context.node_id='other',r=>delete r.proof.settings_readback_verified]){
  const bad=structuredClone(f.error.nodePhaseRefusal);change(bad);assert.equal(verifiedCalculatorRequestRefusal(bad,node),false);
 }
});
for(const failure of ['formula','owner','incomplete','read','select','open','close1','close2'])test('uncertain rejection '+failure+' never claims safe retry',async()=>{
 const f=fixture(failure);await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops));assert.equal(f.error.nodePhaseRefusal,undefined);
});
function syntaxFixture(){
 const f=fixture();f.baseline.wizard.root_ref='wizard';
 const v={status:'observed',root_ref:'wizard',message:'Unknown function MID',source:'loginom_wizard_error_tooltip'};
 f.error.receipt={action_key:'ui.act',operation_id:'op:n10',status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true,
  error:{code:'WIZARD_CALCULATOR_VALIDATION_FAILED',message:v.message},output:{prepared_node_context:f.baseline.prepared_node_context,wizard:{stage:'calculator',root_ref:'wizard',calculator_validation:v}},
  trace:[{event:'wizard_calculator_validation_failed',root_ref:'wizard',message:v.message}]};
 const retained=f.channel.observe;let reads=0;
 f.channel.observe=async()=>++reads===1?{...state(),wizard:{stage:'calculator',root_ref:'wizard',calculator_validation:v}}:retained();
 f.ops={...f.ops,syntax:true,graphBefore:{nodes:['n','source'],links:['source:n']},readGraph:async()=>({nodes:['n','source'],links:['source:n']})};return f;
}
test('syntax refusal requires native error, unchanged restored settings and unchanged graph',async()=>{
 const f=syntaxFixture();assert.equal(verifiedCalculatorSyntaxFailure(f.error,f.baseline),true);
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>e===f.error);
 assert.equal(verifiedCalculatorRequestRefusal(f.error.nodePhaseRefusal,node),true);
 for(const mutate of [p=>p.graph_after.links.push('foreign'),p=>p.validation_receipt.output.prepared_node_context.node_id='foreign',p=>delete p.validation_receipt.trace,p=>delete p.before]){
  const r=structuredClone(f.error.nodePhaseRefusal);mutate(r.proof);assert.equal(verifiedCalculatorRequestRefusal(r,node),false);
 }
});
test('syntax phase proof excludes unrelated UI strings altered by journal normalization',async()=>{
 const f=syntaxFixture();f.error.receipt.output.origin='http://10.200.11.224';
 f.error.receipt.output.ui={elements:[{label:'{ "unrelated": true }'}]};
 assert.notEqual(JSON.stringify(createRedactor().redact(f.error.receipt)),JSON.stringify(f.error.receipt));
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>e===f.error);
 const proof=f.error.nodePhaseRefusal;
 assert.equal(proof.proof.validation_receipt.output.ui,undefined);
 assert.equal(JSON.stringify(createRedactor().redact(proof)),JSON.stringify(proof));
});
for(const mode of ['lost_reply','cleanup','foreign','wrong_error','changed_validation','graph_drift'])test('syntax rollback rejects '+mode,async()=>{
 const f=syntaxFixture();
 if(mode==='lost_reply')delete f.error.receipt;
 if(mode==='cleanup')f.error.receipt.cleanup_complete=false;
 if(mode==='foreign')f.error.receipt.output.prepared_node_context={verified:true,...node,node_id:'foreign'};
 if(mode==='wrong_error')f.error.receipt.error.code='WIZARD_STEP_NOT_CONFIRMED';
 if(mode==='changed_validation')f.channel.observe=async()=>state();
 if(mode==='graph_drift')f.ops.readGraph=async()=>({nodes:['n','source'],links:[]});
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops));assert.equal(f.error.nodePhaseRefusal,undefined);
});
