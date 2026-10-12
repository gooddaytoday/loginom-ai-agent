import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {captureOwnResources,verifyOwnResources,primaryPresence} from '../grouping-own-resources.mjs';
const expected={request_id:'request',owner_id:'owner',account:'own',origin:'https://own.invalid',build:'7.4.2'};
function fixture(fault){
 const calls=[],document={},user={get_Name:async()=>{calls.push('name');return fault==='user'?'foreign':'own';}};
 const session={get_CurrentUser:async()=>{calls.push('user');if(fault==='connection')map.FServerConnection={...connection};return user;},get_Guid:async()=>{calls.push('guid');if(fault==='epoch')state.__loginomStartupV1.document={};return fault==='guid'?'17':'11111111-1111-4111-8111-111111111111';}};
 const connection={Connected:true,UserName:'own',Session:session},map={FServerConnection:connection,FPackagesParentNode:{},PackageNodes:{Count:0},HasRunningNodes:()=>fault==='running'?undefined:false};
 const state=vm.createContext({document,location:{origin:expected.origin},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}},__loginomStartupV1:{document,id:'owner',account:'own'}});
 if(fault==='owner')state.__loginomStartupV1.id='foreign';if(fault==='account')connection.UserName='foreign';if(fault==='root')map.FPackagesParentNode=undefined;
 if(fault==='getter')session.get_Guid=undefined;if(fault==='package')map.PackageNodes.Count=1;
 return {page:{evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg)},calls,session,map,connection};
}
test('actual serialized reader binds native CurrentUser and Guid on one exact own reference chain (VM double)',async()=>{
 const f=fixture(),r=await captureOwnResources(f.page,expected);assert.equal(r.status,'OWN_CONNECTION_IDLE_CACHE_VERIFIED');
 assert.deepEqual(f.calls,['user','name','guid']);assert.equal(verifyOwnResources(r,expected,Date.now()).status,'LIMITED_OWN_CONNECTION_IDLE_CACHE');
 assert.equal(r.holders.verified,false);assert.equal(r.dirty.verified,false);assert.equal(r.release_authorized,false);
});
for(const fault of ['owner','account','root','getter','package','connection','user','guid','epoch','running'])test('serialized own binding refuses '+fault,async()=>{
 const f=fixture(fault),r=await captureOwnResources(f.page,expected);assert.equal(r.status,'NOT_VERIFIED');
 if(['owner','account','root','getter','package'].includes(fault))assert.deepEqual(f.calls,[]);
});
for(const fault of ['request','owner','account','origin','build','guid','old','future','holders','dirty','history','mutation','release','running','chain'])test('private consumer refuses '+fault,async()=>{
 const r=JSON.parse(JSON.stringify(await captureOwnResources(fixture().page,expected))),now=Date.now();
 const keys={request:'request_id',owner:'owner_id',account:'account',origin:'origin',build:'build',guid:'session_guid'};
 if(keys[fault])r[keys[fault]]='foreign';if(fault==='old')r.started_at=new Date(now-16000).toISOString();if(fault==='future')r.finished_at=new Date(now+1000).toISOString();
 if(fault==='holders')r.holders.verified=true;if(fault==='dirty')r.dirty.verified=true;if(fault==='history')r.historical_operation.verified=true;
 if(fault==='mutation')r.mutation_authorized=true;if(fault==='release')r.release_authorized=true;if(fault==='running')r.running.observed=false;if(fault==='chain')r.own_reference_chain_verified=false;
 assert.equal(verifyOwnResources(r,expected,now).status,'NOT_VERIFIED');
});
test('absence and thrown undefined differ by primary presence bit',()=>{
 assert.deepEqual(primaryPresence({}),{present:false,is_undefined:false});
 for(const value of [undefined,null,false,0,'',Error('primary')]){const r=primaryPresence({primaryFailure:value});assert.equal(r.present,true);assert.equal(r.value,value);assert.equal(r.is_undefined,value===undefined);}
});
for(const fault of ['root','inventory','count','session'])test('awaited native Guid cannot retain stale '+fault+' reference authority',async()=>{
 const f=fixture();f.session.get_Guid=async()=>{
  if(fault==='root')f.map.FPackagesParentNode={};if(fault==='inventory')f.map.PackageNodes={Count:0};
  if(fault==='count')f.map.PackageNodes.Count=1;if(fault==='session')f.connection.Session={};
  return '11111111-1111-4111-8111-111111111111';
 };assert.equal((await captureOwnResources(f.page,expected)).status,'NOT_VERIFIED');
});
for(const value of [undefined,null,false,0,'',Error('native CurrentUser getter')])test('supported getter rejection retains primary presence '+String(value),async()=>{
 const f=fixture();f.session.get_CurrentUser=async()=>{throw value};const owner={};let thrown=false;
 try{await captureOwnResources(f.page,expected)}catch(e){thrown=true;owner.primaryFailure=e;}
 assert.equal(thrown,true);assert.equal(primaryPresence(owner).present,true);assert.equal(primaryPresence(owner).value,value);
});
test('a valid other Guid is not authority for an expected historical Session',async()=>{
 const r=await captureOwnResources(fixture().page,expected);
 assert.equal(verifyOwnResources(r,{...expected,session_guid:'22222222-2222-4222-8222-222222222222'},Date.now()).status,'NOT_VERIFIED');
});
