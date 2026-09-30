import {createHash} from 'node:crypto';
import {verifyJavascriptMappingGraph} from './javascript-graph-preservation.mjs';
import {journalManagedJavascriptError} from './javascript-managed-wizard-error.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const need=(value,message)=>{if(!value)throw Error(message);};
const verification='javascript_native_refusal_draft_discarded_baseline_retained';

export function javascriptWizardDiagnostic(diagnostic,node) {
  const bounded=value=>{
    let text='';
    for(const char of value) {
      if(Buffer.byteLength(text+char)>2048)break;
      text+=char;
    }
    return {text,truncated:text!==value};
  };
  const tooltip=bounded(diagnostic.tooltip),dialog=bounded(diagnostic.dialog_text);
  const text=diagnostic.tooltip+'\n'+diagnostic.dialog_text;
  const classes=[...new Set([...text.matchAll(/\b(SyntaxError|TypeError|ReferenceError|RangeError|EvalError|URIError|Error):/g)].map(item=>item[1]))];
  const positions=[...new Set([...text.matchAll(/\(:(\d+):(\d+)\)/g)].map(item=>item[1]+':'+item[2]))];
  const at=positions.length===1?['',...positions[0].split(':')]:null;
  const line=at&&Number(at[1]),column=at&&Number(at[2]);
  return {kind:'javascript_wizard',stage:'code_next',node,source_sha256:diagnostic.source_sha256,
    tooltip:tooltip.text,tooltip_truncated:diagnostic.tooltip_truncated||tooltip.truncated,
    dialog_text:dialog.text,dialog_text_truncated:diagnostic.dialog_text_truncated||dialog.truncated,dialog_closed:true,
    error_class:classes.length===1?{status:'recognized',name:classes[0]}:{status:'unrecognized'},
    location:at&&Number.isSafeInteger(line)&&line>0&&Number.isSafeInteger(column)&&column>0
      ?{status:'recognized',line,column}:{status:'unrecognized'}};
}

// Fresh independent source admission/discard, all semantic native settings and
// complete graph evidence are required after the owned failed draft is closed.
export async function retainedJavascriptWizardRefusal({refusal,owner,admitted,afterReceipt,baseline,afterBaseline,
  beforeGraph,afterGraph,record,deadline}) {
  const node=Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,owner[key]]));
  const diagnostic=refusal?.diagnostic,closed=refusal?.closed;
  need(diagnostic?.dialog_closed===true&&diagnostic.native_owner_verified===true&&same(diagnostic.owner,node)
    &&diagnostic.explicit_execute_requested===false&&diagnostic.source_sha256===admitted.effective_source.source_sha256
    &&closed?.verified===true&&closed.closed===true&&closed.node_id===node.node_id&&closed.draft_discarded===true
    &&closed.settings_applied===false&&closed.execution_started===false,'JavaScript native draft discard proof unavailable');
  need(admitted.kind==='existing'&&afterReceipt.kind==='existing'&&afterReceipt.phase==='admitted'
    &&afterReceipt.intent==='preserve'&&same(admitted.owner,owner)&&same(afterReceipt.owner,owner)
    &&same(afterReceipt.previous_source,admitted.previous_source)
    &&afterReceipt.effective_source.source_sha256===admitted.previous_source.source_sha256
    &&admitted.settings_sha256===afterReceipt.settings_sha256&&same(baseline,afterBaseline),
  'JavaScript retained committed source/settings changed');
  verifyJavascriptMappingGraph(beforeGraph,afterGraph,node);
  need(afterGraph.nodes.find(item=>same(item.ref,node))?.locked===false,'JavaScript retained graph node still locked');
  const native=javascriptWizardDiagnostic(diagnostic,node);
  const proof={node,owner:structuredClone(owner),admission_id:admitted.admission_id,
    recovery_admission_id:afterReceipt.admission_id,retained_source:admitted.previous_source,
    rejected_source_sha256:admitted.effective_source.source_sha256,settings_sha256:admitted.settings_sha256,
    schema_mode:baseline.schema_mode,graph_sha256:createHash('sha256').update(JSON.stringify(afterGraph)).digest('hex'),
    dialog_closed:true,draft_discarded:true,full_source_read_discard_verified:true,native_settings_unchanged:true,
    full_graph_unchanged:true,explicit_execute_requested:false,native};
  await journalManagedJavascriptError({record,deadline},{phase:verification,operation_id:owner.operation_id,proof,deadline});
  const error=Error(native.tooltip||native.dialog_text);
  error.receipt={error:{code:'JAVASCRIPT_WIZARD_SOURCE_REJECTED',message:error.message}};
  error.nodePhaseRefusal={phase:'node_finish',status:'FAILED',effect_possible:true,cleanup_complete:true,
    settings_unchanged:true,verification,proof};
  throw error;
}

