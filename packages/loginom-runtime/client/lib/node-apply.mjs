import {createHash} from 'node:crypto';
import {verifiedCalculatorRequestRefusal} from './calculator-request-refusal.mjs';
import {verifiedNativeReadRefusal,verifiedExportReadRefusal} from './native-read-refusal.mjs';
import {verifiedJavascriptExistingSchemaRefusal} from './javascript-existing-schema-refusal.mjs';
import {verifiedJavascriptWizardRefusal} from './javascript-wizard-recovery.mjs';
import {verifiedJavascriptSourcePolicyRefusal} from './javascript-source-policy-refusal.mjs';
import {NODE_CONTRACT_REVISION, validateNodeTargetRequest} from './node-contracts.mjs';
import {NODE_READ_MODE,nodeReadHandler} from './node-read-contract.mjs';

const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const requireValue = (v, message) => { if (!v) throw Error(message); };
const object = (v, keys) => requireValue(v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k)), 'Invalid node.apply contract');
const id = v => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);

/** This shell is private until every required live driver and audit is admitted.
 * It does not interpret recipes and never invokes another executor or a model.
 */
export function validateNodeApplyRequest(request, handlers) {
  object(request, ['operation_id','contract_revision','document_id','workflow_ref','target','inputs',
    'mode','parameters','mappings','finish','read','budgets']);
  requireValue(id(request.operation_id) && request.contract_revision === NODE_CONTRACT_REVISION,
    'Unsupported node.apply operation ID or contract revision');
  const graph = Object.fromEntries(['document_id','workflow_ref','target','inputs'].map(k=>[k,request[k]]));
  validateNodeTargetRequest(graph);
  const installed = handlers.get(request.target.type);
  const handler = installed && request.mode===NODE_READ_MODE ? nodeReadHandler(installed) : installed;
  requireValue(handler && typeof handler.validate === 'function' && typeof handler.configure === 'function'
    && typeof handler.revision === 'string' && handler.revision.length > 0, 'No local configuration handler for this node type');
  requireValue(handler.output_wizard===undefined||['embedded','separate'].includes(handler.output_wizard),'Unsupported handler output wizard placement');
  requireValue(handler.modes.includes(request.mode), 'Unsupported node configuration mode');
  requireValue(['done','execute','close'].includes(request.finish), 'Choose Done, Execute or Close explicitly');
  requireValue(Array.isArray(request.mappings) && request.mappings.length <= 16, 'Bounded port mappings required');
  const mapped = new Set();
  for (const mapping of request.mappings) {
    requireValue(mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      && Object.keys(mapping).every(k=>['direction','port','autosync','fields','changes'].includes(k))
      && ['input','output'].includes(mapping.direction) && Number.isInteger(mapping.port) && mapping.port >= 0 && mapping.port < 100,
    'Invalid port mapping');
    const key = mapping.direction + ':' + mapping.port;
    requireValue(!mapped.has(key), 'Duplicate port mapping'); mapped.add(key);
    requireValue(mapping.autosync === undefined || typeof mapping.autosync === 'boolean', 'Invalid mapping autosync');
    requireValue(mapping.changes===undefined||mapping.direction==='output'&&mapping.fields===undefined,'Output changes and full fields are mutually exclusive');
    const entries=mapping.fields??mapping.changes;
    if (entries !== undefined) {
      requireValue(Array.isArray(entries) && entries.length <= 1000, 'Bounded mapping fields required');
      const changed=new Set();
      for (const field of entries) {
        requireValue(field && typeof field === 'object' && !Array.isArray(field)
          && Object.keys(field).every(k=>['source','name','label','excluded'].includes(k)), 'Invalid mapping field');
        if(field.source?.kind==='configured_field') {
          object(field.source,['kind','name']);
          requireValue(typeof field.source.name==='string' && field.source.name.length>0
            && field.source.name.length<=200 && !/[\x00-\x1f]/.test(field.source.name),'Configured output source name required');
        } else {
          object(field.source, ['schema_id','field_id']);
          requireValue(id(field.source.schema_id) && id(field.source.field_id), 'Bound mapping field identity required');
        }
        for(const key of ['name','label'])requireValue(field[key]===undefined || typeof field[key]==='string'
          && field[key].length>0 && field[key].length<=200 && !/[\x00-\x1f]/.test(field[key]), 'Invalid mapping '+key);
        requireValue(field.excluded===undefined || typeof field.excluded==='boolean', 'Invalid exclusion flag');
        if(mapping.changes!==undefined){
          requireValue(field.source?.kind==='configured_field'&&!changed.has(field.source.name),'Unique configured output changes required');changed.add(field.source.name);
          requireValue(['name','label','excluded'].some(k=>Object.hasOwn(field,k)),'Output change must rename or exclude a field');
        }
      }
    }
  }
  object(request.read, ['ports','sample_rows','require_exact_numbers',...(Object.hasOwn(request.read??{},'coverage')?['coverage']:[])]);
  requireValue(request.read.coverage===undefined||['full','sample'].includes(request.read.coverage),'Invalid output coverage');
  if(request.read.coverage==='full')requireValue(request.finish==='execute'&&JSON.stringify(request.read.ports)==='[0]'
    &&(['transform.collapse_columns','transform.cross_table'].includes(request.target.type)
      ||request.target.type==='programming.javascript'&&handler.fullUiOutput===true
        &&request.read.sample_rows===100&&request.read.require_exact_numbers===true),
    'Invalid parameters.read.coverage: full requires executed Collapse or CrossTable output 0 or installed JavaScript UI full-read support with 100 exact rows');
  requireValue(Array.isArray(request.read.ports) && request.read.ports.length <= 16
    && new Set(request.read.ports).size === request.read.ports.length
    && request.read.ports.every(p=>Number.isInteger(p) && p>=0 && p<100)
    && Number.isInteger(request.read.sample_rows) && request.read.sample_rows>=0 && request.read.sample_rows<=100
    && typeof request.read.require_exact_numbers==='boolean', 'Invalid output read request');
  requireValue(request.finish==='execute' || request.read.ports.length===0, 'Invalid parameters.read.ports: Done and Close require an empty list; choose finish=execute to read fresh output');
  object(request.budgets, ['configure_ms','execute_ms','total_ms']);
  requireValue(Object.values(request.budgets).every(v=>Number.isInteger(v) && v>=1 && v<=1800000)
    && request.budgets.total_ms>=Math.max(request.budgets.configure_ms,request.budgets.execute_ms), 'Invalid node budgets');
  // A handler rejects unsupported mapping/read modes and parameters here, before
  // even the target phase can create a node. Validation must be pure.
  handler.validate(request.parameters, request.mode, request);
  return {graph,handler};
}

