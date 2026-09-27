import {open,rename,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {javascriptCoercionCase,javascriptCoercionIds} from './javascript-native-coercion-cases.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripOutcome} from './javascript-native-roundtrip-contract.mjs';
import {verifyCoercionFailureOutcome} from './javascript-native-coercion-failure.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
const need=(v,m)=>{if(!v)throw Error('Coercion run: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// One selected case, never a runtime batch. The six untouched slots are retained
// in every checkpoint; only a separate coordinator can aggregate separate runs.
export function createJavascriptCoercionTrial(fixtureId){
 const fixture=javascriptCoercionCase(fixtureId),probe=javascriptNativeRoundtripProbe(fixtureId);
 let reserved=false,finished=false,result;
 let selected={status:'not_run',case_complete:false,reason:'selected_case_not_dispatched'};
 const coverage=(state=selected)=>freezeCivilEvidence({contract:'javascript-native-coercion-coverage-1',selected_case:fixtureId,explicit_execution_limit:1,
  coverage_complete:false,g5_complete:false,exact_pass:false,characterization_only:true,
  cases:javascriptCoercionIds.map(id=>({id,source_sha256:javascriptCoercionCase(id).source_sha256,
   ...(id===fixtureId?state:{status:'not_run',case_complete:false,reason:'requires_separate_root_assigned_run'})}))});
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
   need(Date.now()<deadline,'original deadline expired');
   await acknowledge(record,{phase:'native_coercion_dispatch_reserved',fixture_id:fixtureId,source_sha256:fixture.source_sha256,node,coverage:coverage()});
   await runtime.checkNativeRoundtripBeforeExecute();
   const boundary=await runtime.captureExecutionBoundary();
   let observed;
   try{
    const execution=await runtime.executeNode(node,deadline,{phase:'initial',source_sha256:fixture.source_sha256});
    await onExecution(execution);await runtime.verifyExecutionBoundary(boundary);
    need(['completed','failed'].includes(execution.status),'unsupported terminal; no inferred result');
    observed=execution.status==='completed'?await runtime.readNativeRoundtrip(input,node,execution):await runtime.readNativeCoercionFailure(input,node,execution);
    await runtime.verifyExecutionBoundary(boundary);
    const outcome=execution.status==='completed'?verifyNativeRoundtripOutcome(observed,fixtureId):verifyCoercionFailureOutcome(observed,fixtureId);
    need(same(observed.outcome,outcome),'terminal outcome differs from native proofs');
    const owned=execution.status==='completed'?observed.output.binding.completed_child:observed.failed.execution;
    need(same(owned,execution),'selected execution differs from returned native proof');
    freezeCivilEvidence(observed);
    await acknowledge(record,{phase:'native_coercion_terminal_verified',fixture_id:fixtureId,execution_id:execution.execution_id,outcome});
    selected={status:'unresolved',case_complete:false,reason:execution.status==='failed'?'owned_execution_failure_unattributed':'awaiting_final_cleanup_and_evidence',
     execution_id:execution.execution_id,outcome:outcome.status};
   }finally{await boundary.native.dispose();}
   result=observed;return observed;
  },
  async finish({cleanup,failure,record,persist}){
   need(!finished,'one finalization; no replay');finished=true;
   const clean=['package_closed','logged_out','browser_closed'].every(k=>cleanup?.[k]===true)&&!cleanup.failure;
   const success=!!result&&!result.failed&&clean&&!failure;
   const finalSelected={...selected,status:success?'characterized':'unresolved',case_complete:success,
    reason:!clean?'cleanup_unconfirmed':failure?'work_failed':success?'native_value_or_null_and_exact_upstream':result?'owned_execution_failure_unattributed':'selected_case_not_completed'};
   const status=!clean?'CLEANUP_UNCONFIRMED':failure?'FAILED':success?'CHARACTERIZED':'UNRESOLVED';
   try{
    await acknowledge(record,{phase:'native_coercion_finalized',status,coverage:coverage(finalSelected),cleanup:structuredClone(cleanup)});
    selected=finalSelected;await persist(status);
    return status;
   }catch(error){
    selected={...selected,status:'unresolved',case_complete:false,reason:'final_evidence_unconfirmed'};throw error;
   }
  }
 };
}

// Report publication uses the same durability rule as the execution journal:
// successful write alone is not an ACK. Failed writes keep their pending file.
export async function writeJavascriptCoercionReport(directory,report,{openFile=open,renameFile=rename,read=readFile}={}){
 const text=JSON.stringify(report,null,2)+'\n',path=join(directory,'report.json');
 const pending=join(directory,'.report-'+randomUUID()+'.pending');
 const file=await openFile(pending,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{await file.writeFile(text);await file.sync();}finally{await file.close();}
 await renameFile(pending,path);
 const parent=await openFile(directory,constants.O_RDONLY|constants.O_DIRECTORY);
 try{await parent.sync();}finally{await parent.close();}
 need(await read(path,'utf8')===text,'durable report read-back differs');
}
