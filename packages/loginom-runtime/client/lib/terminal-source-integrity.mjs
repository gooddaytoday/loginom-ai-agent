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
export function terminalSourceIntegrityScript(){return `(${installTerminalSourceIntegrity.toString()})(${JSON.stringify(pins)});`}
function installTerminalSourceIntegrity(pins){
 if(location.origin!=='https://app.loginom.ai'||globalThis.top!==globalThis)return;
 const root=globalThis,doc=document,key='__loginomOriginalScriptIntegrityV1';
 const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,parent=Object.getPrototypeOf,apply=Reflect.apply;
 const fail=()=>{throw Error('TERMINAL_SOURCE_INTEGRITY_UNAVAILABLE')};
 if(descriptor(root,key))fail();
 const URLConstructor=root.URL,Script=root.HTMLScriptElement,Node=root.Node,scriptPrototype=Script.prototype,nodePrototype=Node.prototype;
 const originals=[],checks=[],records=new WeakMap(),expected=new Map(pins);let failure;
 const initialSlots=['document','HTMLScriptElement','Node','URL'].map(k=>[root,k,descriptor(root,k)]).concat([[Script,'prototype',descriptor(Script,'prototype')],[Node,'prototype',descriptor(Node,'prototype')]]);
 if(initialSlots.some(([, ,d])=>!d))fail();
 const remember=error=>{failure??={value:error};return failure.value};
 const accessor=(owner,name)=>{
  const d=descriptor(owner,name),p=parent(owner);
  if(!d||typeof d.get!=='function'||'value'in d)fail();
  originals.push([owner,name,d,p]);return d;
 };
 const method=(owner,name)=>{const d=descriptor(owner,name);if(!d||!('value'in d)||typeof d.value!=='function')fail();originals.push([owner,name,d,parent(owner)]);return d.value};
 const mapGet=method(Map.prototype,'get'),weakGet=method(WeakMap.prototype,'get'),weakSet=method(WeakMap.prototype,'set'),weakHas=method(WeakMap.prototype,'has');
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
  for(const check of checks)check();
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
   const existing=read(this,'integrity',integrity,scriptPrototype);
   if(existing!==''&&existing!==pin)fail();
   const node=this,chain=[];for(let p=node;p;p=parent(p))chain.push([p,parent(p)]);
   apply(integrity.set,node,[pin]);
   const receipt=Object.freeze({node,document:doc,url:url.href,integrity:pin,armedBeforeSource:true,
    sourceExecutionQualified:false,closureIdentityQualified:false,nativeAuthority:false});
   apply(weakSet,records,[node,receipt]);
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
 const api=Object.freeze({inspect(node){try{if(this!==api)fail();guard();const receipt=apply(weakGet,records,[node]);if(!receipt)fail();return receipt}catch(error){throw remember(error)}}});
 define(root,key,{value:api});guard();
}
