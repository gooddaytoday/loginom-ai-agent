import {closePreparedWizard} from './node-wizard-close.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';

const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identity=s=>Object.fromEntries(['document_id','workflow_id','node_id'].map(k=>[k,s.prepared_node_context?.[k]]));
function configuration(s){
 const c=s.node_calculator;
 need(s.prepared_node_context?.verified===true&&s.wizard?.stage==='calculator'
  &&c?.verified===true&&c.inventory_complete===true&&c.mode==='expression','Complete calculator rejection baseline required');
 return {mode:c.mode,expressions:c.expressions.map(e=>Object.fromEntries(
  ['name','label','type','formula','replace','intermediate','cached','description'].map(k=>[k,e[k]]))),
  input_fields:c.input_fields.map(e=>Object.fromEntries(['name','label','type','data_kind'].map(k=>[k,e[k]])))};
}
const closedFor=(c,node)=>c?.verified===true&&c.cleanup_complete===true&&c.draft_discarded===true
 &&c.settings_applied===false&&c.node_context?.verified===true
 &&Object.keys(node).every(k=>c.node_context[k]===node[k]);
const syntaxReceipt=r=>({action_key:r.action_key,operation_id:r.operation_id,status:r.status,effect_possible:r.effect_possible,
 cleanup_complete:r.cleanup_complete,error:{code:r.error.code,message:r.error.message},
 output:{prepared_node_context:{verified:true,...identity(r.output)},wizard:{stage:r.output.wizard.stage,root_ref:r.output.wizard.root_ref,
  calculator_validation:structuredClone(r.output.wizard.calculator_validation)}},
 trace:r.trace.filter(e=>e.event==='wizard_calculator_validation_failed').map(({event,root_ref,message})=>({event,root_ref,message}))});
export function verifiedCalculatorSyntaxFailure(error,baseline){
 const r=error?.receipt,w=r?.output?.wizard,n=r?.output?.prepared_node_context,v=w?.calculator_validation;
 return r?.action_key==='ui.act'&&r.status==='AMBIGUOUS'&&r.effect_possible===true&&r.cleanup_complete===true
  &&r.error?.code==='WIZARD_CALCULATOR_VALIDATION_FAILED'&&typeof r.operation_id==='string'
  &&n?.verified===true&&same(identity(baseline),Object.fromEntries(['document_id','workflow_id','node_id'].map(k=>[k,n[k]])))
  &&w?.stage==='calculator'&&w.root_ref===baseline.wizard.root_ref&&v?.status==='observed'
  &&v.root_ref===w.root_ref&&v.source==='loginom_wizard_error_tooltip'&&v.message===r.error.message
  &&r.trace?.filter(e=>e.event==='wizard_calculator_validation_failed'&&e.root_ref===w.root_ref&&e.message===v.message).length===1;
}
export function verifiedCalculatorRequestRefusal(refusal,node){
 const p=refusal?.proof;
 const syntax=refusal?.verification==='calculator_syntax_rejected_draft_restored';
 return (refusal?.verification==='calculator_request_rejected_before_edit'||syntax)&&!!p
  &&p.settings_readback_verified===true&&!!node&&['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&p.node?.[k]===node[k])&&same(p.before,p.after)
  &&p.before&&typeof p.before==='object'&&p.after&&typeof p.after==='object'
  &&closedFor(p.first_close,node)&&closedFor(p.closed,node)
  &&(!syntax||p.syntax_failure_verified===true&&p.graph_before&&p.graph_after&&same(p.graph_before,p.graph_after)
   &&same(identity(p.validation_baseline??{}),node)
   &&verifiedCalculatorSyntaxFailure({receipt:p.validation_receipt},p.validation_baseline));
}

// Only called for synchronous patch validation BEFORE the first editor action,
// and only for an existing node with no requested connections/mappings.
// Cancellation alone is insufficient: reopen and compare retained settings.
export async function rejectUnchangedCalculatorDraft(channel,baseline,error,{close=closePreparedWizard,open=openPreparedWizard,
 syntax=false,graphBefore,readGraph,
 select=async channel=>{const s=await channel.observe({condition:'same calculator graph after rejected draft',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
  await selectPreparedGraphNode(channel,s,'reselect retained calculator for rejection verification');}}={}){
 const node=identity(baseline),before=configuration(baseline);
 need(Object.values(node).every(v=>typeof v==='string'&&v.length),'Exact calculator identity required');
 if(syntax){
  need(verifiedCalculatorSyntaxFailure(error,baseline)&&graphBefore&&typeof readGraph==='function','Verified syntax refusal and graph baseline required');
  const current=await channel.observe({condition:'same calculator syntax refusal before rollback',readCalculator:true,
   ready:s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true});
  need(same(identity(current),node)&&current.wizard.root_ref===baseline.wizard.root_ref
   &&same(current.wizard.calculator_validation,error.receipt.output.wizard.calculator_validation),'Calculator validation refusal changed');
 }
 const first_close=await close(channel);need(closedFor(first_close,node),'Calculator cancellation unconfirmed');
 await select(channel);
 await open(channel);
 const reopened=await channel.observe({condition:'retained calculator after rejected request',readCalculator:true,
  ready:s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true&&s.node_calculator?.inventory_complete===true});
 const after=configuration(reopened);
 need(same(identity(reopened),node)&&same(before,after),'Calculator settings changed during rejection verification');
 const closed=await close(channel);need(closedFor(closed,node),'Calculator rejection cleanup unconfirmed');
 const graphAfter=syntax?await readGraph():null;
 if(syntax)need(same(graphBefore,graphAfter),'Calculator graph changed during syntax rollback');
 error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,
  verification:syntax?'calculator_syntax_rejected_draft_restored':'calculator_request_rejected_before_edit',proof:{node,before,after,first_close,closed,settings_readback_verified:true,
   ...(syntax?{syntax_failure_verified:true,graph_before:graphBefore,graph_after:graphAfter,validation_receipt:syntaxReceipt(error.receipt),
    validation_baseline:{prepared_node_context:baseline.prepared_node_context,wizard:{root_ref:baseline.wizard.root_ref}}}:{})}};
 throw error;
}