export function verifiedJavascriptWizardRefusal(refusal,request) {
  const proof=refusal?.proof,node=request.target.ref,native=proof?.native,retained=proof?.retained_source;
  const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const digest=value=>/^[a-f0-9]{64}$/.test(value);
  return request.target.kind==='existing'&&request.target.type==='programming.javascript'&&request.mode==='script'
    &&request.finish==='execute'&&request.inputs.length===0&&request.mappings.length===0&&request.parameters.columns===undefined
    &&refusal?.verification===verification&&same(proof?.node,node)
    &&['document_id','workflow_id','node_id'].every(key=>proof?.owner?.[key]===node[key])
    &&proof.owner.operation_id===request.operation_id&&Number.isSafeInteger(proof.owner.ui_epoch)&&proof.owner.ui_epoch>=0
    &&uuid(proof.admission_id)&&uuid(proof.recovery_admission_id)&&proof.admission_id!==proof.recovery_admission_id
    &&digest(retained?.source_sha256)&&Number.isSafeInteger(retained.source_utf8_bytes)&&retained.source_utf8_bytes>=0
    &&retained.source_utf8_bytes<=32768&&Number.isInteger(retained.source_lf_lines)&&retained.source_lf_lines>=1&&retained.source_lf_lines<=1024
    &&digest(proof.settings_sha256)&&digest(proof.graph_sha256)&&['code','declared'].includes(proof.schema_mode)
    &&(request.parameters.schema_mode===undefined||request.parameters.schema_mode===proof.schema_mode)
    &&(request.parameters.source_text===undefined?proof.rejected_source_sha256===retained.source_sha256
      :request.parameters.expected_source_sha256===retained.source_sha256
        &&proof.rejected_source_sha256===javascriptSourceIdentity(request.parameters.source_text).source_sha256)
    &&proof.dialog_closed===true&&proof.draft_discarded===true&&proof.full_source_read_discard_verified===true
    &&proof.native_settings_unchanged===true&&proof.full_graph_unchanged===true&&proof.explicit_execute_requested===false
    &&native?.kind==='javascript_wizard'&&native.stage==='code_next'&&same(native.node,node)
    &&native.source_sha256===proof.rejected_source_sha256&&native.dialog_closed===true
    &&typeof native.tooltip==='string'&&Buffer.byteLength(native.tooltip)<=2048&&typeof native.tooltip_truncated==='boolean'
    &&typeof native.dialog_text==='string'&&Buffer.byteLength(native.dialog_text)<=2048&&typeof native.dialog_text_truncated==='boolean'
    &&(native.error_class?.status==='unrecognized'&&same(Object.keys(native.error_class),['status'])
      ||native.error_class?.status==='recognized'&&['SyntaxError','TypeError','ReferenceError','RangeError','EvalError','URIError','Error'].includes(native.error_class.name)
        &&same(Object.keys(native.error_class).sort(),['name','status']))
    &&(native.location?.status==='unrecognized'&&same(Object.keys(native.location),['status'])
      ||native.location?.status==='recognized'&&Number.isSafeInteger(native.location.line)&&native.location.line>0
        &&Number.isSafeInteger(native.location.column)&&native.location.column>0&&same(Object.keys(native.location).sort(),['column','line','status']));
}
