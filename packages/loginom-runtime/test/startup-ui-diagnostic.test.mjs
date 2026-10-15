import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {durabilityFixture} from './startup-durability-fixture.mjs';
const source=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
for(const unavailable of [false,true])test('pre-widget diagnostic preserves unknown cleanup '+unavailable,async()=>{
 const f=await durabilityFixture({source});
 try {
  const document={title:'Loginom',readyState:'interactive',querySelectorAll(selector){if(unavailable&&selector.includes("data-tid"))throw Error('diagnostic unavailable');return []}};
  const state=vm.createContext({document,location:{origin:'https://own.invalid',href:'https://own.invalid/app?private=omitted',pathname:'/app'},bg:{app:{Version:'7.4.2'}},Error});
  state.__loginomStartupV1={document,id:f.owner.id,account:'own'};f.owner.navigationStarted=true;
  f.owner.page.evaluate=async(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg);
  await assert.rejects(f.owner.close());
  const snapshot=f.owner.evidence.first_guard;
  assert.equal(snapshot.page_ui.available,!unavailable);
  if(!unavailable){assert.equal(snapshot.page_ui.pathname,'/app');assert.equal(snapshot.page_ui.ready_state,'interactive');assert.equal(snapshot.page_ui.title,'Loginom');assert.equal(snapshot.page_ui.data_tid_count,0);assert.equal(snapshot.page_ui.login.attached,0);assert.equal(snapshot.page_ui.login.visible,false);assert.equal(snapshot.result.reason,'LOGIN_EFFECT_UNKNOWN')}
  else assert.equal(snapshot.page_ui.rejection.message,'diagnostic unavailable');
  assert.equal(snapshot.connected.is_undefined,true);assert.equal(snapshot.running.is_undefined,true);
  assert.equal(f.native(),0);assert.equal(f.context(),0);assert.notEqual(f.owner.closed,true);
 } finally {await f.dispose()}
});
