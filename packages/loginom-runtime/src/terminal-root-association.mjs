import {terminalManagedCallForBridge} from './terminal-managed-call.mjs';
// Original private IPC births only. Wire evidence is never the physical parent signal.
const roots=new WeakMap(),calls=new WeakMap(),replays=new WeakMap(),cancelled=new WeakMap();
const data=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return d.value};
function snapshot(o,seen=new Set()){if(seen.has(o))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');seen.add(o);const prototype=Object.getPrototypeOf(o),keys=Reflect.ownKeys(o),entries=keys.map(k=>[k,Object.getOwnPropertyDescriptor(o,k)]);if(entries.some(([,d])=>!('value'in d)))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');const children=entries.filter(([,d])=>d.value&&typeof d.value==='object').map(([,d])=>snapshot(d.value,seen));return()=>{children.forEach(check=>check());if(Object.getPrototypeOf(o)!==prototype||Reflect.ownKeys(o).length!==keys.length||entries.some(([k,d])=>{const v=Object.getOwnPropertyDescriptor(o,k);return !v||!('value'in v)||v.value!==d.value||v.writable!==d.writable||v.configurable!==d.configurable||v.enumerable!==d.enumerable}))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')}}
export function receiveManagedRootStart(message,state,parentPid=process.ppid,childPid=process.pid){
 if(!Object.hasOwn(message,'rootOrigin'))return;
 if(roots.has(state))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');const wire=data(message,'rootOrigin'),input=data(message,'input');
 if(data(message,'operation')!=='start'||data(wire,'hostPid')!==parentPid||data(wire,'childPid')!==childPid||data(wire,'generation')!==data(input,'generation')||data(wire,'chat')!==data(input,'chat')||!Number.isSafeInteger(data(wire,'deadline'))||typeof data(wire,'originId')!=='string')throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');
 const checkMessage=snapshot(message),checkWire=snapshot(wire),peer=Object.freeze({message,wire,guard(){checkMessage();checkWire();if(roots.get(state)!==peer)throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED')}});roots.set(state,peer);replays.set(peer,new Set());return peer;
}
export function receiveManagedRootCall(message,state){
 const peer=roots.get(state);if(!peer){if(Object.hasOwn(message,'rootOrigin'))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');return}
 peer.guard();const wire=data(message,'rootOrigin');
 if(['originId','deadline','parentPid','hostPid','childPid','generation','chat'].some(k=>data(wire,k)!==data(peer.wire,k))||data(wire,'requestId')!==data(message,'id')||typeof data(wire,'parentRequestId')!=='string')throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');
 const operation=data(message,'operation'),seen=replays.get(peer);if(seen.has(wire.parentRequestId)||seen.has(wire.requestId))throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');seen.add(wire.parentRequestId);seen.add(wire.requestId);
 if(operation==='interrupt'&&wire.aborted)cancelled.set(peer,{value:decodeRootRejection(wire.rejection)});
 const checkMessage=snapshot(message),checkWire=snapshot(wire),record=Object.freeze({peer,wire,guard(){if(operation==='call'&&cancelled.has(peer))throw cancelled.get(peer).value;peer.guard();checkMessage();checkWire();if(calls.get(message)!==record)throw Error('LOGINOM_ORIGINAL_ASSOCIATION_CHANGED');if(data(message,'operation')==='call'&&Date.now()>=wire.deadline)throw Error('LOGINOM_ORIGINAL_RUN_EXPIRED')}});calls.set(message,record);record.guard();return record;
}
export function managedRootCall(message){return calls.get(message)}
export function decodeRootRejection(value){if(value.kind==='Error'){const e=new Error(value.message,'cause'in value?{cause:decodeRootRejection(value.cause)}:undefined);e.name=value.name;return e}return value.is_undefined?undefined:value.value}

// Private original startup lookup; copies/JSON are not retained members.
export function managedRootStartup(message,state){
 const peer=roots.get(state);if(!peer||peer.message!==message)throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE');
 return Object.freeze({peer,guard(){if(cancelled.has(peer))throw cancelled.get(peer).value;if(Date.now()>=data(peer.wire,'deadline'))throw Error('LOGINOM_ORIGINAL_RUN_EXPIRED');peer.guard()}});
}

// Fixed load-purpose custody only. No source bytes/native/Save/Close permission.
const startups=new WeakMap(),owners=new WeakMap(),ownerPeers=new WeakMap();
const fail=()=>{throw Error('LOGINOM_ORIGINAL_LOAD_CHANGED')};
const loadData=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))fail();return d.value};
function slot(object,key,checks){
 const chain=[];let owner,d;
 for(let p=object;p;p=Object.getPrototypeOf(p)){chain.push([p,Object.getPrototypeOf(p)]);d=Object.getOwnPropertyDescriptor(p,key);if(d){owner=p;break}}
 if(!d||!('value'in d))fail();
 checks.push(()=>{let p=object;for(const[original,parent]of chain){if(p!==original||Object.getPrototypeOf(p)!==parent)fail();if(Object.hasOwn(p,key))break;p=Object.getPrototypeOf(p)}
  const now=Object.getOwnPropertyDescriptor(p,key);if(p!==owner||!now||Reflect.ownKeys(d).some(k=>!Object.is(now[k],d[k])))fail()});return d.value;
}
export function retainTerminalSourceStartup(message,state){
 const wire=Object.getOwnPropertyDescriptor(message,'rootOrigin');
 if(!wire)return;
 if(!('value'in wire))fail();const purposeDescriptor=Object.getOwnPropertyDescriptor(wire.value,'loadPurpose');if(!purposeDescriptor)return;
 if(!('value'in purposeDescriptor))fail();
 const input=loadData(message,'input'),original=managedRootStartup(message,state),purpose=purposeDescriptor.value,capture=loadData(input,'acceptanceCapture');
 if(startups.has(state)||loadData(purpose,'purpose')!=='sorting-terminal-source-v1'||loadData(purpose,'harness')!=='sorting-before-close-v1'
   ||loadData(input,'validation')===true||loadData(input,'chat')==='readiness')fail();
 const keys=Reflect.ownKeys(capture);if(Reflect.ownKeys(purpose).length!==keys.length+1||keys.some(k=>loadData(purpose,k)!==loadData(capture,k)))fail();
 if(loadData(capture,'generation')!==loadData(input,'generation')||loadData(capture,'chat')!==loadData(input,'chat')
   ||loadData(capture,'account')!==loadData(loadData(input,'connection'),'username'))fail();
 const captureExpires=loadData(capture,'expires');if(!Number.isSafeInteger(captureExpires))fail();
 const checks=[];let owner,profile,context,page,methods,primary,initTask,initStarted=false,initSettled=false,browserAdmitted=false,navigationStarted=false;
 const remember=value=>{primary??={value};return primary.value};
 const facts=Object.freeze({originId:loadData(original.peer.wire,'originId'),deadline:loadData(original.peer.wire,'deadline'),
  parentSignalSameReference:false,loadPurpose:'sorting-terminal-source-v1',sourceBytesVerified:false,
  nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
 const token=Object.freeze({facts,
  guard(){if(primary)throw primary.value;original.guard();if(Date.now()>=captureExpires)throw Error('LOGINOM_ORIGINAL_LOAD_EXPIRED');if(startups.get(state)!==token)fail();for(const check of checks)check();sourceRoutes.get(owner)?.check();sourceWitnesses.get(owner)?.check()},
  reject(error){return remember(error)},
  async observed(work){let value;try{value=await work}catch(error){throw remember(error)}if(work===initTask)initSettled=true;token.guard();return value},
  bindOwner(value,originalProfile){token.guard();if(typeof originalProfile!=='string'||owner||loadData(state,'startupOwner')!==value||owners.has(value))fail();profile=originalProfile;owner=value;
   slot(state,'startupOwner',checks);for(const key of ['directory','generation','chat'])slot(owner,key,checks);
   if(loadData(owner,'generation')!==loadData(input,'generation')||loadData(owner,'chat')!==loadData(input,'chat'))fail();owners.set(owner,token);ownerPeers.set(owner,original.peer);token.guard()},
  admitBrowser(value,candidate,actualProfile){token.guard();if(browserAdmitted||value!==owner||actualProfile!==profile||candidate!==loadData(input,'connection')
    ||loadData(owner,'account')!==loadData(capture,'account'))fail();for(const key of ['id','account','origin'])slot(owner,key,checks);token.guard();browserAdmitted=true},
  bindContext(value){token.guard();if(context||loadData(owner,'context')!==value)fail();context=value;slot(owner,'context',checks);
   methods=Object.fromEntries(['pages','newPage','addInitScript'].map(key=>{const value=slot(context,key,checks);if(typeof value!=='function')fail();return[key,value]}));token.guard()},
  contextCall(key,args=[]){token.guard();if(!Object.hasOwn(methods,key)||key==='addInitScript')fail();return Reflect.apply(methods[key],context,args)},
  bindPage(value){token.guard();if(page||loadData(owner,'page')!==value)fail();page=value;slot(owner,'page',checks);
   for(const key of ['goto','evaluate','locator'])if(typeof slot(page,key,checks)!=='function')fail();
   // The selected SDK evaluator (or absence) belongs to the original Page birth,
   // before addInitScript/goto. A later method cannot become the initial reader.
   let d;for(let p=page;p;p=Object.getPrototypeOf(p)){d=Object.getOwnPropertyDescriptor(p,'evaluateHandle');if(d)break}
   if(d){if(typeof slot(page,'evaluateHandle',checks)!=='function')fail()}
   else{const chain=[];for(let p=page;p;p=Object.getPrototypeOf(p))chain.push([p,Object.getPrototypeOf(p)]);
    checks.push(()=>{let p=page;for(const[value,parent]of chain){if(p!==value||Object.getPrototypeOf(p)!==parent||Object.hasOwn(p,'evaluateHandle'))fail();p=Object.getPrototypeOf(p)}})}
   token.guard()},
  init(content){token.guard();if(initStarted||!page||typeof content!=='string'||(sourceRoutes.has(owner)&&!sourceRoutes.get(owner).ready()))fail();initStarted=true;
   try{initTask=Reflect.apply(methods.addInitScript,context,[{content}]);return initTask}catch(error){throw remember(error)}},
  admitPage(value,candidate){token.guard();if(value!==page||candidate!==loadData(input,'connection')||!initStarted||!initTask||!initSettled||navigationStarted)fail();navigationStarted=true},
  inspect(){return Object.freeze({owner,profile,context,page,initTask,initStarted,initSettled,browserAdmitted,navigationStarted,facts,sourceResponses:sourceRoutes.get(owner)?.inspect(),scriptWitness:sourceWitnesses.get(owner)?.inspect()})},
 });
 startups.set(state,token);token.guard();return token;
}
export function terminalSourceForOwner(owner){return owners.get(owner)}
// Only the original received call from this owner's startup peer can consume
// its load. Equal wire IDs, copies and another startup's Page do not bind it.
export function terminalSourceForManagedCall(owner,message){
 const call=calls.get(message),load=owners.get(owner);
 if(!call||!load||ownerPeers.get(owner)!==call.peer)throw Error('LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE');
 call.guard();load.guard();return load;
}

// Fixed accepted static inputs; hashes never claim actual execution or closures.
const sourceResponsePins=Object.freeze([
 [
  "https://app.loginom.ai/app/bg/app/Application.js",
  45243,
  "1b922bfff58f5d71ab08bc25b3198da17ae2a4d2a7ce4c034265aca9de15bc78"
 ],
 [
  "https://app.loginom.ai/app/bg/ts/BG_Interfaces.js",
  13573,
  "86dffca2aff50fbc2a272139c63e8302d81d6dffcd7cd753c071453ac8fd6fbb"
 ],
 [
  "https://app.loginom.ai/app/bg/app/Client.js",
  7856,
  "197b1efbee4aa846bdb91a15cc25b025181c35166da2f2c1408c071480873ee1"
 ],
 [
  "https://app.loginom.ai/app/bg/ts/CustomClient.js",
  9592,
  "feb12b9040f155e581531b9796066de0c2fc65d23cfaa19fcbb7028af27e58de"
 ],
 [
  "https://app.loginom.ai/app/bg/lib/Loader.js",
  14073,
  "543fc4c07ef270ab55f1055fcaf97f8f471d308a0877a3b3aef029ac0fa61f3b"
 ],
 [
  "https://app.loginom.ai/app/bg/app/MainForm.js",
  112459,
  "d0b2324d7162816d675e52adc5a5674b46b635d516157ced799ea33690a3c42e"
 ],
 [
  "https://app.loginom.ai/app/bg/app/MapTree.js",
  252920,
  "5ff56cec4f2111534c4c7b04233d3f79c044ec4372d691d79612a11bb98f822b"
 ],
 [
  "https://app.loginom.ai/app/bg/app/ServerConnection.js",
  16418,
  "4c8203aa04050c45f55f2dfec76ef65d93b056a9cbe092419a9bbea821e0c5a6"
 ],
 [
  "https://app.loginom.ai/app/bg/app/User.js",
  4083,
  "884660d99890c59fa5a54f2b245255df98b8aff20a5106c1c2fdaa33723888ea"
 ],
 [
  "https://app.loginom.ai/app/bg/app/Uses.js",
  5070,
  "2b8598cddfd5f224b9e75806c9ba475cf1ff2ed6c37b599feb5b035be9a3dfb8"
 ],
 [
  "https://app.loginom.ai/app/bg/app/Version.js",
  2090,
  "10d0272c12fac8be8ee8a673273601d6c8ac89ee49e48344bbca420b87126a5e"
 ],
 [
  "https://app.loginom.ai/app/app.js",
  227,
  "4190d2937a41a610a6653bc9ac6632fc1bc06d568a46ace8ceb086382f4bbdd1"
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.rtl.js",
  619372,
  "052ec6039e68de03f2e34fea56c3e3ed8b7b0dddadb03281ff8d9a816e6e5dc9"
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.rtl.rpc.js",
  4418862,
  "11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973"
 ],
 [
  "https://app.loginom.ai/app/bg/js/rpc.js",
  296240,
  "afeb91811a02da1f7841fb8c03e3003686c98a051f09186af082a3c44a12b4cc"
 ],
 [
  "https://app.loginom.ai/app/bg/js/mscorlib.js",
  114158,
  "9b2b59bb2f7d3765526c3530e752fe8aeef57360a7bdafb39c6eb8468f7ee555"
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.mscorlib.js",
  38176,
  "a5b62e7dff9920b13b02b9affad6995316df6c6ae191fc078648a987950c4550"
 ],
 [
  "https://app.loginom.ai/app/bg/js/Task.js",
  3494,
  "3dd8c5dbd20e1e45978a0d127c852bf5920fb2d00a87f13270ea0b9d3505726b"
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.model.js",
  749000,
  "d3ab87a3aca82985d41a8b9d4b3502c9d8d662204c67c07fb3ff2156d802407a"
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.model.rpc.js",
  5094119,
  "53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f"
 ]
,
["https://app.loginom.ai/app/bg/js/BitConverter.js", 22125, "03f051286c276608da7023ed91cc9ef5c3d61fcca69f75de390d4b72005f8100"],
["https://app.loginom.ai/app/bg/ts/Int64.js", 31482, "d47df699ab466c0ca77c355db6f3708ffc84fc15abc839a22f22b5aaaeccbc89"],
["https://app.loginom.ai/app/bg/ts/SysUtils.js", 24933, "d9c9e13ec69d4676d41a661855c18e19bfb0c928a39d8c550435f18631362bd4"]
].map(row=>Object.freeze(row)));

const sourceRoutes=new WeakMap();
// Only the fixed admitted login path calls this; neither pins nor callbacks are inputs.
export async function prepareTerminalSourceResponses(owner){
 const load=terminalSourceForOwner(owner);if(!load)throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE');
 load.guard();const original=load.inspect(),page=original.page;
 if(!original.browserAdmitted||!page||original.initStarted||original.navigationStarted||sourceRoutes.has(owner))fail();
 const checks=[],retained=[];let installed=false,routeTask;
 const guard=()=>load.guard();
 const hold=(object,key)=>{
  let cursor=object,descriptor;const chain=[];
  while(cursor){chain.push([cursor,Object.getPrototypeOf(cursor)]);descriptor=Object.getOwnPropertyDescriptor(cursor,key);if(descriptor)break;cursor=Object.getPrototypeOf(cursor)}
  if(!descriptor||!('value'in descriptor)||typeof descriptor.value!=='function')fail();
  const method=descriptor.value,definer=cursor;
  checks.push(()=>{let now=object;for(const[value,parent]of chain){if(now!==value||Object.getPrototypeOf(now)!==parent)fail();if(Object.hasOwn(now,key))break;now=Object.getPrototypeOf(now)}
   const current=Object.getOwnPropertyDescriptor(now,key);if(now!==definer||!current||Reflect.ownKeys(descriptor).some(k=>!Object.is(current[k],descriptor[k])))fail()});
  return(...args)=>Reflect.apply(method,object,args);
 };
 const route=hold(page,'route'),mainFrame=hold(page,'mainFrame'),frame=mainFrame();
 const expected=new Map(sourceResponsePins.map(([url,bytes,sha256])=>[url,{bytes,sha256}])),seen=new Set();
 const pattern=new RegExp('^https://app\\.loginom\\.ai/app/(?:'+sourceResponsePins.map(([url])=>new URL(url).pathname.slice(5).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?:[?#].*)?$');
 const receipt=Object.freeze({
  ready(){return installed},
  check(){for(const check of checks)check()},
  inspect(){return Object.freeze({installed,routeTask,records:Object.freeze(retained.filter(r=>r.phase==='fulfilled').map(r=>r.receipt)),responseBytesComplete:sourceResponsePins.slice(0,20).every(([url])=>retained.some(r=>r.phase==='fulfilled'&&r.receipt.pinUrl===url)),extraResponseBytesComplete:sourceResponsePins.slice(20).every(([url])=>retained.some(r=>r.phase==='fulfilled'&&r.receipt.pinUrl===url)),sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false})},
 });
 sourceRoutes.set(owner,receipt);
 async function handle(routeObject){
  let abort;
  try{
   guard();if(!installed)fail();
   const request=hold(routeObject,'request')(),fetch=hold(routeObject,'fetch'),fulfill=hold(routeObject,'fulfill');abort=hold(routeObject,'abort');
   const urlReader=hold(request,'url'),method=hold(request,'method'),type=hold(request,'resourceType'),requestFrame=hold(request,'frame');
   const url=urlReader(),parsed=new URL(url);
   if(parsed.hash||(parsed.search&&!/^\?_dc=\d+$/.test(parsed.search)))fail();
   const pinUrl=parsed.origin+parsed.pathname,pin=expected.get(pinUrl);
   if(!pin||method()!=='GET'||type()!=='script'||requestFrame()!==frame||mainFrame()!==frame||seen.has(pinUrl))fail();seen.add(pinUrl);
   checks.push(()=>{if(urlReader()!==url||method()!=='GET'||type()!=='script'||requestFrame()!==frame||mainFrame()!==frame)fail()});guard();
   const record={phase:'fetch',receipt:undefined};retained.push(record);
   const fetchTask=fetch({maxRedirects:0,maxRetries:0,timeout:Math.min(60000,load.facts.deadline-Date.now())});
   const response=await load.observed(fetchTask),status=hold(response,'status'),responseUrl=hold(response,'url'),headers=hold(response,'headers'),bodyReader=hold(response,'body');
   if(status()!==200||responseUrl()!==url||urlReader()!==url||requestFrame()!==frame)fail();
   const headerValues=headers(),headerEntries=Reflect.ownKeys(headerValues).map(k=>[k,Object.getOwnPropertyDescriptor(headerValues,k)]);
   if(headerEntries.some(([k,d])=>typeof k!=='string'||!d||!('value'in d)||typeof d.value!=='string'))fail();
   const copiedHeaders=Object.fromEntries(headerEntries.map(([k,d])=>[k.toLowerCase(),d.value]));
   if(!/^(?:application|text)\/(?:javascript|ecmascript)(?:\s*;|$)/i.test(copiedHeaders['content-type']??''))fail();
   const bodyTask=bodyReader(),body=await load.observed(bodyTask);
   if(!Buffer.isBuffer(body)||body.length!==pin.bytes)fail();
   // A private copy prevents mutation of a returned SDK buffer from changing delivered bytes.
   const delivered=Buffer.from(body),digestTask=crypto.subtle.digest('SHA-256',delivered),digest=await load.observed(digestTask);
   if(Buffer.from(digest).toString('hex')!==pin.sha256)fail();
   if(responseUrl()!==url||status()!==200||urlReader()!==url||requestFrame()!==frame||mainFrame()!==frame)fail();
   delete copiedHeaders['content-encoding'];delete copiedHeaders['content-length'];delete copiedHeaders['transfer-encoding'];
   record.phase='fulfill';
   const fulfillTask=fulfill({response,body:delivered,headers:copiedHeaders});await load.observed(fulfillTask);
   const finalDigest=await load.observed(crypto.subtle.digest('SHA-256',delivered));if(Buffer.from(finalDigest).toString('hex')!==pin.sha256)fail();
   record.receipt=Object.freeze({url,pinUrl,bytes:pin.bytes,sha256:pin.sha256,request,response,fetchTask,bodyTask,digestTask,fulfillTask,frame,sourceExecutionQualified:false});record.phase='fulfilled';
  }catch(error){
   const first=load.reject(error);
   // Abort this exact intercepted resource only. Never complete a task or replay a reader.
   if(abort)try{receipt.check();await abort('failed')}catch{}
   return first;
  }
 }
 try{guard();routeTask=route(pattern,handle);await load.observed(routeTask);installed=true;guard();return receipt.inspect()}
 catch(error){throw load.reject(error)}
}

const sourceWitnesses=new WeakMap();
export async function bindTerminalScriptWitness(owner){
 const load=terminalSourceForOwner(owner);if(!load)throw Error('LOGINOM_ORIGINAL_LOAD_UNAVAILABLE');try{load.guard()}catch(error){throw load.reject(error)}
 if(sourceWitnesses.has(owner))fail();
 const original=load.inspect(),responses=original.sourceResponses;
 if(!responses?.responseBytesComplete){
  const partial=Object.freeze({complete:false,reason:'SELECTED_RESPONSES_INCOMPLETE',projectionOnly:true,sourceExecutionQualified:false,closureIdentityQualified:false});
  sourceWitnesses.set(owner,Object.freeze({check(){},inspect:()=>partial}));return partial;
 }
 const page=original.page;if(!original.navigationStarted||!original.initSettled||!page)fail();
 let evaluate,definer,d;const chain=[];
 for(let p=page;p;p=Object.getPrototypeOf(p)){chain.push([p,Object.getPrototypeOf(p)]);d=Object.getOwnPropertyDescriptor(p,'evaluate');if(d){definer=p;break}}
 if(!d||!('value'in d)||typeof d.value!=='function')fail();evaluate=d.value;
 let summaryCheck=()=>{},bound;const handleChecks=[];
 let originalHandleEvaluate,originalHandle;
 const check=()=>{let p=page;for(const[value,parent]of chain){if(p!==value||Object.getPrototypeOf(p)!==parent)fail();if(Object.hasOwn(p,'evaluate'))break;p=Object.getPrototypeOf(p)}
  const now=Object.getOwnPropertyDescriptor(p,'evaluate');if(p!==definer||!now||Reflect.ownKeys(d).some(k=>!Object.is(now[k],d[k])))fail();for(const guard of handleChecks)guard();summaryCheck()};
 // Qualify method/absence before the first import await, not by late lookup.
 let handleDescriptor,evaluateHandle;
 try{
 for(let p=page;p;p=Object.getPrototypeOf(p)){handleDescriptor=Object.getOwnPropertyDescriptor(p,'evaluateHandle');if(handleDescriptor)break}
 if(handleDescriptor){evaluateHandle=slot(page,'evaluateHandle',handleChecks);if(typeof evaluateHandle!=='function')fail()}
 else{
  const chain=[];for(let p=page;p;p=Object.getPrototypeOf(p))chain.push([p,Object.getPrototypeOf(p)]);
  handleChecks.push(()=>{let p=page;for(const[value,parent]of chain){if(p!==value||Object.getPrototypeOf(p)!==parent||Object.hasOwn(p,'evaluateHandle'))fail();p=Object.getPrototypeOf(p)}});
 }
 }catch(error){throw load.reject(error)}
 const phases={phase:'import',importTask:undefined,evaluateTask:undefined,realmHandleTask:undefined,realmHandle:undefined};
 sourceWitnesses.set(owner,Object.freeze({check,inspect:()=>bound??Object.freeze({complete:false,reason:'WITNESS_PENDING',...phases,projectionOnly:true,sourceExecutionQualified:false,closureIdentityQualified:false})}));
 try{
  phases.importTask=import('../client/lib/terminal-script-witness.mjs');const module=await load.observed(phases.importTask);
  const id=loadData(owner,'id'),account=loadData(owner,'account'),witnessArguments=module.terminalScriptWitnessArguments(id,account);phases.phase='evaluate';
  // Missing handle support retains the old evidence-only projection. An accessor
  // or later substitution cannot silently downgrade an original handle binding.
  let summary;
  if(evaluateHandle){
   load.guard();
   phases.realmHandleTask=Reflect.apply(evaluateHandle,page,[module.collectTerminalScriptWitness,witnessArguments]);
   originalHandle=await load.observed(phases.realmHandleTask);phases.realmHandle=originalHandle;
   originalHandleEvaluate=slot(originalHandle,'evaluate',handleChecks);if(typeof originalHandleEvaluate!=='function')fail();load.guard();
   phases.evaluateTask=Reflect.apply(originalHandleEvaluate,originalHandle,[module.projectTerminalScriptWitness]);
   summary=await load.observed(phases.evaluateTask);
  }else{
   phases.evaluateTask=Reflect.apply(evaluate,page,[module.collectTerminalScriptWitness,witnessArguments]);
   summary=await load.observed(phases.evaluateTask);
  }
  summaryCheck=snapshot(summary);
  if(loadData(summary,'id')!==id||loadData(summary,'account')!==account||loadData(summary,'projectionOnly')!==true
    ||loadData(summary,'sourceExecutionQualified')!==false||loadData(summary,'closureIdentityQualified')!==false)fail();
  const rows=loadData(summary,'rows');if(loadData(rows,'length')!==5)fail();
  const kinds=['initial','modifier','ObjectProxy','FileStorage','StreamPersist'],paths=['bg/js/mscorlib.js','bg/js/bg.mscorlib.js','bg/js/rpc.js','bg/js/bg.rtl.rpc.js','bg/js/bg.rtl.rpc.js'],matches=[];let integrityCount=0;
  for(let i=0;i<5;i++){
   const row=loadData(rows,String(i)),url=loadData(row,'url'),pinUrl='https://app.loginom.ai/app/'+paths[i];if(loadData(row,'kind')!==kinds[i])fail();
   const matching=responses.records.filter(record=>record.url===url&&record.pinUrl===pinUrl);if(matching.length!==1)fail();
   const responseReceipt=matching[0],integrityDescriptor=Object.getOwnPropertyDescriptor(row,'integrity');
   const hasMetadata=['integrity','armedBeforeSource','initialExecutionObserved'].some(k=>Object.hasOwn(row,k));
   if(hasMetadata){
    // No original handle means the projected metadata has no retained realm custody.
    if(!originalHandle||!integrityDescriptor||!('value'in integrityDescriptor))fail();
    const integrity=loadData(row,'integrity'),sha256=loadData(responseReceipt,'sha256');
    if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)
      ||integrity!=='sha256-'+Buffer.from(sha256,'hex').toString('base64')
      ||loadData(row,'armedBeforeSource')!==true||loadData(row,'initialExecutionObserved')!==true)fail();
    integrityCount++;
    matches.push(Object.freeze({kind:kinds[i],url,pinUrl,responseReceipt,integrity,armedBeforeSource:true,initialExecutionObserved:true}));
   }else matches.push(Object.freeze({kind:kinds[i],url,pinUrl,responseReceipt}));
  }
  if(integrityCount!==0&&integrityCount!==5)fail();
  const selectedInitialExecutionJoined=integrityCount===5;
  let supportedInitialLoadJoined=false;
  const loadDescriptor=Object.getOwnPropertyDescriptor(summary,'initialLoad');
  if(loadDescriptor){
   if(!('value'in loadDescriptor)||!originalHandle||!selectedInitialExecutionJoined)fail();
   const catalog=loadData(summary,'initialLoad'),loaded=loadData(catalog,'records'),expected=witnessArguments.initialLoadPins;
   if(loadData(catalog,'definingExportsRetained')!==true||loadData(catalog,'applicationSourcesJoined')!==true||loadData(loaded,'length')!==expected.length)fail();
   const seen=new Set();
   for(let i=0;i<expected.length;i++){
    const row=loadData(loaded,String(i)),url=loadData(row,'url');if(typeof url!=='string')fail();
    const parsed=new URL(url);if(parsed.href!==url)fail();const canonical=parsed.origin+parsed.pathname;
    const pin=expected.find(([u])=>u===canonical);
    if(!pin||seen.has(canonical)||parsed.hash||(parsed.search&&!/^\?_dc=\d+$/.test(parsed.search))
      ||loadData(row,'integrity')!==pin[1]||loadData(row,'loaded')!==true)fail();seen.add(canonical);
   }
   supportedInitialLoadJoined=true;
  }
  let extraDependenciesJoined=false;const extraMatches=[];
  const extraDescriptor=Object.getOwnPropertyDescriptor(summary,'extraDependencies');
  if(extraDescriptor){
   if(!('value'in extraDescriptor)||!originalHandle||!supportedInitialLoadJoined)fail();
   const extras=extraDescriptor.value,pins=witnessArguments.extraDependencyPins;
   if(loadData(extras,'length')!==pins.length)fail();const seen=new Set();
   for(let i=0;i<pins.length;i++){
    const row=loadData(extras,String(i)),url=loadData(row,'url');if(typeof url!=='string')fail();
    const parsed=new URL(url);if(parsed.href!==url)fail();const pinUrl=parsed.origin+parsed.pathname,pin=pins.find(([u])=>u===pinUrl);
    if(!pin||seen.has(pinUrl)||parsed.hash||(parsed.search&&!/^\?_dc=\d+$/.test(parsed.search))
      ||loadData(row,'integrity')!==pin[1]||loadData(row,'loaded')!==true||loadData(row,'armedBeforeSource')!==true)fail();seen.add(pinUrl);
    const matching=responses.records.filter(r=>loadData(r,'url')===url&&loadData(r,'pinUrl')===pinUrl);if(matching.length!==1)fail();
    const responseReceipt=matching[0],sha=loadData(responseReceipt,'sha256');
    if(loadData(row,'integrity')!=='sha256-'+Buffer.from(sha,'hex').toString('base64'))fail();
    extraMatches.push(Object.freeze({url,pinUrl,integrity:pin[1],responseReceipt}));
   }
   extraDependenciesJoined=true;
  }
  let pending,failed;
  function recheck(){
   if(pending)return pending;if(failed)return failed;
   try{load.guard()}catch(error){failed=Promise.reject(load.reject(error));return failed}
   pending=(async()=>{try{
    const task=Reflect.apply(originalHandleEvaluate,originalHandle,[module.projectTerminalScriptWitness]);
    const current=await load.observed(task);const guard=snapshot(current);
    const same=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;const keys=Reflect.ownKeys(a);return keys.length===Reflect.ownKeys(b).length&&keys.every(k=>{if(!Object.hasOwn(b,k))return false;const x=Object.getOwnPropertyDescriptor(a,k),y=Object.getOwnPropertyDescriptor(b,k);return x.writable===y.writable&&x.enumerable===y.enumerable&&x.configurable===y.configurable&&same(loadData(a,k),loadData(b,k))})};
    if(!same(current,summary))fail();guard();load.guard();return bound;
   }catch(error){throw load.reject(error)}})();
   const work=pending;work.then(()=>{if(pending===work)pending=undefined},()=>{failed=work;if(pending===work)pending=undefined});return work;
  }
  // One original JSHandle/evaluator; no proxy or function is reconstructed from
  // the returned evidence. Cache the exact pending/rejected prepare task.
  let prepareTask,prepareInput,prepareCheck,prepareCall,prepareBridge,prepareControl;
  function retainPrepare(input,bridge){
   if(prepareTask){if(input!==prepareInput||bridge!==prepareBridge)fail();prepareCall.guard();prepareCheck();return prepareTask}
   load.guard();check();prepareCall=terminalManagedCallForBridge(bridge);if(!prepareCall||terminalSourceForManagedCall(owner,prepareCall.facts.message)!==load)fail();prepareCall.guard();prepareControl=prepareCall.inspect();prepareBridge=bridge;prepareInput=input;prepareCheck=snapshot(input);prepareCheck();
   prepareTask=(async()=>{try{
    load.guard();check();prepareCall.guard();prepareCheck();
    const task=Reflect.apply(originalHandleEvaluate,originalHandle,[module.retainTerminalPrepareOnCapsule,input]);
    const result=await load.observed(task);load.guard();check();prepareCall.guard();prepareCheck();
    const retained=snapshot(result);
    if(loadData(result,'operationId')!==loadData(input,'operationId')||loadData(result,'sessionId')!==loadData(input,'sessionId')
      ||loadData(result,'intent')!=='new_draft'||loadData(result,'creationArmed')!==true||loadData(result,'originalRequestRetained')!==true
      ||loadData(result,'queryDispatched')!==false||['sourceExecutionQualified','closureIdentityQualified','nativeReceiversQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].some(k=>loadData(result,k)!==false))fail();
    retained();return result;
   }catch(error){throw load.reject(error)}})();return prepareTask;
  }
  let creationWork,creationOptions,creationBridge,creationCheck,creationFailed=false;
  function createWorkspace(options,bridge){
   if(creationWork){if(options!==creationOptions||bridge!==creationBridge)fail();if(!creationFailed)creationCheck();return creationWork}
   load.guard();check();if(!prepareTask||!prepareInput)fail();
   const call=terminalManagedCallForBridge(bridge);if(!call||call!==prepareCall||bridge!==prepareBridge||terminalSourceForManagedCall(owner,call.facts.message)!==load)fail();
   const checkOptions=snapshot(options),guards=[];
   for(const name of ['url','evaluate','locator','goto','waitForTimeout'])if(typeof slot(page,name,guards)!=='function')fail();
   const verify=()=>{call.guard();load.guard();check();prepareCall.guard();prepareCheck();checkOptions();for(const guard of guards)guard();
    if(terminalManagedCallForBridge(bridge)!==call||terminalSourceForManagedCall(owner,call.facts.message)!==load)fail()};
   verify();creationOptions=options;creationBridge=bridge;creationCheck=verify;
   const token=Object.freeze({});
   const phase=async mode=>{verify();const task=Reflect.apply(originalHandleEvaluate,originalHandle,[module.continueTerminalCreationOnCapsule,mode]);const result=await load.observed(task);verify();return result};
   workspaceCreations.set(token,{page,check:verify,deadline:load.facts.deadline,account,phase,async evaluate(input){verify();const task=Reflect.apply(originalHandleEvaluate,originalHandle,[workspaceCreations.get(token).evaluator,input]);const value=await load.observed(task);verify();return value}});
   creationWork=(async()=>{try{
    await prepareTask;verify();
    const imported=await load.observed(import('../client/lib/workspace.mjs'));verify();workspaceCreations.get(token).evaluator=imported.inspectWorkspaceRealm;
    const normalized=imported.workspacePreparationOptions(options);
    if(normalized.operationId!==prepareInput.operationId||normalized.sessionId!==prepareInput.sessionId||normalized.intent!=='new_draft'
      ||normalized.allowTestLogin||normalized.recoverOnly||normalized.packagePath!==null||normalized.workflowRef!==null)fail();
    await phase('begin');verify();
    const result=await imported.prepareWorkspace(page,normalized,undefined,token);verify();
    if(result.status!=='READY')fail();
    const query=await phase('query');verify();
    if(loadData(query,'queryCompleted')!==true||['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].some(k=>loadData(query,k)!==false))fail();
    return Object.freeze({...result,creationContinuationVerified:true,queryCompleted:true,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
   }catch(error){creationFailed=true;throw load.reject(error)}})();return creationWork;
  }
  let componentWork,componentFailed=false;
  function continueComponent(bridge){
   const checkControl=()=>{
    prepareCall?.guard();load.guard();check();
    if(bridge!==prepareBridge||terminalManagedCallForBridge(bridge)!==prepareCall||!prepareControl)fail();
    const now=prepareCall.inspect();
    if(!prepareControl.sdkTask||prepareControl.phase!=='dispatched')throw Error('LOGINOM_ORIGINAL_COMPONENT_SDK_TASK_UNAVAILABLE');
    if(['controller','signal','handleTask','sdkTask'].some(k=>now[k]!==prepareControl[k]))fail();
    if(typeof creationCheck!=='function')throw Error('LOGINOM_ORIGINAL_COMPONENT_CREATION_UNAVAILABLE');creationCheck();
   };
   if(componentWork){if(!componentFailed)checkControl();return componentWork}
   checkControl();if(!creationWork)fail();
   componentWork=(async()=>{try{
    await creationWork;checkControl();
    const packetModule=await load.observed(import('../client/lib/terminal-original-packet.mjs'));checkControl();
    const packetTask=Reflect.apply(originalHandleEvaluate,originalHandle,[packetModule.inspectTerminalRealmPacket]);
    const packet=await load.observed(packetTask);checkControl();snapshot(packet)();
    if(loadData(packet,'operationId')!==prepareInput.operationId||loadData(packet,'sessionId')!==prepareInput.sessionId
      ||loadData(packet,'sameRealmInitialPacket')!==true||loadData(packet,'receiptVerified')!==true||loadData(packet,'controlLocation')!=='host'||['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].some(k=>loadData(packet,k)!==false))fail();
    const module=await load.observed(import('../client/lib/terminal-original-interfaces.mjs'));checkControl();
    const task=Reflect.apply(originalHandleEvaluate,originalHandle,[module.continueTerminalRealmComponent]);
    const result=await load.observed(task);checkControl();snapshot(result)();
    if(loadData(result,'packetQueryContinuationVerified')!==true||loadData(result,'interface_reply')!=='original_proxy_observed'
      ||loadData(result,'componentReady')!==false||loadData(result,'reason')!=='READONLY_STORAGE_COMPONENT_NOT_BOUND'
      ||loadData(result,'controlLocation')!=='host'||['sourceExecutionQualified','closureIdentityQualified','nativeReceiversQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].some(k=>loadData(result,k)!==false))fail();
    return Object.freeze({...result,originalManagedControlRetained:true,parentSignalSameReference:false});
   }catch(error){componentFailed=true;throw load.reject(error)}})();return componentWork;
  }
  let storageWork,storageFailed=false;
  function continueStorage(bridge){
   const checkControl=()=>{
    prepareCall?.guard();load.guard();check();
    if(bridge!==prepareBridge||terminalManagedCallForBridge(bridge)!==prepareCall||!prepareControl)fail();
    const now=prepareCall.inspect();
    if(!prepareControl.sdkTask||prepareControl.phase!=='dispatched'||['controller','signal','handleTask','sdkTask'].some(k=>now[k]!==prepareControl[k]))fail();
    if(typeof creationCheck!=='function')throw Error('LOGINOM_ORIGINAL_COMPONENT_CREATION_UNAVAILABLE');creationCheck();
   };
   if(storageWork){if(!storageFailed)checkControl();return storageWork}
   checkControl();
   storageWork=(async()=>{try{
    await continueComponent(bridge);checkControl();
    const module=await load.observed(import('../client/lib/terminal-original-interfaces.mjs'));checkControl();
    const values={};
    for(const method of ['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath']){
     checkControl();const task=Reflect.apply(originalHandleEvaluate,originalHandle,[module.readTerminalRealmStorage,method]);
     const result=await load.observed(task);checkControl();snapshot(result)();
     if(loadData(result,'method')!==method||loadData(result,'readonlyStepVerified')!==true||['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].some(k=>loadData(result,k)!==false))fail();
     const value=loadData(result,'value');
     if(['get_Connected','get_IsOwnCurrentDirectory'].includes(method)?value!==true:typeof value!=='string'||!value)fail();values[method]=value;
    }
    return Object.freeze({status:'PARTIAL',readonlyStorageVerified:true,interface_reply:'original_proxy_observed',connected:true,
     isOwnCurrentDirectory:true,currentDirectory:values.get_CurrentDirectory,rootPath:values.get_RootPath,
     componentReady:false,reason:'NATIVE_LEXICAL_QUALIFICATION_MISSING',sourceBytesVerified:false,originalManagedControlRetained:true,parentSignalSameReference:false,
     sourceExecutionQualified:false,closureIdentityQualified:false,nativeReceiversQualified:false,
     nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
   }catch(error){storageFailed=true;throw load.reject(error)}})();return storageWork;
  }
  load.guard();phases.phase='compared';
  bound=Object.freeze({complete:true,projectionOnly:true,witnessSummaryCompared:true,matches:Object.freeze(matches),page,
   originalInitTask:original.initTask,importTask:phases.importTask,evaluateTask:phases.evaluateTask,
   realmOriginalAssociation:!!originalHandle,selectedInitialExecutionJoined,supportedInitialLoadJoined,extraDependenciesJoined,extraDependencies:Object.freeze(extraMatches),extraDependenciesReason:extraDependenciesJoined?undefined:'ORIGINAL_EXTRA_DEPENDENCIES_UNAVAILABLE',initialLoadReason:supportedInitialLoadJoined?undefined:(Object.hasOwn(summary,'initialLoadReason')?loadData(summary,'initialLoadReason'):'ORIGINAL_INITIAL_LOAD_UNAVAILABLE'),initialExecutionReason:selectedInitialExecutionJoined?undefined:'ORIGINAL_SRI_RECEIPTS_UNAVAILABLE',realmHandleTask:phases.realmHandleTask,realmHandle:originalHandle,
   recheck:originalHandle?()=>recheck():undefined,
   createWorkspace:originalHandle?createWorkspace:undefined,
   continueComponent:originalHandle?continueComponent:undefined,
   continueStorage:originalHandle?continueStorage:undefined,
   retainPrepare:originalHandle&&Object.hasOwn(summary,'privatePrepareAvailable')&&loadData(summary,'privatePrepareAvailable')===true?retainPrepare:undefined,
   sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});return bound;
 }catch(error){throw load.reject(error)}
}

// Opaque tokens are minted only by the retained witness closure below. Public
// workspace options/JSON cannot install callbacks or original custody.
const workspaceCreations=new WeakMap();
export function checkTerminalWorkspaceCreation(token,page){const entry=workspaceCreations.get(token);if(!entry||entry.page!==page)fail();entry.check();return entry.deadline}
export async function evaluateTerminalWorkspaceCreation(token,page,input){
 const entry=workspaceCreations.get(token);if(!entry||entry.page!==page||!['lookup','observe','reserve','effect','verify'].includes(loadData(input,'mode')))fail();entry.check();return entry.evaluate(input);
}
export function terminalWorkspaceCreationAccount(token,page){checkTerminalWorkspaceCreation(token,page);return workspaceCreations.get(token).account}
