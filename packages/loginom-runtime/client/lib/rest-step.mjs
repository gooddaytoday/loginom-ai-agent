import {createHash} from 'node:crypto';
import {withBrowserReceipt} from './executor.mjs';

// Reuse the existing private node-step journal and browser receipt. An unknown
// reply leaves the enclosing node phase pending; it never repeats this procedure.
export async function runRestStep(options,ctx,kind,makeCode,parameters,config){
 const {operation,execute,onRecord,receiptOptions}=options;
 ctx.signal?.throwIfAborted();
 const step=operation.nodeStepSequence=(operation.nodeStepSequence??0)+1;
 const id=operation.id+':n'+step,key='node.rest.'+kind+'.internal';
 const action={verb:'rest_'+kind,...parameters};
 const signature=createHash('sha256').update(JSON.stringify([id,action,ctx.document_id,ctx.workflow_ref,ctx.node??null])).digest('hex');
 const entry=(phase,value)=>onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:'1.0.0',phase,internal_provenance:'client_node_procedure_v1',step,internal_operation_id:id,...value});
 const prepared=await entry('node_step_prepared',{action,signature});
 if(prepared?.signature!==signature||JSON.stringify(prepared.action)!==JSON.stringify(action))throw Error('REST step was not durably prepared');
 ctx.signal?.throwIfAborted();
 const code=makeCode({...parameters,document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node??null,origin:config.targetOrigin,build:config.targetBuild,deadline:ctx.deadline});
 const envelope=`async page=>{const r=await (${code})(page);return {status:r.verified?'SUCCEEDED':r.effect_possible?'AMBIGUOUS':'NOT_APPLIED',action_key:${JSON.stringify(key)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:${JSON.stringify(kind)},effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'REST_STEP_UNCONFIRMED',message:r.error}:null,trace:[]}}`;
 let result;
 try{result=await execute(withBrowserReceipt(`(${envelope})(page)`,{...receiptOptions(id,key,signature),operation_id:id}),{timeout:Math.max(5000,ctx.deadline-Date.now()+5000)});}
 catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
 if(result.operation_id!==id||result.action_key!==key){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('REST step receipt differs');}
 operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
 const completed=await entry('node_step_completed',{outcome:result});
 if(JSON.stringify(completed?.outcome)!==JSON.stringify(result))throw Error('REST step outcome was not durably preserved');
 if(result.status!=='SUCCEEDED'||!operation.cleanupConfirmed||result.output?.verified!==true)throw Error(result.error?.message??'REST step did not confirm completion');
 return result.output;
}
