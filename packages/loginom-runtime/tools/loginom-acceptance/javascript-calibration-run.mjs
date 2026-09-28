import {createHash} from 'node:crypto';
import {javascriptCalibrationCase,javascriptCalibrationIds} from './javascript-calibration-cases.mjs';
import {verifyJavascriptIntegerInput} from './javascript-native-named-contract.mjs';
import {verifyNamedFailureOutcome} from './javascript-native-named-failure.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
const need=(v,m)=>{if(!v)throw Error('Calibration trial: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ack=async(record,event)=>{const saved=await record(event);need(Object.keys(event).every(k=>same(saved?.[k],event[k])),'exact journal ACK');};

export function createJavascriptCalibrationTrial(id){
 const probe=javascriptCalibrationCase(id);
 let prior,result,priorReserved=false,reserved=false,finished=false,finalized=false;
 const coverage=()=>freezeCivilEvidence({selected_case:id,explicit_execution_limit:1,case_complete:false,g6_complete:false,j25_complete:false,
  source_sha256:probe.source_sha256,server_os:{status:'not_observed'},finalized,
  cases:javascriptCalibrationIds.map(k=>({id:k,status:k!==id?'not_run':result?.status??(reserved?'unresolved':'not_run')}))});
 return {
  probe,get coverage(){return coverage();},
  async capturePrior({source,input,node,record}){
   need(!priorReserved&&!reserved&&!finished&&typeof source==='string'&&Buffer.byteLength(source,'utf8')<=32768,'one bounded initial source');priorReserved=true;
   const before=verifyJavascriptIntegerInput(input);
   const captured=freezeCivilEvidence({source,source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),node:structuredClone(node),
    source_kind:'initial_owned_editor_snapshot',committed_source_status:'not_established',before});
   await ack(record,{phase:'calibration_prior_editor_captured',calibration_id:id,prior:captured});prior=captured;
  },
  async wizard({witness,record}){
   need(prior&&!reserved&&!finished,'one wizard diagnostic; no execution after diagnostic');reserved=true;
   need(witness?.calibration_id===id&&witness.source===probe.source&&witness.source_sha256===probe.source_sha256
    &&witness.node_id===prior.node.node_id&&witness.native_owner_verified===true&&witness.draft_source_verified===true
    &&witness.explicit_execute_dispatched===false&&typeof witness.native_text_complete==='boolean'
    &&witness.diagnostic?.present===true&&witness.diagnostic.fresh===true
    &&witness.diagnostic.native_text_complete===witness.native_text_complete
    &&witness.committed_source_status==='not_established','owned native wizard witness');
   verifyWizardDiagnostic(witness.diagnostic);
   const captured=freezeCivilEvidence({status:witness.native_text_complete?'wizard_diagnostic_observed':'wizard_diagnostic_incomplete',prior,wizard:structuredClone(witness),
    output:{status:'not_read_wizard_diagnostic'},upstream:{status:'not_read',reason:'draft_discard_committed_source_proof_unavailable'},
    case_complete:false,attribution:'none',implicit_execution:'unknown'});
   await ack(record,{phase:'calibration_wizard_diagnostic_captured',result:captured});result=captured;return result;
  },
  async run({runtime,input,node,sourceProbe,deadline,record,onExecution}){
   need(prior&&!reserved&&!finished,'one execution reservation; no replay');reserved=true;
   need(same(probe,sourceProbe)&&same(prior.node,node)&&Date.now()<deadline,'fixed source/owner/deadline');
   need(same(verifyJavascriptIntegerInput(input),prior.before),'original input');
   await ack(record,{phase:'calibration_dispatch_reserved',calibration_id:id,source_sha256:probe.source_sha256,node});
   await runtime.checkNativeRoundtripBeforeExecute();
   const boundary=await runtime.captureExecutionBoundary();
   let captured;
   try{
    const execution=await runtime.executeNode(node,deadline,{phase:'initial',source_sha256:probe.source_sha256});
    await onExecution(execution);await runtime.verifyExecutionBoundary(boundary);
    need(Date.now()<deadline,'original deadline expired');
    if(execution.status==='failed'){
     const observed=await runtime.readNativeNamedFailure(input,node,execution);
     const outcome=verifyNamedFailureOutcome(observed,id);
     need(same(observed.outcome,outcome)&&same(observed.failed.execution,execution),'actual failed evidence association');
     await runtime.verifyExecutionBoundary(boundary);await runtime.checkNativeNamedEvidence();
     need(Date.now()<deadline,'original deadline expired');
     captured=freezeCivilEvidence({status:'owned_failure_observed',prior,...observed});
    }else{
     need(execution.status==='completed','unknown terminal');
     captured=freezeCivilEvidence({status:'unexpected_completed',prior,execution,case_complete:false,
      attribution:'none',controlled_throw_verified:false,mapping_status:'unverified',source_span:null,rejection_attributed:false,g6_complete:false,j25_complete:false,
      output:{status:'not_read_calibration'},upstream:{status:'not_read',reason:'unexpected_completed_calibration'}});
    }
    await ack(record,{phase:'calibration_terminal_captured',calibration_id:id,result:captured});
   }finally{await boundary.native.dispose();}
   result=captured;return result;
  },
  async finish({cleanup,failure,record,persist}){
   need(!finished,'one finalization; no replay');finished=true;
   const clean=['package_closed','logged_out','browser_closed'].every(k=>cleanup?.[k]===true)&&!cleanup.failure;
   const status=!clean?'CLEANUP_UNCONFIRMED':failure?'FAILED':result?.status==='owned_failure_observed'?'DIAGNOSTIC_OBSERVED':'UNRESOLVED';
   try{
    await ack(record,{phase:'calibration_finalized',calibration_id:id,status,cleanup:structuredClone(cleanup),
     case_complete:false,controlled_throw_verified:false,mapping_status:'unverified',g6_complete:false,j25_complete:false});
    finalized=true;await persist(status);return status;
   }catch(error){finalized=false;throw error;}
  }
 };
}

function verifyWizardDiagnostic(diagnostic){
 need(diagnostic.native_owner_verified===true&&diagnostic.truncated===false&&diagnostic.normalization_applied==='none'
  &&diagnostic.completeness_scope==='retained_wizard_exception_text_tree'&&diagnostic.source_span===null
  &&diagnostic.server_stack_origin==='not_established','native diagnostic provenance');
 if(!diagnostic.native_text_complete){
  need(diagnostic.tree===null&&diagnostic.position_status==='incomplete'&&typeof diagnostic.refusal==='string'&&diagnostic.refusal.length<200,'explicit incomplete diagnostic');return;
 }
 need(diagnostic.position_status==='not_attributed'&&Number.isSafeInteger(diagnostic.text_units),'complete diagnostic status');
 let nodes=0,units=0;
 const visit=(node,depth)=>{
  need(node&&depth<=8&&++nodes<=32&&Array.isArray(node.children)&&node.children.length<=32,'diagnostic tree bound');
  for(const key of ['message','name','stack']){
   const value=node[key];
   need(key!=='message'&&value===null||typeof value==='string'&&value.length<=8192,'diagnostic field type/bound');
   if(typeof value==='string')units+=value.length;
  }
  node.children.forEach(child=>visit(child,depth+1));
 };
 visit(diagnostic.tree,0);need(units<=32768&&units===diagnostic.text_units,'complete diagnostic text length');
}
