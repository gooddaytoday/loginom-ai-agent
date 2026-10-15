import {randomUUID} from 'node:crypto';
import {javascriptCalibrationCase,javascriptCalibrationIds} from './javascript-calibration-cases.mjs';
import {javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {verifyJavascriptIntegerInput,verifyJavascriptNamedInput} from './javascript-native-named-contract.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {sealJavascriptNamedFailure,verifyNamedFailedExecution,verifyNamedFailureWitness,verifyNamedFailureOutcome} from './javascript-native-named-failure.mjs';
const need=(v,m)=>{if(!v)throw Error('Named failed driver: '+m);};

// This route never receives an OUTPUT reader. It reserves the actual failed
// process once and reads only the already-completed original import.
export async function readNativeNamedFailure({page,input,node,execution,caseId,options,workflow,deadline,targetOrigin,targetBuild,validateSource,onState},
 {readUpstream=readNativeRoundtrip}={}){
 const calibration=javascriptCalibrationIds.includes(caseId),fixture=calibration?javascriptCalibrationCase(caseId):javascriptNamedCase(caseId);
 const identity=calibration?{calibration_id:caseId}:{named_case_id:caseId};
 const check=()=>{need(options.now()<deadline&&options.exclusiveNodeOperation()===true,'original deadline/read lock');validateSource();};
 check();verifyNamedFailedExecution(execution,node,caseId);
 const before=calibration?verifyJavascriptIntegerInput(input):verifyJavascriptNamedInput(input,caseId);freezeCivilEvidence(before);
 const failed=await page.evaluate(sealJavascriptNamedFailure,{...identity,source:fixture.source,source_sha256:fixture.source_sha256,execution});
 verifyNamedFailureWitness(failed,execution,node,caseId);freezeCivilEvidence(failed);
 const sealed={phase:'native_named_failed_terminal_sealed',failed};
 const acknowledged=await options.onRecord(sealed);
 need(JSON.stringify(acknowledged?.failed)===JSON.stringify(failed)&&acknowledged.phase===sealed.phase,'failed seal journal ACK differs');
 check();
 const checkFailed=async()=>{
  const current=await page.evaluate(()=>{const cap=globalThis.__loginomJavascriptNamedFailureV1;cap.checkIdle();return cap.proof;});
  need(JSON.stringify(current)===JSON.stringify(failed),'held failed witness differs');
 };
 await checkFailed();
 const operation={id:'native-named-upstream-'+randomUUID(),action:{action_key:'diagnostic.javascript',revision:'1'},deadline};
 const upstream=await readUpstream({options:{...options,operation},ctx:{document_id:node.document_id,workflow_ref:workflow,node:input.node,
  execution:before.exact.provenance.execution,failed_terminal:failed,deadline},input:before,role:'upstream',...(calibration?{calibrationId:caseId}:{namedCaseId:caseId}),targetOrigin,targetBuild,
  onState:async state=>{
   const uncertain=!state||state.uncertain===true||state.retired===true||state.pending!==0||state.status!=='completed'
    ||state.requests!==4||state.releasedRequests!==4||state.releasedResponses!==4;
   await onState(state,uncertain);
   await options.onRecord({phase:'native_named_failed_upstream_lifecycle',state,uncertain});
  }});
 check();await checkFailed();
 const results={before,failed,upstream,output:{status:'not_read_failed_execution'}};
 results.outcome=verifyNamedFailureOutcome(results,caseId);freezeCivilEvidence(results);
 const event={phase:'native_named_failed_upstream_verified',results,g5_complete:false};
 const saved=await options.onRecord(event);
 need(saved?.phase===event.phase&&JSON.stringify(saved.results)===JSON.stringify(results),'failed upstream final journal ACK differs');
 check();await checkFailed();
 return results;
}
