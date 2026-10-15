import {javascriptNamedCase,javascriptNamedIds,javascriptNamedProbe} from './javascript-native-named-cases.mjs';
import {verifyJavascriptNamedInput,verifyJavascriptNamedOutcome} from './javascript-native-named-contract.mjs';
import {writeJavascriptCoercionReport} from './javascript-native-coercion-run.mjs';
import {verifyNamedFailureOutcome} from './javascript-native-named-failure.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
const need=(v,m)=>{if(!v)throw Error('Named run: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// One selected case, never a runtime batch. All untouched slots are retained
// in every checkpoint; only a separate coordinator can aggregate separate runs.
export function createJavascriptNamedTrial(caseId){
 const fixture=javascriptNamedCase(caseId),probe=javascriptNamedProbe(caseId);
 let reserved=false,finished=false,result;
 let selected={status:'not_run',case_complete:false,reason:'selected_case_not_dispatched'};
 const coverage=(state=selected)=>freezeCivilEvidence({contract:'javascript-native-named-coverage-1',selected_case:caseId,explicit_execution_limit:1,
  coverage_complete:false,g5_complete:false,exact_pass:false,characterization_only:true,
  cases:javascriptNamedIds.map(id=>({id,source_sha256:javascriptNamedCase(id).source_sha256,
   ...(id===caseId?state:{status:'not_run',case_complete:false,reason:'requires_separate_root_assigned_run'})}))});
 const acknowledge=async(record,event)=>{
  const saved=await record(event);need(Object.keys(event).every(k=>same(saved?.[k],event[k])),'exact orchestration journal ACK differs');
 };
 return {
  get coverage(){return coverage();},
  async run({runtime,input,node,sourceProbe,deadline,record,onExecution}){
   need(!reserved&&!finished,'one selected launch; no replay');reserved=true;
   selected={status:'unresolved',case_complete:false,reason:'execution_reserved'};
   need(sourceProbe?.id===probe.id&&sourceProbe.source===fixture.source&&sourceProbe.source_sha256===fixture.source_sha256
    &&sourceProbe.schema_mode==='code'&&same(sourceProbe.output_schema,probe.output_schema),'fixed selected source/schema');
   need(sourceProbe.named_case_id===caseId&&sourceProbe.input_fixture_id==='integer-safe','immutable case/input identity');
   verifyJavascriptNamedInput(input,caseId);
   need(Date.now()<deadline,'original deadline expired');
   await acknowledge(record,{phase:'native_named_dispatch_reserved',named_case_id:caseId,source_sha256:fixture.source_sha256,node,coverage:coverage()});
   await runtime.checkNativeRoundtripBeforeExecute();
   const boundary=await runtime.captureExecutionBoundary();
   let observed;
   try{
    const execution=await runtime.executeNode(node,deadline,{phase:'initial',source_sha256:fixture.source_sha256});
    await onExecution(execution);await runtime.verifyExecutionBoundary(boundary);
    need(['completed','failed'].includes(execution.status),'unsupported terminal; no inferred result');
    observed=execution.status==='completed'?await runtime.readNativeRoundtrip(input,node,execution):await runtime.readNativeNamedFailure(input,node,execution);
    await runtime.verifyExecutionBoundary(boundary);
    const outcome=execution.status==='completed'?verifyJavascriptNamedOutcome(observed,caseId):verifyNamedFailureOutcome(observed,caseId);
    need(same(observed.outcome,outcome),'terminal outcome differs from native proofs');
    const owned=execution.status==='completed'?observed.output.binding.completed_child:observed.failed.execution;
    need(same(owned,execution),'selected execution differs from returned native proof');
    freezeCivilEvidence(observed);
    await acknowledge(record,{phase:'native_named_terminal_verified',named_case_id:caseId,execution_id:execution.execution_id,outcome});
    await runtime.checkNativeNamedEvidence();
    selected={status:'unresolved',case_complete:false,reason:execution.status==='failed'?'owned_execution_failure_unattributed':'awaiting_final_cleanup_and_evidence',
     execution_id:execution.execution_id,outcome:outcome.status};
   }finally{await boundary.native.dispose();}
   result=observed;return observed;
  },
  async finish({cleanup,failure,record,persist}){
   need(!finished,'one finalization; no replay');finished=true;
   const clean=['package_closed','logged_out','browser_closed'].every(k=>cleanup?.[k]===true)&&!cleanup.failure;
   const success=!!result&&!result.failed&&clean&&!failure
    &&(result.outcome.exact_pass===true||result.outcome.status==='characterized_return'&&result.outcome.return_characterized===true
     ||result.outcome.status==='characterized_value'&&result.outcome.value_characterized===true);
   const finalSelected={...selected,status:success?'characterized':'unresolved',case_complete:success,
    exact_pass:success&&result.outcome.exact_pass===true,...(result?.outcome.marker!==undefined?{marker:result.outcome.marker,return_kind:result.outcome.return_kind}:{}),
    ...(caseId.startsWith('C-')?{execution_status:result?.failed?'failed':result?'completed':'not_observed',
     evidence_status:result&&clean&&!failure?'complete':'incomplete',semantic_status:result?.failed?'OWNED_EXECUTION_FAILURE_UNATTRIBUTED':result?.outcome.semantic_status??'NOT_RUN'}:{}),
    ...(result?.outcome.observed_cell?{observed_cell:structuredClone(result.outcome.observed_cell),value_observation:result.outcome.value_observation,
    }:{}),
    reason:!clean?'cleanup_unconfirmed':failure?'work_failed':success?(result.outcome.exact_pass?'independent_named_oracle_and_exact_upstream':result.outcome.status==='characterized_value'?'characterized_value_and_exact_upstream':'characterized_return_and_exact_upstream'):result?.failed?'owned_execution_failure_unattributed':result?.outcome.status==='observed_mismatch'?'strict_set_oracle_mismatch':result?'unsupported_return':'selected_case_not_completed'};
   const status=!clean?'CLEANUP_UNCONFIRMED':failure?'FAILED':success?'CHARACTERIZED':'UNRESOLVED';
   try{
    await acknowledge(record,{phase:'native_named_finalized',status,coverage:coverage(finalSelected),cleanup:structuredClone(cleanup)});
    selected=finalSelected;await persist(status);
    return status;
   }catch(error){
    selected={...selected,status:'unresolved',case_complete:false,exact_pass:false,...(caseId.startsWith('C-')?{evidence_status:'incomplete'}:{}),reason:'final_evidence_unconfirmed'};throw error;
   }
  }
 };
}

export async function writeJavascriptNamedReport(directory,report,options){
 return writeJavascriptCoercionReport(directory,report,options);
}
