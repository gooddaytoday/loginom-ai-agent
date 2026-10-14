import {assertCaptureOwner,captureData} from './retained-capture.mjs';
const preparations=new WeakMap(), completions=new WeakMap();
const fail=why=>{throw Error('LOGINOM_AMOUNT_'+why)};
const bytes=value=>{captureData(value);return JSON.stringify(value)};
// This private handle is created only by the bridge from its original observed
// preparation and verified save outcome. No handle or completion bit crosses IPC.
export function retainAmountPreparation(retained,preparation,save) {
 assertCaptureOwner(retained);
 const binding=retained.binding,state=preparation?.state;
 if(!preparation?.attempted || state?.status!=='READY' || !state.workflow_ref
  || typeof state.workflow_ref.workflow_id!=='string' || !state.workflow_ref.workflow_id
  || !Array.isArray(state.workflow_ref.navigation_path)
  || !save || save.status!=='SUCCEEDED' || save.phase!=='verified' || save.cleanup_complete!==true
  || !['package.save_as','package.save_checkpoint'].includes(save.action_key)
  || typeof save.operation_id!=='string' || !save.operation_id
  || save.output?.package_ref?.path!==binding.packagePath
  || state.loginom_account!==binding.account || !state.document_id
  || !state.workflow_ref.tab_tid)fail('ORIGINAL_PREPARATION_UNAVAILABLE');
 if(typeof preparation.operation_id!=='string' || !preparation.operation_id
  || state.operation_id!==preparation.operation_id)fail('ORIGINAL_PREPARATION_UNAVAILABLE');
 const session=retained.session,metadata=session.metadata,handle=Object.freeze({});
 preparations.set(handle,{retained,preparation,save,preparationBytes:bytes(preparation),saveBytes:bytes(save),
  metadata,directory:session.directory,sessionId:metadata.sessionId,binding,started:false,receipt:undefined});
 assertAmountPreparation(handle,preparation,save);return handle;
}
export function assertAmountPreparation(handle,preparation,save,{closed=false}={}) {
 const p=preparations.get(handle);if(!p)fail('ORIGINAL_PREPARATION_UNAVAILABLE');
 const r=p.retained,s=r.state;
 if(r.owner.signal?.aborted)throw r.owner.signal.reason;
 if(!Number.isSafeInteger(r.owner.deadline) || Date.now()>=Math.min(r.owner.deadline,p.binding.expires))fail('ORIGINAL_CONTROL_EXPIRED');
 if(!closed)assertCaptureOwner(r);
 if(r.binding!==p.binding || r.session.metadata!==p.metadata || r.session.directory!==p.directory
  || p.metadata.sessionId!==p.sessionId || s.captureRetained!==r || s.session!==r.session
  || s.startupOwner!==r.owner || s.captureStartupBinding!==r.startup
  || s.bridge!==r.runtime.bridge || s.client!==r.runtime.client
  || r.owner.context!==r.context || r.owner.page!==r.page
  || p.metadata.workspacePreparation!==p.preparation || preparation!==p.preparation || save!==p.save
  || bytes(preparation)!==p.preparationBytes || bytes(save)!==p.saveBytes)fail('ORIGINAL_PREPARATION_CHANGED');
 return p;
}
export function beginAmountCompletion(handle,preparation,save) {
 const p=assertAmountPreparation(handle,preparation,save);
 if(p.started)fail('CAPTURE_CONSUMED');p.started=true;
}
export function retainAmountConsumerResult(handle,receipt,preparation,save) {
 const p=assertAmountPreparation(handle,preparation,save);
 if(!p.started || p.receipt || !receipt || receipt.settings_applied!==false || receipt.cancel_verified!==true)
  fail('CONSUMER_COMPLETION_UNAVAILABLE');
 p.receipt=receipt;p.receiptBytes=bytes(receipt);
}
export function sealAmountCompletion(handle,result,{preparation,save,evidence,evidenceBytes,
 receiptWritten,journalWritten,closed,cleanupBytes}) {
 const p=assertAmountPreparation(handle,preparation,save,{closed:true});
 if(!p.started || result.receipt!==p.receipt || bytes(p.receipt)!==p.receiptBytes
  || evidence?.receipt!==p.receipt || evidence.binding!==p.binding || !receiptWritten || !journalWritten
  || evidenceBytes!==JSON.stringify(evidence,null,2)+'\n'
  || !closed || closed.cleanup_complete!==true || closed.browser_transport_closed!==true
  || !result.cleanup || result.cleanup.status!=='SUCCEEDED' || result.cleanup.package_closed!==true
  || result.cleanup.logged_out!==true || result.cleanupComplete!==true
  || result.cleanup.session_id!==p.sessionId || result.cleanup.document_id!==p.preparation.state.document_id
  || result.cleanup.account!==p.binding.account || result.cleanup.package_path!==p.binding.packagePath
  || result.cleanup.save_operation_id!==p.save.operation_id
  || cleanupBytes!==JSON.stringify(result.cleanup,null,2)+'\n')fail('PHYSICAL_COMPLETION_UNAVAILABLE');
 const prior=completions.get(handle);if(prior)fail('CAPTURE_CONSUMED');
 completions.set(handle,{result,bytes:bytes(result)});return result;
}
export function assertAmountCompletion(handle,result,preparation,save) {
 assertAmountPreparation(handle,preparation,save,{closed:true});
 const c=completions.get(handle);
 if(!c || c.result!==result || c.bytes!==bytes(result))fail('PHYSICAL_COMPLETION_UNAVAILABLE');
 return true;
}
