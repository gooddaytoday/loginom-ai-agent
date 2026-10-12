import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {captureOwnResources,verifyOwnResources} from '../grouping-own-resources.mjs';

const expected={request_id:'review-request',owner_id:'review-owner',account:'own',origin:'https://own.invalid',build:'7.4.2'};
function fixture(fault) {
  const calls=[],document={},user={get_Name:async()=>{calls.push('name');return 'own';}};
  const session={get_CurrentUser:async()=>{
    calls.push('user');
    if(fault==='marker')state.__loginomStartupV1={document,id:'foreign-owner',account:'foreign'};
    if(fault==='app')state.bg.app={...app,Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{Connected:true,UserName:'foreign'}}}}}};
    if(fault==='main')app.Application.FInstance.FMainForm={FMapTree:{FServerConnection:{Connected:true,UserName:'foreign'}}};
    if(fault==='count')map.PackageNodes.Count=1;
    return user;
  },get_Guid:async()=>{
    calls.push('guid');
    if(fault==='root-after-guid')map.FPackagesParentNode={replaced:true};
    return '11111111-1111-4111-8111-111111111111';
  }};
  const connection={Connected:true,UserName:'own',Session:session};
  const map={FServerConnection:connection,FPackagesParentNode:{},PackageNodes:{Count:0},HasRunningNodes:()=>{calls.push('running');return false;}};
  const main={FMapTree:map},app={Version:'7.4.2',Application:{FInstance:{FMainForm:main}}};
  const state=vm.createContext({document,location:{origin:expected.origin},bg:{app},__loginomStartupV1:{document,id:expected.owner_id,account:'own'}});
  return {calls,page:{evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg)}};
}

// VM doubles only; execute the exact published diagnostic function.
for(const fault of ['marker','app','main']) {
  test('reviewer: live global '+fault+' replacement must refuse before the next RPC',async t=>{
    const f=fixture(fault),r=await captureOwnResources(f.page,expected);
    t.diagnostic(JSON.stringify({capture:r.status,consumer:verifyOwnResources(r,expected,Date.now()).status,calls:f.calls}));
    assert.equal(r.status,'NOT_VERIFIED','captured old references must not certify the replaced live chain');
    assert.deepEqual(f.calls,['user'],'no further RPC/read after live authority drift');
  });
}

test('reviewer: newly nonempty cache after await must refuse before further RPC',async()=>{
  const f=fixture('count'),r=await captureOwnResources(f.page,expected);
  assert.equal(r.status,'NOT_VERIFIED');
  assert.deepEqual(f.calls,['user'],'prepared package authority is required before more RPC/read');
});

test('reviewer: root drift during Guid await must refuse before HasRunningNodes',async()=>{
  const f=fixture('root-after-guid'),r=await captureOwnResources(f.page,expected);
  assert.equal(r.status,'NOT_VERIFIED');
  assert.deepEqual(f.calls,['user','name','guid'],'HasRunningNodes must not inspect an unvalidated root');
});
