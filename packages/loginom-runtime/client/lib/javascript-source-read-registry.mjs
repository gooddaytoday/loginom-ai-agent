import {validateJavascriptSourceReadRequest} from './javascript-source-read-session.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const signature = value => JSON.stringify(canonical(value));

// An operation ID retains its source reader and every successful reply. An
// exact retry joins or replays that reply; no browser gesture is repeated.
export function createJavascriptSourceReadRegistry({openSession, maxOperations = 128,validateRequest=validateJavascriptSourceReadRequest}) {
  if (typeof openSession !== 'function' || !Number.isInteger(maxOperations)
    || maxOperations < 1 || maxOperations > 1024||typeof validateRequest!=='function') throw Error('Invalid JavaScript source registry');
  const operations = new Map();
  const find=id=>{
    const entry=operations.get(id);
    if(!entry)throw Error('Unknown JavaScript source operation');
    return entry;
  };
  // Source/context retain their own receipts, rather than inventing an apply
  // outcome. The existing job envelope exposes cancellation and cleanup only.
  const snapshot=entry=>structuredClone({operation_id:entry.request.operation_id,attempt:1,
    state:entry.inflight===null?'settled':'running',cancel_requested:entry.controller.signal.aborted,
    server_stop_requested:false,progress:{node:entry.request.node,
      execution:{status:'not_requested',execution_id:null},accepted_phases:[],
      pending_phase:entry.inflight===null?null:'read',effect_possible:entry.session!==null,
      cleanup_complete:entry.inflight===null&&entry.session?.cleanupUnconfirmed!==true},
    outcome:null,error:entry.error});
  return Object.freeze({
    has:id=>operations.has(id),
    get busy() { return [...operations.values()].some(entry => entry.inflight !== null); },
    get unsettled() { return [...operations.values()].some(entry => entry.session?.cleanupUnconfirmed === true); },
    status:id=>snapshot(find(id)),
    cancel(id){
      const entry=find(id);
      if(entry.inflight!==null)entry.controller.abort(Error('Local JavaScript read cancellation requested'));
      return snapshot(entry);
    },
    async wait(id,{timeoutMs=1000,signal}={}){
      const entry=find(id);
      if(!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>60000)throw Error('Node wait timeout must be 0..60000 ms');
      signal?.throwIfAborted();
      if(entry.inflight===null||timeoutMs===0)return snapshot(entry);
      let timer,onAbort;
      const waiting=new Promise((resolve,reject)=>{
        timer=setTimeout(resolve,timeoutMs);
        if(signal){onAbort=()=>reject(signal.reason);signal.addEventListener('abort',onAbort,{once:true});}
      });
      try{await Promise.race([entry.inflight.catch(()=>undefined),waiting]);return snapshot(entry);}
      finally{clearTimeout(timer);if(onAbort)signal.removeEventListener('abort',onAbort);}
    },
    async read(request,{signal}={}) {
      signal?.throwIfAborted();
      const kind = validateRequest(request);
      const key = signature(request);
      let entry = operations.get(request.operation_id);
      if (!entry) {
        if (kind !== 'initial') throw Error('Unknown JavaScript source operation');
        if ([...operations.values()].some(value => value.inflight !== null))
          throw Error('Another JavaScript source operation is running');
        if (operations.size >= maxOperations) throw Error('JavaScript source registry full');
        entry = {initial: key,request:structuredClone(request), session: null, inflight: null, pendingKey: null,
          receipts: new Map(), retired: false,controller:new AbortController(),error:null};
        operations.set(request.operation_id, entry);
      }
      if (kind === 'initial' && key !== entry.initial) throw Error('JavaScript source operation ID reused');
      if (entry.retired) throw Error('JavaScript source operation uncertain; no replay');
      if (entry.receipts.has(key)) return structuredClone(entry.receipts.get(key));
      if (entry.inflight && entry.pendingKey !== key) throw Error('JavaScript source operation busy');
      if (kind === 'continuation' && entry.session === null)
        throw Error('JavaScript source continuation before initial read');
      const abort=()=>entry.controller.abort(signal.reason);
      signal?.addEventListener('abort',abort,{once:true});
      try{
        if(entry.inflight)return structuredClone(await entry.inflight);
        entry.controller.signal.throwIfAborted();
        entry.pendingKey = key;
        entry.error=null;
        entry.inflight = (async () => {
          if (entry.session === null) {
            try { entry.session = await openSession(structuredClone(request),{signal:entry.controller.signal}); }
            catch (error) { entry.retired = true; throw error; }
            if (entry.session?.owner?.operation_id !== request.operation_id
              || typeof entry.session.read !== 'function') {
              entry.retired = true; throw Error('JavaScript source session owner changed');
            }
          }
          try {
            const receipt = await entry.session.read(structuredClone(request),{signal:entry.controller.signal});
            entry.controller.signal.throwIfAborted();
            entry.receipts.set(key, structuredClone(receipt));
            return receipt;
          } catch (error) {
            if (entry.session.uncertain === true) entry.retired = true;
            throw error;
          }
        })().catch(error=>{
          const cancelled=entry.controller.signal.aborted&&error===entry.controller.signal.reason;
          entry.error={code:cancelled?'JAVASCRIPT_READ_CANCELLED':'JAVASCRIPT_READ_FAILED',
            message:String(error?.message??error).slice(0,1000)};
          if(entry.controller.signal.aborted)entry.retired=true;
          throw error;
        }).finally(()=>{entry.inflight=null;entry.pendingKey=null;});
        return structuredClone(await entry.inflight);
      }finally{signal?.removeEventListener('abort',abort);}
    }
  });
}