/** Phases share the enclosing runtime's gate and cancellation ownership.
 * Drivers return verified facts or throw; a transport timeout is never retried.
 * Re-entry requires explicit inspection of the original phase and exact context.
 */
export async function reconcileNodeWorkflow({operation,adapter,record,now=Date.now}) {
  const state=operation.nodeApply,pending=state?.pending;
  if(pending?.phase!=='workflow'||typeof adapter?.readWorkflowReceipt!=='function'
    ||typeof adapter?.verifyWorkflow!=='function')return false;
  requireValue(state.phases.length===1&&state.phases[0].phase==='source'&&!state.node
    &&pending.receipt_id===operation.id+':workflow','Workflow recovery boundary differs');
  const request={document_id:state.request.document_id,workflow_ref:state.request.workflow_ref};
  const ctx={receipt_id:pending.receipt_id,deadline:now()+15000};
  const response=await adapter.readWorkflowReceipt(request,ctx);
  if(response?.output?.state!=='completed')return false;
  const value=response.output.receipt;
  const matches=v=>v?.status==='SUCCEEDED'&&v.verified===true&&v.cleanup_complete===true
    &&v.document_id===request.document_id&&hash(v.workflow_ref)===hash(request.workflow_ref);
  if(!matches(value))return false;
  // A historical receipt alone cannot restore a lost draft or switch a tab.
  const current=await adapter.verifyWorkflow(request,ctx);
  if(!matches(current)||current.effect_possible!==false)return false;
  const receipt={phase:'workflow',receipt_id:pending.receipt_id,status:'verified',
    effect_possible:value.effect_possible===true,value:structuredClone(value)};
  const event={operation_id:operation.id,action_key:'node.apply',action_revision:NODE_CONTRACT_REVISION,
    phase:'node_phase_completed',signature:state.signature,receipt};
  const saved=await record(event);
  requireValue(saved&&hash(Object.fromEntries(Object.keys(event).map(k=>[k,saved[k]])))===hash(event),
    'Node phase journal acknowledgement differs');
  state.phases.push(receipt);state.pending=null;state.cleanup_complete=true;
  state.effect_possible=state.phases.some(p=>p.effect_possible===true);
  return true;
}

