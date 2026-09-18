import {createHash} from 'node:crypto';
import {verifiedCalculatorRequestRefusal} from './calculator-request-refusal.mjs';
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
  if(request.read.coverage==='full')requireValue(request.target.type==='transform.collapse_columns'&&request.finish==='execute'
    &&JSON.stringify(request.read.ports)==='[0]','Invalid parameters.read.coverage: full requires executed Collapse output 0; other handlers support sample');
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
  requireValue(!separateOutput||request.finish==='close'||typeof drivers.finishGraph==='function','Separate output wizard requires a graph finish driver');
  const signature=hash({request,handler_revision:handler.revision,...(separateOutput?{output_wizard:'separate'}:{})});
  const acknowledge=async entry=>{
    const event={operation_id:operation.id,action_key:'node.apply',action_revision:NODE_CONTRACT_REVISION,...entry};
    const saved=await record(event);
    requireValue(saved && hash(Object.fromEntries(Object.keys(event).map(k=>[k,saved[k]])))===hash(event),
      'Node phase journal acknowledgement differs');
    return saved;
  };
  let state=operation.nodeApply;
  let continuingConfigure=false;
  if(state) {
    requireValue(state.signature===signature, 'node.apply operation ID was used with different parameters or handler');
    continuingConfigure=resume&&state.pending?.phase==='configure'&&request.target.type==='transform.date_time'
      &&typeof drivers.verifyPendingConfigure==='function';
    if(state.pending&&!continuingConfigure)throw Error('Inspect the unresolved original node phase before continuing');
    if(state.result)return structuredClone(state.result);
    requireValue(resume && (state.cleanup_complete===true||continuingConfigure), 'Explicit inspected resume is required');
    requireValue(state.resumes<3, 'Node resume budget exhausted');
    // A journal cannot resurrect an unsaved draft. The live driver must attest
    // the same prepared package and every already accepted phase.
    requireValue(await (continuingConfigure?drivers.verifyPendingConfigure(state,{signal}):drivers.verifyContinuation(state,{signal}))===true, 'Live package or accepted phases differ from checkpoint');
    state.resumes++;
    delete state.verified_refusal;
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
    const configuration=!['source','execute','read'].includes(name);
    if(configuration)state.configure_deadline??=Math.min(state.deadline,now()+request.budgets.configure_ms);
    const deadline=Math.min(state.deadline,now()+budget,configuration?state.configure_deadline:Infinity,
      name==='execute'?state.execution_wait?.deadline??Infinity:Infinity);
    requireValue(now()<deadline,'node.apply configuration deadline elapsed');
    const oldConfigure=continuingConfigure&&name==='configure';
    const pending=oldConfigure?state.pending:{phase:name,receipt_id:operation.id+':'+name,deadline,
      effect_possible:mutation,before_node:structuredClone(state.node)};
    requireValue(!oldConfigure||pending.receipt_id===operation.id+':configure'&&now()<pending.deadline,'Original configure boundary differs');
    if(!oldConfigure)await acknowledge({phase:'node_phase_prepared',signature,receipt:pending});
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
      if((name==='target'&&['reform_mapped_preflight_completed','missing_values_preflight_completed'].includes(refusal?.verification)||replacementRefusal)
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
      if(name==='execute'&&signal?.aborted&&!stopSignal?.aborted
        &&pause?.read_only===true&&pause.cleanup_complete===true
        &&pause.execution_id===state.execution.execution_id&&state.execution.status==='pending'
        &&operation.cleanupConfirmed===true&&!operation.transportUncertain) {
        const checkpoint={...pending,...pause};
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
    if(name==='execute')delete state.execution_wait;
    requireValue(now()<pending.deadline,'node.apply phase deadline elapsed: '+name);
    return value;
  };
  try {
    // File verification does not infer identity from the displayed path. The
    // driver checks an already completed upload/inspect/verify receipt chain.
    await phase('source',ctx=>drivers.verifySource(request.parameters,ctx),{mutation:false});
    if(drivers.activateWorkflow)await phase('workflow',ctx=>drivers.activateWorkflow(ctx));
    const target=await phase('target',ctx=>drivers.prepareTarget(graph,ctx),{verify:value=>requireValue(
      value.node?.document_id===request.document_id && value.node.workflow_id===request.workflow_ref.workflow_id
      && id(value.node.node_id), 'Target phase returned a foreign node')});state.node=target.node;
    const readingOnly=request.mode===NODE_READ_MODE;
    if(!readingOnly){
    await phase('input_mapping',ctx=>drivers.mapPorts(request.mappings.filter(m=>m.direction==='input'),ctx));
    await phase('open',ctx=>drivers.openWizard(ctx));
    await phase('configure',ctx=>handler.configure(ctx,request.parameters,drivers));
    // A separate port wizard can open only after the node settings are saved.
    // Close must discard the node draft before any such intermediate commit.
    if(separateOutput&&request.finish!=='close')await phase('node_finish',ctx=>drivers.finish('done',ctx),{verify:value=>{
      requireValue(value.mode==='done'&&value.settings_applied===true&&value.execution_started===false&&value.execution_id==null,
        'Intermediate node Done must save settings without execution');
    }});
    if(!separateOutput||request.finish!=='close')await phase('output_mapping',ctx=>drivers.mapPorts(request.mappings.filter(m=>m.direction==='output'),ctx));
    }
    const finish=await phase('finish',ctx=>(readingOnly||separateOutput&&request.finish!=='close')
      ?drivers.finishGraph(request.finish,ctx):drivers.finish(request.finish,ctx),{verify:value=>{
      requireValue(value.mode===request.finish, 'Wrong wizard finish mode');
      if(readingOnly)requireValue(value.settings_applied===false,'Output read must not apply node settings');
      if(request.finish==='execute')requireValue(id(value.execution_id), 'A fresh execution identity is required');
      else requireValue(value.execution_id==null && value.execution_started===false, 'Done must not execute');
      if(request.finish==='close')requireValue(value.draft_discarded===true && value.settings_applied===false,'Close must discard draft settings');
    }});
    if(request.finish==='execute') {
      state.execution={status:'pending',execution_id:finish.execution_id};
      const execution=await phase('execute',ctx=>drivers.waitExecution(ctx),{budget:request.budgets.execute_ms,mutation:false,
        verify:value=>requireValue(value.execution_id===state.execution.execution_id && ['completed','cancelled','failed'].includes(value.status)
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
          checkpoint_kind:'local_node_failed',persisted_package_verified:false,error:execution.error};
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
      // Output reading has its own work (formats, paging, restoration). The
      // configuration limit does not cap it; the total operation deadline still does.
      const output=await phase('read',ctx=>drivers.readOutput(request.read,ctx),{budget:request.budgets.total_ms,mutation:request.read.ports.length>0||handler.fileOutput===true,verify:value=>requireValue(
        value.execution_id===state.execution.execution_id && ['partial','complete'].includes(value.status)
        && typeof value.evidence_ref==='string' && value.evidence_ref.length>0 && Array.isArray(value.ports)
        && value.ports.length===request.read.ports.length
        && value.ports.every((p,i)=>p.port===request.read.ports[i] && p.fresh===true), 'Output is not bound to the requested execution and ports')});
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
    return {operation_id:operation.id,status:state.verified_refusal?'FAILED':state.effect_possible?'AMBIGUOUS':'NOT_APPLIED',effect_possible:state.effect_possible,
      phases:state.phases.map(({value,...p})=>p),node:state.node,execution:state.execution,output:state.output,
      package_saved:false,cleanup_complete:state.cleanup_complete,warnings:[],
      ...(state.correctable_calculator_request&&state.cleanup_complete&&!state.pending?{next_step:{tool:'dock_node_apply',original_operation_id:operation.id,
        instruction:'Retained calculator settings were independently rechecked unchanged. Correct expressions and submit a NEW operation_id with the SAME existing target '+JSON.stringify(state.node)+'. '+(state.calculator_default_expression?'The restored node has the blank default Expr1. Correct the formula by updating target:{kind:"existing",name:"Expr1"} inside the first expression with replace:false (name/label/type may be changed). replace:true replaces an INPUT field, not the saved expression. Do not leave this blank default behind. ':'To execute/read without changing formulas use parameters:{expressions:[]}; to edit a retained expression use target:{kind:"existing",name:"existing_name"} inside that expression. ')+'Keep existing connections: inputs:[] and mappings:[]. Do not create another node.'}}:{}),
      pending_phase:state.pending?.phase??null,error:{code:'NODE_APPLY_STOPPED',message:String(error.message).slice(0,1000),
        ...(['WIZARD_SOURCE_VALIDATION_FAILED','WIZARD_CALCULATOR_VALIDATION_FAILED'].includes(error.receipt?.error?.code)?{cause:{code:error.receipt.error.code,
          message:String(error.receipt.error.message??'').slice(0,240)}}:{})}};
  }
}
