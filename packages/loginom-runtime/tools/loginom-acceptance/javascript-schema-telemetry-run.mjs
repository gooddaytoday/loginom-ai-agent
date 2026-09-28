import {javascriptTelemetryCase,javascriptTelemetryIds,javascriptTelemetryProbe} from './javascript-schema-telemetry-cases.mjs';
import {verifyJavascriptIntegerInput} from './javascript-native-named-contract.mjs';
import {verifyJavascriptTelemetryOutcome} from './javascript-schema-telemetry-contract.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
const need=(v,m)=>{if(!v)throw Error('Telemetry run: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createJavascriptTelemetryTrial(caseId){
 const probe=javascriptTelemetryProbe(caseId);
 let reserved=false,finished=false,result;
 let selected={status:'not_run',case_complete:false,reason:'selected_case_not_dispatched'};
 const coverage=(state=selected)=>freezeCivilEvidence({contract:'javascript-schema-telemetry-coverage-1',selected_case:caseId,explicit_execution_limit:1,
  coverage_complete:false,g5_complete:false,bridge_verified:false,cases:javascriptTelemetryIds.map(id=>({id,source_sha256:javascriptTelemetryCase(id).source_sha256,
   ...(id===caseId?state:{status:'not_run',case_complete:false,reason:'requires_separate_root_assigned_run'})}))});
 const ack=async(record,event)=>{const saved=await record(event);need(Object.keys(event).every(k=>same(saved?.[k],event[k])),'exact journal ACK differs');};
 return {
  get coverage(){return coverage();},
  async run({runtime,input,node,sourceProbe,deadline,record,onExecution}){
   need(!reserved&&!finished,'one launch; no replay');reserved=true;
   selected={status:'unresolved',case_complete:false,reason:'execution_reserved'};
   need(same(sourceProbe,probe),'fixed source identity');verifyJavascriptIntegerInput(input);
   need(Date.now()<deadline,'original deadline');
   await ack(record,{phase:'schema_telemetry_dispatch_reserved',telemetry_case_id:caseId,source_sha256:probe.source_sha256,node,coverage:coverage()});
   await runtime.checkNativeRoundtripBeforeExecute();const boundary=await runtime.captureExecutionBoundary();
   try{
    const execution=await runtime.executeNode(node,deadline,{phase:'initial',source_sha256:probe.source_sha256});
    await onExecution(execution);await runtime.verifyExecutionBoundary(boundary);
    need(execution.status==='completed','failed execution is not telemetry characterization');
    const observed=await runtime.readNativeRoundtrip(input,node,execution);await runtime.verifyExecutionBoundary(boundary);
    const outcome=verifyJavascriptTelemetryOutcome(observed,caseId);
    need(same(observed.outcome,outcome)&&same(observed.output.binding.completed_child,execution),'native outcome/execution differs');
    freezeCivilEvidence(observed);
    await ack(record,{phase:'schema_telemetry_terminal_verified',telemetry_case_id:caseId,execution_id:execution.execution_id,outcome});
    await runtime.checkNativeTelemetryEvidence();
    result=observed;selected={status:'unresolved',case_complete:false,reason:'awaiting_final_cleanup_and_evidence',execution_id:execution.execution_id};return result;
   }finally{await boundary.native.dispose();}
  },
  async finish({cleanup,failure,record,persist}){
   need(!finished,'one finalization');finished=true;
   const clean=['package_closed','logged_out','browser_closed'].every(k=>cleanup?.[k]===true)&&!cleanup.failure;
   const success=!!result&&clean&&!failure;
   const final={...selected,status:success?'characterized':'unresolved',case_complete:success,
    reason:!clean?'cleanup_unconfirmed':failure?'work_failed':success?'independent_native_observations_and_exact_upstream':'selected_case_not_completed'};
   const status=!clean?'CLEANUP_UNCONFIRMED':failure?'FAILED':success?'CHARACTERIZED':'UNRESOLVED';
   try{await ack(record,{phase:'schema_telemetry_finalized',status,coverage:coverage(final),cleanup:structuredClone(cleanup)});selected=final;await persist(status);return status;}
   catch(error){selected={...selected,status:'unresolved',case_complete:false,reason:'final_evidence_unconfirmed'};throw error;}
  }
 };
}