export async function applyNode({request, operation, handlers, drivers, record,
  signal, stopSignal, now=Date.now, resume=false}) {
  request=structuredClone(request);
  const {graph,handler}=validateNodeApplyRequest(request,handlers);
  requireValue(operation.id===request.operation_id, 'node.apply operation identity differs');
  const separateOutput=handler.output_wizard==='separate';
  const javascriptConfigurationOnly=request.target.type==='programming.javascript'
    &&handler.materialize_output===true&&request.finish!=='execute';
  const materialize=handler.materialize_output===true&&!javascriptConfigurationOnly;
  requireValue(!materialize||request.target.type==='programming.javascript'&&separateOutput
    &&request.finish==='execute'&&typeof drivers.materializeOutput==='function',
  'JavaScript materialization requires separate output and explicit Execute');
  requireValue(!separateOutput||request.finish==='close'||typeof drivers.finishGraph==='function','Separate output wizard requires a graph finish driver');
  const signature=hash({request,handler_revision:handler.revision,...(separateOutput?{output_wizard:'separate'}:{}),...(materialize?{materialize_output:true}:{})});
  const acknowledge=async entry=>{
    const event={operation_id:operation.id,action_key:'node.apply',action_revision:NODE_CONTRACT_REVISION,...entry};
    const saved=await record(event);
    requireValue(saved && hash(Object.fromEntries(Object.keys(event).map(k=>[k,saved[k]])))===hash(event),
      'Node phase journal acknowledgement differs');
    return saved;
  };
  let state=operation.nodeApply;
  let continuingConfigure=false;
  let continuingOpen=false,openRecovery,continuingFinish=false;
  if(state) {
    requireValue(state.signature===signature, 'node.apply operation ID was used with different parameters or handler');
    continuingConfigure=resume&&state.pending?.phase==='configure'&&request.target.type==='transform.date_time'
      &&typeof drivers.verifyPendingConfigure==='function';
    continuingOpen=resume&&state.pending?.phase==='open'&&typeof drivers.verifyPendingOpen==='function';
    continuingFinish=resume&&state.pending?.phase==='finish'&&typeof drivers.verifyPendingFinish==='function';
    if(state.pending&&!continuingConfigure&&!continuingOpen&&!continuingFinish)throw Error('Inspect the unresolved original node phase before continuing');
    if(state.result)return structuredClone(state.result);
    requireValue(resume && (state.cleanup_complete===true||continuingConfigure||continuingOpen||continuingFinish), 'Explicit inspected resume is required');
    requireValue(state.resumes<3, 'Node resume budget exhausted');
    // A journal cannot resurrect an unsaved draft. The live driver must attest
    // the same prepared package and every already accepted phase.
    if(continuingOpen){
      openRecovery=await drivers.verifyPendingOpen(state,{signal});
      requireValue(openRecovery?.verified===true&&typeof openRecovery.wizard_open==='boolean','Original open boundary is not verified');
      await acknowledge({phase:'node_open_recovery_checked',signature,receipt_id:state.pending.receipt_id,recovery:openRecovery});
    }else if(continuingFinish){
      // A refused finish proof is final for this operation; only release remains.
      const recovery=await drivers.verifyPendingFinish(state,{signal}).catch(error=>{state.finish_resume_refused=true;throw error;});
      requireValue(recovery?.verified===true&&recovery.launch_effect===false,'Original finish boundary is not verified');
      await acknowledge({phase:'node_finish_recovery_checked',signature,receipt_id:state.pending.receipt_id,recovery});
    }else requireValue(await (continuingConfigure?drivers.verifyPendingConfigure(state,{signal}):drivers.verifyContinuation(state,{signal}))===true, 'Live package or accepted phases differ from checkpoint');
    state.resumes++;
    delete state.verified_refusal;
    delete state.export_destination_conflict;
  } else {
    signal?.throwIfAborted();
    state={signature,handler_revision:handler.revision,request:structuredClone(request),phases:[],pending:null,
      node:null,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},
      effect_possible:false,cleanup_complete:true,resumes:0,started_at:now(),deadline:now()+request.budgets.total_ms};
    await acknowledge({phase:'node_apply_prepared',signature,request:structuredClone(request),deadline_at:state.deadline});
    operation.nodeApply=state;
  }
  const context=()=>({operation_id:operation.id,document_id:request.document_id,workflow_ref:request.workflow_ref,
    node:state.node,execution:state.execution,deadline:state.deadline,signal,stopSignal});
  const check=()=>{signal?.throwIfAborted();requireValue(now()<state.deadline,'node.apply total deadline elapsed');};
  const phase=async(name,call,{budget=request.budgets.configure_ms,mutation=true,verify=()=>{}}={})=>{
    const prior=state.phases.find(p=>p.phase===name);
    if(prior)return structuredClone(prior.value);
    check();
    const executionPhase=['execute','materialization_execute'].includes(name);
    const configuration=!['source','execute','materialization_execute','read'].includes(name);
    if(configuration)state.configure_deadline??=Math.min(state.deadline,now()+request.budgets.configure_ms);
    const deadline=Math.min(state.deadline,now()+budget,configuration?state.configure_deadline:Infinity,
      executionPhase&&state.execution_wait?.phase===name?state.execution_wait.deadline:Infinity);
    requireValue(now()<deadline,'node.apply configuration deadline elapsed');
    const oldConfigure=continuingConfigure&&name==='configure',oldOpen=continuingOpen&&name==='open',oldFinish=continuingFinish&&name==='finish';
    const pending=oldConfigure||oldOpen||oldFinish?state.pending:{phase:name,receipt_id:operation.id+':'+name,deadline,
      effect_possible:mutation,before_node:structuredClone(state.node)};
    requireValue(!oldConfigure||pending.receipt_id===operation.id+':configure'&&now()<pending.deadline,'Original configure boundary differs');
    requireValue(!oldOpen||pending.receipt_id===operation.id+':open'&&now()<pending.deadline,'Original open boundary differs');
    requireValue(!oldFinish||pending.receipt_id===operation.id+':finish'&&now()<pending.deadline,'Original finish boundary differs');
    if(!oldConfigure&&!oldOpen&&!oldFinish)await acknowledge({phase:'node_phase_prepared',signature,receipt:pending});
    check();
    state.pending=pending;state.cleanup_complete=false;
    // Preserve uncertainty until the driver and journal both confirm completion.
    const previousEffect=state.effect_possible;
    state.effect_possible ||= mutation;
    let value;
    try{value=await call({...context(),receipt_id:pending.receipt_id,deadline:pending.deadline});}
    catch(error){
      // Explicit trusted-driver proof is required: a transport exception alone
      // never clears uncertainty, even in a nominally non-mutating phase.
      const refusal=error.nodePhaseRefusal;
      if(name==='read'&&request.target.type==='exports.text'&&operation.cleanupConfirmed===true&&!operation.transportUncertain
        &&verifiedExportReadRefusal(refusal,state.node,state.execution,operation.id)){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        state.export_download_refusal=true;
      }
      if(name==='read'&&['transform.cross_table','transform.collapse_columns'].includes(request.target.type)
        &&operation.cleanupConfirmed===true&&!operation.transportUncertain
        &&verifiedNativeReadRefusal(refusal,state.node,state.execution,request.read)){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        state.native_read_refusal=true;
      }
      if(refusal?.phase===name&&refusal.status==='FAILED'&&refusal.effect_possible===true
        &&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
        &&refusal.proof?.closed?.deadline===pending.deadline
        &&verifiedJavascriptSourcePolicyRefusal(refusal,request,state.node)){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
      }
      if(name==='node_finish'&&refusal?.phase===name&&refusal.status==='FAILED'&&refusal.effect_possible===true
        &&refusal.cleanup_complete===true&&refusal.settings_unchanged===true&&verifiedJavascriptWizardRefusal(refusal,request)) {
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        state.javascript_wizard_refusal=structuredClone(refusal.proof);
      }
      const importClosed=refusal?.proof?.closed;
      if(name==='configure'&&request.target.type==='imports.text'
        &&['text_import_binding_draft_discarded','text_import_readiness_draft_discarded','text_import_refresh_draft_discarded','text_import_initial_settings_draft_discarded'].includes(refusal?.verification)&&refusal.phase===name
        &&refusal.status==='FAILED'&&refusal.effect_possible===true&&refusal.cleanup_complete===true
        &&refusal.settings_unchanged===true&&importClosed?.verified===true&&importClosed.cleanup_complete===true
        &&importClosed.draft_discarded===true&&importClosed.settings_applied===false
        &&importClosed.execution_started===false&&importClosed.node_context?.verified===true
        &&importClosed.node_context.surface==='graph'
        &&['document_id','workflow_id','node_id'].every(k=>importClosed.node_context[k]===state.node?.[k])) {
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        // A discarded first wizard of a new node leaves no saved source, so the
        // retry must name source_path explicitly; an existing node keeps its own.
        const draftOnly=['text_import_readiness_draft_discarded','text_import_refresh_draft_discarded'].includes(refusal.verification);
        state.correctable_import_request=refusal.verification==='text_import_initial_settings_draft_discarded'||draftOnly&&request.target.kind==='new'?'initial_settings'
          :draftOnly?'readiness':'binding';
      }
      if(name==='configure'&&request.target.type==='transform.calculator'
        &&(request.target.kind==='existing'&&request.inputs.length===0&&request.mappings.length===0
          ||refusal?.verification==='calculator_syntax_rejected_draft_restored')&&refusal?.phase===name&&refusal.status==='FAILED'
        &&refusal.effect_possible===true&&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
        &&verifiedCalculatorRequestRefusal(refusal,state.node)){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        state.correctable_calculator_request=true;
        state.calculator_default_expression=refusal.proof.before.expressions?.length===1
         &&refusal.proof.before.expressions[0].name==='Expr1'&&refusal.proof.before.expressions[0].formula==='';
      }
      if(name==='configure'&&request.target.type==='exports.text'&&refusal?.phase===name&&refusal.status==='FAILED'
        &&refusal.effect_possible===true&&refusal.cleanup_complete===true&&refusal.settings_unchanged===true&&['text_export_conflict_rejected','text_export_unsupported_retained'].includes(refusal.verification)){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
        state.export_destination_conflict=refusal.verification==='text_export_conflict_rejected';
      }
      if(name==='input_mapping'&&request.target.type==='research.duplicates'&&refusal?.phase===name
        &&refusal.status==='FAILED'&&refusal.effect_possible===true&&refusal.cleanup_complete===true
        &&refusal.settings_unchanged===true&&refusal.verification==='duplicates_input_validation_refused'){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
      }
      const replacementClosed=refusal?.proof?.closed;
      const replacementRefusal=name==='configure'&&request.target.type==='transform.replace_columns'
        &&refusal?.verification==='replacement_effective_preflight_completed'
        &&replacementClosed?.verified===true&&replacementClosed.cleanup_complete===true
        &&replacementClosed.draft_discarded===true&&replacementClosed.settings_applied===false
        &&replacementClosed.node_context?.verified===true
        &&['document_id','workflow_id','node_id'].every(k=>replacementClosed.node_context[k]===state.node?.[k]);
      if((name==='target'&&(['reform_mapped_preflight_completed','missing_values_preflight_completed','crosstable_preflight_completed'].includes(refusal?.verification)
          ||verifiedJavascriptExistingSchemaRefusal(refusal,request))||replacementRefusal)
        &&refusal?.phase===name&&refusal.status==='FAILED'
        &&refusal.effect_possible===true&&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
      ){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=true;state.pending=null;state.cleanup_complete=true;state.verified_refusal=true;
      }
      if((name==='target'||name==='source'&&state.phases.length===0&&!previousEffect)
        && refusal?.phase===name && refusal.status==='NOT_APPLIED'
        && refusal.effect_possible===false && refusal.cleanup_complete===true){
        await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,...refusal}});
        state.effect_possible=previousEffect;state.pending=null;state.cleanup_complete=true;
      }
      const pause=error.nodeExecutionWaitPause;
      if(executionPhase&&signal?.aborted&&!stopSignal?.aborted
        &&pause?.read_only===true&&pause.cleanup_complete===true
        &&pause.execution_id===state.execution.execution_id&&state.execution.status==='pending'
        &&operation.cleanupConfirmed===true&&!operation.transportUncertain) {
        const checkpoint={...pending,...pause,phase:name};
        await acknowledge({phase:'node_phase_paused',signature,receipt:checkpoint});
        state.execution_wait=checkpoint;state.pending=null;state.cleanup_complete=true;
      }
      throw error;
    }
    if(name==='workflow' && value?.status==='NOT_APPLIED' && value.verified===false
      && value.effect_possible===false && value.cleanup_complete===true){
      await acknowledge({phase:'node_phase_refused',signature,receipt:{...pending,status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,value}});
      state.effect_possible=previousEffect;state.pending=null;state.cleanup_complete=true;
      throw new Error(value.error??'Workflow activation refused before effect');
    }
    requireValue(value?.verified===true && value.cleanup_complete===true, 'Node phase did not verify '+name);
    verify(value);
    const receipt={phase:name,receipt_id:pending.receipt_id,status:'verified',effect_possible:value.effect_possible===true,value:structuredClone(value)};
    await acknowledge({phase:'node_phase_completed',signature,receipt});
    // Anticipated mutation is uncertainty until the verified receipt arrives.
    // A proven unchanged workflow must not turn a later pre-target refusal into
    // an ambiguous configuration effect.
    if(name==='workflow')state.effect_possible=previousEffect||value.effect_possible===true;
    state.phases.push(receipt);state.pending=null;state.cleanup_complete=true;
    if(executionPhase)delete state.execution_wait;
    requireValue(now()<pending.deadline,'node.apply phase deadline elapsed: '+name);
    return value;
  };
  const readingOnly=request.mode===NODE_READ_MODE;
  const waitForExecution=async name=>{
      const execution=await phase(name,ctx=>drivers.waitExecution(ctx),{budget:request.budgets.execute_ms,mutation:false,
        verify:value=>requireValue(value.execution_id===state.execution.execution_id
          &&(name!=='materialization_execute'||value.owner_verified===true) && ['completed','cancelled','failed'].includes(value.status)
          && (value.status!=='cancelled'||stopSignal?.aborted===true&&value.stop_verified===true&&value.owner_verified===true)
          && (value.status!=='failed'||value.failure_verified===true&&value.output_refreshed===false
            &&['document_id','workflow_id','node_id'].every(k=>value.node?.[k]===state.node[k])&&id(value.root_id)&&id(value.group_id)&&id(value.group_record_id)
            &&value.execution_id===state.node.document_id+':'+value.root_id+':'+value.group_id
            &&value.error?.code==='NODE_EXECUTION_FAILED'&&typeof value.error.message==='string'&&value.error.message.trim().length>0&&value.error.message.length<=1000), 'Execution has no verified terminal outcome')});
      if(execution.status==='failed') {
        state.execution={status:'failed',execution_id:execution.execution_id,failure_verified:true,
          root_id:execution.root_id,group_id:execution.group_id,group_record_id:execution.group_record_id};
        const result={operation_id:operation.id,status:'FAILED',effect_possible:state.effect_possible,
          phases:state.phases.map(({value,...p})=>p),node:state.node,execution:state.execution,output:state.output,
          package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:readingOnly?'not_requested':'applied'},
          checkpoint_kind:'local_node_failed',persisted_package_verified:false,error:execution.error,
          next_step:correctNodeRequest(request,state.node)};
        await acknowledge({phase:'node_checkpoint',signature,result});state.result=structuredClone(result);
        return result;
      }
      if(execution.status==='cancelled') {
        state.execution={status:'cancelled',execution_id:execution.execution_id,stop_verified:true};
        const result={operation_id:operation.id,status:'FAILED',effect_possible:state.effect_possible,
          phases:state.phases.map(({value,...p})=>p),node:state.node,execution:state.execution,output:state.output,
          package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:readingOnly?'not_requested':'applied'},
          checkpoint_kind:'local_node_stopped',persisted_package_verified:false,
          error:{code:'NODE_EXECUTION_CANCELLED',message:'The identified server execution was cancelled; configured node retained'}};
        await acknowledge({phase:'node_checkpoint',signature,result});state.result=structuredClone(result);
        return result;
      }
      state.execution={status:'completed',execution_id:execution.execution_id};
      return null;
  };
  try {
    // File verification does not infer identity from the displayed path. The
    // driver checks an already completed upload/inspect/verify receipt chain.
    await phase('source',ctx=>drivers.verifySource(request.parameters,ctx),{mutation:false});
    if(drivers.activateWorkflow)await phase('workflow',ctx=>drivers.activateWorkflow(ctx));
    const target=await phase('target',ctx=>drivers.prepareTarget(graph,ctx),{verify:value=>requireValue(
      value.node?.document_id===request.document_id && value.node.workflow_id===request.workflow_ref.workflow_id
      && id(value.node.node_id), 'Target phase returned a foreign node')});state.node=target.node;
    if(!readingOnly){
    await phase('input_mapping',ctx=>drivers.mapPorts(request.mappings.filter(m=>m.direction==='input'),ctx));
    await phase('open',ctx=>openRecovery?.wizard_open?openRecovery.value:drivers.openWizard(ctx));
    await phase('configure',ctx=>handler.configure(ctx,request.parameters,drivers));
    // A separate port wizard can open only after the node settings are saved.
    // Close must discard the node draft before any such intermediate commit.
    if(separateOutput&&request.finish!=='close')await phase('node_finish',ctx=>drivers.finish('done',ctx),{verify:value=>{
      if(request.target.type==='programming.javascript')requireValue(value.mode==='done'
        &&value.settings_applied===true&&value.execution_started===null&&value.execution_id==null
        &&value.explicit_execute_requested===false&&value.wizard_commit_verified===true
        &&value.graph_owner_verified===true&&value.source_readback_verified===true&&value.owned_done_settled===true,
      'Intermediate JavaScript Done requires settled owner and independent source readback');
      else requireValue(value.mode==='done'&&value.settings_applied===true&&value.execution_started===false&&value.execution_id==null,
        'Intermediate node Done must save settings without execution');
    }});
    if(materialize){
      const first=await phase('materialization_start',ctx=>drivers.materializeOutput(ctx),{verify:value=>requireValue(
        value.mode==='execute'&&id(value.execution_id),'Materialization requires a fresh execution identity')});
      state.execution={status:'pending',execution_id:first.execution_id};
      const terminal=await waitForExecution('materialization_execute');
      if(terminal)return terminal;
    }
    if((!separateOutput||request.finish!=='close')&&!javascriptConfigurationOnly)
      await phase('output_mapping',ctx=>drivers.mapPorts(request.mappings.filter(m=>m.direction==='output'),ctx));
    }
    const finish=await phase('finish',ctx=>(readingOnly||separateOutput&&request.finish!=='close')
      ?drivers.finishGraph(request.finish,ctx):drivers.finish(request.finish,ctx),{verify:value=>{
      requireValue(value.mode===request.finish, 'Wrong wizard finish mode');
      if(readingOnly)requireValue(value.settings_applied===false,'Output read must not apply node settings');
      if(request.finish==='execute')requireValue(id(value.execution_id)
        &&(!materialize||value.execution_id!==state.execution.execution_id), 'A fresh execution identity is required');
      else if(request.target.type==='programming.javascript'&&request.finish==='done'){
        // Loginom does not expose whether Done ran internal work. The owned
        // gesture, graph settlement and independent source readback establish
        // the commit without claiming that unknown internal effects are false.
        requireValue(value.execution_id==null&&value.execution_started===null
          &&value.explicit_execute_requested===false&&value.settings_applied===true
          &&value.wizard_commit_verified===true&&value.graph_owner_verified===true
          &&value.source_readback_verified===true&&value.owned_done_settled===true,
        'JavaScript Done requires settled owner and independent source readback');
      }else requireValue(value.execution_id==null && value.execution_started===false, 'Done must not execute');
      if(request.finish==='close')requireValue(value.draft_discarded===true && value.settings_applied===false,'Close must discard draft settings');
    }});
    if(request.finish==='execute') {
      state.execution={status:'pending',execution_id:finish.execution_id};
      const terminal=await waitForExecution('execute');
      if(terminal)return terminal;
      // Output reading has its own work (formats, paging, restoration). The
      // configuration limit does not cap it; the total operation deadline still does.
      const output=await phase('read',ctx=>drivers.readOutput(request.read,ctx),{budget:request.budgets.total_ms,mutation:request.read.ports.length>0||handler.fileOutput===true,verify:value=>requireValue(
        value.execution_id===state.execution.execution_id && ['partial','complete'].includes(value.status)
        && typeof value.evidence_ref==='string' && value.evidence_ref.length>0 && Array.isArray(value.ports)
        && value.ports.length===request.read.ports.length
        && value.ports.every((p,i)=>p.port===request.read.ports[i] && p.fresh===true)
        &&(request.read.coverage!=='full'||request.target.type!=='programming.javascript'
          ||value.status==='complete'&&value.ports.every(p=>p.sample_complete===true&&p.sample_rows===p.row_count)),
        'Output is not bound to the requested execution, ports or full JavaScript row coverage')});
      state.output=output;
    }
    check();
    const result={operation_id:operation.id,status:'SUCCEEDED',effect_possible:state.effect_possible,phases:state.phases.map(({value,...p})=>p),node:state.node,
      execution:state.execution,output:state.output,package_saved:false,cleanup_complete:true,warnings:[],
      configuration:{status:readingOnly?'not_requested':request.finish==='close'?'discarded':'applied',
        ...(!readingOnly&&request.finish!=='close'&&handler.configurationReadback?{readback:handler.configurationReadback({
          node:state.node,phases:state.phases,operation_id:operation.id})}:{})},
      checkpoint_kind:request.finish==='close'?'local_node_cancellation':'local_node_checkpoint',persisted_package_verified:false};
    await acknowledge({phase:'node_checkpoint',signature,result});state.result=structuredClone(result);
    return result;
  } catch(error) {
    // No automatic rollback and no repetition of an unknown upload/run/save.
    // status/wait/inspect remain the responsibility of the owning runtime.
    if(readingOnly&&state.pending?.phase==='read'&&error.code==='NODE_READ_SCHEMA_CHANGED')state.read_schema_changed=true;
    return {operation_id:operation.id,status:state.verified_refusal?'FAILED':state.effect_possible?'AMBIGUOUS':'NOT_APPLIED',effect_possible:state.effect_possible,
      phases:state.phases.map(({value,...p})=>p),node:state.node,execution:state.execution,output:state.output,
      package_saved:false,cleanup_complete:state.cleanup_complete,warnings:[],
      ...(state.javascript_wizard_refusal&&state.verified_refusal?{configuration:{status:'discarded'},
        checkpoint_kind:'local_node_failed',persisted_package_verified:false}:{}),
      ...(state.verified_refusal&&state.cleanup_complete&&!state.pending&&state.node
        ?{next_step:state.javascript_wizard_refusal?{tool:'dock_node_apply',original_operation_id:operation.id,
          instruction:'Loginom rejected the JavaScript draft. Its dialog and draft were closed; the committed source, native settings and complete graph were independently rechecked unchanged. Correct source_text and submit a NEW operation_id on the SAME existing target '+JSON.stringify(state.node)
            +' with expected_source_sha256:'+state.javascript_wizard_refusal.retained_source.source_sha256
            +'. Preserve inputs:[] and mappings:[]. Do not recreate or save the package; no explicit Execute was sent.'}
          :state.export_download_refusal?{tool:'dock_action_run',original_operation_id:operation.id,
          instruction:'The native export completed, but its download was not confirmed. The original scenario is restored, its temporary download lease released and no phase remains unresolved. Save the scenario with dock_action_run, action_key:"package.save_checkpoint", a NEW operation_id and the task package path in parameters.path. Report the download as unconfirmed. Do not resume this failed operation, repeat export, or recreate the node.'}
          :state.native_read_refusal?{tool:'dock_node_apply',original_operation_id:operation.id,
          instruction:'Full native reading was refused by the unchanged 50x8 limit. The owned Preview is closed, workflow restored and execution retained. No operation remains unresolved; saving or another action is allowed. Do not recreate or reconfigure the node. For a scalar report use a NEW operation_id with the SAME existing target, parameters:{}, inputs:[], mappings:[], finish:"execute" and read:{ports:[0],sample_rows:100,require_exact_numbers:true} without full coverage. This does not authorize ordinary reading of Variant values.'}:correctNodeRequest(request,state.node,state.export_destination_conflict===true)}:{}),
      ...(state.correctable_import_request&&state.cleanup_complete&&!state.pending?{next_step:{tool:'dock_node_apply',original_operation_id:operation.id,
        instruction:'The import wizard draft was discarded and the SAME node is back in the graph. '+(state.correctable_import_request==='initial_settings'
          ?'This node has no saved source. Supply complete settings.source with explicit source_path equal to the verified upload destination, encoding, rows_to_skip and first_line_as_title, complete settings.format and nonempty settings.columns with at least one used field. Submit a NEW operation_id with target:'
          :state.correctable_import_request==='readiness'
          ?'The wizard did not reach an expected state, so no setting was saved. Submit a NEW operation_id with the SAME settings and target:'
          :'Correct settings using the observed source names/labels and submit a NEW operation_id with target:')+JSON.stringify({kind:'existing',type:'imports.text',ref:state.node})+'. Keep the verified upload source, inputs:[] and mappings:[]. Supply source, format and columns again because the rejected draft was not saved. Do not recreate the node or reupload the file.'}}:{}),
      ...(state.correctable_calculator_request&&state.cleanup_complete&&!state.pending?{next_step:{tool:'dock_node_apply',original_operation_id:operation.id,
        instruction:'Retained calculator settings were independently rechecked unchanged. Correct expressions and submit a NEW operation_id with the SAME existing target '+JSON.stringify(state.node)+'. '+(state.calculator_default_expression?'The restored node has the blank default Expr1. Correct the formula by updating target:{kind:"existing",name:"Expr1"} inside the first expression with replace:false (name/label/type may be changed). replace:true replaces an INPUT field, not the saved expression. Do not leave this blank default behind. ':'To execute/read without changing formulas use parameters:{expressions:[]}; to edit a retained expression use target:{kind:"existing",name:"existing_name"} inside that expression. ')+'Keep existing connections: inputs:[] and mappings:[]. Do not create another node.'}}:{}),
      pending_phase:state.pending?.phase??null,error:state.javascript_wizard_refusal&&state.verified_refusal
        ?{code:'JAVASCRIPT_WIZARD_SOURCE_REJECTED',message:String(error.message).slice(0,1000),native:state.javascript_wizard_refusal.native}
        :{code:'NODE_APPLY_STOPPED',message:String(error.message).slice(0,1000),
        ...(typeof error.receipt?.error?.code==='string'&&typeof error.receipt.error.message==='string'?{cause:{code:error.receipt.error.code.slice(0,120),
          message:String(error.receipt.error.message??'').slice(0,240)}}:{})}};
  }
}

