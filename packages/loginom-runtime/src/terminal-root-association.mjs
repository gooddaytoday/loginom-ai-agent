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
const startups=new WeakMap(),owners=new WeakMap();
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
  guard(){if(primary)throw primary.value;original.guard();if(Date.now()>=captureExpires)throw Error('LOGINOM_ORIGINAL_LOAD_EXPIRED');if(startups.get(state)!==token)fail();for(const check of checks)check();sourceRoutes.get(owner)?.check()},
  reject(error){return remember(error)},
  async observed(work){let value;try{value=await work}catch(error){throw remember(error)}if(work===initTask)initSettled=true;token.guard();return value},
  bindOwner(value,originalProfile){token.guard();if(typeof originalProfile!=='string'||owner||loadData(state,'startupOwner')!==value||owners.has(value))fail();profile=originalProfile;owner=value;
   slot(state,'startupOwner',checks);for(const key of ['directory','generation','chat'])slot(owner,key,checks);
   if(loadData(owner,'generation')!==loadData(input,'generation')||loadData(owner,'chat')!==loadData(input,'chat'))fail();owners.set(owner,token);token.guard()},
  admitBrowser(value,candidate,actualProfile){token.guard();if(browserAdmitted||value!==owner||actualProfile!==profile||candidate!==loadData(input,'connection')
    ||loadData(owner,'account')!==loadData(capture,'account'))fail();for(const key of ['id','account','origin'])slot(owner,key,checks);token.guard();browserAdmitted=true},
  bindContext(value){token.guard();if(context||loadData(owner,'context')!==value)fail();context=value;slot(owner,'context',checks);
   methods=Object.fromEntries(['pages','newPage','addInitScript'].map(key=>{const value=slot(context,key,checks);if(typeof value!=='function')fail();return[key,value]}));token.guard()},
  contextCall(key,args=[]){token.guard();if(!Object.hasOwn(methods,key)||key==='addInitScript')fail();return Reflect.apply(methods[key],context,args)},
  bindPage(value){token.guard();if(page||loadData(owner,'page')!==value)fail();page=value;slot(owner,'page',checks);
   for(const key of ['goto','evaluate','locator'])if(typeof slot(page,key,checks)!=='function')fail();token.guard()},
  init(content){token.guard();if(initStarted||!page||typeof content!=='string'||(sourceRoutes.has(owner)&&!sourceRoutes.get(owner).ready()))fail();initStarted=true;
   try{initTask=Reflect.apply(methods.addInitScript,context,[{content}]);return initTask}catch(error){throw remember(error)}},
  admitPage(value,candidate){token.guard();if(value!==page||candidate!==loadData(input,'connection')||!initStarted||!initTask||!initSettled||navigationStarted)fail();navigationStarted=true},
  inspect(){return Object.freeze({owner,profile,context,page,initTask,initStarted,initSettled,browserAdmitted,navigationStarted,facts,sourceResponses:sourceRoutes.get(owner)?.inspect()})},
 });
 startups.set(state,token);token.guard();return token;
}
export function terminalSourceForOwner(owner){return owners.get(owner)}

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
  inspect(){return Object.freeze({installed,routeTask,records:Object.freeze(retained.map(r=>r.receipt)),responseBytesComplete:retained.length===expected.size&&retained.every(r=>r.phase==='fulfilled'),sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false})},
 });
 sourceRoutes.set(owner,receipt);
 async function handle(routeObject){
  let abort;
  try{
   guard();if(!installed)fail();
   const request=hold(routeObject,'request')(),fetch=hold(routeObject,'fetch'),fulfill=hold(routeObject,'fulfill');abort=hold(routeObject,'abort');
   const urlReader=hold(request,'url'),method=hold(request,'method'),type=hold(request,'resourceType'),requestFrame=hold(request,'frame');
   const url=urlReader(),pin=expected.get(url);
   if(!pin||method()!=='GET'||type()!=='script'||requestFrame()!==frame||mainFrame()!==frame||seen.has(url))fail();seen.add(url);
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
   record.receipt=Object.freeze({url,bytes:pin.bytes,sha256:pin.sha256,request,response,fetchTask,bodyTask,digestTask,fulfillTask,frame,sourceExecutionQualified:false});record.phase='fulfilled';
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
