import {JAVASCRIPT_MODULE_POLICY} from './javascript-module-policy.mjs';

const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const phases=['target','materialization_start','finish'];
const verification='javascript_source_policy_closed';

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
  &&['policy','stale_identity','effect_drift'].includes(closed.reason)
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
