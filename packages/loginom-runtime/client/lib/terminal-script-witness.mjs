import {terminalSourceIntegrityPins} from './terminal-source-integrity.mjs';
import {terminalUserPublisherInspectorSource} from './terminal-user-publisher.mjs';
export function terminalScriptWitnessArguments(id,account){return Object.freeze({id,account,inspector:terminalUserPublisherInspectorSource,initialLoadPins:terminalSourceIntegrityPins()})}
// Fixed same-Page evaluation only. Returned JSON is evidence, never original refs/authority.
export function collectTerminalScriptWitness(expected){
 const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');return d.value};
 const requireFrozen=o=>{if(!o||!Object.isFrozen(o))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');return o};
 const publisher=requireFrozen(own(globalThis,'__loginomOriginalUserPublisherV1')),inspect=own(publisher,'inspect');
 if(typeof inspect!=='function'||Function.prototype.toString.call(inspect)!==expected.inspector)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const sample=requireFrozen(Reflect.apply(inspect,publisher,[])),doc=own(sample,'document'),startup=own(globalThis,'__loginomStartupV1');
 if(own(startup,'document')!==doc||own(startup,'id')!==expected.id||own(startup,'account')!==expected.account)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const acquisition=requireFrozen(own(sample,'acquisition')),defs=requireFrozen(own(acquisition,'loadedDefinitions')),bindings=requireFrozen(own(defs,'bindings'));
 const initializer=requireFrozen(own(defs,'initializers'));
 if(own(initializer,'complete')!==true||own(initializer,'scriptIdentityComplete')!==true||own(initializer,'sourceExecutionQualified')!==false||own(initializer,'closureIdentityQualified')!==false)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const rows=[],nodes=[],integrityChecks=[];
 const script=(kind,witness)=>{
  requireFrozen(witness);if(own(witness,'complete')!==true||own(witness,'document')!==doc)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  const node=own(witness,'script'),url=own(witness,'url');if(!node||typeof url!=='string')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  const row={kind,url},receiptDescriptor=Object.getOwnPropertyDescriptor(witness,'integrityReceipt');
  if(receiptDescriptor){
   if(!('value'in receiptDescriptor))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   if(receiptDescriptor.value!==undefined){
    const receipt=requireFrozen(receiptDescriptor.value),integrity=own(witness,'integrity');
    const check=()=>{
     if(own(witness,'integrityReceipt')!==receipt||own(receipt,'node')!==node||own(receipt,'document')!==doc
       ||own(receipt,'url')!==url||own(receipt,'integrity')!==integrity||own(receipt,'armedBeforeSource')!==true
       ||own(receipt,'sourceExecutionQualified')!==false||own(receipt,'closureIdentityQualified')!==false
       ||own(receipt,'nativeAuthority')!==false)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
    };
    check();integrityChecks.push(check);
    // These are evidence from the retained original receipt/currentScript event,
    // never a caller-provided pin or a reconstructed node/closure.
    row.integrity=integrity;row.armedBeforeSource=true;row.initialExecutionObserved=true;
   }
  }
  nodes.push(node);rows.push(row);
 };
 script('initial',own(initializer,'initialScript'));script('modifier',own(initializer,'modifierScript'));
 const records=own(initializer,'records');requireFrozen(records);if(own(records,'length')!==3)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const names=['ObjectProxy','FileStorage','StreamPersist'],constructors=['ObjectProxy','FileStorage','StreamPersistProxy'];
 for(let i=0;i<3;i++){
  const r=requireFrozen(own(records,String(i))),kind=own(r,'kind'),ctor=own(r,'ctor'),ss=own(r,'ss'),members=own(r,'members'),methods=requireFrozen(own(r,'methods')),dependencies=requireFrozen(own(r,'dependencies'));
  if(kind!==names[i]||ctor!==own(bindings,constructors[i])||ss!==own(bindings,'ss')||own(r,'receiver')!==ss||own(ctor,'__assembly')!==own(r,'assembly'))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  for(const key of Reflect.ownKeys(methods)){const method=own(methods,key);if(typeof method!=='function'||own(members,key)!==method||own(own(ctor,'prototype'),key)!==method)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE')}
  if(own(dependencies,'shallowCopy')!==own(ss,'shallowCopy')||own(dependencies,'prepareProperties')!==own(ss,'prepareProperties')||typeof own(dependencies,'initialBase')!=='function')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  script(kind,own(r,'execution'));
 }
 if(nodes[3]!==nodes[4]||nodes[0]===nodes[1]||nodes[2]===nodes[3])throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 // Re-run the original guard after projection. Never return a node/receiver/closure as DTO.
 if(own(requireFrozen(Reflect.apply(inspect,publisher,[])),'document')!==doc)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 // The non-enumerable closure is retained only through the original JSHandle.
 // JSON retains evidence rows only; it cannot reconstruct this original custody.
 let initialLoad,loadSummary;
 const loadDescriptor=Object.getOwnPropertyDescriptor(defs,'initialLoad');
 if(loadDescriptor){
  if(!('value'in loadDescriptor))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');initialLoad=requireFrozen(loadDescriptor.value);
  if(own(initialLoad,'complete')===true){
   if(own(initialLoad,'document')!==doc||own(initialLoad,'sourceExecutionQualified')!==false||own(initialLoad,'closureIdentityQualified')!==false||own(initialLoad,'nativeAuthority')!==false)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   const loaded=requireFrozen(own(initialLoad,'records')),pins=expected.initialLoadPins;
   if(own(loaded,'length')!==pins.length)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   const loadRows=[];
   for(let i=0;i<loaded.length;i++){
    const r=requireFrozen(own(loaded,String(i))),receipt=requireFrozen(own(r,'receipt')),url=own(r,'url'),integrity=own(r,'integrity'),node=own(r,'node');
    if(typeof url!=='string'||typeof integrity!=='string')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
    const parsed=new URL(url);if(parsed.href!==url)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
    const pin=pins.find(([u])=>parsed.origin+parsed.pathname===u);
    if(!pin||pin[1]!==integrity||own(r,'loaded')!==true||own(r,'document')!==doc
      ||own(receipt,'node')!==node||own(receipt,'document')!==doc||own(receipt,'url')!==url||own(receipt,'integrity')!==integrity)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
    loadRows.push(Object.freeze({url,integrity,loaded:true}));
   }
   if(new Set(loadRows.map(r=>new URL(r.url).origin+new URL(r.url).pathname)).size!==pins.length)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   if(own(defs,'applicationSourcesJoined')!==true)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   const acquisitionDefinition=requireFrozen(own(defs,'acquisitionDefinition')),userDefinition=requireFrozen(own(defs,'userDefinition'));
   if(own(acquisitionDefinition,'originalGet')!==own(acquisition,'originalGet')||own(userDefinition,'originalSet')!==own(sample,'originalSet')||own(userDefinition,'originalInit')!==own(sample,'originalInit'))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
   loadSummary=Object.freeze({records:Object.freeze(loadRows),definingExportsRetained:true,applicationSourcesJoined:true});
  }
 }
 const id=expected.id,account=expected.account,summary=Object.freeze({id,account,
  ...(loadSummary?{initialLoad:loadSummary}:{}),initialLoadReason:loadSummary?undefined:(initialLoad&&Object.hasOwn(initialLoad,'reason')?own(initialLoad,'reason'):'ORIGINAL_INITIAL_LOAD_UNAVAILABLE'),
  rows:Object.freeze(rows.map(row=>Object.freeze(row))),privatePrepareAvailable:true,projectionOnly:true,sourceExecutionQualified:false,closureIdentityQualified:false});
 const descriptor=Object.getOwnPropertyDescriptor,apply=Reflect.apply,parent=Object.getPrototypeOf;
 const originalPublisher=publisher,originalInspect=inspect,originalStartup=startup,originalDefs=defs,originalInitializers=initializer;
 const capsule={...summary},capsuleParent=parent(capsule);
 // Fixed same-realm provider. Native refs stay here, never in the projection.
 // Its only production host entry below inspects custody; it cannot dispatch.
 const providerChecks=[],providerPatches=[];
 const descriptorEqual=(a,b)=>!a&&!b||!!a&&!!b&&Reflect.ownKeys(b).every(k=>Object.is(a[k],b[k]))&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length;
 function hold(object,key){
  const chain=[];let value;
  for(let p=object;p;p=parent(p)){
   const d=descriptor(p,key);chain.push({p,prototype:parent(p),d});
   if(d){if(!('value'in d))throw Error('TERMINAL_PROVIDER_ACCESSOR');value=d.value;break}
  }
  if(!chain.at(-1)?.d)throw Error('TERMINAL_PROVIDER_MISSING_'+key);
  if(value&&['object','function'].includes(typeof value)){const prototype=parent(value);providerChecks.push(()=>{if(parent(value)!==prototype)throw Error('TERMINAL_PROVIDER_CHANGED')})}
  providerChecks.push(()=>{let p=object;for(const x of chain){const d=descriptor(p,key);
   const patch=providerPatches.find(v=>v.active&&v.object===p&&v.key===key),expected=patch?patch.temporary:x.d;
   if(p!==x.p||parent(p)!==x.prototype||!descriptorEqual(d,expected))throw Error('TERMINAL_PROVIDER_CHANGED');p=parent(p)}});
  return value;
 }
 let provider,providerFailure;
 try{
 const MapCtor=hold(globalThis,'Map'),mapPrototype=hold(MapCtor,'prototype'),mapGet=hold(mapPrototype,'get');
 const storeKey='__loginomDockPreparationV1';
 let storeDescriptor=descriptor(globalThis,storeKey),preparation;
 // Same fixed preparation store as workspace. Birth precedes any reservation or
 // effect; creating bookkeeping does not create a package or native permission.
 if(!storeDescriptor){
  Object.defineProperty(globalThis,storeKey,{value:{document:doc,id,receipts:new MapCtor()},writable:true,configurable:true,enumerable:true});
  storeDescriptor=descriptor(globalThis,storeKey);
 }
 preparation=hold(globalThis,storeKey);
 if(hold(preparation,'document')!==doc||typeof hold(preparation,'id')!=='string')throw Error('TERMINAL_PROVIDER_DOCUMENT');
 const preparationId=hold(preparation,'id'),receipts=hold(preparation,'receipts');
 if(hold(receipts,'get')!==mapGet)throw Error('TERMINAL_PROVIDER_READER');
 const transport=own(own(sample,'bindings'),'transport'),originalQuery=own(bindings,'query'),streamType=own(bindings,'StreamPersist');
 if(typeof originalQuery!=='function'||!transport||!streamType)throw Error('TERMINAL_PROVIDER_DEFINITION');
 const connection=own(acquisition,'receiver'),applicationSession=hold(connection,'FSession');
 const main=hold(hold(hold(hold(globalThis,'bg'),'app'),'Application'),'FInstance');
 const form=hold(main,'FMainForm'),mapTree=hold(form,'FMapTree'),urlUtils=hold(form,'FUrlUtils'),storage=hold(urlUtils,'FFileStorage');
 if(hold(mapTree,'FServerConnection')!==connection||applicationSession!==own(acquisition,'session')
   ||hold(applicationSession,'$S')!==transport||hold(connection,'FUsername')!==account||hold(storage,'$S')!==transport
   ||hold(storage,'QueryInterface')!==originalQuery)throw Error('TERMINAL_PROVIDER_NATIVE_REFS');
 const storageReaders=Object.freeze(Object.fromEntries([['get_Connected','connected'],['get_CurrentDirectory','currentDirectory'],['get_IsOwnCurrentDirectory','ownDirectory'],['get_RootPath','rootPath']].map(([key,binding])=>{const method=hold(storage,key);if(typeof method!=='function'||method!==own(bindings,binding))throw Error('TERMINAL_PROVIDER_STORAGE_METHOD');return [key,method]})));
 const storageIdentity=hold(storage,'$');for(const key of ['$OW','$O']){const value=hold(storageIdentity,key);if(!Number.isInteger(value)||value<0)throw Error('TERMINAL_PROVIDER_STORAGE_IDENTITY')}
 const messages=hold(transport,'$M');hold(messages,'GetDynamicData');hold(transport,'$R');hold(transport,'DispatchMessageAsync');
 const nativeSS=own(bindings,'ss');hold(nativeSS,'TaskCompletionSource');hold(nativeSS,'mkdel');hold(hold(nativeSS,'Exception'),'wrap');
 let armed,creationState;const storageStates=[];
 function patchCheck(p){if(parent(p.object)!==p.prototype||!descriptorEqual(descriptor(p.object,p.key),p.active?p.temporary:p.original))throw Error('TERMINAL_PROVIDER_PATCH_CHANGED')}
 function suspendNative(check){
  const selected=providerPatches.filter(p=>p.active&&p.object===transport);
  selected.forEach(patchCheck);
  for(const p of selected){if(p.original)Object.defineProperty(p.object,p.key,p.original);else delete p.object[p.key];p.active=false}
  try{return check()}finally{
   // Inspect is synchronous. Never restore over a descriptor it changed/refused.
   selected.forEach(patchCheck);
   for(const p of selected){Object.defineProperty(p.object,p.key,p.temporary);p.active=true}
  }
 }
 function guard(){if(providerFailure)throw providerFailure.value;
  try{providerPatches.forEach(patchCheck);suspendNative(()=>checkOriginal.call(capsule));for(const check of providerChecks)check()}catch(value){providerFailure??={value};throw providerFailure.value}
 }
 function patch(object,key,make){
  const original=descriptor(object,key),method=hold(object,key);
  if(typeof method!=='function'||original&&!original.configurable&&!original.writable)throw Error('TERMINAL_PROVIDER_PATCH_UNAVAILABLE');
  const temporary={value:make(method),writable:true,enumerable:original?.enumerable??false,configurable:original?.configurable??true};
  const p={object,key,prototype:parent(object),original,method,temporary,active:true};Object.defineProperty(object,key,temporary);providerPatches.push(p);return p;
 }
 function restore(){providerPatches.forEach(patchCheck);for(const p of providerPatches.slice().reverse())if(p.active){
  if(p.original)Object.defineProperty(p.object,p.key,p.original);else delete p.object[p.key];p.active=false;
 }providerPatches.forEach(patchCheck);providerPatches.length=0}
 function startLower(proxy,type,rejectWork,readMethod){
  const r={proxy,type,transport,observed:false,completed:false,restored:false};let invoking=false;
  const first=value=>{r.primary??={value};return r.primary.value};
  const stop=value=>{r.stopped=true;providerFailure??={value};rejectWork(r.primary?r.primary.value:providerFailure.value)};
  try{
   if(!readMethod)r.resolverPatch=patch(transport,'$R',original=>function(w,o,type){
    if(!r.completing)return apply(original,this,arguments);
    guard();if(this!==transport||w!==r.w||o!==r.o||!Number.isInteger(type)||type<0)throw Error('TERMINAL_PROVIDER_QUERY_COMPLETION');
    r.returnedType=type;
    try{r.support=apply(original,this,arguments)}catch(value){throw first(value)}
    guard();r.completed=true;r.completing=false;return r.support;
   });
   r.dispatchPatch=patch(transport,'DispatchMessageAsync',original=>function(request){
    if(!invoking)return apply(original,this,arguments);
    guard();if(this!==transport||r.dispatchTask)throw Error('TERMINAL_PROVIDER_QUERY_REPLAY');r.request=request;
    patch(request,'Release',release=>function(){guard();const value=apply(release,this,arguments);guard();return value});
    const task=apply(original,this,arguments);r.dispatchTask=task;
    const begin=providerChecks.length;r.originalReader=hold(task,'getAwaitedResult');const readerChecks=providerChecks.slice(begin);
    r.readerPatch=patch(task,'getAwaitedResult',()=>function(){
     if(this!==task||!r.observed||r.delivered)throw Error('TERMINAL_PROVIDER_QUERY_READER_REPLAY');
     r.delivered=true;if(r.primary)throw r.primary.value;guard();r.response=r.outcome;
     hold(r.response,'set_StaticDataSize');
     if(readMethod){
      const key=['get_Connected','get_IsOwnCurrentDirectory'].includes(readMethod)?'ReadParameterBoolean':'ReadString';
      patch(r.response,key,read=>function(){
       guard();if(this!==r.response||r.valueRead)throw Error('TERMINAL_PROVIDER_STORAGE_READER_REPLAY');
       r.valueRead=true;try{r.value=apply(read,this,arguments)}catch(value){throw first(value)}
       guard();r.completed=true;return r.value;
      });
     }else patch(r.response,'ReadParameterInt32',read=>function(offset){
      guard();if(this!==r.response||![0,4,8].includes(offset))throw Error('TERMINAL_PROVIDER_QUERY_RESPONSE');
      const value=apply(read,this,arguments);guard();if(offset===0)r.w=value;else if(offset===4)r.o=value;else r.hresult=value;return value;
     });
     patch(r.response,'Release',release=>function(){guard();const value=apply(release,this,arguments);guard();return value});
     r.completing=true;return r.response;
    });
    r.continuationPatch=patch(task,'continueWith',continuation=>function(callback){
     if(this!==task||r.originalContinuation)throw Error('TERMINAL_PROVIDER_QUERY_REPLAY');r.originalContinuation=callback;
     const callbackPrototype=parent(callback);providerChecks.push(()=>{if(parent(callback)!==callbackPrototype)throw Error('TERMINAL_PROVIDER_CONTINUATION_CHANGED')});
     return apply(continuation,this,[function(){
      if(r.observed){r.replayed=true;stop(Error('TERMINAL_PROVIDER_QUERY_CONTINUATION_REPLAY'));return}
      // Qualify the original reader before reading it; unrelated post-await
      // drift cannot replace its raw rejection. A foreign reader is never called.
      try{patchCheck(r.readerPatch);for(const check of readerChecks)check()}catch(value){stop(value);return}
      r.observed=true;
      try{r.outcome=apply(r.originalReader,task,[])}catch(value){first(value)}
      try{guard()}catch(value){stop(value);return}
      return apply(callback,this,arguments);
     }]);
    });return task;
   });
   guard();invoking=true;try{r.task=readMethod?apply(storageReaders[readMethod],storage,[]):apply(originalQuery,proxy,[type])}finally{invoking=false}
   if(!r.dispatchTask)throw Error('TERMINAL_PROVIDER_QUERY_DISPATCH_UNAVAILABLE');
   return r;
  }catch(value){first(value);try{restore();r.restored=true}catch{}throw r.primary.value}
 }
 function readReceipt(operationId){guard();return apply(mapGet,receipts,[operationId])}
 function retainRequest(request){
  const keys=Reflect.ownKeys(request),prototype=parent(request),entries=keys.map(k=>[k,descriptor(request,k)]);
  if(keys.length!==3||!['operationId','sessionId','intent'].every(k=>keys.includes(k))||entries.some(([,d])=>!('value'in d))
   ||typeof own(request,'operationId')!=='string'||!own(request,'operationId')||typeof own(request,'sessionId')!=='string'||!own(request,'sessionId')||own(request,'intent')!=='new_draft')throw Error('TERMINAL_PROVIDER_REQUEST');
  const check=()=>{if(parent(request)!==prototype||Reflect.ownKeys(request).length!==keys.length||entries.some(([k,d])=>{const n=descriptor(request,k);return !n||Reflect.ownKeys(d).some(p=>!Object.is(n[p],d[p]))}))throw Error('TERMINAL_PROVIDER_REQUEST_CHANGED')};
  return {request,operationId:own(request,'operationId'),sessionId:own(request,'sessionId'),check};
 }
 provider=Object.freeze({
  inspect(){if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');guard();return Object.freeze({preparation,receipts,document:doc,documentId:preparationId,
   currentUser:own(sample,'user'),acquisition,transport,connection,storage,query:originalQuery,streamType,armed:!!armed,
   nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false})},
  continueCreation(mode){
   if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');guard();
   if(!armed)throw Error('TERMINAL_PROVIDER_CREATION_REQUIRED');armed.check();
   try{
   const request=armed.request,entry=readReceipt(armed.operationId);
   if(mode==='check'){if(!creationState)throw Error('TERMINAL_PROVIDER_CREATION_REQUIRED');if(creationState.receipt&&(entry!==creationState.receipt||own(entry,'phase')!==({reserved:'reserved',effect:'effect_possible',verified:'verified'})[creationState.phase]))throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');return Object.freeze({operationId:armed.operationId,sessionId:armed.sessionId})}
   if(mode==='begin'){
    if(creationState)throw Error('TERMINAL_PROVIDER_CREATION_REPLAY');
    if(entry)throw Error('TERMINAL_PROVIDER_LATE');
    creationState={request,phase:'initial'};
   }else{
    if(!creationState||creationState.request!==request)throw Error('TERMINAL_PROVIDER_CREATION_REQUIRED');
    if(mode==='reserve'){
     if(creationState.phase!=='initial'||!entry||own(entry,'phase')!=='reserved'
       ||own(entry,'request')!==JSON.stringify({session:armed.sessionId,intent:'new_draft',packagePath:null,workflowRef:null}))throw Error('TERMINAL_PROVIDER_FOREIGN_CREATION');
     creationState.receipt=entry;creationState.requestText=hold(entry,'request');creationState.before=hold(entry,'before');creationState.preserved=hold(entry,'preserved');
     for(const list of [creationState.before,creationState.preserved]){if(!Array.isArray(list))throw Error('TERMINAL_PROVIDER_FOREIGN_CREATION');const keys=Reflect.ownKeys(list);for(const key of keys)hold(list,key);providerChecks.push(()=>{const now=Reflect.ownKeys(list);if(now.length!==keys.length||now.some((key,i)=>key!==keys[i]))throw Error('TERMINAL_PROVIDER_CREATION_CHANGED')})}
     for(let i=0;i<creationState.preserved.length;i++){const item=creationState.preserved[i];for(const key of ['tab','graph','html'])hold(item,key)}
     creationState.phase='reserved';
    }else if(mode==='effect'){
     if(creationState.phase!=='reserved'||entry!==creationState.receipt||own(entry,'phase')!=='effect_possible')throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');
     creationState.phase='effect';
    }else if(mode==='verify'){
     if(creationState.phase!=='effect'||entry!==creationState.receipt||own(entry,'phase')!=='verified')throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');
     const completion=own(entry,'terminalOriginalCreation');
     if(!Object.isFrozen(completion)||own(completion,'document')!==doc||own(completion,'documentId')!==preparationId
       ||own(completion,'operationId')!==armed.operationId||own(completion,'sessionId')!==armed.sessionId
       ||own(completion,'nativeSession')!==transport||own(completion,'connection')!==connection||own(completion,'account')!==account||own(completion,'path')!==null
       ||own(entry,'tab')!==own(completion,'tab')||own(entry,'packageNode')!==own(completion,'packageNode'))throw Error('TERMINAL_PROVIDER_FOREIGN_CREATION');
     for(const key of Reflect.ownKeys(completion))hold(completion,key);hold(entry,'terminalOriginalCreation');hold(entry,'tab');hold(entry,'packageNode');
     creationState.completion=completion;creationState.phase='verified';
     creationState.packet=Object.freeze({initial:armed.initial,request,receipt:entry,completion,
      preparation,receipts,document:doc,account,session:transport,packageNode:own(completion,'packageNode'),tab:own(completion,'tab'),proxy:own(completion,'packageProxy')});
     for(const key of Reflect.ownKeys(creationState.packet))hold(creationState.packet,key);
    }else if(mode==='query'){
     if(creationState.phase!=='verified'||entry!==creationState.receipt||own(entry,'terminalOriginalCreation')!==creationState.completion)throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');
     return armed.binding.query();
    }else throw Error('TERMINAL_PROVIDER_CREATION_MODE');
   }
   guard();return Object.freeze({operationId:armed.operationId,sessionId:armed.sessionId,phase:creationState.phase,
    originalRequestRetained:true,receiptVerified:creationState.phase==='verified',nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
   }catch(value){providerFailure??={value};throw providerFailure.value}
  },
  packet(){if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');guard();
   if(!creationState?.packet)throw Error('TERMINAL_PROVIDER_PACKET_INCOMPLETE');provider.checkPacket(creationState.packet);return creationState.packet},
  checkPacket(packet){if(this!==provider||!creationState||packet!==creationState.packet)throw Error('TERMINAL_PROVIDER_PACKET_FOREIGN');
   guard();armed.check();
   if(packet.initial!==armed.initial||packet.request!==armed.request||packet.receipt!==readReceipt(armed.operationId)
     ||own(packet.receipt,'phase')!=='verified'||own(packet.receipt,'terminalOriginalCreation')!==packet.completion
     ||packet.completion!==creationState.completion||own(packet.completion,'packageProxy')!==packet.proxy)throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');
   return true},
  queryPacket(packet){if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');provider.checkPacket(packet);return armed.binding.query()},
  readStoragePacket(packet,method){
   if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');
   const names=['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'],index=names.indexOf(method);
   if(index<0)throw Error('TERMINAL_PROVIDER_STORAGE_METHOD');
   if(packet!==creationState?.packet)throw Error('TERMINAL_PROVIDER_PACKET_FOREIGN');
   const prior=storageStates[index];if(prior){if(!prior.failed)provider.checkPacket(packet);return prior.work}
   provider.checkPacket(packet);
   // The original query must already be settled; no implicit query/reacquire.
   const query=armed.binding.inspect();if(!query.lower?.completed||!query.support)throw Error('TERMINAL_PROVIDER_STORAGE_QUERY_REQUIRED');
   if(index!==storageStates.length||index&&storageStates[index-1].settled!==true)throw Error('TERMINAL_PROVIDER_STORAGE_ORDER');
   let resolve,reject;const state={work:new Promise((yes,no)=>{resolve=yes;reject=no})};storageStates.push(state);
   const rejectFirst=value=>{state.failed??={value};reject(state.failed.value)};
   try{
    const lower=startLower(storage,undefined,rejectFirst,method);state.lower=lower;
    const task=lower.task,continuation=hold(task,'continueWith'),begin=providerChecks.length,reader=hold(task,'getAwaitedResult'),checks=providerChecks.slice(begin);let completed=false;
    apply(continuation,task,[()=>{if(completed)return;completed=true;
     try{for(const fn of checks)fn();const value=apply(reader,task,[]);restore();lower.restored=true;
      if(!lower.completed||value!==lower.value)throw Error('TERMINAL_PROVIDER_STORAGE_COMPLETION');
      provider.checkPacket(packet);
      if(method==='get_Connected'&&value!==true)throw Error('TERMINAL_INTERFACE_DISCONNECTED');
      if(method==='get_IsOwnCurrentDirectory'&&value!==true)throw Error('TERMINAL_INTERFACE_NON_PERSONAL');
      if(['get_CurrentDirectory','get_RootPath'].includes(method)&&(typeof value!=='string'||!value))throw Error('TERMINAL_INTERFACE_ROOT_UNKNOWN');
      state.value=value;state.settled=true;resolve(value);
     }catch(error){const first=lower.primary?lower.primary.value:error;try{restore();lower.restored=true}catch{}providerFailure??={value:first};rejectFirst(first)}
    }]);
   }catch(error){providerFailure??={value:error};rejectFirst(error)}return state.work;
  },
  arm(request){
   if(this!==provider)throw Error('TERMINAL_PROVIDER_RECEIVER');guard();
   if(armed){if(armed.request!==request)throw Error('TERMINAL_PROVIDER_REPLAY');armed.check();return armed.binding}
   const entry=retainRequest(request),prior=readReceipt(entry.operationId);
   if(prior&&(own(prior,'phase')!=='reserved'||Object.hasOwn(prior,'terminalOriginalCreation')))throw Error('TERMINAL_PROVIDER_LATE');
   let creation,receipt,proxy,task,work,failed,support,lower;
   const check=()=>{guard();entry.check();if(creation){
    if(readReceipt(entry.operationId)!==receipt||own(receipt,'terminalOriginalCreation')!==creation||own(receipt,'phase')!=='verified'
      ||own(creation,'packageProxy')!==proxy||own(receipt,'tab')!==own(creation,'tab')||own(receipt,'packageNode')!==own(creation,'packageNode'))throw Error('TERMINAL_PROVIDER_CREATION_CHANGED');
   }};
   let binding;
   binding=Object.freeze({
    query(){
     if(this!==binding)throw Error('TERMINAL_PROVIDER_RECEIVER');
     if(work){if(!failed)check();return work}check();
     receipt=readReceipt(entry.operationId);if(!receipt||own(receipt,'phase')!=='verified'||prior&&receipt!==prior)throw Error('TERMINAL_PROVIDER_CREATION_REQUIRED');
     creation=own(receipt,'terminalOriginalCreation');
     if(!Object.isFrozen(creation)||own(creation,'document')!==doc||own(creation,'documentId')!==preparationId
       ||own(creation,'operationId')!==entry.operationId||own(creation,'sessionId')!==entry.sessionId
       ||own(creation,'nativeSession')!==transport||own(creation,'account')!==account||own(creation,'path')!==null)throw Error('TERMINAL_PROVIDER_FOREIGN_CREATION');
     proxy=hold(creation,'packageProxy');if(hold(proxy,'$S')!==transport||hold(proxy,'QueryInterface')!==originalQuery)throw Error('TERMINAL_PROVIDER_PROXY');
     const identity=hold(proxy,'$'),w=hold(identity,'$OW'),o=hold(identity,'$O');
     if(!Number.isInteger(w)||w<0||!Number.isInteger(o)||o<0||hold(own(creation,'packageNode'),'Package')!==proxy
       ||own(creation,'connection')!==connection)throw Error('TERMINAL_PROVIDER_PROXY');
     for(const key of Reflect.ownKeys(creation))hold(creation,key);for(const key of ['terminalOriginalCreation','phase','tab','packageNode'])hold(receipt,key);
     // One original task, original receiver and original returned completion.
     // Only a private in-realm consumer can invoke this; stock H0 still refuses.
     let resolve,reject;work=new Promise((yes,no)=>{resolve=yes;reject=no});
     const rejectFirst=value=>{failed??={value};reject(failed.value)};
     try{
      check();lower=startLower(proxy,streamType,rejectFirst);task=lower.task;
      const continuation=hold(task,'continueWith'),begin=providerChecks.length,reader=hold(task,'getAwaitedResult'),readerChecks=providerChecks.slice(begin);let completed=false;
      if(typeof continuation!=='function'||typeof reader!=='function')throw Error('TERMINAL_PROVIDER_TASK');
      apply(continuation,task,[()=>{if(completed)return;completed=true;
       try{for(const fn of readerChecks)fn();support=apply(reader,task,[]);restore();lower.restored=true;
        if(!lower.completed||support!==lower.support)throw Error('TERMINAL_PROVIDER_QUERY_COMPLETION');
        if(hold(support,'$S')!==transport||hold(support,'SaveToStream')!==own(bindings,'persist'))throw Error('TERMINAL_PROVIDER_SUPPORT');
        const identity=hold(support,'$'),w=hold(identity,'$OW'),o=hold(identity,'$O');if(!Number.isInteger(w)||w<0||!Number.isInteger(o)||o<0)throw Error('TERMINAL_PROVIDER_SUPPORT');
        check();resolve(support)}catch(error){const first=lower.primary?lower.primary.value:error;try{restore();lower.restored=true}catch{}rejectFirst(first)}
      }]);
     }catch(error){rejectFirst(error)}return work;
    },
    inspect(){if(this!==binding)throw Error('TERMINAL_PROVIDER_RECEIVER');check();return Object.freeze({request,initial:armed?.initial,preparation,receipts,creation,receipt,proxy,task,work,support,transport,query:originalQuery,streamType,
     lower:lower?Object.freeze({dispatchTask:lower.dispatchTask,request:lower.request,response:lower.response,continuation:lower.originalContinuation,reader:lower.originalReader,resolver:lower.resolverPatch.method,
      w:lower.w,o:lower.o,hresult:lower.hresult,returnedType:lower.returnedType,support:lower.support,observed:lower.observed,completed:lower.completed,restored:lower.restored}):undefined})},
   });
   // Same-realm initial custody is captured before begin/reserve/effect. The
   // physical host control deliberately stays outside this packet.
   const initial=Object.freeze({request,document:doc,documentId:preparationId,account,preparation,receipts,
    currentUser:own(sample,'user'),userTask:own(sample,'task'),acquisition,acquisitionTask:own(acquisition,'task'),
    acquisitionReceiver:own(acquisition,'receiver'),connection,applicationSession,storage,transport,
    definitions:originalDefs,bindings,storageReaders,query:originalQuery,streamType,controlLocation:'host'});
   for(const key of Reflect.ownKeys(initial))hold(initial,key);
   armed={...entry,initial,check,binding};return binding;
  },
 });
 }catch(value){
  // Existing partial source witnesses remain evidence-only. Missing original
  // native slots cannot be repaired by a late lookup on this capsule.
  providerFailure={value};provider=Object.freeze({inspect(){throw providerFailure.value},arm(){throw providerFailure.value}});
 }
 Object.defineProperty(capsule,'originalProvider',{value:provider});
 function checkOriginal(){
  if(this!==capsule||parent(capsule)!==capsuleParent||own(globalThis,'__loginomOriginalUserPublisherV1')!==originalPublisher
    ||own(originalPublisher,'inspect')!==originalInspect||own(globalThis,'__loginomStartupV1')!==originalStartup
    ||own(originalStartup,'document')!==doc||own(originalStartup,'id')!==id||own(originalStartup,'account')!==account)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  const now=requireFrozen(apply(originalInspect,originalPublisher,[])),current=requireFrozen(own(now,'acquisition'));
  if(own(now,'document')!==doc||own(now,'user')!==own(sample,'user')||own(now,'task')!==own(sample,'task')
    ||own(current,'task')!==own(acquisition,'task')||own(current,'receiver')!==own(acquisition,'receiver')
    ||own(current,'loadedDefinitions')!==originalDefs||own(originalDefs,'bindings')!==bindings
    ||own(originalDefs,'initializers')!==originalInitializers)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  if(initialLoad&&own(originalDefs,'initialLoad')!==initialLoad)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  for(const check of integrityChecks)check();
  const method=descriptor(capsule,'checkOriginal');if(!method||method.value!==checkOriginal||method.get||method.set
    ||method.writable||method.configurable||method.enumerable)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  const p=descriptor(capsule,'originalProvider');if(!p||p.value!==provider||p.get||p.set||p.writable||p.configurable||p.enumerable)throw Error('TERMINAL_PROVIDER_RECEIVER');
  return summary;
 }
 Object.defineProperty(capsule,'checkOriginal',{value:checkOriginal});Object.freeze(capsule);
 checkOriginal.call(capsule);return capsule;
}

// Fixed original-handle evaluation. A JSON/copy receiver has no original closure.
export function projectTerminalScriptWitness(capsule){
 if(!capsule||typeof capsule!=='object')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const d=Object.getOwnPropertyDescriptor(capsule,'checkOriginal');
 if(!Object.isFrozen(capsule)||!d||!('value'in d)||typeof d.value!=='function'||d.writable||d.configurable||d.enumerable)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 return Reflect.apply(d.value,capsule,[]);
}

// Fixed production host entry: custody evidence only, no arm/query dispatch.
export function inspectTerminalOriginalProvider(capsule){
 const check=Object.getOwnPropertyDescriptor(capsule,'checkOriginal');
 if(!Object.isFrozen(capsule)||!check||!('value'in check)||typeof check.value!=='function'||check.writable||check.configurable||check.enumerable)throw Error('TERMINAL_PROVIDER_RECEIVER');
 Reflect.apply(check.value,capsule,[]);
 const d=Object.getOwnPropertyDescriptor(capsule,'originalProvider');
 if(!d||!('value'in d)||d.writable||d.configurable||d.enumerable)throw Error('TERMINAL_PROVIDER_RECEIVER');
 const p=d.value,m=Object.getOwnPropertyDescriptor(p,'inspect');
 if(!Object.isFrozen(p)||!m||!('value'in m)||typeof m.value!=='function')throw Error('TERMINAL_PROVIDER_RECEIVER');
 const r=Reflect.apply(m.value,p,[]);
 return {providerRetained:true,creationArmed:r.armed,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false};
}

// Fixed private same-handle H0 entry. The argument is operational data in this
// realm, not the physical parent request/control and never native permission.
export function retainTerminalPrepareOnCapsule(capsule,input){
 const descriptor=Object.getOwnPropertyDescriptor,apply=Reflect.apply;
 const data=(object,key)=>{const d=descriptor(object,key);if(!d||!('value'in d))throw Error('TERMINAL_PROVIDER_REQUEST');return d.value};
 const check=data(capsule,'checkOriginal');apply(check,capsule,[]);
 if(!input||Reflect.ownKeys(input).length!==3||Object.getPrototypeOf(input)!==Object.prototype
   ||typeof data(input,'operationId')!=='string'||!data(input,'operationId')
   ||typeof data(input,'sessionId')!=='string'||!data(input,'sessionId')||data(input,'intent')!=='new_draft')throw Error('TERMINAL_PROVIDER_REQUEST');
 const provider=data(capsule,'originalProvider'),arm=data(provider,'arm');
 Object.freeze(input);const binding=apply(arm,provider,[input]);
 const retained=apply(data(binding,'inspect'),binding,[]);apply(check,capsule,[]);
 if(data(retained,'request')!==input||data(retained,'creation')!==undefined||data(retained,'task')!==undefined)throw Error('TERMINAL_PROVIDER_LATE');
 return Object.freeze({operationId:input.operationId,sessionId:input.sessionId,intent:input.intent,creationArmed:true,
  originalRequestRetained:true,queryDispatched:false,sourceExecutionQualified:false,closureIdentityQualified:false,nativeReceiversQualified:false,
  nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
}

// Only the fixed same-handle workspace continuation calls these phases. Never
// accept a replacement request, callback, proxy, reader or executable source.
export async function continueTerminalCreationOnCapsule(capsule,mode){
 const descriptor=Object.getOwnPropertyDescriptor,data=(object,key)=>{const d=descriptor(object,key);if(!d||!('value'in d))throw Error('TERMINAL_PROVIDER_RECEIVER');return d.value};
 Reflect.apply(data(capsule,'checkOriginal'),capsule,[]);
 const provider=data(capsule,'originalProvider'),result=Reflect.apply(data(provider,'continueCreation'),provider,[mode]);
 if(mode!=='query')return result;
 await result;
 return Object.freeze({queryCompleted:true,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
}
