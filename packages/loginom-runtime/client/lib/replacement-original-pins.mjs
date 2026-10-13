import {createHash,randomUUID} from 'node:crypto';
import {assertCaptureOwner,captureData,freezeCaptureResult} from '../../src/retained-capture.mjs';

const kind='replacement-input0-readonly-v1';
const resource='runtime/src/acceptance/replacement-input0-readonly-v1.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=value=>typeof value==='string'&&value.length>0&&value.length<=1024;
const refuse=()=>{throw Error('REPLACEMENT_ORIGINAL_PINS_REFUSED');};
const slots=new WeakMap(); // One correlation producer per existing retained slot/state.

// Trusted process-local producer only. Its operands are the existing managed
// retained owner and executor handle, never request DTOs or model callbacks.
// This component does not register an IPC operation or authorize capture/close.
export function retainReplacementOriginalPins(retained,node) {
 node.signal.throwIfAborted();
 captureData(node.request);captureData(node.opening);
 assertCaptureOwner(retained);node.assertCurrent();
 const binding=retained.binding,state=node.state,request=node.request,opening=node.opening;
 const signal=node.signal,deadline=node.deadline,session=retained.session;
 captureData(request);captureData(opening);
 const requestBytes=JSON.stringify(request),openingBytes=JSON.stringify(opening);
 if(binding.harness!==kind||retained.resource.path!==resource||!Object.isFrozen(retained.runtime)
  ||!(signal instanceof AbortSignal)||!Number.isSafeInteger(deadline)
  ||request.target?.kind!=='existing'||request.target.type!=='transform.replace_columns'
  ||!id(request.operation_id)||!id(request.document_id)||!id(request.workflow_ref?.workflow_id)
  ||request.target.ref?.node_id!==state.node?.node_id||state.node?.document_id!==request.document_id
  ||state.node?.workflow_id!==request.workflow_ref.workflow_id
  ||opening.phase!=='open'||opening.status!=='verified'||opening.value?.verified!==true
  ||opening.value.cleanup_complete!==true||!id(opening.receipt_id)||!id(opening.value.opening_operation_id)
  ||opening.receipt_id===opening.value.opening_operation_id||!id(opening.value.epoch)
  ||node.requestSha256!==digest(request)||node.openingSha256!==digest(opening))refuse();
 const previous=slots.get(retained)?.get(state);
 if(previous){previous.assertCurrent();return previous;}
 const scope=randomUUID(),cancellationScope=randomUUID();
 // Scalar tuple is copied once from the already frozen original binding.
 const packet=freezeCaptureResult({version:1,kind:'replacement-original-pins-v1',scope,
  owner:binding.owner,run:binding.run,lease:binding.lease,generation:binding.generation,chat:binding.chat,
  session_id:retained.sessionId,account:binding.account,package_path:binding.packagePath,
  resource_path:retained.resource.path,resource_sha256:retained.resource.sha256,
  operation_id:request.operation_id,document_id:request.document_id,
  workflow_id:request.workflow_ref.workflow_id,node_id:state.node.node_id,
  request:JSON.parse(requestBytes),request_sha256:node.requestSha256,opening_sha256:node.openingSha256,
  outer_opening_operation_id:opening.receipt_id,native_opening_operation_id:opening.value.opening_operation_id,
  opening_epoch:opening.value.epoch,deadline,
  cancellation:{scope:cancellationScope,link:'original-server-operation'}});
 captureData(packet);
 let delivered=false;
 const guard=()=>{
  // Preserve an already cancelled ORIGINAL server signal as the primary reason.
  signal.throwIfAborted();
  captureData(request);captureData(opening);
  assertCaptureOwner(retained);node.assertCurrent();
  if(retained.binding!==binding||retained.session!==session||node.state!==state||node.request!==request
   ||node.opening!==opening||node.signal!==signal||node.deadline!==deadline
   ||state.request!==request||state.phases.find(p=>p.phase==='open')!==opening
   ||JSON.stringify(request)!==requestBytes||JSON.stringify(opening)!==openingBytes
   ||Date.now()>=deadline)refuse();
 };
 guard();
 const producer={
  assertCurrent:guard,
  project(){guard();if(delivered)throw Error('REPLACEMENT_ORIGINAL_PINS_ALREADY_DELIVERED');delivered=true;return packet;},
 };
 // Signal stays exclusively on the trusted server object; not on the packet.
 Object.defineProperty(producer,'signal',{value:signal});
 if(!slots.has(retained))slots.set(retained,new WeakMap());
 slots.get(retained).set(state,producer);
 return Object.freeze(producer);
}
