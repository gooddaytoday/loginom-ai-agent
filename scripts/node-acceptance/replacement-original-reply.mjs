import {createHash} from 'node:crypto';
import {captureData,freezeCaptureResult} from '../../packages/loginom-runtime/src/retained-capture.mjs';

const fields='version,kind,scope,owner,run,lease,generation,chat,session_id,account,package_path,resource_path,resource_sha256,operation_id,document_id,workflow_id,node_id,request,request_sha256,opening_sha256,outer_opening_operation_id,native_opening_operation_id,opening_epoch,deadline,cancellation'.split(',');
const exact=(value,keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('REPLACEMENT_REPLY_SHAPE');
 const own=Reflect.ownKeys(value);
 if(own.length!==keys.length||keys.some(k=>!own.includes(k))||own.some(k=>typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))throw Error('REPLACEMENT_REPLY_SHAPE');
};
const hash=value=>{captureData(value);return createHash('sha256').update(JSON.stringify(value)).digest('hex')};
const string=value=>typeof value==='string'&&value.length>0&&value.length<=1024;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);

// Private client correlation only. This has no browser/host opcode, dispatcher,
// admission, close or server cancellation API. Expected values are locally
// pinned operands; equality does not establish native authority.
export function createReplacementOriginalReplyAdapter(owner,input) {
 exact(input,['request','opening','run','ownerId','chat','sessionId','account','packagePath','resourceSha256','lease','signal','deadline']);
 const handles=Object.fromEntries(['host','request','captureHandle','exited'].map(k=>[k,Object.getOwnPropertyDescriptor(owner??{},k)?.value]));
 if(!handles.host||typeof handles.request!=='function'||typeof handles.captureHandle!=='function'||!handles.exited||!handles.host.alive
  ||!(input.signal instanceof AbortSignal)||!Number.isSafeInteger(input.deadline)
  ||!Number.isSafeInteger(Object.getOwnPropertyDescriptor(input.lease??{},'generation')?.value)||Object.getOwnPropertyDescriptor(input.lease,'generation').value<1
  ||![input.run,input.ownerId,input.chat,input.sessionId,input.account,input.packagePath].every(string)||!sha(input.resourceSha256))throw Error('REPLACEMENT_REPLY_INPUT');
 captureData(input.request);captureData(input.opening);
 if(input.opening?.phase!=='open'||!string(input.opening.receipt_id)||!string(input.opening.value?.opening_operation_id)||!string(input.opening.value?.epoch))throw Error('REPLACEMENT_REPLY_INPUT');
 if(input.request.target?.kind!=='existing'||input.request.target.type!=='transform.replace_columns'
  ||!string(input.request.operation_id)||!string(input.request.document_id)||!string(input.request.workflow_ref?.workflow_id)
  ||!string(input.request.target.ref?.node_id))throw Error('REPLACEMENT_REPLY_INPUT');
 const expected={...input},requestHash=hash(input.request),openingHash=hash(input.opening),generation=input.lease.generation;
 let consumed=false;
 owner.secondaryFailures??=[];
 const fail=error=>{if(!Object.hasOwn(owner,'primaryFailure')){owner.primaryFailure=error;owner.error=error}else owner.secondaryFailures.push(error);owner.failed=true};
 const guard=()=>{
  exact(input,['request','opening','run','ownerId','chat','sessionId','account','packagePath','resourceSha256','lease','signal','deadline']);
  if(Object.keys(expected).some(k=>input[k]!==expected[k])||hash(input.request)!==requestHash||hash(input.opening)!==openingHash)throw Error('REPLACEMENT_REPLY_ORIGINAL_CHANGED');
  input.signal.throwIfAborted();if(Date.now()>=expected.deadline)throw Error('REPLACEMENT_REPLY_DEADLINE');
  if(Object.keys(handles).some(k=>Object.getOwnPropertyDescriptor(owner,k)?.value!==handles[k])||!handles.host.alive||Object.getOwnPropertyDescriptor(input.lease,'generation')?.value!==generation)throw Error('REPLACEMENT_REPLY_OWNER_CHANGED');
 };
 const pin=packet=>{
  exact(packet,fields);captureData(packet);
  exact(packet.cancellation,['scope','link']);
  if(packet.version!==1||packet.kind!=='replacement-original-pins-v1'||!uuid(packet.scope)||!uuid(packet.cancellation.scope)
   ||packet.cancellation.link!=='original-server-operation'||!string(packet.owner)||!string(packet.chat)
   ||packet.owner!==expected.ownerId||packet.chat!==expected.chat||packet.run!==expected.run||packet.lease!==packet.owner+':'+expected.run||packet.generation!==generation
   ||packet.session_id!==expected.sessionId||packet.account!==expected.account||packet.package_path!==expected.packagePath
   ||packet.resource_path!=='runtime/src/acceptance/replacement-input0-readonly-v1.mjs'||packet.resource_sha256!==expected.resourceSha256
   ||packet.operation_id!==expected.request.operation_id||packet.document_id!==expected.request.document_id
   ||packet.workflow_id!==expected.request.workflow_ref.workflow_id||packet.node_id!==expected.request.target.ref.node_id
   ||packet.request_sha256!==requestHash||hash(packet.request)!==requestHash||!sha(packet.opening_sha256)
   ||packet.opening_sha256!==openingHash||packet.outer_opening_operation_id!==expected.opening.receipt_id
   ||packet.native_opening_operation_id!==expected.opening.value.opening_operation_id||packet.opening_epoch!==expected.opening.value.epoch
   ||![packet.outer_opening_operation_id,packet.native_opening_operation_id,packet.opening_epoch].every(string)
   ||packet.outer_opening_operation_id===packet.native_opening_operation_id||!Number.isSafeInteger(packet.deadline)
   ||packet.deadline!==expected.deadline||Date.now()>=packet.deadline)throw Error('REPLACEMENT_REPLY_BINDING');
  return freezeCaptureResult(JSON.parse(JSON.stringify(packet)));
 };
 // Read data descriptors before recording a channel refusal; getters are never
 // invoked, nor is a malformed success treated as an observed refusal.
 const refusal=reply=>{
  const outcome=reply&&typeof reply==='object'&&Object.getOwnPropertyDescriptor(reply,'outcome')?.value;
  if(!outcome||typeof outcome!=='object')return {seen:false};
  const get=k=>Object.getOwnPropertyDescriptor(outcome,k);
  if(get('cleanupComplete')?.value!==false||get('refused')?.value!==true)return {seen:false};
  if(get('rejectedIsUndefined')?.value===true)return {seen:true,value:undefined};
  const rejected=get('rejected');return rejected&&Object.hasOwn(rejected,'value')?{seen:true,value:rejected.value}:{seen:false};
 };
 return Object.freeze({
  accept(reply){
   if(consumed)throw Error('REPLACEMENT_REPLY_NO_RETRY');consumed=true;
   const first=refusal(reply);if(first.seen)fail(first.value);
   try{
    guard();exact(reply,['version','kind','original','outcome']);
    if(reply.version!==1||reply.kind!=='replacement-original-reply-v1')throw Error('REPLACEMENT_REPLY_SHAPE');
    const correlation=pin(reply.original);guard();
    const outcome=reply.outcome,refused=Object.getOwnPropertyDescriptor(outcome??{},'refused')?.value===true,isUndefined=Object.getOwnPropertyDescriptor(outcome??{},'rejectedIsUndefined')?.value===true;
    exact(outcome,refused?(isUndefined?['cleanupComplete','refused','rejectedIsUndefined']:['cleanupComplete','refused','rejectedIsUndefined','rejected']):['cleanupComplete','diagnosticRead','receipt']);
    if(!first.seen)captureData(reply.outcome.receipt);
    if(reply.outcome.cleanupComplete!==false || (!first.seen && reply.outcome.diagnosticRead!==true))throw Error('REPLACEMENT_REPLY_OUTCOME');
    // Refusal payload remains the exact observed channel object/cause. No JSON
    // coercion of primary failure, and no success/admission inferred from it.
    return Object.freeze({correlation,outcome:reply.outcome,correlation_only:true,native_admission:false,
     server_cancellation_verified:false,cleanupComplete:false});
   }catch(error){fail(error);throw error}
  },
  lost(error){if(consumed)throw Error('REPLACEMENT_REPLY_NO_RETRY');consumed=true;fail(error);try{guard()}catch(secondary){fail(secondary)}throw error},
  assertCurrent:guard,
 });
}
