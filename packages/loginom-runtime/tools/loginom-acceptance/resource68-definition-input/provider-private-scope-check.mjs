import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Real own-process V8 inspector, no listening socket or browser. Actual public
// defining bytes; VM and transpiler helper are explicit offline doubles.
const bytes=readFileSync(new URL('./provider-Lock.js',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),
 'e321d140d5da0ef14ab24435e9a6562c1042f2e5f789424de6d1c3dfa2af23bd');
const session=new Session();session.connect();
let result;
try {
 await session.post('Runtime.enable');
 const contexts=[];session.on('Runtime.executionContextCreated',e=>contexts.push(e.params.context));
 const realm=vm.createContext({console,__extends:(derived,base)=>{
  Object.setPrototypeOf(derived,base);
  derived.prototype=Object.create(base.prototype,{constructor:{value:derived,writable:true,configurable:true}});
 }},{name:'resource68-fixed-offline-defining-entry'});
 vm.runInContext(bytes.toString('utf8'),realm,{filename:'actual-public-Lock.js',timeout:1000});
 const context=contexts.find(c=>c.name==='resource68-fixed-offline-defining-entry');assert.ok(context);
 // Fixed expressions only; no retrieved function invocation or arbitrary path.
 const original=(await session.post('Runtime.evaluate',{expression:'bg.LockDeferred',contextId:context.id,
  objectGroup:'resource68-own-offline-scope',returnByValue:false})).result;assert.equal(original.type,'function');
 const properties=await session.post('Runtime.getProperties',{objectId:original.objectId,ownProperties:true});
 const scopes=properties.internalProperties.find(p=>p.name==='[[Scopes]]')?.value;assert.ok(scopes?.objectId);
 const scopeRows=(await session.post('Runtime.getProperties',{objectId:scopes.objectId,ownProperties:true})).result;
 let dependencies;
 for(const row of scopeRows.filter(p=>/^\d+$/.test(p.name))){
  const values=(await session.post('Runtime.getProperties',{objectId:row.value.objectId,ownProperties:true})).result;
  if(values.some(p=>p.name==='GetLockDeferredDefault')){dependencies=values;break;}
 }
 const getter=dependencies?.find(p=>p.name==='GetLockDeferredDefault')?.value;
 const cache=dependencies?.find(p=>p.name==='LockDeferredDefault')?.value;
 assert.equal(getter?.type,'function');assert.ok(getter.objectId);assert.equal(cache?.type,'undefined');
 // Inspector holds real lexical function reference without toString/refetch/
 // GUID reconstruction or invoking LockDeferred/GetLockDeferredDefault.
 const getterProperties=await session.post('Runtime.getProperties',{objectId:getter.objectId,ownProperties:true});
 assert.ok(getterProperties.internalProperties.some(p=>p.name==='[[Scopes]]'));
 result={kind:'private-own-V8-scope-acquisition',pass:true,source_sha256:createHash('sha256').update(bytes).digest('hex'),
  exact_export_reference_held:true,lexical_getter_reference_held:true,default_cache_observed:'undefined_before_first_call',
  scope_refs_serialized:false,target_callbacks_invoked:0,inspector_listening_socket:false,
  native_Page:false,original_startup_owner:false,original_completion_refs:false,
  supported_Resource68_provider:false,Chromium_Page_scope_qualification:'NOT_VERIFIED',
  doubles:['VM realm instead of Page','__extends transpiler helper']};
 await session.post('Runtime.releaseObjectGroup',{objectGroup:'resource68-own-offline-scope'});
} finally {session.disconnect();}
writeFileSync(new URL('./provider-private-scope-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
