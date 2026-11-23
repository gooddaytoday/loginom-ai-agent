import {JAVASCRIPT_MODULE_POLICY} from './javascript-module-policy.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';

const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const phases=['target','materialization_start','finish'];
const verification='javascript_source_policy_closed';
export const JAVASCRIPT_EFFECTS_REQUIRE_DECLARED_OUTPUT='JAVASCRIPT_EFFECTS_REQUIRE_DECLARED_OUTPUT';
const effectPolicy=policy=>policy?.policy===JAVASCRIPT_MODULE_POLICY&&policy.parser?.name==='acorn'
 &&policy.parser.version==='8.15.0'&&Array.isArray(policy.effect_imports)&&policy.effect_imports.length>0
 &&policy.effect_imports.every(name=>['builtIn/FS','builtIn/Fetch'].includes(name));
export function javascriptEffectsSourceRefusal(policy){
 const error=Error('FS/Fetch execution requires declared output columns');
 error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,
  verification:'javascript_effects_output_required',proof:{policy}};
 return error;
}
export function verifiedJavascriptEffectsSourceRefusal(refusal,request){
 const policy=refusal?.proof?.policy;
 return request.target.type==='programming.javascript'&&request.target.kind==='new'&&request.finish==='execute'
  &&request.parameters.schema_mode==='code'&&refusal?.verification==='javascript_effects_output_required'
  &&effectPolicy(policy)&&same(Object.fromEntries(Object.keys(javascriptSourceIdentity(request.parameters.source_text)).map(k=>[k,policy[k]])),
    javascriptSourceIdentity(request.parameters.source_text));
}

// Trusted host boundary. Source admission supplies this proof only after its
// actual full reader and discard have completed, before a callback is dispatched.
export async function withJavascriptSourcePolicyBoundary({phase,owner,deadline,record},perform){
 if(!phases.includes(phase)||typeof record!=='function'||deadline<=Date.now())throw Error('JavaScript policy boundary unavailable');
 try{return await perform();}
 catch(error){
  const closed=error.javascriptSourceClosedRefusal;
  if(!closed||!same(closed.owner,owner)||closed.deadline!==deadline)throw error;
  const proof={phase,node:Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,owner[key]])),
   operation_id:owner.operation_id,closed:structuredClone(closed)};
  const event={phase:verification,operation_id:owner.operation_id,proof},expected=JSON.stringify(event);
  let timer;
  try{
   const ack=await Promise.race([Promise.resolve().then(()=>record(structuredClone(event))),new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('JavaScript policy refusal ACK deadline')),Math.max(1,deadline-Date.now()));
   })]);
   if(Date.now()>=deadline||JSON.stringify({phase:ack?.phase,operation_id:ack?.operation_id,proof:ack?.proof})!==expected)
    throw Error('JavaScript policy refusal ACK differs');
  }finally{clearTimeout(timer);}
  error.nodePhaseRefusal={phase,status:'FAILED',effect_possible:true,cleanup_complete:true,
   settings_unchanged:true,verification,proof};
  throw error;
 }
}

export function verifiedJavascriptSourcePolicyRefusal(refusal,request,configuredNode){
 const proof=refusal?.proof,closed=proof?.closed,source=closed?.source_identity,policy=closed?.policy;
 const node=request.target.kind==='existing'?request.target.ref:configuredNode;
 return request.target.type==='programming.javascript'&&phases.includes(refusal?.phase)
  &&refusal.verification===verification&&proof?.phase===refusal.phase&&node&&same(proof.node,node)
  &&node.document_id===request.document_id&&node.workflow_id===request.workflow_ref.workflow_id
  &&proof.operation_id===request.operation_id&&closed?.owner?.operation_id===request.operation_id
  &&['document_id','workflow_id','node_id'].every(key=>closed?.owner?.[key]===node?.[key])
  &&Number.isSafeInteger(closed.owner.ui_epoch)&&closed.owner.ui_epoch>=0
  &&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(closed.admission_id)
  &&Number.isSafeInteger(closed.read_id)&&closed.read_id>0&&Number.isSafeInteger(closed.deadline)
  &&['policy','stale_identity','stale_digest','effect_drift','declared_output_required'].includes(closed.reason)
  &&(closed.reason!=='declared_output_required'||request.finish==='execute'&&closed.declared_schema===false
    &&effectPolicy(closed.effective_policy)
    &&closed.effective_policy.source_sha256===(request.parameters.source_text===undefined?source?.source_sha256:javascriptSourceIdentity(request.parameters.source_text).source_sha256))
  &&closed.source_read_discard_verified===true&&closed.check_callback_dispatched===false
  &&/^[a-f0-9]{64}$/.test(source?.source_sha256)&&Number.isInteger(source.source_utf8_bytes)
  &&source.source_utf8_bytes>=0&&source.source_utf8_bytes<=32768&&Number.isInteger(source.source_lf_lines)
  &&source.source_lf_lines>=1&&source.source_lf_lines<=1024&&/^[a-f0-9]{64}$/.test(closed.settings_sha256)
  &&policy?.policy===JAVASCRIPT_MODULE_POLICY&&policy.parser?.name==='acorn'&&policy.parser.version==='8.15.0'
  &&policy.parser.ecma_version===2025&&policy.parser.source_type==='module'
  &&(policy.status==='ADMITTED'&&closed.reason!=='policy'&&same(Object.fromEntries(Object.keys(source).map(key=>[key,policy[key]])),source)
   ||policy.status==='REFUSED'&&['source_bounds','parser_version','syntax','unclassifiable','ast_bound',
    'dynamic_import','direct_require','module_specifier'].includes(policy.reason));
}
