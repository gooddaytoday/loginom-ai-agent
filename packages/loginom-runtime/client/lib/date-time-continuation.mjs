import {createRedactor} from './redact.mjs';
import {selectDateTimeField} from './date-time-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error('Date/time continuation: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=c=>c.fields.map(({count,...f})=>f);
const owner=c=>({document_id:c.node_context.document_id,workflow_id:c.node_context.workflow_id,node_id:c.node_context.node_id,tid:c.node_context.tid});
const expectedPending=progress=>{
 const p=progress.pending,prior=progress.expected.find(f=>f.name===p.field)?.matrix;
 need(prior?.length===29&&same(prior,p.before),'last verified matrix differs');
 const next=structuredClone(prior),row=next.find(r=>r.record_id===p.cell.record_id);
 need(row&&row.func===p.cell.func&&row.iso===p.cell.iso&&['first','last','number','string'].includes(p.cell.key)
  &&typeof p.cell.checked==='boolean'&&row[p.cell.key]!==p.cell.checked,'exact pending cell differs');
 row[p.cell.key]=p.cell.checked;need(same(next,p.expected),'pending matrix is not one exact flag change');
 return next;
};

export function verifyDateTimeReceipt(progress,state,reference,stored){
 const p=progress.pending,s=progress.step;
 need(state.pending?.phase==='configure'&&state.request.target.type==='transform.date_time'&&p&&s,'original configure checkpoint required');
 need(progress.signature===state.signature&&same(progress.node,state.node),'original node/signature differs');
 need(s.operation_id===state.request.operation_id&&s.internal_operation_id===state.request.operation_id+':n'+s.step,'original operation differs');
 expectedPending(progress);
 need(s.internal_operation_id===reference?.id&&s.signature===reference.signature&&reference.action_key==='ui.act','original receipt reference differs');
 need(s.action.verb==='click'&&s.action.ref===p.ref,'original flag gesture differs');
 const r=stored?.receipt;
 need(stored?.state==='completed'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.action_key==='ui.act'
  &&r.operation_id===reference.id&&r.error===null,'original click completion unavailable');
 need(r.trace?.some(t=>t.event==='ui_preconditions_verified'&&t.verb==='click'&&t.refs?.includes(p.ref))
  &&r.trace?.filter(t=>t.event==='ui_gesture_applied'&&t.verb==='click').length===1,'original gesture evidence differs');
 return structuredClone(r);
}

export function verifyDateTimeDraft(progress,current,matrices){
 need(current?.verified===true&&current.inventory_complete===true&&current.node_context?.verified===true
  &&current.node_context.surface==='wizard'&&same(owner(current),owner(progress.baseline)),'live owner differs');
 need(same(fields(current),fields(progress.baseline)),'live input inventory differs');
 need(current.selected?.name===progress.pending.field&&current.selected.record_id===progress.pending.field_record_id,'selected field differs');
 const expected=structuredClone(progress.expected);
 expected.find(f=>f.name===progress.pending.field).matrix=expectedPending(progress);
 need(expected.length===matrices.length&&expected.every((f,i)=>f.name===matrices[i]?.name
  &&f.matrix.length===29&&same(f.matrix,matrices[i].matrix)),'complete matrix differs');
 return expected;
}

export async function inspectDateTimeConfigure({channel,operation,progress,readReceipt,record,now}){
 const state=operation.nodeApply;
 need(now()<Math.min(state.deadline,state.configure_deadline,state.pending?.deadline??0),'original deadline elapsed');
 need(progress?.reference&&progress.pending&&progress.step,'recoverable flag checkpoint absent');
 const receipt=verifyDateTimeReceipt(progress,state,progress.reference,await readReceipt(progress.reference));
 // This acknowledges the old gesture only. Configure remains pending even if
 // the subsequent live matrix refuses continuation.
 if(!progress.receipt_recorded){
  const event={operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
   phase:'node_step_completed',internal_provenance:'client_node_procedure_v1',step:progress.step.step,
   internal_operation_id:progress.step.internal_operation_id,outcome:createRedactor().redact(receipt)};
  const ack=await record(event);need(Object.keys(event).every(k=>same(ack?.[k],event[k])),'receipt journal acknowledgement differs');
  progress.receipt_recorded=true;
 }
 const start=await channel.observe({condition:'original date/time draft before continuation',readDateTime:true,
  ready:s=>s.wizard?.stage==='date_time'&&s.node_date_time?.verified===true});
 const current=start.node_date_time;
 // Refuse a foreign selected field before selecting anything else.
 verifyDateTimeDraft(progress,current,progress.expected.map(f=>({name:f.name,matrix:f.name===progress.pending.field?progress.pending.expected:f.matrix})));
 const matrices=[];
 for(const field of progress.baseline.fields){
  const s=await selectDateTimeField(channel,progress.baseline,field.name);
  matrices.push({name:field.name,matrix:structuredClone(s.node_date_time.matrix)});
 }
 await selectDateTimeField(channel,progress.baseline,progress.pending.field);
 const expected=verifyDateTimeDraft(progress,current,matrices);
 const event={operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
  phase:'node_configure_continuation_checked',signature:state.signature,receipt_id:progress.reference.id,
  verified:true,node:structuredClone(state.node),matrices:structuredClone(matrices)};
 const ack=await record(event);need(Object.keys(event).every(k=>same(ack?.[k],event[k])),'continuation journal acknowledgement differs');
 return {verified:true,expected,receipt_id:progress.reference.id};
}
