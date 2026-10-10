import {withDiagnosticSession} from './diagnostic-session.mjs';
// The existing foreground caller retains owner; this module never starts a login.
export async function runReplacementDiagnostic(options, owner, scenario) {
 if(!owner || typeof owner!=='object' || owner.context)throw Error('FOREGROUND_OWNER_REQUIRED');
 const {context,page,execute,runtime,directory,identity,makeCleanupCode}=options;
 const pinned=Object.freeze({...identity,diagnosticDiscard:false});
 Object.assign(owner,{context,page,execute,runtime,identity:pinned,failed:false,closed:false});
 const session=dir=>({context,execute,directory:dir,identity:pinned,makeCleanupCode});
 owner.recover=async()=>{
  if(owner.closed)throw Error('DIAGNOSTIC_CONTEXT_ALREADY_CLOSED');
  if(runtime.hasUnsettledWork())throw Error('DIAGNOSTIC_PENDING_OPERATION_PRESERVED');
  const value=await withDiagnosticSession(session(directory+'/recovery'),async({bindPrepared})=>bindPrepared(owner.prepared));
  owner.closed=true;return value;
 };
 try {
  owner.value=await withDiagnosticSession(session(directory),async({bindPrepared})=>scenario({bindPrepared:async prepared=>{
   owner.prepared=prepared;return bindPrepared(prepared);
  },owner}));
  owner.closed=true;
 }catch(error){owner.failed=true;owner.error=error;}
 return owner;
}
