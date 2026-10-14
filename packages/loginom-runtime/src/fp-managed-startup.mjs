import {validateStartInput} from './start-input.mjs'
import {decodePreReadyRejection} from './qualified-pre-ready.mjs'

const amountManagedStartups=new WeakMap();
const amountManagedCaptures=new WeakMap();

// IPC carries the original accepted startup tuple, never an AbortSignal or
// readiness grant. Reuse the managed startup's one original controller.
export function retainFPManagedStartup(message,input,state,controller) {
  return retainManagedStartup(message,input,state,controller,'fpStartup')
}

// Closed wrappers retain their own packet; neither purpose aliases the other.
export function retainAmountManagedStartup(message,input,state,controller) {
  validateStartInput(input)
  const retained=retainManagedStartup(message,input,state,controller,'amountStartup');
  amountManagedStartups.set(retained,{state,input,controller,tuple:input.amountStartup});
  return retained
}

function retainManagedStartup(message,input,state,controller,key) {
  const id=message.id,tuple=input[key],connection=input.connection
  const fixed={...tuple}, primitives={...input}, credentials={...connection}
  const capture=input.acceptanceCapture,binding=tuple.binding,originalBinding=binding&&{...binding}
  if(message.deadline!==fixed.deadline)throw Error('LOGINOM_START_INVALID')
  let owner,bound,primary,secondary,pending=true,accepted=false
  function refuse(value) {primary??={value,origin:"control"};if(!controller.signal.aborted)controller.abort(primary.value)}
  const timer=setTimeout(()=>refuse(Error('LOGINOM_INITIAL_READINESS_DEADLINE')),fixed.deadline-Date.now())
  function guard() {
    if(primary)throw primary.value
    if(controller.signal.aborted){refuse(controller.signal.reason);throw primary.value}
    if(Date.now()>=fixed.deadline){refuse(Error('LOGINOM_INITIAL_READINESS_DEADLINE'));throw primary.value}
    // Successful settlement ends pending control ownership, not the lifetime
    // of the original accepted owner/signal/deadline. Never restore the slot.
    if((pending ? state.startupController!==controller : !accepted || state.startupController!==undefined) || message.id!==id || message.input!==input || message.deadline!==fixed.deadline
        || input[key]!==tuple || Object.keys(fixed).some(k=>tuple[k]!==fixed[k])
        || (key==='amountStartup' && Object.keys(tuple).sort().join(',')!==Object.keys(fixed).sort().join(','))
        || (originalBinding && (tuple.binding!==binding || input.acceptanceCapture!==capture
          || Object.keys(binding).sort().join(',')!==Object.keys(originalBinding).sort().join(',')
          || Object.keys(capture).sort().join(',')!==Object.keys(originalBinding).sort().join(',')
          || Object.keys(originalBinding).some(k=>binding[k]!==originalBinding[k] || capture[k]!==originalBinding[k])))
        || Object.keys(primitives).some(k=>input[k]!==primitives[k]) || input.connection!==connection
        || Object.keys(credentials).some(k=>connection[k]!==credentials[k])
        || (owner && (state.startupOwner!==owner || Object.keys(bound).some(k=>owner[k]!==bound[k]))))
      throw Error('LOGINOM_STARTUP_OWNER_CHANGED')
  }
  return {
    guard,
    get pending(){return pending}, get accepted(){return accepted}, get secondary(){return secondary}, get rejectionOrigin(){return primary?.origin},
    bindOwner(value) {
      guard();if(owner)throw Error('LOGINOM_STARTUP_OWNER_CHANGED')
      owner=value;bound={directory:value.directory,generation:value.generation,chat:value.chat,signal:value.signal,deadline:value.deadline}
      if(value.signal!==controller.signal || value.deadline!==fixed.deadline || value.generation!==input.generation || value.chat!==input.chat)
        throw Error('LOGINOM_STARTUP_OWNER_CHANGED')
      guard()
    },
    // Only a rejected owned await is a new event. A guard/root catch carries
    // the existing primary without claiming a second failure.
    reject(value){if(!primary)primary={value,origin:"await"};else secondary??={value};return primary.value},
    propagate(value){primary??={value,origin:"guard"};return primary.value},
    cancel(value){
      if(!pending || value?.phase!=='startup' || value.requestId!==id || value.startupRequestId!==fixed.requestId
          || value.authorization!==fixed.authorization || value.harness!==(fixed.harness??fixed.purpose) || value.deadline!==fixed.deadline
          || (key==='amountStartup' && (value.operation!==fixed.operation || value.request!==fixed.request)))return false
      if(originalBinding && (value.bindingPhase!=='capture' || !value.captureBinding
          || Object.keys(value.captureBinding).sort().join(',')!==Object.keys(originalBinding).sort().join(',')
          || Object.keys(originalBinding).some(k=>value.captureBinding[k]!==originalBinding[k])))return false
      if(primary)return false
      guard();refuse(decodePreReadyRejection(value.rejection));return true
    },
    ...(key==="amountStartup"?{cancelCapture(value){if(pending || !accepted || primary)return false;guard();refuse(value);return true}}:{}),
    accept(){guard();accepted=true},
    settle(){pending=false;clearTimeout(timer);if(state.startupController===controller)state.startupController=undefined},
  }
}

