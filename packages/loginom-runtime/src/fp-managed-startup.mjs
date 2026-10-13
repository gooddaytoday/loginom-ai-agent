import {validateStartInput} from './start-input.mjs'
import {decodePreReadyRejection} from './qualified-pre-ready.mjs'

// IPC carries the original accepted startup tuple, never an AbortSignal or
// readiness grant. Reuse the managed startup's one original controller.
export function retainFPManagedStartup(message,input,state,controller) {
  return retainManagedStartup(message,input,state,controller,'fpStartup')
}

// Closed wrappers retain their own packet; neither purpose aliases the other.
export function retainAmountManagedStartup(message,input,state,controller) {
  validateStartInput(input)
  return retainManagedStartup(message,input,state,controller,'amountStartup')
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
    accept(){guard();accepted=true},
    settle(){pending=false;clearTimeout(timer);if(state.startupController===controller)state.startupController=undefined},
  }
}
