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
  guard(){if(primary)throw primary.value;original.guard();if(Date.now()>=captureExpires)throw Error('LOGINOM_ORIGINAL_LOAD_EXPIRED');if(startups.get(state)!==token)fail();for(const check of checks)check()},
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
  init(content){token.guard();if(initStarted||!page||typeof content!=='string')fail();initStarted=true;
   try{initTask=Reflect.apply(methods.addInitScript,context,[{content}]);return initTask}catch(error){throw remember(error)}},
  admitPage(value,candidate){token.guard();if(value!==page||candidate!==loadData(input,'connection')||!initStarted||!initTask||!initSettled||navigationStarted)fail();navigationStarted=true},
  inspect(){return Object.freeze({owner,profile,context,page,initTask,initStarted,initSettled,browserAdmitted,navigationStarted,facts})},
 });
 startups.set(state,token);token.guard();return token;
}
export function terminalSourceForOwner(owner){return owners.get(owner)}
