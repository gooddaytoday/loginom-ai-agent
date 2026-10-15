// Fixed terminal-purpose dynamic loader admission, installed before application code.
// SRI is enforced by the browser; this receipt alone never claims execution/closures.
const pins=Object.freeze([
 [
  "https://app.loginom.ai/app/bg/core/__extends.js",
  "sha256-J22UfjlY9vuXPnTq63ZhD8UAKPuueeFP6rj+oABSvow="
 ],
 [
  "https://app.loginom.ai/app/bg/core/__awaiter.js",
  "sha256-R8s8VMylJJYtWXYkG/T0e3sEr0brwsPxt0lHlAGkIJo="
 ],
 [
  "https://app.loginom.ai/app/bg/core/__helpers.js",
  "sha256-+E8oDugUdCOLmxQcsdPYMFjpR6q0kE+W7I2uo0OFI10="
 ],
 [
  "https://app.loginom.ai/app/bg/core/__virtual.js",
  "sha256-O7I8+PQEzLxOxwIrcw/Sl8Ux9r3u4xg8QWybl7i4S6k="
 ],
 [
  "https://app.loginom.ai/app/bg/ts/rtl.imp.js",
  "sha256-rqa9AynIntCFBxsJfxs5Rw9QU2JY3Do/+9/5KO6GQLE="
 ],
 [
  "https://app.loginom.ai/app/bg/ts/PropertySelector.js",
  "sha256-9jAmbK/LtlWean9SH/nmyAe4i+E+GODVRuk5yPFMe1U="
 ],
 [
  "https://app.loginom.ai/app/bg/ts/BG_System.js",
  "sha256-775ZIi7jfa+OhLQp8KzE672w3OzkbEL7ctRfXyQpqlA="
 ],
 [
  "https://app.loginom.ai/app/bg/ts/BG_Interfaces.js",
  "sha256-ht/8oq/1D7wqJyE5xj6DAtgdbf/NfNdTwHFFOsj9b7s="
 ],
 [
  "https://app.loginom.ai/app/bg/js/mscorlib.js",
  "sha256-mytZuy99N2VSbDUw51L+iu71c2Cnva+znG64Ro9+5VU="
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.mscorlib.js",
  "sha256-pbYuff+ZILE7Armv+taZUxbfbGrhkfwHhkiph5UMRVA="
 ],
 [
  "https://app.loginom.ai/app/bg/js/CustomProxyClassBuilder.js",
  "sha256-miijaG7/8+K0kEmU2Hb0Owy1ktp/ji8FGi/WjRW20Ys="
 ],
 [
  "https://app.loginom.ai/app/bg/js/Task.js",
  "sha256-PdjF29IOHkWXig0SfIUr9ZIPstAKh/EycOoLnTUFcms="
 ],
 [
  "https://app.loginom.ai/app/bg/js/rtl.js",
  "sha256-pHHQHlU+5tIzV22poul2qVLoU2y67rzn20pLaBiLJ00="
 ],
 [
  "https://app.loginom.ai/app/bg/js/rpc.js",
  "sha256-r+uRgRoC2h94QfuMA+MANobJigUfCRhq8IKjxEoStMw="
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.rtl.js",
  "sha256-BS7GA55o3gPy40/qVsPj7Yt7Dd2tsDKB/42agW5uXck="
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.rtl.rpc.js",
  "sha256-EawsY9LoFiuXT1fRTg9PV7GcyA09OXl743fiLs7WqXM="
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.model.js",
  "sha256-06uHo6yoKYXUGoudSzUCydjWYiBMZ8B/s/8hVtgCQHo="
 ],
 [
  "https://app.loginom.ai/app/bg/js/bg.model.rpc.js",
  "sha256-U9BD5KfuncyABqqJFcpD2Dod9Cf6DXPY6kAzV+xhoo8="
 ],
 [
  "https://app.loginom.ai/app/bg/app/ServerConnection.js",
  "sha256-TIIDqgQFDEX1Xy3+x272XZOwVqnL4JJBmpu+qCHgxaY="
 ],
 [
  "https://app.loginom.ai/app/bg/app/User.js",
  "sha256-iEZg2ZiQxZ+lpU8rJFJV35i4r/IKUQbBwv2qM3I4iOo="
 ]
].map(row=>Object.freeze(row)));
const propertyPins=Object.freeze([["https://app.loginom.ai/app/bg/js/BitConverter.js", "sha256-A/BRKGwnZgjacCPtkcye9cPWH8ymn3XeOQ1LcgBfgQA="], ["https://app.loginom.ai/app/bg/ts/Int64.js", "sha256-1H32matGbAynfDVdtvNwj/yE/BWryDmiLyK1qq7MvIk="], ["https://app.loginom.ai/app/bg/ts/SysUtils.js", "sha256-2cnhPsadRnbUGmYYVcGOGb+wySijnYxVBDXxhjE2K9Q="]].map(row=>Object.freeze(row)));
export function terminalSourceIntegrityPins(){return pins}
export function terminalPropertyIntegrityPins(){return propertyPins}
export function terminalSourceIntegrityScript(){return `(${installTerminalSourceIntegrity.toString()})(${JSON.stringify(pins)},${JSON.stringify(propertyPins)});`}
function installTerminalSourceIntegrity(pins,propertyPins){
 if(location.origin!=='https://app.loginom.ai'||globalThis.top!==globalThis)return;
 const root=globalThis,doc=document,key='__loginomOriginalScriptIntegrityV1';
 const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,parent=Object.getPrototypeOf,apply=Reflect.apply;
 const fail=()=>{throw Error('TERMINAL_SOURCE_INTEGRITY_UNAVAILABLE')};
 if(descriptor(root,key))fail();
 const URLConstructor=root.URL,Script=root.HTMLScriptElement,Node=root.Node,scriptPrototype=Script.prototype,nodePrototype=Node.prototype;
 const originals=[],checks=[],records=new WeakMap(),expected=new Map([...pins,...propertyPins]);let failure,loadSnapshot;const loads=[],definitions={},propertyDefinitions={};let propertyArmed=false;const propertyChecks=[];
 const initialSlots=['document','HTMLScriptElement','Node','URL','Event','EventTarget'].map(k=>[root,k,descriptor(root,k)]).concat([[Script,'prototype',descriptor(Script,'prototype')],[Node,'prototype',descriptor(Node,'prototype')]]);
 if(initialSlots.some(([, ,d])=>!d))fail();
 const remember=error=>{failure??={value:error};return failure.value};
 const accessor=(owner,name)=>{
  const d=descriptor(owner,name),p=parent(owner);
  if(!d||typeof d.get!=='function'||'value'in d)fail();
  originals.push([owner,name,d,p]);return d;
 };
 const method=(owner,name)=>{const d=descriptor(owner,name);if(!d||!('value'in d)||typeof d.value!=='function')fail();originals.push([owner,name,d,parent(owner)]);return d.value};
 const mapGet=method(Map.prototype,'get'),weakGet=method(WeakMap.prototype,'get'),weakSet=method(WeakMap.prototype,'set'),weakHas=method(WeakMap.prototype,'has');
 const EventCtor=root.Event,eventPrototype=EventCtor.prototype,targetPrototype=root.EventTarget.prototype;
 const listen=method(targetPrototype,'addEventListener'),unlisten=method(targetPrototype,'removeEventListener');
 const eventType=accessor(eventPrototype,'type'),eventTarget=accessor(eventPrototype,'target');
 const trustedGetter=descriptor(new EventCtor('terminal-initial-load'),'isTrusted')?.get;
 if(typeof trustedGetter!=='function')fail();
 const catalog={
  '__awaiter.js':[['awaiter',['__awaiter']]],
  'mscorlib.js':[['ss',['ss']],['taskConstructor',['ss','TaskCompletionSource']],['task',['ss','Task']],['mkdel',['ss','mkdel']],['exceptionWrap',['ss','Exception','wrap']]],
  'bg.mscorlib.js':[['shallowCopy',['ss','shallowCopy']],['prepareProperties',['ss','prepareProperties']]],
  'rpc.js':[['rpc',['rpc']],['ObjectProxy',['rpc','TBGObjectProxy']],['GuidHelper',['rpc','GuidHelper']],['MessageDynamicData',['rpc','TBGMessageDynamicData']],['HResult',['rpc','HResult']],['sessionConstructor',['rpc','TBGSession']],['query',['rpc','TBGObjectProxy','prototype','QueryInterface']]],
  'bg.rtl.js':[['StreamPersist',['bg','IBGStreamPersist']]],
  'bg.rtl.rpc.js':[['FileStorage',['bg','rpc','TIBGFileStorage_Proxy']],['StreamPersistProxy',['bg','rpc','TIBGStreamPersist_Proxy']],['connected',['bg','rpc','TIBGFileStorage_Proxy','prototype','get_Connected']],['currentDirectory',['bg','rpc','TIBGFileStorage_Proxy','prototype','get_CurrentDirectory']],['ownDirectory',['bg','rpc','TIBGFileStorage_Proxy','prototype','get_IsOwnCurrentDirectory']],['rootPath',['bg','rpc','TIBGFileStorage_Proxy','prototype','get_RootPath']],['persist',['bg','rpc','TIBGStreamPersist_Proxy','prototype','SaveToStream']]],
  'PropertySelector.js':[['selectAsync',['bg','selectAsync']]],
  'BG_System.js':[['bg',['bg']],['objectEquals',['bg','ObjectEquals']]],
 };
 const propertyCatalog={"mscorlib.js":[["ss.safeCast",["ss","safeCast"]],["ss.cast",["ss","cast"]],["ss.isValue",["ss","isValue"]],["ss.isNullOrUndefined",["ss","isNullOrUndefined"]],["ss.referenceEquals",["ss","referenceEquals"]],["ss.getMembers",["ss","getMembers"]],["ss.getInterfaces",["ss","getInterfaces"]],["ss.getBaseType",["ss","getBaseType"]],["ss.isInstanceOfType",["ss","isInstanceOfType"]],["ss.getEnumerator",["ss","getEnumerator"]],["ss.IteratorBlockEnumerable",["ss","IteratorBlockEnumerable"]],["ss.IteratorBlockEnumerator",["ss","IteratorBlockEnumerator"]]],"rtl.js":[["rtl.GetSelectorMembersDict",["rtl","RemoteMetaHelper","GetSelectorMembersDict"]],["rtl.$DoGetSelectorDict",["rtl","RemoteMetaHelper","$DoGetSelectorDict"]],["rtl.$_GetSelectorDict",["rtl","RemoteMetaHelper","$_GetSelectorDict"]],["rtl.$AddToSelectorDict",["rtl","RemoteMetaHelper","$AddToSelectorDict"]],["rtl.$GetSelectorPropInfo",["rtl","RemoteMetaHelper","$GetSelectorPropInfo"]],["rtl.$GetSelectorMethodInfo",["rtl","RemoteMetaHelper","$GetSelectorMethodInfo"]],["rtl.$GetCustomAttribute",["rtl","RemoteMetaHelper","$GetCustomAttribute"]],["rtl.SelectorMemberInfo",["rtl","SelectorMemberInfo"]]],"rpc.js":[["rpc.SelectPropertyDescs",["rpc","TBGSession","SelectPropertyDescs"]],["rpc.$DoSelectPropertyDescs$1",["rpc","TBGSession","$DoSelectPropertyDescs$1"]],["rpc.$GetSelectMemberDesc",["rpc","TBGSession","$GetSelectMemberDesc"]],["rpc.GetPropertyValues",["rpc","TBGSession","GetPropertyValues"]],["rpc.GetPropertyValues$1",["rpc","TBGSession","GetPropertyValues$1"]],["rpc.$WritePropertyDescs",["rpc","TBGSession","$WritePropertyDescs"]],["rpc.$SplitPropertyValuesMessage",["rpc","TBGSession","$SplitPropertyValuesMessage"]],["rpc.$ReadPropertyValues",["rpc","TBGSession","$ReadPropertyValues"]],["rpc.$ReadSimplePropertyValue",["rpc","TBGSession","$ReadSimplePropertyValue"]],["rpc.$ReadObjectIdPropertyValue",["rpc","TBGSession","$ReadObjectIdPropertyValue"]],["rpc.GetPropertyValueReader",["rpc","TBGMessageDynamicData","GetPropertyValueReader"]],["rpc.CheckConnected",["rpc","TBGObjectProxy","prototype","CheckConnected"]],["rpc.GetRemoteInterfaceID",["rpc","TBGMessageDynamicData","GetRemoteInterfaceID$1"]]],"bg.model.js":[["IBGBaseDeductorUser",["bg","IBGBaseDeductorUser"]],["IBGDeductorUser",["bg","IBGDeductorUser"]],["IBGBaseDeductorUser.metadata",["bg","IBGBaseDeductorUser","__metadata"]],["IBGDeductorUser.metadata",["bg","IBGDeductorUser","__metadata"]]],"bg.model.rpc.js":[["UserProxy",["bg","rpc","TIBGDeductorUser_Proxy"]],["UserProxy.interfaces",["bg","rpc","TIBGDeductorUser_Proxy","__interfaces"]],["reader.1973",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1973"]],["reader.1976",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1976"]],["reader.1978",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1978"]],["reader.1979",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1979"]],["reader.1980",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1980"]],["reader.1981",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1981"]],["reader.1985",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1985"]],["reader.1983",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1983"]],["reader.1987",["rpc","TBGMessageDynamicData","$FRegisteredPropertyValueReaders","1987"]]],"SysUtils.js":[["CreateDictionary",["bg","CreateDictionary"]]],"Int64.js":[["Int64",["Int64"]],["UInt64",["UInt64"]]],"BitConverter.js":[["BitConverter.FromInt32",["BitConverter","FromInt32"]],["BitConverter.ToInt32",["BitConverter","ToInt32"]],["BitConverter.FromUInt16",["BitConverter","FromUInt16"]],["BitConverter.ToUInt16",["BitConverter","ToUInt16"]],["BitConverter.FromUInt32",["BitConverter","FromUInt32"]],["BitConverter.ToUInt32",["BitConverter","ToUInt32"]],["BitConverter.FromUInt64",["BitConverter","FromUInt64"]],["BitConverter.ToUInt64",["BitConverter","ToUInt64"]],["BitConverter.FromString",["BitConverter","FromString"]],["BitConverter.ToString",["BitConverter","ToString"]]]};
 function dataPath(path,sink=checks){
  let value=root;
  for(const key of path){
   const object=value,d=descriptor(object,key),p=parent(object);if(!d||!('value'in d))throw Error('TERMINAL_SOURCE_DEFINITION_UNAVAILABLE:'+path.join('.'));
   sink.push(()=>{const now=descriptor(object,key);if(parent(object)!==p||!now||Reflect.ownKeys(d).some(k=>now[k]!==d[k]))fail()});value=d.value;
  }return value;
 }
 function holdMetadata(value,seen=[]){
  if(value===null||typeof value!=='object')return;
  for(let i=0;i<seen.length;i++)if(seen[i]===value)return;seen[seen.length]=value;const p=parent(value),keys=Reflect.ownKeys(value),slots=keys.map(k=>[k,descriptor(value,k)]);
  if(slots.some(([,d])=>!d||!('value'in d)))fail();
  propertyChecks.push(()=>{if(parent(value)!==p||Reflect.ownKeys(value).length!==keys.length)fail();for(const[k,d]of slots){const now=descriptor(value,k);if(!now||Reflect.ownKeys(d).some(key=>now[key]!==d[key]))fail()}});
  for(const[,d]of slots)holdMetadata(d.value,seen);
 }
 function captureDefinitions(state){
  const file=state.url.pathname.split('/').at(-1),entries=catalog[file]??[];
  for(const[name,path]of entries){
   if(Object.hasOwn(definitions,name))fail();const value=dataPath(path);
   if(value==null||(!['ss','bg','rpc'].includes(name)&&typeof value!=='function'))fail();
   definitions[name]=Object.freeze({value,sourceReceipt:state.receipt});
  }
  for(const[name,path]of propertyCatalog[file]??[]){
   if(Object.hasOwn(propertyDefinitions,name))fail();const value=dataPath(path,propertyChecks);if(value==null)fail();
   const valueParent=parent(value);propertyChecks.push(()=>{if(parent(value)!==valueParent)fail()});
   if(name.endsWith('.metadata')||name.endsWith('.interfaces'))holdMetadata(value);
   propertyDefinitions[name]=Object.freeze({value,sourceReceipt:state.receipt});
  }
  if(file==='BitConverter.js')propertyArmed=true;
  if(file==='PropertySelector.js'&&definitions.selectAsync.value!==dataPath(['rpc','$imp','selectAsync']))fail();
 }
 function settle(state,event){
  try{
   guard();
   if(this!==state.node||read(event,'target',eventTarget,eventPrototype)!==state.node
     ||apply(trustedGetter,event,[])!==true||state.status!=='pending')fail();
   const type=read(event,'type',eventType,eventPrototype);
   if(type!=='load'||read(state.node,'isConnected',connected,nodePrototype)!==true)fail();
   state.event=event;const eventChain=[];for(let p=event;p;p=parent(p))eventChain.push([p,parent(p)]);
   const eventSlots=Reflect.ownKeys(event).map(k=>[k,descriptor(event,k)]);
   checks.push(()=>{
    let p=event;for(const[original,prototype]of eventChain){if(p!==original||parent(p)!==prototype)fail();p=parent(p)}
    if(Reflect.ownKeys(event).length!==eventSlots.length)fail();
    for(const[k,d]of eventSlots){const now=descriptor(event,k);if(!now||Reflect.ownKeys(d).some(key=>now[key]!==d[key]))fail()}
   });
   // Native dispatch may clear/retarget event internals after the callback.
   // Retain the measured event fact, never reinterpret a later dispatch as load.
   const nativeEvent=Object.freeze({target:state.node,type,trusted:true});
   captureDefinitions(state);state.status='loaded';
   state.loaded=Object.freeze({receipt:state.receipt,event,nativeEvent,node:state.node,document:doc,url:state.url.href,integrity:state.pin,loaded:true});
   apply(unlisten,state.node,['load',state.listener]);apply(unlisten,state.node,['error',state.listener]);guard();
  }catch(error){state.status='refused';state.refusedEvent=event;remember(error)}
 }
 const src=accessor(scriptPrototype,'src'),integrity=accessor(scriptPrototype,'integrity');
 const owner=accessor(nodePrototype,'ownerDocument'),connected=accessor(nodePrototype,'isConnected'),base=accessor(nodePrototype,'baseURI');
 if(typeof src.set!=='function'||typeof integrity.set!=='function')fail();
 const read=(object,name,d,definer)=>{
  let p=object;while(p){const now=descriptor(p,name);if(now){if(p!==definer||!Reflect.ownKeys(d).every(k=>now[k]===d[k]))fail();return apply(d.get,object,[])}p=parent(p)}fail();
 };
 let wrapped;
 function guard(){
  if(failure)throw failure.value;
  for(const[o,k,d]of initialSlots){const now=descriptor(o,k);if(!now||Reflect.ownKeys(d).some(n=>now[n]!==d[n]))fail();}
  for(const[o,k,d,p]of originals){const now=descriptor(o,k),wanted=k==='src'?wrapped:d;if(parent(o)!==p||!now||Reflect.ownKeys(wanted).some(n=>now[n]!==wanted[n]))fail()}
  for(const check of checks)check();if(propertyArmed)for(const check of propertyChecks)check();
 }
 function setSource(value){
  try{
   guard();
   // Preserve ordinary unknown sources and native conversion behavior. They mint no receipt.
   if(typeof value!=='string')return apply(src.set,this,[value]);
   if(read(this,'ownerDocument',owner,nodePrototype)!==doc)fail();
   const url=new URLConstructor(value,read(this,'baseURI',base,nodePrototype));
   const pin=apply(mapGet,expected,[url.origin+url.pathname]);
   if(!pin)return apply(src.set,this,[value]);
   if(url.hash||(url.search&&!/^\?_dc=\d+$/.test(url.search))||apply(weakHas,records,[this])
     ||read(this,'isConnected',connected,nodePrototype)!==false)fail();
   if(loads.some(r=>r.url.origin+r.url.pathname===url.origin+url.pathname))fail();
   const existing=read(this,'integrity',integrity,scriptPrototype);
   if(existing!==''&&existing!==pin)fail();
   const node=this,chain=[];for(let p=node;p;p=parent(p))chain.push([p,parent(p)]);
   apply(integrity.set,node,[pin]);
   const receipt=Object.freeze({node,document:doc,url:url.href,integrity:pin,armedBeforeSource:true,
    sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false});
   apply(weakSet,records,[node,receipt]);
   const state={node,url,pin,receipt,status:'pending'};state.listener=function(event){return settle.call(this,state,event)};loads.push(state);
   apply(listen,node,['load',state.listener]);apply(listen,node,['error',state.listener]);
   // The browser snapshots integrity metadata when it prepares this script.
   const result=apply(src.set,node,[value]);
   const nodeCheck=()=>{
    let p=node;for(const[original,prototype]of chain){if(p!==original||parent(p)!==prototype)fail();p=parent(p)}
    if(read(node,'ownerDocument',owner,nodePrototype)!==doc||read(node,'src',wrapped,scriptPrototype)!==url.href
      ||read(node,'integrity',integrity,scriptPrototype)!==pin)fail();
   };
   nodeCheck();checks.push(nodeCheck);guard();return result;
  }catch(error){throw remember(error)}
 }
 wrapped={...src,set:setSource};define(scriptPrototype,'src',wrapped);
 const api=Object.freeze({
  inspect(node){try{if(this!==api)fail();guard();const receipt=apply(weakGet,records,[node]);if(!receipt)fail();return receipt}catch(error){throw remember(error)}},
  inspectLoad(){try{
   if(this!==api)fail();guard();
   for(const state of loads)if(state.status==='loaded'&&read(state.node,'isConnected',connected,nodePrototype)!==true)fail();
   if(loadSnapshot)return loadSnapshot;
   const core=loads.filter(r=>pins.some(([url])=>url===r.url.origin+r.url.pathname));
   const complete=core.length===pins.length&&core.every(r=>r.status==='loaded')
    &&Object.values(catalog).flat().every(([name])=>Object.hasOwn(definitions,name));
   const bindings=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([key,r])=>[key,r.value])));
   loadSnapshot=Object.freeze({complete,reason:complete?undefined:'INITIAL_LOAD_INCOMPLETE',document:doc,
    missing:Object.freeze(pins.filter(([url])=>!loads.some(r=>r.url.origin+r.url.pathname===url&&r.status==='loaded')).map(([url])=>url)),
    records:Object.freeze(core.filter(r=>r.loaded).map(r=>r.loaded)),bindings,
    propertyOperands:Object.freeze({complete:propertyArmed&&Object.values(propertyCatalog).flat().every(([name])=>Object.hasOwn(propertyDefinitions,name)),
      definitions:Object.freeze({...propertyDefinitions}),additionalRecords:Object.freeze(loads.filter(r=>!core.includes(r)&&r.loaded).map(r=>r.loaded)),
      closureIdentityQualified:false,nativeAuthority:false}),
    sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false});return loadSnapshot;
  }catch(error){throw remember(error)}}
 });
 define(root,key,{value:api});guard();
}
