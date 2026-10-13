// Fixed offline destination primitive. No host/runtime/IPC registration.
import {createHash,randomUUID} from 'node:crypto';
const lockHash='e321d140d5da0ef14ab24435e9a6562c1042f2e5f789424de6d1c3dfa2af23bd';
const dependencyHash='276d947e3958f6fb973e74eaeb76610fc50028fbae79e14feab8fea00052be8c';
const signalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const signalReason=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>Object.assign(Error(code),{code});
const keys=['page','context','gate','token','run','lease','generation','chat','operation','request','authorization','account','session','purpose','target','signal','deadline','destination'];
export function retainDestinationLockFixture(owner) {
 const original=Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(owner,k);if(!d||!('value'in d)||d.value==null)throw fail('DESTINATION_ORIGINAL_MISSING');return[k,d.value];}));
 // Native getters brand-check the original signal without consulting its
 // shadowable throwIfAborted property. Preserve preabort before validation.
 if(signalAborted.call(original.signal))throw signalReason.call(original.signal);
 const url=new URL(original.destination);
 if(original.purpose!=='resource68-destination-fixture-v1'||!Number.isSafeInteger(original.generation)||original.generation<1||original.page.context()!==original.context||original.page.url()!=='about:blank'||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/destination.html'||!Number.isSafeInteger(original.deadline))throw fail('DESTINATION_ORIGINAL_INVALID');
 let sessionCreation='not_started';
 let session,targetId,frameId,initialContext,defaultContext,breakpoint;
 let realmLost=false,pendingRealmRefusal;
 let installed=false,pending=0,first,held=false,disposal='not_started';
 let installPromise,navigationPromise,armPromise,boundaryPromise,readPromise,disposePromise,normalBreakpoint;
 let navigation='not_started',boundary='not_started',readState='not_started';
 let primitiveRoot,objectHandle,descriptorHandle,rootHandle,bgHandle,exportHandle,scopesHandle,scopeHandle;
 let armResumeState='not_started';
 let bootstrapAnchor,exportLocation,getterLocation;
 const utilityPauses=new Set();
 const utilityPromises=[];
 const group='resource68-destination-fixture-'+randomUUID(),scripts=[],contexts=[],trace=[],secondary=[];
 const hold=e=>{if(!held){first=e;held=true;}return first;};
 function guard(early=false) {
  if(disposal==='pending')throw fail('DESTINATION_DISPOSAL_PENDING');
  try {
   if(held)throw first;
   if(signalAborted.call(original.signal))throw signalReason.call(original.signal);
   if(Date.now()>=original.deadline)throw fail('DESTINATION_EXPIRED');
   if(disposal!=='not_started'||original.page.isClosed())throw fail('DESTINATION_RELEASED');
   for(const k of keys){const d=Object.getOwnPropertyDescriptor(owner,k);if(!d||!('value'in d)||d.value!==original[k])throw fail('DESTINATION_BINDING_CHANGED');}
   if(original.page.context()!==original.context)throw fail('DESTINATION_BINDING_CHANGED');
   if(realmLost)throw fail('DESTINATION_REALM_LOST');
   if(defaultContext!==undefined){
    const current=contexts.filter(c=>c.auxData?.isDefault&&c.auxData.frameId===frameId);
    if(current.length!==1||current[0].id!==defaultContext)throw fail('DESTINATION_REALM_LOST');
   }
   for(const k of ['pending','unknown','overlap']){const d=Object.getOwnPropertyDescriptor(original.gate,k);if(!d||!('value'in d)||d.value!==false)throw fail('DESTINATION_UNSETTLED');}
   const start=Object.getOwnPropertyDescriptor(original.gate,'started');
   if(!start||!('value'in start)||!start.writable)throw fail('DESTINATION_UNSETTLED');
   if(early&&(start.value!==0||original.page.url()!=='about:blank'))throw fail('DESTINATION_LATE_INSTALL');
  }catch(e){throw hold(e);}
 }
 async function query(method,params={}) {
  guard();pending++;
  try {const value=await session.send(method,params);guard();return value;}
  catch(e){throw hold(e);}finally{pending--;}
 }
 const props=id=>query('Runtime.getProperties',{objectId:id,ownProperties:true});
 function data(rows,name,type) {
  const matches=rows.result?.filter(r=>r.name===name);
  const d=matches?.length===1?matches[0]:undefined;
  if(!d||d.get||d.set||d.value?.type!==type||!d.value.objectId)throw fail('DESTINATION_DATA_HANDLE_MISSING');
  return d.value.objectId;
 }
 const location=p=>p.internalProperties?.find(r=>r.name==='[[FunctionLocation]]')?.value?.value;
 async function armBoundary(event) {
  const script=scripts.find(s=>s.scriptId===(event.data?.scriptId??event.callFrames[0]?.location.scriptId));
  const context=contexts.find(c=>c.id===script?.executionContextId);
  if(!script||script.url!==new URL('/__extends.js',url).href||!context?.auxData?.isDefault||context.auxData.frameId!==frameId||context.id===initialContext)throw hold(fail('DESTINATION_FIRST_SCRIPT_CHANGED'));
  if(hash((await query('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource)!==dependencyHash)throw hold(fail('DESTINATION_FIRST_SOURCE_CHANGED'));
  defaultContext=context.id;
  const point=await query('Debugger.setBreakpoint',{location:{scriptId:script.scriptId,lineNumber:0,columnNumber:0}});
  if(point.actualLocation.scriptId!==script.scriptId||point.actualLocation.lineNumber!==1||point.actualLocation.columnNumber!==16)throw hold(fail('DESTINATION_BOOTSTRAP_ANCHOR_CHANGED'));
  normalBreakpoint=point.breakpointId;bootstrapAnchor={...point.actualLocation};
  await query('Debugger.removeBreakpoint',{breakpointId:breakpoint});
  trace.push('fixed-bootstrap-entry-breakpoint-ack');
  armResumeState='pending';try{await query('Debugger.resume');armResumeState='confirmed';}catch(e){armResumeState='unknown';throw e;}
 }
 async function captureBoundary(event) {
  guard();pending++;
  try {
   if(navigation!=='pending'||!event.hitBreakpoints?.includes(normalBreakpoint)||!event.callFrames?.length)throw fail('DESTINATION_UNEXPECTED_PAUSE');
   const script=scripts.find(s=>s.scriptId===(event.data?.scriptId??event.callFrames[0].location.scriptId));
   const context=contexts.find(c=>c.id===script?.executionContextId);
   if(!script||script.url!==new URL('/__extends.js',url).href||!context?.auxData?.isDefault||context.auxData.frameId!==frameId||context.id===initialContext)throw fail('DESTINATION_FIRST_SCRIPT_CHANGED');
   if(hash((await query('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource)!==dependencyHash)throw fail('DESTINATION_FIRST_SOURCE_CHANGED');
   defaultContext=context.id;
   // Remove only this owned breakpoint while its FIRST script is still paused.
   await query('Debugger.removeBreakpoint',{breakpointId:normalBreakpoint});
   const evaluated=await query('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'this',objectGroup:group,returnByValue:false,silent:true});
   const root=evaluated.result;if(evaluated.exceptionDetails||root?.type!=='object'||!root.objectId)throw fail('DESTINATION_ROOT_MISSING');
   primitiveRoot=root.objectId;
   objectHandle=data(await props(primitiveRoot),'Object','function');
   const objects=await props(objectHandle);descriptorHandle=data(objects,'getOwnPropertyDescriptor','function');
   const primitive=await props(descriptorHandle),descriptor=objects.result.find(r=>r.name==='getOwnPropertyDescriptor').value;
   if(descriptor.description!=='function getOwnPropertyDescriptor() { [native code] }'||location(primitive)||primitive.internalProperties?.some(r=>r.name==='[[TargetFunction]]'))throw fail('DESTINATION_DESCRIPTOR_UNQUALIFIED');
   guard();trace.push('destination-native-primitive-before-lock-definition');
   await query('Debugger.resume');boundary='confirmed';trace.push('original-resume-ack');
  }catch(e){boundary='unknown';throw hold(e);}finally{pending--;}
 }
 guard(true);
 return Object.freeze({
  install() {
   if(disposal!=='not_started')throw fail(disposal==='pending'?'DESTINATION_DISPOSAL_PENDING':'DESTINATION_RELEASED');
   if(installPromise){if(installed)guard(true);return installPromise;}
   guard(true);pending++;
   installPromise=Promise.resolve().then(async()=>{
    sessionCreation='pending';try{session=await original.context.newCDPSession(original.page);sessionCreation='confirmed';}catch(e){sessionCreation='unknown';throw e;}guard(true);
    // Events invalidate continuity, but do not preempt an original pending
    // transport rejection. Its raw primary settles before secondary guards.
    const loseRealm=()=>{realmLost=true;};
    session.on('Runtime.executionContextCreated',e=>{
     contexts.push(e.context);
     if(defaultContext!==undefined&&e.context.auxData?.isDefault&&e.context.auxData.frameId===frameId&&e.context.id!==defaultContext)loseRealm();
    });
    session.on('Runtime.executionContextDestroyed',e=>{
     const index=contexts.findIndex(c=>c.id===e.executionContextId);if(index!==-1)contexts.splice(index,1);
     if(defaultContext!==undefined&&e.executionContextId===defaultContext)loseRealm();
    });
    session.on('Runtime.executionContextsCleared',()=>{contexts.length=0;if(defaultContext!==undefined)loseRealm();});
    session.on('Page.frameNavigated',e=>{if(defaultContext!==undefined&&e.frame.id===frameId)loseRealm();});
    session.on('Page.frameDetached',e=>{if(defaultContext!==undefined&&e.frameId===frameId)loseRealm();});
    session.on('Inspector.detached',()=>{if(defaultContext!==undefined)loseRealm();});
    session.on('Debugger.scriptParsed',e=>scripts.push(e));
    session.on('Debugger.paused',event=>{
     const script=scripts.find(s=>s.scriptId===(event.data?.scriptId??event.callFrames[0]?.location.scriptId));const context=contexts.find(c=>c.id===script?.executionContextId);
     
     if(event.reason==='instrumentation'&&context?.auxData?.isDefault===false&&/^__playwright_utility_world_page@[a-f0-9]{32}$/.test(context.name)&&script.url===''&&context.auxData.frameId===frameId&&navigation==='pending') {
      const key=context.id+':'+script.scriptId;if(utilityPauses.has(key)){hold(fail('DESTINATION_DUPLICATE_UTILITY_PAUSE'));return;}utilityPauses.add(key);
      const work=Promise.resolve().then(()=>query('Debugger.resume'));utilityPromises.push(work);work.catch(e=>hold(e));return;
     }
     if(event.reason==='instrumentation') {if(armPromise){hold(fail('DESTINATION_DUPLICATE_BOUNDARY'));return;}armPromise=armBoundary(event);armPromise.catch(e=>hold(e));return;}
     if(boundaryPromise){hold(fail('DESTINATION_DUPLICATE_BOUNDARY'));return;}
     boundary='pending';boundaryPromise=captureBoundary(event);boundaryPromise.catch(()=>{});
    });
    targetId=(await query('Target.getTargetInfo')).targetInfo.targetId;
    frameId=(await query('Page.getFrameTree')).frameTree.frame.id;
    await query('Page.enable');await query('Runtime.enable');await query('Debugger.enable');
    const initial=contexts.filter(c=>c.auxData?.isDefault&&c.auxData.frameId===frameId);
    if(initial.length!==1)throw fail('DESTINATION_INITIAL_CONTEXT_CHANGED');initialContext=initial[0].id;
    breakpoint=(await query('Debugger.setInstrumentationBreakpoint',{instrumentation:'beforeScriptExecution'})).breakpointId;
    guard(true);installed=true;trace.push('instrumentation-install-ack-before-goto');
   }).catch(e=>{throw hold(e);}).finally(()=>{pending--;});
   return installPromise;
  },
  navigate() {
   if(navigationPromise){if(navigation==='confirmed')guard();return navigationPromise;}
   guard(true);if(!installed||pending)throw fail('DESTINATION_INSTALL_REQUIRED');
   navigation='pending';original.gate.started=1;trace.push('original-first-goto');
   navigationPromise=Promise.resolve().then(async()=>{
    guard();await original.page.goto(original.destination,{waitUntil:'domcontentloaded',timeout:5000});
    guard();if(!armPromise||!boundaryPromise)throw fail('DESTINATION_BOUNDARY_MISSING');await armPromise;await boundaryPromise;
    if(boundary!=='confirmed')throw fail('DESTINATION_BOUNDARY_UNKNOWN');
    await Promise.all(utilityPromises);navigation='confirmed';trace.push('destination-navigation-complete');
   }).catch(e=>{navigation='unknown';throw hold(e);});
   return navigationPromise;
  },
  acquire() {
   if(arguments.length)throw fail('DESTINATION_EXTERNAL_INPUT_FORBIDDEN');
   if(readPromise){
    // Refuse new admission without committing a secondary ahead of the
    // original pending transport's raw rejection (including falsy reasons).
    if(readState==='pending'&&realmLost&&!held){
     if(!pendingRealmRefusal){pendingRealmRefusal=fail('DESTINATION_REALM_LOST');secondary.push(pendingRealmRefusal);}
     throw pendingRealmRefusal;
    }
    if(readState==='confirmed'||realmLost)guard();return readPromise;
   }
   guard();if(navigation!=='confirmed'||boundary!=='confirmed'||pending)throw fail('DESTINATION_NOT_READY');
   readState='pending';pending++;
   readPromise=Promise.resolve().then(async()=>{
    const target=await query('Target.getTargetInfo');if(target.targetInfo.targetId!==targetId)throw fail('DESTINATION_TARGET_CHANGED');
    const candidates=scripts.filter(s=>s.url===new URL('/fixed-Lock.js',url).href);
    if(candidates.length!==1||candidates[0].executionContextId!==defaultContext)throw fail('DESTINATION_LOCK_CONTEXT_CHANGED');
    const script=candidates[0];if(hash((await query('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource)!==lockHash)throw fail('DESTINATION_LOCK_SOURCE_CHANGED');
    const root=await query('Runtime.evaluate',{expression:'this',contextId:defaultContext,objectGroup:group,returnByValue:false,silent:true,disableBreaks:true});
    rootHandle=root.result?.objectId;if(!rootHandle)throw fail('DESTINATION_ROOT_MISSING');
    bgHandle=data(await props(rootHandle),'bg','object');exportHandle=data(await props(bgHandle),'LockDeferred','function');
    const fn=await props(exportHandle);exportLocation=location(fn);if(exportLocation?.scriptId!==script.scriptId||exportLocation.lineNumber!==463||exportLocation.columnNumber!==25)throw fail('DESTINATION_FUNCTION_CHANGED');
    scopesHandle=fn.internalProperties?.find(r=>r.name==='[[Scopes]]')?.value?.objectId;if(!scopesHandle)throw fail('DESTINATION_SCOPES_MISSING');
    const scopes=await props(scopesHandle);let found=0;
    for(const row of scopes.result??[]){
     if(!/^\d+$/.test(row.name)||!row.value?.objectId)continue;
     const lexical=await props(row.value.objectId);
     const getter=lexical.result?.filter(r=>r.name==='GetLockDeferredDefault');
     const cache=lexical.result?.filter(r=>r.name==='LockDeferredDefault');
     if(getter?.length!==1||cache?.length!==1)continue;
     if(getter[0].get||getter[0].set||getter[0].value?.type!=='function'||cache[0].get||cache[0].set||cache[0].value?.type!=='undefined')throw fail('DESTINATION_LEXICAL_CHANGED');
     getterLocation=location(await props(getter[0].value.objectId));if(getterLocation?.scriptId!==script.scriptId||getterLocation.lineNumber!==460||getterLocation.columnNumber!==35)throw fail('DESTINATION_LEXICAL_CHANGED');
     scopeHandle=row.value.objectId;found++;
    }
    if(found!==1)throw fail('DESTINATION_LEXICAL_MISSING');
    const matched=await query('Runtime.callFunctionOn',{objectId:descriptorHandle,arguments:[rootHandle,bgHandle,exportHandle,primitiveRoot].map(objectId=>({objectId})),functionDeclaration:'function(root,bg,exported,originalRoot){if(root!==originalRoot)return false;const r=this(root,"bg"),rv=r&&this(r,"value");if(!rv||rv.value!==bg)return false;const e=this(bg,"LockDeferred"),ev=e&&this(e,"value");return !!ev&&ev.value===exported}',returnByValue:true,silent:true});
    if(matched.exceptionDetails||matched.result?.value!==true)throw fail('DESTINATION_ATOMIC_BINDING_CHANGED');
    guard();readState='confirmed';return Object.freeze({firstContext:initialContext,destinationContext:defaultContext,target:targetId,sourceHash:lockHash,nativeProvider:false,openReadAuthority:false,bootstrapAnchor,exportLocation,getterLocation,trace:[...trace]});
   }).catch(e=>{readState='unknown';throw hold(e);}).finally(()=>{pending--;});
   return readPromise;
  },
  dispose() {
   if(disposePromise)return disposePromise;
   if(pending||navigation==='pending'||boundary==='pending')return Promise.reject(fail('DESTINATION_DISPOSAL_PENDING'));
   const originalSession=session,handles=[primitiveRoot,objectHandle,descriptorHandle,rootHandle,bgHandle,exportHandle,scopesHandle,scopeHandle].filter(Boolean);
   disposal='pending';pending++;
   disposePromise=Promise.resolve().then(async()=>{
    if(sessionCreation==='unknown'&&!originalSession)throw fail('DESTINATION_SESSION_UNKNOWN');
    if(originalSession){
     await originalSession.send('Runtime.releaseObjectGroup',{objectGroup:group});
     for(const objectId of handles){let lost=false;try{await originalSession.send('Runtime.getProperties',{objectId,ownProperties:true});}catch(e){if(String(e?.message).includes('Could not find object with given id'))lost=true;else throw e;}if(!lost)throw fail('DESTINATION_RELEASE_NOT_CONFIRMED');}
     await originalSession.detach();
    }
    disposal='confirmed';
   }).catch(e=>{disposal='unknown';secondary.push(e);throw hold(e);}).finally(()=>{pending--;});
   return disposePromise;
  },
  facts(){return{realmLost,armResumeState,sessionCreation,pending,held,first,secondary:[...secondary],installed,navigation,boundary,readState,disposal,bootstrapAnchor,exportLocation,getterLocation,trace:[...trace],firstContext:initialContext,destinationContext:defaultContext,nativeProvider:false,openReadAuthority:false};},
 });
}