/** Ends a stopped operation without continuing it. Only the trusted driver's
 * release proof clears the phase; verified phases keep their facts, while an
 * unverified commit or launch is reported as unknown rather than inferred.
 */
export async function releaseNodeApply({operation,handlers,drivers,record,signal,releaseBeforeTarget}) {
  const state=operation.nodeApply,pending=state?.pending??(!state?.node&&state?.target_reconciled?{phase:'target'}:null),request=state?.request;
  if(pending&&!state.node&&!state.result&&['source','workflow','target'].includes(pending.phase)&&releaseBeforeTarget){
    validateNodeApplyRequest(request,handlers);
    const proof=await releaseBeforeTarget();
    requireValue(proof?.verified===true&&proof.cleanup_complete===true&&['found','not_created'].includes(proof.target_state)
      &&(proof.target_state==='not_created'?proof.node===null:proof.node?.document_id===request.document_id
        &&proof.node?.workflow_id===request.workflow_ref.workflow_id&&id(proof.node.node_id)), 'Pre-target release proof differs');
    const result={operation_id:operation.id,status:'FAILED',effect_possible:state.effect_possible,
      phases:state.phases.map(({value,...p})=>p),node:proof.node,execution:state.execution,output:state.output,
      package_saved:false,cleanup_complete:true,configuration:{status:'not_requested'},warnings:[],
      checkpoint_kind:'local_node_released',persisted_package_verified:false,pending_phase:null,released_phase:pending.phase,
      error:{code:'NODE_OPERATION_RELEASED',message:'Early node phase released after confirmed browser completion and a quiet original graph; the stopped phase was not repeated.'},
      next_step:request.mode===NODE_READ_MODE?{tool:'dock_node_read',original_operation_id:operation.id,
        instruction:'The early read was released without reading output. Call dock_node_read with a NEW operation_id and source_operation_id:'
          +JSON.stringify(request.parameters.source_operation_id)+'. Do not reconfigure or recreate its existing node.'}
        :{tool:'dock_node_apply',original_operation_id:operation.id,
        instruction:'The original operation remains unsuccessful. Correct the request and use a NEW operation_id with target:'
          +JSON.stringify(proof.node?{kind:'existing',type:request.target.type,ref:proof.node}:request.target)
          +'. '+(proof.node?'The partial target was found; do not recreate it. Supply complete intended settings and complete intended inputs, preserving all observed existing links.':'This operation did not create its target.')
          +' Source/preflight effects are not undone; no settings, output or package persistence are verified by release.'}};
    const event={operation_id:operation.id,action_key:'node.apply',action_revision:NODE_CONTRACT_REVISION,
      phase:'node_operation_released',signature:state.signature,receipt:{...pending,proof},result};
    const saved=await record(event);
    requireValue(saved&&hash(Object.fromEntries(Object.keys(event).map(k=>[k,saved[k]])))===hash(event),'Node phase journal acknowledgement differs');
    state.pending=null;state.cleanup_complete=true;state.result=structuredClone(result);
    return result;
  }
  requireValue(pending&&state.node&&!state.result&&typeof drivers?.releasePending==='function',
    'Release proof unavailable: no stopped phase of a known node with a release verifier');
  const {handler}=validateNodeApplyRequest(request,handlers);
  const proof=await drivers.releasePending(state,{signal});
  requireValue(proof?.verified===true&&proof.cleanup_complete===true
    &&['document_id','workflow_id','node_id'].every(k=>proof.node_context?.[k]===state.node[k]),'Release proof differs from the stopped node');
  const verified=name=>state.phases.some(p=>p.phase===name);
  const committed=request.finish!=='close'&&(verified('finish')||handler.output_wizard==='separate'&&verified('node_finish')&&verified('output_mapping'));
  const launch=['materialization_start','materialization_execute','execute'].includes(pending.phase)||pending.phase==='finish'&&request.finish==='execute';
  const readingOnly=request.mode===NODE_READ_MODE;
  // Export release proves only workspace cleanup. An unconfirmed launch may
  // already have written a file; never infer its settings or offer a replay.
  const exportRelease=request.target.type==='exports.text';
  const configuration=readingOnly?{status:'not_requested'}:exportRelease?{status:'unknown'}:committed?{status:'applied',...(verified('finish')&&handler.configurationReadback
    ?{readback:handler.configurationReadback({node:state.node,phases:state.phases,operation_id:operation.id})}:{})}
    :{status:proof.cleanup.wizard_closed&&!verified('node_finish')?'discarded':'unknown'};
  const execution=exportRelease?{status:'unknown',execution_id:state.execution.execution_id??null}
    :['completed','failed','cancelled'].includes(state.execution.status)||!launch?state.execution
    :{status:'unknown',execution_id:state.execution.execution_id??null};
  // A released reread keeps its source unless that schema was observed stale.
  const readSource=readingOnly&&!state.read_schema_changed?request.parameters.source_operation_id
    :pending.phase==='read'&&execution.status==='completed'&&configuration.readback?operation.id:null;
  const result={operation_id:operation.id,status:'FAILED',effect_possible:true,phases:state.phases.map(({value,...p})=>p),
    node:state.node,execution,output:state.output,package_saved:false,cleanup_complete:true,
    warnings:[...(proof.cleanup.wizard_closed?['The unsaved wizard draft of this node was cancelled during release.']:[]),
      ...(proof.cleanup.read_view_restored?['The output Table view opened for reading was restored and closed during release.']:[]),
      ...(proof.cleanup.views_returned?['The node visualizers opened for reading were left during release; a Table visualizer added by the stopped read may remain on its output port.']:[])],
    configuration,checkpoint_kind:'local_node_released',persisted_package_verified:false,pending_phase:null,released_phase:pending.phase,
    error:{code:'NODE_OPERATION_RELEASED',message:'Phase '+pending.phase+' stopped without a verified receipt. The operation was released after Dock proved the node rests unlocked on an unchanged quiet graph; nothing of the stopped phase was repeated.'},
    next_step:exportRelease?{tool:'dock_action_run',original_operation_id:operation.id,
      instruction:'The stopped text export was released, but its settings, execution and file output remain unverified. '
        +'Do not resume this operation, repeat the export or recreate the node: a file may already have been written. '
        +'Save the retained scenario with dock_action_run, action_key:"package.save_checkpoint", a NEW operation_id '
        +'and the task package path in parameters.path, or continue work on other nodes. Report export and download as unconfirmed.'}
      :readSource?{tool:'dock_node_read',original_operation_id:operation.id,
      instruction:(readingOnly?'This output read was released. ':'The node is configured and executed; only reading its output stopped. ')
        +'To read the output, call dock_node_read with a NEW operation_id and source_operation_id:"'+readSource+'". Saving the package and work on other nodes are allowed now.'}
      :{tool:'dock_node_apply',original_operation_id:operation.id,
      instruction:'Configuration: '+configuration.status+'. Execution: '+execution.status+'. Do not recreate the node and do not resume this released operation. To continue with this node, submit a NEW operation_id with target:'
        +JSON.stringify({kind:'existing',type:request.target.type,ref:state.node})
        +' and inputs:[] (existing links stay), supplying the complete intended settings for an existing node of this type; choose finish:"execute" when output is needed. Saving the package and work on other nodes are allowed now.'}};
  const event={operation_id:operation.id,action_key:'node.apply',action_revision:NODE_CONTRACT_REVISION,
    phase:'node_operation_released',signature:state.signature,receipt:{...pending,proof},result};
  const saved=await record(event);
  requireValue(saved&&hash(Object.fromEntries(Object.keys(event).map(k=>[k,saved[k]])))===hash(event),'Node phase journal acknowledgement differs');
  state.pending=null;state.cleanup_complete=true;state.effect_possible=true;state.result=structuredClone(result);
  return result;
}

function correctNodeRequest(request,node,exportConflict=false) {
  return {tool:'dock_node_apply',original_operation_id:request.operation_id,
    instruction:'The failure is known and cleanup is verified. Correct the indicated settings or inputs and submit a NEW operation_id with target:'
      +JSON.stringify({kind:'existing',type:request.target.type,ref:node})
      +'. Preserve the existing graph and source receipts. Do not recreate the node or inspect an unknown effect: no effect is unresolved.'
      +(exportConflict?' The existing destination file was preserved by overwrite:"reject". Choose parameters.destination allowed by the task, or use parameters.overwrite:"replace" with an explicit destination ONLY if the user authorized replacement of that file. Otherwise retain reject and report the path conflict; do not invent a different required path. finish:"done" still checks destination conflicts and does not verify file export. Do not restore an older destination unless the task requires it.':'')};
}
