import {withDiagnosticSession} from './diagnostic-session.mjs';
// The existing foreground caller retains owner; this module never starts a login.
export function retainReplacementOwner(options, owner) {
 const {context,page,execute,directory,identity,makeCleanupCode}=options;
 if(!owner || typeof owner!=='object' || owner.started || owner.failed || owner.context&&(owner.context!==context||owner.page!==page||owner.execute!==execute||owner.startupOwner?.context!==context||owner.startupOwner?.page!==page||owner.startupOwner?.closed===true))throw Error('FOREGROUND_OWNER_REQUIRED');
 const pinned=Object.freeze({...identity,diagnosticDiscard:false});
 Object.assign(owner,{context,page,execute,runtime:options.runtime,identity:pinned,failed:false,closed:false});
 const session=dir=>({context,execute,directory:dir,identity:pinned,makeCleanupCode});
 owner.recover=async()=>{
  if(owner.closed)throw Error('DIAGNOSTIC_CONTEXT_ALREADY_CLOSED');
  if(options.runtime?.hasUnsettledWork())throw Error('DIAGNOSTIC_PENDING_OPERATION_PRESERVED');
  const value=await withDiagnosticSession(session(directory+'/recovery'),async({bindPrepared})=>bindPrepared(owner.prepared));
  owner.closed=true;return value;
 };
 return owner;
}
export async function runReplacementDiagnostic(options, owner, scenario) {
 if(owner?.context){
  if(owner.context!==options.context || owner.page!==options.page || owner.execute!==options.execute || owner.started)throw Error('FOREGROUND_OWNER_REQUIRED');
 }else retainReplacementOwner(options,owner);
 owner.started=true;
 const {context,execute,directory,identity,makeCleanupCode}=options;
 const session=dir=>({context,execute,directory:dir,identity:{...identity,diagnosticDiscard:false},makeCleanupCode});
 try {
  owner.value=await withDiagnosticSession(session(directory),async({bindPrepared})=>scenario({bindPrepared:async prepared=>{
   owner.prepared=prepared;return bindPrepared(prepared);
  },owner}));
  owner.closed=true;
 }catch(error){owner.failed=true;owner.error=error;}
 return owner;
}

// Private caller adapter: startup cleanup remains owned by loginBrowser.
export function createReplacementStartupBridge(startup, owner) {
 if(!startup||!owner||owner.context||owner.started)throw Error('FOREGROUND_OWNER_REQUIRED');
 owner.startupOwner=startup;owner.phase='startup';owner.evidenceFailures=[];
 const has=(o,k)=>Object.hasOwn(o,k);
 let context,page,resolved=false;
 const execute=code=>{
  if(!page||owner.page!==page||startup.page!==page||owner.context!==context||startup.context!==context)
   throw Error('STARTUP_PAGE_BINDING_REQUIRED');
  return new Function('page',`return (${code})(page)`)(page);
 };
 owner.execute=execute;
 const fail=(value,stage)=>{
  if(!has(owner,'entryFailure')){owner.entryFailure=value;owner.failureStage=stage;}
  if(!has(owner,'primaryFailure'))owner.primaryFailure=has(startup,'primaryFailure')?startup.primaryFailure:value;
  owner.failed=true;owner.error=owner.entryFailure;
  if(startup.closed===true&&startup.receipt?.cleanup_complete===true&&startup.receipt?.context_closed===true&&startup.receipt?.owner_id===startup.id){owner.closed=true;owner.cleanupReceipt=startup.receipt;}
  return owner;
 };
 const evidenceFailure=value=>{owner.evidenceFailures.push(value);};
 owner.recover=async()=>{
  if(owner.phase!=='startup')throw Error('STARTUP_LIFECYCLE_ALREADY_TRANSFERRED');
  if(owner.context!==context||startup.context!==context||owner.page!==page||startup.page!==page)
   throw Error('STARTUP_OWNER_CHANGED');
  if(owner.runtime?.hasUnsettledWork())throw Error('DIAGNOSTIC_PENDING_OPERATION_PRESERVED');
  if(typeof startup.close!=='function')throw Error('STARTUP_GUARDED_CLOSE_UNAVAILABLE');
  try {
   const receipt=await startup.close();
   if(receipt?.cleanup_complete!==true||receipt?.context_closed!==true||receipt?.owner_id!==startup.id||startup.closed!==true)
    throw Error('STARTUP_CLEANUP_UNCONFIRMED');
   owner.closed=true;owner.cleanupReceipt=receipt;return receipt;
  }catch(error){owner.cleanupFailure=error;throw error;}
 };
 return {
  fail,evidenceFailure,
  captureContext(value){
   if(!value||context&&context!==value||startup.context&&startup.context!==value)throw Error('STARTUP_CONTEXT_CHANGED');
   context=value;startup.context=value;owner.context=value;
  },
  capturePage(value){
   if(!context||!value||page&&page!==value||startup.page&&startup.page!==value)throw Error('STARTUP_PAGE_CHANGED');
   page=value;startup.page=value;owner.page=value;
  },
  fulfilled(value){
   if(!context||!page||value?.context!==context||startup.context!==context||startup.page!==page||startup.closed||owner.failed)
    throw Error('STARTUP_HANDOFF_REFUSED');
   resolved=true;
  },
  handoff(options,retain){
   if(!resolved||owner.failed||startup.closed||options.context!==context||options.page!==page||options.execute!==execute)
    throw Error('STARTUP_HANDOFF_REFUSED');
   // The receiving retainer adopts these already owned handles exactly,
   // retaining its identity/pending/cleanup guards; no delete owner.context.
   retain(options,owner);
   if(owner.context!==context||owner.page!==page||owner.execute!==execute)throw Error('REPLACEMENT_HANDOFF_CHANGED');
   owner.phase='replacement';return owner;
  }
 };
}
