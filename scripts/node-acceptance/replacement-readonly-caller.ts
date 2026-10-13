import {createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {launchReplacementDiagnostic} from '../../packages/loginom-host/src/node-client'
import {captureData} from '../../packages/loginom-runtime/src/retained-capture.mjs'

// Private foreground client. Native Page/context/client/bridge remain exclusively
// with the host's retained owner. Expected data below is correlation, NOT authority.
export async function launchReplacementReadOnlyCaller(input:any,owner:any) {
 const keys=['product','root','packagePath','run','session','signal','deadline'];
 if(!input||Object.keys(input).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(input,k))
  ||!owner||typeof owner!=='object'||Reflect.ownKeys(owner).length||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Object.values(Object.getOwnPropertyDescriptors(input)).some(d=>!Object.hasOwn(d,'value')))throw Error('REPLACEMENT_CALLER_INPUT')
 const {product,root,packagePath,run,session,signal,deadline}=input;
 if(typeof product!=='string'||resolve(product)!==product||typeof root!=='string'||resolve(root)!==root
  ||![packagePath,run,session].every(v=>typeof v==='string'&&v.length>0&&v.length<=1024)
  ||!(signal instanceof AbortSignal)||!Number.isSafeInteger(deadline))throw Error('REPLACEMENT_CALLER_INPUT')
 const expected={product,root,packagePath,run,session,signal,deadline};
 const guardInput=()=>{if(keys.some(k=>input[k]!==expected[k]))throw Error('REPLACEMENT_CALLER_ORIGINAL_CHANGED');signal.throwIfAborted();if(Date.now()>=deadline)throw Error('REPLACEMENT_CALLER_DEADLINE')};
 const hash=(v:any)=>{captureData(v);return createHash('sha256').update(JSON.stringify(v)).digest('hex')};
 const fail=(error:any)=>{if(!Object.hasOwn(owner,'primaryFailure')){owner.primaryFailure=error;owner.error=error}else owner.secondaryFailures.push(error);owner.failed=true;return owner};
 let resourceHash:string;let host:any,requestHandle:any,captureHandle:any,exitHandle:any,original:any,pin:any,lease:any,leaseGeneration:number,acquired=false,attempted=false;
 owner.secondaryFailures=[];owner.gates=Object.freeze({native_admission:'not_verified',current_resources:'not_verified',original_native_owner:'not_verified',cleanup_before_exit:'not_verified'});
 const guard=()=>{guardInput();if(owner.host!==host||owner.request!==requestHandle||owner.captureHandle!==captureHandle||owner.exited!==exitHandle||!host?.alive)throw Error('REPLACEMENT_CALLER_OWNER_CHANGED');
  if(lease&&lease.generation!==leaseGeneration)throw Error('REPLACEMENT_CALLER_LEASE_CHANGED');
  if(original&&(original.request!==pin.request||original.opening!==pin.opening||original.signal!==pin.signal||original.deadline!==pin.deadline||original.sessionId!==pin.sessionId||hash(original.request)!==pin.requestHash||hash(original.opening)!==pin.openingHash))throw Error('REPLACEMENT_CALLER_ORIGINAL_CHANGED');
  if(original){original.signal.throwIfAborted();if(Date.now()>=original.deadline)throw Error('REPLACEMENT_CALLER_DEADLINE')}};
 try {
  guardInput();owner.phase='factory';
  const manifest=JSON.parse(await readFile(join(product,'resources/loginom/resource-manifest.json'),'utf8'));guardInput();
  const resources=manifest.files?.filter((r:any)=>r.path==='runtime/src/acceptance/replacement-input0-readonly-v1.mjs');if(resources?.length!==1||!/^[a-f0-9]{64}$/.test(resources[0].sha256))throw Error('REPLACEMENT_CALLER_RESOURCE_REQUIRED');resourceHash=resources[0].sha256;
  host=await launchReplacementDiagnostic({node:join(product,'resources/loginom/bin/node'),entry:join(product,'resources/loginom/host/node-host.mjs'),resources:join(product,'resources/loginom'),root,packagePath,headless:true,strictRecovery:true});
  // Retain handles before the post-await check, including cancelled startup.
  Object.assign(owner,{host,request:host.request,captureHandle:host.capture,exited:host.exited});requestHandle=host.request;captureHandle=host.capture;exitHandle=host.exited;guard();owner.phase='host';
 }catch(error){return fail(error)}
 owner.acquire=async()=>{try{guard();if(acquired||owner.failed)throw Error('REPLACEMENT_CALLER_NO_RETRY');acquired=true;lease=await requestHandle('acquire',{run,session});if(!lease||!Number.isSafeInteger(lease.generation)||lease.generation<1)throw Error('REPLACEMENT_CALLER_MISSING_LEASE');leaseGeneration=lease.generation;guard();owner.phase='leased';return lease}catch(error){fail(error);throw error}};
 owner.pinOriginal=(value:any)=>{try{guard();if(!acquired||!lease||original||owner.failed)throw Error('REPLACEMENT_CALLER_ORIGINAL_REQUIRED');
  if(!value||Object.keys(value).sort().join(',')!=='deadline,opening,request,sessionId,signal'||!(value.signal instanceof AbortSignal)||!Number.isSafeInteger(value.deadline)||typeof value.sessionId!=='string'||!value.sessionId)throw Error('REPLACEMENT_CALLER_ORIGINAL_REQUIRED');
  const r=value.request,o=value.opening;captureData(r);captureData(o);
  if(!r?.operation_id||!r.document_id||!r.workflow_ref?.workflow_id||r.target?.type!=='transform.replace_columns'||!r.target?.ref?.node_id||!o?.receipt_id||o.phase!=='open'||o.status!=='verified'||!o.value?.opening_operation_id)throw Error('REPLACEMENT_CALLER_ORIGINAL_REQUIRED');
  original=value;pin={request:r,opening:o,signal:value.signal,deadline:value.deadline,sessionId:value.sessionId,requestHash:hash(r),openingHash:hash(o)};guard();owner.phase='original-pinned';
 }catch(error){fail(error);throw error}};
 owner.read=async()=>{try{guard();if(owner.failed||!original||attempted)throw Error('REPLACEMENT_CALLER_NO_RETRY');attempted=true;owner.phase='capture';
  const result=await captureHandle(run);owner.result=result;
  // The original channel may have already refused before reply delivery drift.
  // Record that observation first; it never authorizes accepting the result.
  const refused=result&&typeof result==='object'&&result.cleanupComplete===false&&result.refused===true
   &&(result.rejectedIsUndefined===true||Object.hasOwn(result,'rejected'));
  if(refused)fail(result.rejectedIsUndefined===true?undefined:result.rejected);
  guard();
  // No release/ACK/close from a diagnostic read, including a successful one.
  if(!result||typeof result!=='object'||result.cleanupComplete!==false)throw Error('REPLACEMENT_CALLER_UNCONFIRMED_RESULT');
  if(result.refused===true){if(!refused)throw Error('REPLACEMENT_CALLER_UNCONFIRMED_RESULT');owner.phase='refused';return result}
  captureData(result);const receipt=result.receipt,p=receipt?.publication,r=original.request,o=original.opening;
  if(result.diagnosticRead!==true||receipt?.status!=='DIAGNOSTIC_READ'||receipt.effect_possible!==false||receipt.native_capture_admitted!==false||receipt.admission_confirmed!==false||receipt.settings_applied!==false||receipt.execution_started!==false
   ||!p||typeof p.owner!=='string'||!p.owner||p.account!==packagePath.split('/')[1]||p.resource_path!=='runtime/src/acceptance/replacement-input0-readonly-v1.mjs'||p.resource_sha256!==resourceHash||p.run!==run||p.chat!==createHash('sha256').update(session).digest('hex')||p.lease!==p.owner+':'+run||p.generation!==lease.generation||p.package_path!==packagePath||p.operation_id!==r.operation_id||p.document_id!==r.document_id||p.workflow_id!==r.workflow_ref.workflow_id||p.node_id!==r.target.ref.node_id
   ||p.session_id!==original.sessionId||p.opening_operation_id!==o.receipt_id||p.deadline!==original.deadline||p.request_sha256!==pin.requestHash||p.opening_sha256!==pin.openingHash
   ||receipt.native_before?.input_port?.opening_operation_id!==o.value.opening_operation_id)throw Error('REPLACEMENT_CALLER_RESULT_BINDING');
  if(!receipt.root||['document_id','workflow_id','node_id','session_id','account','package_path'].some(k=>receipt.root[k]!==p[k]))throw Error('REPLACEMENT_CALLER_RESULT_BINDING');
  owner.phase='diagnostic-only';return result;
 }catch(error){fail(error);throw error}};
 owner.close=()=>{const error=Error('REPLACEMENT_CALLER_CLEANUP_NOT_VERIFIED');if(!Object.hasOwn(owner,'cleanupFailure'))owner.cleanupFailure=error;return Promise.reject(error)};
 return owner;
}
