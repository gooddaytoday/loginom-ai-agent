import {terminalManagedCallForBridge} from './terminal-managed-call.mjs';
import {terminalSourceForManagedCall} from './terminal-root-association.mjs';
// Private fixed managed→bridge channel. No configuration, IPC or tool field can
// register a Page here. Request/deadline admission belongs to the later H0 cut.
const sessions=new WeakMap(),bridges=new WeakMap(),originals=new WeakMap();
export function retainOriginalPrepareStartup(session,{startup,owner,readiness,assertStartup}) {
  if(sessions.has(session) || !startup || !Object.isFrozen(startup) || startup.owner!==owner
      || !owner?.page || !owner.context || typeof assertStartup!=='function')
    throw Error('LOGINOM_ORIGINAL_PREPARE_STARTUP_UNAVAILABLE');
  const metadata=session.metadata,directory=session.directory,sessionId=metadata?.sessionId;
  const facts=Object.freeze({startup,owner,page:startup.page,context:startup.context,readiness,session,
    id:startup.id,account:startup.account,origin:startup.origin,generation:startup.generation,chat:startup.chat,
    documentId:readiness?.documentId,loginomBuild:readiness?.loginomBuild,sessionId,directory,startupSignal:owner.signal,startupDeadline:owner.deadline});
  let primary,secondary,bridge;
  const identity=['id','account','origin','generation','chat'];
  function guard() {
    if(primary)throw primary.value;
    try {
      assertStartup();
      facts.startupSignal.throwIfAborted();
      if(Number.isSafeInteger(facts.startupDeadline) && Date.now()>=facts.startupDeadline)throw Error('LOGINOM_ORIGINAL_PREPARE_STARTUP_EXPIRED');
      if(!sessionId || !facts.documentId || facts.loginomBuild!=='7.4.2' || readiness.loginomBuild!==facts.loginomBuild || readiness.account!==facts.account
          || session.metadata!==metadata || metadata.sessionId!==sessionId || session.directory!==directory
          || owner.signal!==facts.startupSignal || owner.deadline!==facts.startupDeadline
          || startup.owner!==owner || startup.page!==facts.page || owner.page!==facts.page
          || startup.context!==facts.context || owner.context!==facts.context
          || identity.some(k=>startup[k]!==facts[k] || owner[k]!==facts[k])
          || readiness.documentId!==facts.documentId || readiness.account!==facts.account
          || facts.page.isClosed() || facts.context.pages().length!==1 || facts.context.pages()[0]!==facts.page)
        throw Error('LOGINOM_ORIGINAL_PREPARE_OWNER_CHANGED');
    } catch(value) {primary??={value};throw primary.value}
  }
  const lender=Object.freeze({
    guard,
    // Only a private same-bridge consumer can borrow these original refs.
    original(){guard();return facts},
    async observed(work) {
      guard();let value;
      try {value=await work()}catch(error){if(primary)secondary??={value:error};else primary={value:error};throw primary.value}
      guard();return value;
    },
    get secondary(){return secondary},
    bind(value){guard();if(bridge || bridges.has(value))throw Error('LOGINOM_ORIGINAL_PREPARE_OWNER_CHANGED');bridge=value;bridges.set(value,lender)},
    // Current SDK extra supplies signal, not a trusted absolute RunCommand
    // deadline/typed creation operand. Never infer either from timeout_ms.
    requireInvocation(){guard();throw Error('LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE')},
  });
  guard();sessions.set(session,lender);originals.set(lender,facts);return lender;
}
export function originalPrepareLenderForSession(session){const lender=sessions.get(session);lender?.guard();return lender}
export function originalPrepareLenderForBridge(bridge){const lender=bridges.get(bridge);lender?.guard();return lender}

