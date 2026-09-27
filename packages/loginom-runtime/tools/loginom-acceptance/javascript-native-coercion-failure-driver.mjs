import {randomUUID} from 'node:crypto';
import {javascriptCoercionCase} from './javascript-native-coercion-cases.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {verifyNativeRoundtripInput} from './javascript-native-roundtrip-contract.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {sealJavascriptCoercionFailure,verifyCoercionFailedExecution,verifyCoercionFailureWitness,verifyCoercionFailureOutcome} from './javascript-native-coercion-failure.mjs';
const need=(v,m)=>{if(!v)throw Error('Coercion failed driver: '+m);};

// This route never receives an OUTPUT reader. It reserves the actual failed
// process once and reads only the already-completed original import.
export async function readNativeCoercionFailure({page,input,node,execution,fixtureId,options,workflow,deadline,targetOrigin,targetBuild,validateSource,onState},
 {readUpstream=readNativeRoundtrip}={}){
 const fixture=javascriptCoercionCase(fixtureId);
 const check=()=>{need(options.now()<deadline&&options.exclusiveNodeOperation()===true,'original deadline/read lock');validateSource();};
 check();verifyCoercionFailedExecution(execution,node,fixtureId);
 const before=verifyNativeRoundtripInput(input,fixtureId);freezeCivilEvidence(before);
 const failed=await page.evaluate(sealJavascriptCoercionFailure,{fixture_id:fixtureId,source:fixture.source,source_sha256:fixture.source_sha256,execution});
 verifyCoercionFailureWitness(failed,execution,node,fixtureId);freezeCivilEvidence(failed);
 const sealed={phase:'native_coercion_failed_terminal_sealed',failed};
 const acknowledged=await options.onRecord(sealed);
 need(JSON.stringify(acknowledged?.failed)===JSON.stringify(failed)&&acknowledged.phase===sealed.phase,'failed seal journal ACK differs');
 check();
 const checkFailed=async()=>{
  const current=await page.evaluate(()=>{const cap=globalThis.__loginomJavascriptCoercionFailureV1;cap.checkIdle();return cap.proof;});
  need(JSON.stringify(current)===JSON.stringify(failed),'held failed witness differs');
 };
 await checkFailed();
 const operation={id:'native-coercion-upstream-'+randomUUID(),action:{action_key:'diagnostic.javascript',revision:'1'},deadline};
 const upstream=await readUpstream({options:{...options,operation},ctx:{document_id:node.document_id,workflow_ref:workflow,node:input.node,
  execution:before.exact.provenance.execution,failed_terminal:failed,deadline},input:before,role:'upstream',targetOrigin,targetBuild,
  onState:async state=>{
   const uncertain=!state||state.uncertain===true||state.retired===true||state.pending!==0||state.status!=='completed'
    ||state.requests!==fixture.rows||state.releasedRequests!==fixture.rows||state.releasedResponses!==fixture.rows;
   await onState(state,uncertain);
   await options.onRecord({phase:'native_coercion_failed_upstream_lifecycle',state,uncertain});
  }});
 check();await checkFailed();
 const results={before,failed,upstream,output:{status:'not_read_failed_execution'}};
 results.outcome=verifyCoercionFailureOutcome(results,fixtureId);freezeCivilEvidence(results);
 const event={phase:'native_coercion_failed_upstream_verified',results,g5_complete:false};
 const saved=await options.onRecord(event);
 need(saved?.phase===event.phase&&JSON.stringify(saved.results)===JSON.stringify(results),'failed upstream final journal ACK differs');
 check();await checkFailed();
 return results;
}
