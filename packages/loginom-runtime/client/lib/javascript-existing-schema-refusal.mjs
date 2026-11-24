import {javascriptExistingLifecycleBaseline} from './javascript-existing-lifecycle.mjs';
import {javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
import {journalManagedJavascriptError} from './javascript-managed-wizard-error.mjs';

const phase='javascript_existing_schema_mode_refused';

function schemaRefusal(parameters,baseline,request) {
  if(baseline.unconfigured){
    if(request.finish==='close'||parameters.schema_mode===undefined
      ||parameters.schema_mode==='declared'&&parameters.columns===undefined)return 'unconfigured_schema_required';
    return null;
  }
  if(parameters.schema_mode!==undefined&&parameters.schema_mode!==baseline.schema_mode
    ||parameters.columns!==undefined||request.inputs.length!==0
    ||parameters.input_state==='unconnected'&&request.variable_inputs?.length)return 'configured_schema_preserved';
  return null;
}

const messages={
  configured_schema_preserved:'JavaScript existing lifecycle preserves observed schema and inputs',
  unconfigured_schema_required:'Unconfigured JavaScript requires schema_mode, columns for declared mode, and finish:done or execute',
  filesystem_input_required:'JavaScript FS requires input_state:unconnected before mutation or execution',
  unconnected_graph:'JavaScript unconnected input requires a complete owned graph without incoming table, service or unowned variable links',
  table_input_required:'Unconfigured JavaScript requires an existing or requested table input, or input_state:unconnected',
  target_not_applied:'JavaScript target preflight refused before applying changes',
};

// Issue a refusal only after an independent, acknowledged full source read
// and discard. Ownership, uncertain reads and lost ACKs reject separately.
export async function admitJavascriptExistingSchema({receipt,snapshot,parameters,owner,record,deadline,request}) {
  const baseline=javascriptExistingLifecycleBaseline({receipt,snapshot,
    parameters:{expected_source_sha256:parameters.expected_source_sha256},owner});
  const reason=schemaRefusal(parameters,baseline,request);
  if(reason)await refuseJavascriptExistingTarget({receipt,snapshot,baseline,parameters,owner,record,deadline},reason);
  return baseline;
}

export async function refuseJavascriptExistingTarget({receipt,snapshot,baseline,parameters,owner,record,deadline},reason,message) {
  const proof={node:Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,owner[key]])),
    owner:structuredClone(owner),admission_id:receipt.admission_id,observed_schema_mode:baseline.schema_mode,
    requested_schema_mode:parameters.schema_mode??null,unconfigured:baseline.unconfigured===true,reason,
    filesystem:receipt.effective_source.filesystem===true,source_identity:structuredClone(receipt.previous_source),
    settings:structuredClone(snapshot.settings),settings_sha256:baseline.settings_sha256,
    source_read_discard_verified:true,settings_unchanged:true,editor_mutation_started:false,explicit_execute_requested:false};
  await journalManagedJavascriptError({record,deadline},{phase,operation_id:owner.operation_id,proof});
  const error=Error(message??messages[reason]);
  // The owned read and discard can affect the UI while preserving settings.
  error.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,
    settings_unchanged:true,verification:phase,proof};
  throw error;
}

export function verifiedJavascriptExistingSchemaRefusal(refusal,request) {
  const proof=refusal?.proof,node=request.target.ref,source=proof?.source_identity;
  if(request.target.type!=='programming.javascript'||request.target.kind!=='existing'||request.mode!=='script'
    ||!['done','close','execute'].includes(request.finish)||request.mappings.length!==0||refusal?.verification!==phase
    ||!['document_id','workflow_id','node_id'].every(key=>proof?.node?.[key]===node[key]&&proof?.owner?.[key]===node[key])
    ||proof.owner.operation_id!==request.operation_id||!Number.isSafeInteger(proof.owner.ui_epoch)||proof.owner.ui_epoch<0
    ||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(proof.admission_id))
    ||!['code','declared'].includes(proof.observed_schema_mode)
    ||proof.requested_schema_mode!==(request.parameters.schema_mode??null)
    ||proof.source_read_discard_verified!==true||proof.settings_unchanged!==true
    ||proof.editor_mutation_started!==false||proof.explicit_execute_requested!==false
    ||!(/^[a-f0-9]{64}$/.test(source?.source_sha256))||!Number.isSafeInteger(source.source_utf8_bytes)
    ||source.source_utf8_bytes<0||source.source_utf8_bytes>32768||!Number.isInteger(source.source_lf_lines)
    ||source.source_lf_lines<1||source.source_lf_lines>1024
    ||request.parameters.expected_source_sha256!==undefined&&request.parameters.expected_source_sha256!==source.source_sha256
    ||proof.settings?.generation!==(proof.observed_schema_mode==='code')||!Array.isArray(proof.settings.grids)
    ||proof.settings_sha256!==javascriptSourceSettingsDigest(proof.settings))return false;

  const targets=proof.settings.grids.filter(grid=>grid.tid.endsWith(';grdTargetColumns;tbl'));
  const unconfigured=proof.settings.generation===false&&targets.length===1&&targets[0].fields.length===0;
  if(proof.unconfigured!==unconfigured)return false;
  const expected=schemaRefusal(request.parameters,{schema_mode:proof.observed_schema_mode,unconfigured},request);
  return expected!==null?proof.reason===expected
    :proof.reason==='filesystem_input_required'&&proof.filesystem===true&&request.parameters.input_state!=='unconnected'
    ||proof.reason==='unconnected_graph'&&request.parameters.input_state==='unconnected'
    ||proof.reason==='table_input_required'&&unconfigured&&request.inputs.length===0&&request.parameters.input_state===undefined
    ||proof.reason==='target_not_applied';
}