const invocations=new WeakMap();
// Fixed H0 consumer. It can recheck an existing original realm binding, but
// never turn its projection/false qualification into a creation provider.
export function requireTerminalPrepareProvider(bridge){
 const call=terminalManagedCallForBridge(bridge),lender=bridges.get(bridge);
 const unavailable=reason=>{throw Object.assign(Error('LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE'),{cause:reason})};
 if(!call||!lender)unavailable('ORIGINAL_CALL_OR_STARTUP_NOT_BOUND');
 call.guard();
 const previous=invocations.get(call);if(previous)return previous;
 // The private fact lookup precedes the legacy lender guard. The load's
 // descriptor guards must reject foreign owner accessors without reading them.
 const original=originals.get(lender),load=terminalSourceForManagedCall(original.owner,call.facts.message);
 lender.guard();
 const initial=load.inspect(),witness=initial.scriptWitness;
 const check=()=>{call.guard();load.guard();lender.guard();
  if(lender.original()!==original||load.inspect().page!==original.page||load.inspect().context!==original.context
    ||call.facts.session!==original.session||load.facts.deadline!==call.facts.rootAssociation.wire.deadline)
   unavailable('ORIGINAL_PROVIDER_IDENTITY_CHANGED');
 };
 check();
 // Retain the actual child input/argument descriptors before any await. These
 // are not parsed SDK params or extra.signal. Realm arguments are evidence only.
 const argsDescriptor=Object.getOwnPropertyDescriptor(call.facts.input,'arguments');
 if(!argsDescriptor||!('value'in argsDescriptor)||!argsDescriptor.value||typeof argsDescriptor.value!=='object')unavailable('ORIGINAL_TYPED_CREATION_UNAVAILABLE');
 const args=argsDescriptor.value,argumentKeys=Reflect.ownKeys(args),argumentPrototype=Object.getPrototypeOf(args);
 const descriptors=argumentKeys.map(key=>[key,Object.getOwnPropertyDescriptor(args,key)]);
 const argumentCheck=()=>{call.guard();if(Object.getPrototypeOf(args)!==argumentPrototype||Reflect.ownKeys(args).length!==argumentKeys.length
   ||descriptors.some(([key,d])=>{const n=Object.getOwnPropertyDescriptor(args,key);return !d||!n||!('value'in d)||!('value'in n)||Reflect.ownKeys(d).some(k=>!Object.is(d[k],n[k]))}))unavailable('ORIGINAL_TYPED_REQUEST_CHANGED')};
 argumentCheck();
 const work=Promise.resolve().then(async()=>{
  check();
  if(!witness?.complete||!witness.realmOriginalAssociation||!witness.supportedInitialLoadJoined
    ||typeof witness.recheck!=='function')unavailable('ORIGINAL_INITIAL_LOAD_NOT_BOUND');
  // Keep the exact recheck Promise and result. No new Page/JSHandle/evaluator,
  // acquisition, reader, packet, task settlement or creation is introduced.
  const task=witness.recheck();const result=await task;check();
  if(result!==witness)unavailable('ORIGINAL_WITNESS_CHANGED');
  // This accepted producer still promises literal false. No success branch is
  // inferred from a future flag or caller-provided function/DTO.
  if(typeof witness.retainPrepare==='function'){
   argumentCheck();const value=key=>{const d=Object.getOwnPropertyDescriptor(args,key);return d&&'value'in d?d.value:undefined};
   if(typeof value('operation_id')!=='string'||!value('operation_id')||value('intent')!=='new_draft'
     ||value('package_path')!=null||value('workflow_ref')!=null)unavailable('ORIGINAL_TYPED_CREATION_UNAVAILABLE');
   const request=Object.freeze({operationId:value('operation_id'),sessionId:original.sessionId,intent:'new_draft'});
   const task=witness.retainPrepare(request,bridge);await task;check();argumentCheck();
   unavailable('ORIGINAL_CREATION_BOUND_NATIVE_QUALIFICATION_MISSING');
  }
  unavailable('LOADED_NATIVE_PROVIDER_NOT_BOUND');
 });
 invocations.set(call,work);return work;
}
