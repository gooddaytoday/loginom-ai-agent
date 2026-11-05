import test from 'node:test';
import assert from 'node:assert/strict';
import {createRedactor} from '../lib/redact.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
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

test('native preview console refusal closes the owned modal before restoring the draft',async()=>{
 const f=syntaxFixture(),w=f.error.receipt.output.wizard;
 w.calculator_validation.source='loginom_calculator_preview_console';
 w.calculator_preview={status:'observed',root_ref:'preview',root_tid:'MF;TF;WizrdMCF;CalcPreviewForm',errors:[w.calculator_validation.message]};
 const retained=f.channel.observe;let opened=true;
 f.channel.observe=async()=>{
  if(opened)return {...state(),wizard:structuredClone(w),ui:{elements:[{tid:w.calculator_preview.root_tid+';p.h;close',ref:'close',allowed_actions:['click']}]}};
  const s=await retained();s.wizard.calculator_preview={status:'absent'};return s;
 };
 f.channel.perform=async({resolve})=>{assert.deepEqual(resolve(await f.channel.observe()),{verb:'click',ref:'close'});f.calls.push('preview_close');opened=false;};
 assert.equal(verifiedCalculatorSyntaxFailure(f.error,f.baseline),true);
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>e===f.error);
 assert.equal(verifiedCalculatorRequestRefusal(f.error.nodePhaseRefusal,node),true);
 assert.equal(f.calls[0],'preview_close');
});

test('journal C parse-error dialog requires its confirmed OK before draft rollback',async()=>{
 const f=syntaxFixture(),v=f.error.receipt.output.wizard.calculator_validation;
 v.source='loginom_calculator_preview_error_dialog';v.field_name='id';
 v.message='Loginom 7.4.2 Настройка прервана 1. Ошибка разбора выражения "id" 1.1. Некорректный символ';
 f.error.receipt.error.message=v.message;f.error.receipt.trace[0].message=v.message;
 f.error.receipt.trace.push({event:'wizard_calculator_preview_error_dismissed',root_ref:'wizard',message:v.message});
 const read=f.channel.observe;f.channel.observe=async()=>{const s=await read();s.wizard.calculator_preview={status:'absent'};s.ui={dialogs:[]};return s;};
 assert.equal(verifiedCalculatorSyntaxFailure(f.error,f.baseline),true);
 const unconfirmed=structuredClone(f.error.receipt);unconfirmed.trace.pop();
 assert.equal(verifiedCalculatorSyntaxFailure({receipt:unconfirmed},f.baseline),false);
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>e===f.error);
 assert.equal(verifiedCalculatorRequestRefusal(f.error.nodePhaseRefusal,node),true);
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

// d1:615→617: after native error dismissal/cancellation, SVG body 1855 is
// replaced by 1857 before selection, while the prepared native GUID is unchanged.
for(const fault of ['none','repeat','foreign_node','foreign_document','foreign_workflow','signature','effect','gesture','changed_after_refresh'])
test('calculator rollback reobserves a replaced graph body: '+fault,async()=>{
 const f=syntaxFixture(),records=[],actions=[];
 const graph={origin:'https://app.loginom.ai/',loginom_build:'7.4.2',workflow_ref:{prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',workflow_id:'w',navigation_path:[{tid:'path',label:'Workflow'}]},
  prepared_node_context:{verified:true,...node,surface:'graph',tid:'MF;TF-1;Graph;Calculator',locked:false},
  graph_identity:{status:'observed',container_ref:'diagram',native_prefix:'MF;TF-1;Graph;'},dom_epoch:{document:'dom',revision:50860},
  scan:{complete:true},wizard:{status:'absent'},ui:{dialogs:[],masks:[],truncated:{dialogs:false,masks:false},elements:[
   {tid:'MF;TF-1;Graph;Calculator',ref:'ui-body-1855',scope:'graph',kind:'graph',graph_node:{part:'body'},
    identity:{anchor_tid:'MF;TF-1;Graph;Calculator',path:[]},signature:{tag:'g',native_graph:{node_id:'n',identity:['native-cell']}},
    allowed_actions:['click'],interaction:{state:'point_observed'}}]}};
 let stage='validation',attempts=0,clicks=0;
 const channel=createNodeProcedure({operation:{id:'rollback',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
  preparedNodeContext:{document_id:'d',workflow_ref:graph.workflow_ref,node},targetOrigin:graph.origin,targetBuild:graph.loginom_build,
  now:()=>1,wait:async()=>{},record:async e=>{records.push(e);return structuredClone(e);},
  wrapMutation:(code,reference)=>({reference}),execute:async code=>{
   if(typeof code==='string'){
    const s=structuredClone(graph);
    if(attempts&&fault==='changed_after_refresh')s.prepared_node_context.node_id='foreign';
    return {status:'SUCCEEDED',output:s};
   }
   const action=records.findLast(e=>e.phase==='node_step_prepared').action;actions.push(action);attempts++;
   if(attempts===1||fault==='repeat'){
    graph.ui.elements[0].ref=attempts===1?'ui-body-1857':'ui-body-1859';graph.dom_epoch.revision++;
    if(fault==='foreign_node')graph.prepared_node_context.node_id='foreign';
    if(fault==='foreign_document')graph.prepared_node_context.document_id='foreign';
    if(fault==='foreign_workflow')graph.prepared_node_context.workflow_id='foreign';
    if(fault==='signature')graph.ui.elements[0].signature.native_graph.identity=['foreign-cell'];
    return {action_key:'ui.act',operation_id:code.reference.id,status:'NOT_APPLIED',phase:'preconditions',
     effect_possible:fault==='effect',cleanup_complete:true,error:{code:'UI_REFERENCE_STALE',message:'Observed control is detached, hidden, disabled, or replaced'},
     trace:fault==='gesture'?[{event:'ui_gesture_applied'}]:[{event:'ui_action_failed',code:'UI_REFERENCE_STALE'}],output:structuredClone(graph)};
   }
   assert.equal(action.ref,'ui-body-1857');clicks++;
   return {action_key:'ui.act',operation_id:code.reference.id,status:'SUCCEEDED',phase:'completed',effect_possible:true,cleanup_complete:true,output:structuredClone(graph)};
  }});
 const close=f.ops.close,open=f.ops.open;
 f.ops.close=async()=>{const r=await close();stage='graph';return r;};
 f.ops.open=async()=>{await open();stage='reopened';};
 delete f.ops.select;
 f.channel={perform:channel.perform,observe:async options=>stage==='graph'?channel.observe(options)
  :stage==='reopened'?state():{...state(),wizard:structuredClone(f.error.receipt.output.wizard)}};
 await assert.rejects(rejectUnchangedCalculatorDraft(f.channel,f.baseline,f.error,f.ops),e=>fault==='none'?e===f.error:e!==f.error);
 assert.equal(clicks,fault==='none'?1:0);
 assert.equal(attempts,fault==='none'||fault==='repeat'?2:1);
 if(fault==='none'){
  assert.deepEqual(actions.map(a=>a.ref),['ui-body-1855','ui-body-1857']);
  assert.equal(records.filter(e=>e.phase==='node_step_refresh_authorized'&&e.reason==='prepared_graph_body_replaced').length,1);
  assert.equal(verifiedCalculatorRequestRefusal(f.error.nodePhaseRefusal,node),true);
 }else assert.equal(f.error.nodePhaseRefusal,undefined);
});
