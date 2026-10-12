import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {captureOwnResources} from '../grouping-own-resources.mjs';
const expected={request_id:'request',owner_id:'owner',account:'own',origin:'https://own.invalid',build:'7.4.2'};
// Page/native RPC doubles: verify early refusal at each asynchronous boundary.
for(const stage of ['user','name','guid'])for(const drift of ['marker','bg','app','application','instance','main','map','connection','session','root','inventory','count','count-type']){
 test(`serialized reader stops after ${stage} on ${drift} drift (VM double)`,async()=>{
  const calls=[],document={};let state;
  const mutate=()=>{
   if(drift==='marker')state.__loginomStartupV1={...state.__loginomStartupV1};
   if(drift==='bg')state.bg={app};if(drift==='app')state.bg.app={...app};
   if(drift==='application')app.Application={FInstance:instance};
   if(drift==='instance')app.Application.FInstance={FMainForm:main};
   if(drift==='main')instance.FMainForm={FMapTree:map};
   if(drift==='map')main.FMapTree={...map};if(drift==='connection')map.FServerConnection={...connection};
   if(drift==='session')connection.Session={...session};if(drift==='root')map.FPackagesParentNode={};
   if(drift==='inventory')map.PackageNodes={Count:0};if(drift==='count')map.PackageNodes.Count=1;
   if(drift==='count-type')map.PackageNodes.Count='0';
  };
  const invoke=(name,value)=>async()=>{calls.push(name);if(stage===name)mutate();return value;};
  const user={get_Name:invoke('name','own')};
  const session={get_CurrentUser:invoke('user',user),get_Guid:invoke('guid','11111111-1111-4111-8111-111111111111')};
  const connection={Connected:true,UserName:'own',Session:session};
  const map={FServerConnection:connection,FPackagesParentNode:{},PackageNodes:{Count:0},HasRunningNodes:()=>{calls.push('running');return false;}};
  const main={FMapTree:map},instance={FMainForm:main},app={Version:'7.4.2',Application:{FInstance:instance}};
  state=vm.createContext({document,location:{origin:expected.origin},bg:{app},__loginomStartupV1:{document,id:'owner',account:'own'}});
  const page={evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg)};
  const result=await captureOwnResources(page,expected);
  assert.equal(result.status,'NOT_VERIFIED');
  assert.deepEqual(calls,['user','name','guid'].slice(0,['user','name','guid'].indexOf(stage)+1));
  if(drift==='count')assert.equal(result.reason,'PREPARED_PACKAGE_AUTHORITY_REQUIRED');
 });
}