// Private branded reader; startup JSON or a copied handle cannot provide this ABI.
export function assertAmountManagedStartup(retained,state) {
  const record=amountManagedStartups.get(retained);
  if(!record || record.state!==state || state.controlledStartup!==retained)
    throw Error('LOGINOM_AMOUNT_MANAGED_PROVIDER_UNAVAILABLE');
  retained.guard();
  const tuple=record.tuple;
  if(record.input.amountStartup!==tuple || !tuple.binding || tuple.purpose!=='amount-import-type-v1')
    throw Error('LOGINOM_AMOUNT_MANAGED_PROVIDER_UNAVAILABLE');
  return {signal:record.controller.signal,deadline:tuple.deadline,operation:tuple.operation,request:tuple.request,binding:tuple.binding};
}

// Fixed input-less capture on the already retained managed channel only.
export function retainAmountManagedCapture(retained,state,message) {
 const record=amountManagedStartups.get(retained),original=assertAmountManagedStartup(retained,state),frame=message.amountCapture;
 const fields=['revision','purpose','outerRequestId','captureRequestId','managedRequestId','startupRequestId','authorization','operation','request','deadline','binding'];
 if(!record || !retained.accepted || retained.pending || !frame || message.input!==undefined
  || Object.keys(frame).sort().join(',')!==fields.sort().join(',') || frame.revision!==1 || frame.purpose!=='amount-import-type-v1'
  || frame.managedRequestId!==message.id || frame.captureRequestId!==frame.outerRequestId
  || ![frame.managedRequestId,frame.outerRequestId].every(v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v))
  || frame.startupRequestId!==record.tuple.requestId || frame.authorization!==record.tuple.authorization
  || frame.operation!==original.operation || frame.request!==original.request || frame.deadline!==original.deadline
  || !frame.binding || Object.keys(frame.binding).sort().join(',')!==Object.keys(original.binding).sort().join(',')
  || Object.keys(original.binding).some(k=>frame.binding[k]!==original.binding[k]))throw Error('LOGINOM_AMOUNT_CAPTURE_FRAME_REFUSED');
 if(amountManagedCaptures.has(retained))throw Error('LOGINOM_AMOUNT_CAPTURE_CONSUMED');
 const originalFrameBinding=frame.binding,snapshot=Object.freeze({...frame,binding:Object.freeze({...frame.binding})});let pending=true,cancelled=false;
 const guard=()=>{
  assertAmountManagedStartup(retained,state);
  if(state.amountCaptureRequest!==handle || message.amountCapture!==frame || message.id!==snapshot.managedRequestId
    || message.input!==undefined || frame.binding!==originalFrameBinding || Object.keys(frame).sort().join(',')!==Object.keys(snapshot).sort().join(',') || Object.keys(snapshot).some(k=>k==='binding'?Object.keys(snapshot.binding).some(b=>frame.binding[b]!==snapshot.binding[b]):frame[k]!==snapshot[k]))throw Error('LOGINOM_AMOUNT_CAPTURE_FRAME_CHANGED');
 };
 const handle=Object.freeze({frame:snapshot,signal:original.signal,guard,
  get pending(){return pending},
  cancel(input){
   if(!pending || cancelled || !input || Object.keys(input).sort().join(',')!=='amountCapture,phase,rejection,requestId'
    || input.phase!=='amount-capture' || input.requestId!==snapshot.managedRequestId || !input.amountCapture
    || JSON.stringify(input.amountCapture)!==JSON.stringify(snapshot))return false;
   guard();cancelled=true;return retained.cancelCapture(decodePreReadyRejection(input.rejection));
  },settle(){pending=false}
 });
 amountManagedCaptures.set(retained,handle);state.amountCaptureRequest=handle;guard();return handle;
}
