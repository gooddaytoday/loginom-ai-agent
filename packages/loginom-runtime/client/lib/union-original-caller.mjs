import {createHash} from 'node:crypto';

const scopes=new WeakMap();
const descriptor=Object.getOwnPropertyDescriptor;
const abortGet=descriptor(AbortSignal.prototype,'aborted').get;
const reasonGet=descriptor(AbortSignal.prototype,'reason').get;
const field=(object,key)=>{
 const d=descriptor(object,key);
 if(!d||!Object.hasOwn(d,'value'))throw Error('UNION_CALLER_DATA_OPERAND_REQUIRED: '+key);
 return d.value;
};
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
function requestDigest(value,seen=new Set()) {
 const walk=v=>{
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){requireValue(Number.isFinite(v)&&!Object.is(v,-0),'UNION_CALLER_REQUEST_SHAPE');return;}
  requireValue(v&&typeof v==='object'&&!seen.has(v),'UNION_CALLER_REQUEST_SHAPE');seen.add(v);
  const array=Array.isArray(v),keys=Reflect.ownKeys(v);
  requireValue(array?Object.getPrototypeOf(v)===Array.prototype:Object.getPrototypeOf(v)===Object.prototype,'UNION_CALLER_REQUEST_SHAPE');
  requireValue(keys.every(k=>typeof k==='string'),'UNION_CALLER_REQUEST_SHAPE');
  if(array)requireValue(keys.length===v.length+1&&keys.every(k=>k==='length'||/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<v.length),'UNION_CALLER_REQUEST_SHAPE');
  for(const key of keys){if(array&&key==='length')continue;const d=descriptor(v,key);
   requireValue(d&&Object.hasOwn(d,'value')&&d.enumerable,'UNION_CALLER_REQUEST_SHAPE');walk(d.value);}
  seen.delete(v);
 };
 walk(value);
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Private caller transport only. No Page, wizard callback, native completion,
// receipt, cleanup or release authority is minted by this component.
export function retainUnionOriginalCaller(input) {
 const operation=field(input,'operation'),signal=field(input,'signal'),deadline=field(input,'deadline');
 const execute=field(input,'execute'),now=field(input,'now');
 // Native getters brand-check the raw signal; a copied phase facade is refused.
 abortGet.call(signal);reasonGet.call(signal);
 requireValue(Number.isSafeInteger(deadline)&&deadline>0&&typeof execute==='function'&&typeof now==='function','UNION_CALLER_INPUT_REQUIRED');
 const request=field(operation,'parameters'),id=field(operation,'id'),signature=field(operation,'signature');
 requireValue(typeof id==='string'&&id.length>0&&field(request,'operation_id')===id
  &&typeof signature==='string'&&signature.length>0&&field(field(request,'target'),'type')==='transform.union_data','UNION_CALLER_ORIGINAL_REQUEST_REQUIRED');
 const digest=requestDigest(request),calls=new Map();let active=null,first=null;
 const check=()=>{
  if(abortGet.call(signal))throw reasonGet.call(signal);
  requireValue(now()<deadline,'UNION_CALLER_DEADLINE_EXPIRED');
  requireValue(field(input,'operation')===operation&&field(input,'signal')===signal&&field(input,'deadline')===deadline
   &&field(input,'execute')===execute&&field(input,'now')===now
   &&field(operation,'id')===id&&field(operation,'parameters')===request&&field(operation,'signature')===signature
   &&requestDigest(request)===digest,'UNION_CALLER_BINDING_CHANGED');
 };
 check();
 const fail=reason=>{first??={reason};return reason;};
 const caller=Object.freeze({
  check,
  execute(id,code,options={}) {
   const old=calls.get(id);
   if(old){
    try{check();old.checkOptions();requireValue(old.code===code&&old.options===options,'UNION_CALLER_DUPLICATE_CHANGED');}catch(error){return Promise.reject(error);}
    return old.promise;
   }
   try{check();requireValue(typeof id==='string'&&id.startsWith(operation.id+':')&&typeof code==='string','UNION_CALLER_DISPATCH_REQUIRED');
    requireValue(!active&&!first,'UNION_CALLER_PENDING_OR_REFUSED');
    // Existing phase timeouts remain transport bounds; cancellation and the
    // absolute caller deadline always come from the original retained input.
    requireValue(options&&Object.getPrototypeOf(options)===Object.prototype,'UNION_CALLER_OPTIONS_REQUIRED');
    for(const key of Reflect.ownKeys(options))requireValue(['timeout','signal','deadline'].includes(key)&&Object.hasOwn(descriptor(options,key),'value'),'UNION_CALLER_OPTIONS_REQUIRED');
    requireValue(!Object.hasOwn(options,'signal')||field(options,'signal')===signal,'UNION_CALLER_FOREIGN_SIGNAL');
    requireValue(!Object.hasOwn(options,'deadline')||field(options,'deadline')===deadline,'UNION_CALLER_FOREIGN_DEADLINE');
    requireValue(!Object.hasOwn(options,'timeout')||Number.isFinite(field(options,'timeout'))&&field(options,'timeout')>0,'UNION_CALLER_OPTIONS_REQUIRED');
   }catch(error){return Promise.reject(error);}
   const values=Object.fromEntries(Object.keys(options).map(k=>[k,field(options,k)]));
   const checkOptions=()=>requireValue(Reflect.ownKeys(options).length===Object.keys(values).length
    &&Object.keys(values).every(k=>field(options,k)===values[k]),'UNION_CALLER_OPTIONS_CHANGED');
   const call={code,options,checkOptions,promise:null,status:'pending',reply:undefined};calls.set(id,call);active=call;
   // Start after the original promise/state is retained, including synchronous
   // transport failures. A second invocation never replaces this operation.
   call.promise=Promise.resolve().then(()=>{check();checkOptions();return execute(code,{...values,signal,deadline});}).then(
    reply=>{call.reply=reply;call.status='confirmed';active=null;try{check();checkOptions();return reply;}catch(error){throw fail(error);}},
    error=>{call.status='unknown';active=null;throw fail(error);});
   return call.promise;
  },
  confirmed(id) {
   check();const call=calls.get(id);requireValue(call?.status==='confirmed','UNION_CALLER_COMPLETION_UNKNOWN');
   call.checkOptions();return call.reply;
  },
  facts(){return Object.freeze({calls:calls.size,pending:active!==null,refused:first!==null,
   nativeAuthority:false,completionAuthority:false,cleanupAuthority:false,releaseAuthority:false});}
 });
 scopes.set(caller,{operation,signal,deadline});return caller;
}
export function unionOriginalCallerMatches(caller,operation) {
 const retained=scopes.get(caller);if(!retained||retained.operation!==operation)return false;
 try{caller.check();return true;}catch{return false;}
}
