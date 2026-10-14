// Same-realm private provenance only. Never a native/Save/cleanup permission.
import {prepareWorkspace,workspacePreparationOptions} from './workspace.mjs';
const loads=new WeakMap(),initials=new WeakMap(),packets=new WeakMap();
const fail=code=>{throw Error('TERMINAL_PACKET_'+code)};
const data=(object,key)=>{
  for(let value=object;value;value=Object.getPrototypeOf(value)) {
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(descriptor){if(!('value' in descriptor))fail('ACCESSOR');return descriptor.value}
  }
  fail('MISSING_'+key);
};
const ownerKeys=['owner','run','lease','generation','chat','document','documentId','account',
  'session','operation','operationId','page','context','gate','signal','deadline','refusal','path'];
const nativeKeys=['currentUser','fileStorage','nativeSession'];
const safeKeys=['pending','running','unknown','writerPending','dirty','targetSelected'];
const originalMapGet=Map.prototype.get;
function retainReceiptReader(receipts) {
  const chain=[];
  for(let object=receipts;object;object=Object.getPrototypeOf(object)) {
    const descriptor=Object.getOwnPropertyDescriptor(object,'get');
    chain.push({object,prototype:Object.getPrototypeOf(object),descriptor});
    if(descriptor) {
      if(!('value' in descriptor)||descriptor.value!==originalMapGet)fail('RECEIPT_READER');
      break;
    }
  }
  if(!chain.at(-1)?.descriptor)fail('RECEIPT_READER');
  const reader=chain.at(-1).descriptor.value;
  const check=()=>{
    for(const entry of chain) {
      const descriptor=Object.getOwnPropertyDescriptor(entry.object,'get'),original=entry.descriptor;
      if(Object.getPrototypeOf(entry.object)!==entry.prototype
        ||(original?(!descriptor||!('value' in descriptor)||descriptor.value!==reader
          ||descriptor.writable!==original.writable||descriptor.enumerable!==original.enumerable
          ||descriptor.configurable!==original.configurable):descriptor!==undefined))fail('RECEIPT_READER');
    }
  };
  return {check,read:key=>{check();return Reflect.apply(reader,receipts,[key])}};
}
function take(object,keys){return Object.fromEntries(keys.map(key=>[key,data(object,key)]))}
function same(object,values){if(Object.keys(values).some(key=>!Object.is(data(object,key),values[key])))fail('REPLACED')}
function graph(objects){
  const edges=[];
  for(const object of objects) {
    if(!object||!['object','function'].includes(typeof object))fail('DEPENDENCY');
    const keys=Reflect.ownKeys(object);
    edges.push({object,prototype:Object.getPrototypeOf(object),keys,values:keys.map(key=>data(object,key))});
  }
  return ()=>{
    for(const edge of edges){
      const keys=Reflect.ownKeys(edge.object);
      if(Object.getPrototypeOf(edge.object)!==edge.prototype||keys.length!==edge.keys.length
        ||keys.some((key,index)=>key!==edge.keys[index]||!Object.is(data(edge.object,key),edge.values[index])))fail('DEPENDENCY');
    }
  };
}
export function captureTerminalLoadedExports(loaded) {
  const binding=take(loaded,['page','context','document','global','sourceInputs']);
  if(Object.values(binding).some(value=>!value))fail('LOAD_REQUIRED');
  const nativeGlobal=binding.global,rpc=data(nativeGlobal,'rpc'),bg=data(nativeGlobal,'bg'),bgRpc=data(bg,'rpc');
  if(data(nativeGlobal,'document')!==binding.document)fail('LOAD_DOCUMENT');
  const exports={ObjectProxy:data(rpc,'TBGObjectProxy'),FileStorage:data(bgRpc,'TIBGFileStorage_Proxy'),
    StreamPersistProxy:data(bgRpc,'TIBGStreamPersist_Proxy'),StreamPersist:data(bg,'IBGStreamPersist')};
  const definitions=Object.freeze({ObjectProxyPrototype:data(exports.ObjectProxy,'prototype'),
    FileStoragePrototype:data(exports.FileStorage,'prototype'),StreamPersistPrototype:data(exports.StreamPersistProxy,'prototype'),StreamPersist:exports.StreamPersist});
  const query=data(definitions.ObjectProxyPrototype,'QueryInterface');
  const methods=['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'];
  const functions=[query,...methods.map(name=>data(definitions.FileStoragePrototype,name)),data(definitions.StreamPersistPrototype,'SaveToStream')];
  const source=take(binding.sourceInputs,['rpc.js','bg.rtl.js','bg.rtl.rpc.js']);
  if(Object.values(source).some(value=>typeof value!=='string')||functions.some(fn=>typeof fn!=='function'))fail('DEFINING_EXPORT');
  if(!source['rpc.js'].includes(Function.prototype.toString.call(query))
    ||functions.slice(1).some(fn=>!source['bg.rtl.rpc.js'].includes(Function.prototype.toString.call(fn))))fail('DEFINING_SOURCE');
  const closures=Object.freeze({ss:data(nativeGlobal,'ss'),$rpc_GuidHelper:data(rpc,'GuidHelper'),
    $rpc_TBGMessageDynamicData:data(rpc,'TBGMessageDynamicData'),$rpc_TBGObjectProxy:exports.ObjectProxy,$rpc_HResult:data(rpc,'HResult')});
  const exportRefs={rpc,bg,bgRpc,...exports,...closures};
  const checkGraph=graph([...Object.values(definitions),...Object.values(exports),binding.sourceInputs,
    ...Object.values(closures),data(closures.ss,'Exception')]);
  const token=Object.freeze({});
  const check=()=>{same(loaded,binding);same(binding.sourceInputs,source);
    if(data(nativeGlobal,'document')!==binding.document)fail('DOCUMENT_REPLACED');
    if(data(nativeGlobal,'rpc')!==rpc||data(nativeGlobal,'bg')!==bg||data(bg,'rpc')!==bgRpc
      ||data(rpc,'TBGObjectProxy')!==exports.ObjectProxy||data(bgRpc,'TIBGFileStorage_Proxy')!==exports.FileStorage
      ||data(bgRpc,'TIBGStreamPersist_Proxy')!==exports.StreamPersistProxy||data(bg,'IBGStreamPersist')!==exports.StreamPersist
      ||data(nativeGlobal,'ss')!==closures.ss||data(rpc,'GuidHelper')!==closures.$rpc_GuidHelper
      ||data(rpc,'TBGMessageDynamicData')!==closures.$rpc_TBGMessageDynamicData||data(rpc,'HResult')!==closures.$rpc_HResult)fail('LOADED_EXPORT_REPLACED');
    checkGraph();};
  check();loads.set(token,{binding,definitions,source,exportRefs,check});return token;
}
function invocationCustody(invocation) {
  if(invocation===undefined)return ()=>{};
  const refs=take(invocation,['source','input','control']);
  const objects=[invocation,...Object.values(refs),data(refs.input,'compatibility')];
  const originals=objects.map(object=>({object,prototype:Object.getPrototypeOf(object),
    descriptors:Reflect.ownKeys(object).map(key=>{const d=Object.getOwnPropertyDescriptor(object,key);
      if(!('value' in d))fail('INVOCATION_ACCESSOR');return [key,d]})}));
  return ()=>{for(const {object,prototype,descriptors} of originals){
    const keys=Reflect.ownKeys(object);
    if(Object.getPrototypeOf(object)!==prototype||keys.length!==descriptors.length)fail('INVOCATION_REPLACED');
    descriptors.forEach(([key,original],index)=>{const d=Object.getOwnPropertyDescriptor(object,key);
      if(keys[index]!==key||!d||!('value' in d)||!Object.is(d.value,original.value)
        ||d.writable!==original.writable||d.enumerable!==original.enumerable||d.configurable!==original.configurable)
        fail('INVOCATION_REPLACED');});
  }};
}
export function captureTerminalInitialCustody({custody,native,loaded,preparation,invocation}) {
  const load=loads.get(loaded);if(!load)fail('LOAD_REQUIRED');load.check();
  const owner=take(custody,ownerKeys),nativeRefs=take(native,nativeKeys);
  if(Object.entries(owner).some(([key,value])=>!['refusal','path'].includes(key)&&(value===undefined||value===null))
    ||Object.values(nativeRefs).some(value=>!value)||!Number.isSafeInteger(owner.generation)
    ||owner.generation<0||!Number.isFinite(owner.deadline)
    ||owner.page!==load.binding.page||owner.context!==load.binding.context||owner.document!==load.binding.document)fail('INITIAL');
  const dependency=take(nativeRefs.nativeSession,['$M','$R','DispatchMessageAsync']);
  const pageMethods=take(owner.page,['url','evaluate','locator','goto','waitForTimeout']);
  if(Object.values(pageMethods).some(value=>typeof value!=='function'))fail('PAGE_METHOD');
  const originalUrl=pageMethods.url.call(owner.page);
  const messageMethod=data(dependency.$M,'GetDynamicData');
  if(typeof messageMethod!=='function')fail('DEPENDENCY');
  const preparationRefs=take(preparation,['document','id','receipts']);
  if(preparationRefs.document!==owner.document||preparationRefs.id!==owner.documentId)fail('INITIAL_PROVENANCE');
  const receiptReader=retainReceiptReader(preparationRefs.receipts);
  const prior=receiptReader.read(owner.operationId);
  if(prior&&(data(prior,'phase')!=='reserved'||Object.hasOwn(prior,'terminalOriginalCreation')))fail('LATE_INITIAL');
  const nativeBinding=nativeKeys.slice(0,2).map(key=>{
    const proxy=nativeRefs[key],identity=data(proxy,'$');
    if(data(proxy,'$S')!==nativeRefs.nativeSession)fail('FOREIGN_SESSION');
    const values=take(identity,['$OW','$O']);
    if(Object.values(values).some(value=>!Number.isInteger(value)||value<0))fail('DISCONNECTED');
    return {proxy,identity,values};
  });
  const checkInvocation=invocationCustody(invocation);
  const check=()=>{
    AbortSignal.prototype.throwIfAborted.call(owner.signal);
    if(data(owner.signal,'throwIfAborted')!==AbortSignal.prototype.throwIfAborted)fail('SIGNAL_METHOD');
    if(Date.now()>=owner.deadline)fail('DEADLINE');
    checkInvocation();
    same(custody,owner);same(native,nativeRefs);same(preparation,preparationRefs);receiptReader.check();load.check();same(nativeRefs.nativeSession,dependency);
    same(owner.page,pageMethods);if(pageMethods.url.call(owner.page)!==originalUrl)fail('PAGE_URL');
    if(data(dependency.$M,'GetDynamicData')!==messageMethod)fail('DEPENDENCY');
    for(const entry of nativeBinding){if(data(entry.proxy,'$')!==entry.identity||data(entry.proxy,'$S')!==nativeRefs.nativeSession)fail('FOREIGN_SESSION');same(entry.identity,entry.values)}
    if(safeKeys.some(key=>data(custody,key)!==false))fail('UNSETTLED');
  };
  check();const token=Object.freeze({});initials.set(token,{owner,nativeRefs,load,custody,preparation,prior,receiptReader,check});return token;
}
export function bindTerminalCreationPacket(initial,preparation,receipt) {
  const start=initials.get(initial);if(!start)fail('INITIAL');start.check();
  if(start.packet)fail('CREATION_REPLAY');
  if(start.completedReceipt!==receipt)fail('COMPLETION_REQUIRED');
  if(preparation!==start.preparation||start.prior&&receipt!==start.prior)fail('INITIAL_PROVENANCE');
  const creation=data(receipt,'terminalOriginalCreation');
  if(!Object.isFrozen(creation)||data(receipt,'phase')!=='verified'
    ||data(preparation,'document')!==start.owner.document||data(preparation,'id')!==start.owner.documentId
    ||start.receiptReader.read(start.owner.operationId)!==receipt)fail('CREATION');
  const values=take(creation,['document','documentId','request','operationId','sessionId','tab','packageNode',
    'packageProxy','connection','nativeSession','account','path']);
  if(values.document!==start.owner.document||values.documentId!==start.owner.documentId
    ||values.operationId!==start.owner.operationId||values.sessionId!==start.owner.session
    ||values.account!==start.owner.account||values.path!==start.owner.path||values.nativeSession!==start.nativeRefs.nativeSession
    ||!values.tab||!values.packageNode||!values.packageProxy||!values.connection)fail('FOREIGN_CREATION');
  const proxy=values.packageProxy,identity=data(proxy,'$'),proxyIds=take(identity,['$OW','$O']);
  if(Object.values(proxyIds).some(value=>!Number.isInteger(value)||value<0))fail('DISCONNECTED');
  const proxyDependencies=take(proxy,['$II','$GetProxyMetaClass']);
  if(data(proxy,'$S')!==values.nativeSession)fail('FOREIGN_SESSION');
  // Realm capsule records the verified application backing fields. Never
  // invoke public Session/UserName getters or treat UI CurrentUser as a receiver.
  const realmDescriptor=Object.getOwnPropertyDescriptor(preparation,'terminalOriginalRealm');
  if(realmDescriptor&&!('value' in realmDescriptor))fail('ACCESSOR');
  const realm=realmDescriptor?.value;
  if(realm&&(data(realm,'connection')!==values.connection||data(realm,'nativeSession')!==values.nativeSession
    ||data(realm,'fileStorage')!==start.nativeRefs.fileStorage||data(realm,'account')!==values.account))fail('FOREIGN_CREATION');
  if(realm&&Object.hasOwn(realm,'user')&&data(realm,'user')!==start.nativeRefs.currentUser)fail('FOREIGN_CREATION');
  const original=Object.freeze({...start.owner,...start.nativeRefs,tab:values.tab,
    packageNode:values.packageNode,packageProxy:proxy,path:values.path});
  const check=()=>{
    start.check();
    if(data(receipt,'terminalOriginalCreation')!==creation||data(receipt,'phase')!=='verified'
      ||data(receipt,'tab')!==values.tab||data(receipt,'packageNode')!==values.packageNode
      ||data(receipt,'request')!==values.request||data(preparation,'document')!==values.document
      ||data(preparation,'id')!==values.documentId||start.receiptReader.read(values.operationId)!==receipt)fail('CREATION_REPLACED');
    same(creation,values);
    if(realm){
      if(data(preparation,'terminalOriginalRealm')!==realm
        ||data(values.connection,'FSession')!==data(realm,'applicationSession')
        ||data(data(realm,'applicationSession'),'$S')!==values.nativeSession
        ||data(values.connection,'FUsername')!==values.account
        ||data(data(realm,'urlUtils'),'FFileStorage')!==start.nativeRefs.fileStorage)fail('NATIVE_REPLACED');
      if(Object.hasOwn(realm,'user')){
        const publisher=data(realm,'userPublisher'),inspect=data(realm,'userPublisherInspect');
        if(data(publisher,'inspect')!==inspect)fail('NATIVE_REPLACED');
        const held=Reflect.apply(inspect,publisher,[]);
        if(data(held,'document')!==values.document||data(held,'user')!==start.nativeRefs.currentUser
          ||data(held,'task')!==data(realm,'userTask')||data(held,'receiver')!==data(realm,'userReceiver')
          ||data(held,'originalSet')!==data(realm,'originalUserSet')
          ||data(held,'originalInit')!==data(realm,'originalUserInit'))fail('NATIVE_REPLACED');
        if(Object.hasOwn(realm,'userAcquisitionTask')){const acquisition=data(held,'acquisition');
          if(!acquisition||data(acquisition,'task')!==data(realm,'userAcquisitionTask')
            ||data(acquisition,'receiver')!==data(realm,'userAcquisitionReceiver')
            ||data(acquisition,'session')!==data(realm,'userAcquisitionSession')
            ||data(acquisition,'originalGet')!==data(realm,'originalUserGet')
            ||data(acquisition,'user')!==start.nativeRefs.currentUser)fail('NATIVE_REPLACED');
          if(Object.hasOwn(realm,'userRpcTask')){const lower=data(acquisition,'lower');
            if(data(acquisition,'rpcCompletionVerified')!==true||!lower
              ||data(lower,'task')!==data(realm,'userRpcTask')||data(lower,'dispatchTask')!==data(realm,'userDispatchTask')
              ||data(lower,'response')!==data(realm,'userResponse')||data(lower,'method')!==data(realm,'userRpcMethod')
              ||data(lower,'originalContinuation')!==data(realm,'userRpcContinuation')
              ||data(lower,'user')!==start.nativeRefs.currentUser||data(lower,'type')!==703)fail('NATIVE_REPLACED');
          }
        }
      }
      for(const slot of data(realm,'slots')){
        let effective=slot.object;for(const member of slot.chain){
          if(effective!==member)fail('NATIVE_REPLACED');
          if(Object.hasOwn(effective,slot.key))break;effective=Object.getPrototypeOf(effective);
        }
        if(effective!==slot.owner)fail('NATIVE_REPLACED');
        const d=Object.getOwnPropertyDescriptor(effective,slot.key);
        if(Object.getPrototypeOf(slot.object)!==slot.prototype||!d||!('value' in d)
          ||!Object.is(d.value,slot.value)||d.writable!==slot.writable
          ||d.enumerable!==slot.enumerable||d.configurable!==slot.configurable)fail('NATIVE_REPLACED');}
    }else if(data(values.connection,'Session')!==values.nativeSession||data(values.connection,'UserName')!==values.account)fail('NATIVE_REPLACED');
    if(data(values.packageNode,'Package')!==proxy||data(proxy,'$')!==identity
      ||data(proxy,'$S')!==values.nativeSession)fail('NATIVE_REPLACED');
    const rawPath=data(values.packageNode,'PackageFileName');
    const path=typeof rawPath==='string'&&rawPath?'/'+rawPath.replaceAll('\\','/').replace(/^\/+/, ''):null;
    if(path!==values.path)fail('PATH');same(identity,proxyIds);same(proxy,proxyDependencies);
  };
  check();const token=Object.freeze({});packets.set(token,{original,start,check,tasks:new Map()});start.packet=token;return token;
}
export function checkTerminalInitialCustody(initial,page) {
  const entry=initials.get(initial);if(!entry||entry.owner.page!==page)fail('INITIAL');entry.check();
}
export function terminalInitialDeadline(initial,page) {
  checkTerminalInitialCustody(initial,page);return initials.get(initial).owner.deadline;
}
export function terminalInitialAccount(initial,page) {
  checkTerminalInitialCustody(initial,page);return initials.get(initial).owner.account;
}
export async function prepareTerminalOriginalPacket(initial,input) {
  const entry=initials.get(initial);if(!entry)fail('INITIAL');
  try{entry.check()}catch(error){if(entry.preparationRejected)return entry.preparing;throw error}
  const options=workspacePreparationOptions(input);
  if(options.sessionId!==entry.owner.session||options.operationId!==entry.owner.operationId
    ||options.intent!=='new_draft'||options.allowTestLogin||options.recoverOnly)fail('PREPARATION_IDENTITY');
  const request=JSON.stringify(options);
  if(entry.preparing){if(entry.preparationRequest!==request)fail('PREPARATION_REPLAY');return entry.preparing}
  entry.preparationRequest=request;
  entry.preparing=Promise.resolve().then(async()=>{
    entry.check();const prepared=await prepareWorkspace(entry.owner.page,options,initial);entry.check();
    if(prepared.status!=='READY'||prepared.document_id!==entry.owner.documentId||prepared.loginom_account!==entry.owner.account)fail('PREPARATION');
    const receipt=entry.receiptReader.read(entry.owner.operationId);
    entry.completedReceipt=receipt;
    return bindTerminalCreationPacket(initial,entry.preparation,receipt);
  }).catch(error=>{entry.preparationRejected=true;throw error});
  return entry.preparing;
}
export function terminalPacketArguments(packet) {
  const entry=packets.get(packet);if(!entry)fail('PACKET');entry.check();
  return {packet,original:entry.original,current:()=>{
    entry.check();return {...entry.original,...take(entry.start.custody,safeKeys)};
  },definitions:entry.start.load.definitions,sourceInputs:entry.start.load.binding.sourceInputs,
    signal:entry.original.signal,deadline:entry.original.deadline};
}
export function checkTerminalOriginalPacket(packet,original,scope) {
  const entry=packets.get(packet);if(!entry||entry.original!==original)fail('PACKET');entry.check();
  if(scope!==undefined){if(entry.scope&&entry.scope!==scope)fail('COMPONENT_REPLAY');entry.scope=scope}
  for(const retained of entry.tasks.values())if(retained.task
    &&(data(retained.task,'continueWith')!==retained.continueWith||data(retained.task,'getAwaitedResult')!==retained.getAwaitedResult))fail('TASK_REPLACED');
}
function callOriginalTask(packet,entry,name,receiver,method,args) {
  if(entry.tasks.has(name))return entry.tasks.get(name).promise;
  checkTerminalOriginalPacket(packet,entry.original);
  // Store the operation before invoking the retained original method; no replay.
  let resolve,reject;const retained={promise:new Promise((ok,no)=>{resolve=ok;reject=no})};entry.tasks.set(name,retained);
  let completed=false;
  try {
    const task=method.apply(receiver,args);retained.task=task;
    retained.continueWith=data(task,'continueWith');retained.getAwaitedResult=data(task,'getAwaitedResult');
    if(typeof retained.continueWith!=='function'||typeof retained.getAwaitedResult!=='function')fail('TASK_REQUIRED');
    checkTerminalOriginalPacket(packet,entry.original);
    retained.continueWith.call(task,()=>{
      if(completed)return;completed=true;
      try {
        // Raw original task failure remains primary even if custody drifted.
        const support=retained.getAwaitedResult.call(task);
        checkTerminalOriginalPacket(packet,entry.original);
        retained.result=support;resolve(support);
      } catch(error){reject(error)}
    });
  } catch(error){completed=true;reject(error)}
  return retained.promise;
}
export function queryTerminalOriginalPacket(packet,query,type) {
  const entry=packets.get(packet);if(!entry)fail('PACKET');
  const definitions=entry.start.load.definitions;
  if(query!==data(definitions.ObjectProxyPrototype,'QueryInterface')||type!==definitions.StreamPersist)fail('QUERY');
  return callOriginalTask(packet,entry,'QueryInterface',entry.original.packageProxy,query,[type]);
}
export function readTerminalOriginalPacket(packet,name) {
  const entry=packets.get(packet);if(!entry)fail('PACKET');
  if(!['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'].includes(name))fail('READ_METHOD');
  const method=data(entry.start.load.definitions.FileStoragePrototype,name);
  return callOriginalTask(packet,entry,name,entry.original.fileStorage,method,[]);
}
