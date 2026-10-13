import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Controlled offline definition load only. No Page/native/Dispatcher methods.
// __extends is an explicit transpiler-helper double; browser/Ext are absent.
const bytes=readFileSync(new URL('./provider-Lock.js',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),
 'e321d140d5da0ef14ab24435e9a6562c1042f2e5f789424de6d1c3dfa2af23bd');
function load(){
 const realm=vm.createContext({console,__extends:(derived,base)=>{
  Object.setPrototypeOf(derived,base);
  derived.prototype=Object.create(base.prototype,{constructor:{value:derived,writable:true,configurable:true}});
 }});
 vm.runInContext(bytes.toString('utf8'),realm,{filename:'actual-public-Lock.js',timeout:1000});
 return realm;
}
const a=load(),b=load();
assert.equal(typeof a.bg.LockDeferred,'function');
assert.equal(a.bg.LockDeferred,vm.runInContext('bg.LockDeferred',a));
assert.notEqual(a.bg.LockDeferred,b.bg.LockDeferred);
assert.equal(vm.runInContext('typeof GetLockDeferredDefault',a),'undefined');
assert.equal(vm.runInContext('typeof LockDeferredDefault',a),'undefined');
assert.equal(Object.hasOwn(a.bg,'GetLockDeferredDefault'),false);
assert.equal(Object.hasOwn(a.bg,'LockDeferredDefault'),false);
assert.equal(typeof a.bg.LockedSessionCatch,'undefined');
const result={kind:'actual-public-defining-source-offline-load',checks:8,pass:true,
 defining_source_sha256:createHash('sha256').update(bytes).digest('hex'),
 exported_LockDeferred_defined:true,same_realm_export_retained:true,
 copied_realm_export_same:false,lexical_GetLockDeferredDefault_exposed:false,
 lexical_LockDeferredDefault_exposed:false,LockedSessionCatch_defined:false,
 invoked_LockDeferred:false,original_Page_received:false,
 original_initialization_received:false,native_provider_supported:false,
 doubles:['VM realm is not Page','__extends transpiler helper'],
 native_calls:0,dispatcher_calls:0,adapter_facade_suites_repeated:false};
writeFileSync(new URL('./provider-defining-input-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
