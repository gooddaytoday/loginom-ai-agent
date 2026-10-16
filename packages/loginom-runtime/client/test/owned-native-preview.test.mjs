import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOwnedNativePreview,reuseOwnedNativePreview,verifyFrontends,nativeFrontendPins} from '../lib/collapse-native-output.mjs';
const fixture=()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},port={port_guid:'port',tid:'owned;Output_Data-0',index:0,active:true};
 const preview={verified:true,inventory_complete:true,port:0,node_id:node.node_id,port_guid:port.port_guid,
  root_tid:'owned;PreviewWindow',fields:[{name:'Amount',label:'Amount',type:'real',index:0,record_id:'field'}]};
 return {ctx:{node},port,preview,handle:structuredClone({node,port,preview})};
};
test('a previously opened own Preview is reusable only after a fresh identical complete observation',()=>{
 const {handle,ctx,port,preview}=fixture();assert.doesNotThrow(()=>verifyOwnedNativePreview(handle,ctx,port,preview));
});

for(const stage of ['headers','body'])test('native frontend timeout gets one fresh readonly fetch: '+stage,async t=>{
 let calls=0,lookups=0;
 const timeout=new DOMException('fixture timeout','TimeoutError');
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  calls++;assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  if(calls===1){if(stage==='headers')throw timeout;return {ok:true,body:(async function*(){yield new Uint8Array([1]);throw timeout;})()};}
  return {ok:false};
 });
 await assert.rejects(verifyFrontends(async()=>{lookups++;return Object.fromEntries(Object.keys(nativeFrontendPins).map(n=>[n,'https://example.test/'+n]));},'https://example.test',undefined,1000,()=>0),/Native frontend fetch failed/);
 assert.equal(calls,2);assert.equal(lookups,1);
});
test('native frontend retry keeps the exact hash check and never trusts a partial first body',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{
  if(++calls===1)return {ok:true,body:(async function*(){yield new Uint8Array([1]);throw new DOMException('fixture timeout','TimeoutError');})()};
  return {ok:true,body:(async function*(){yield new Uint8Array([2]);})()};
 });
 await assert.rejects(verifyFrontends(async()=>({'rpc.js':'https://example.test/rpc.js'}),'https://example.test',undefined,1000,()=>0),/Native frontend changed: rpc.js/);
 assert.equal(calls,2);
});
for(const fault of ['timeout_again','network','parent_cancel','deadline'])test('native frontend fetch does not retry '+fault,async t=>{
 let calls=0,clock=0;const controller=new AbortController(),cancel=Error('parent cancelled');
 t.mock.method(globalThis,'fetch',async()=>{
  calls++;if(fault==='network')throw Error('network failure');
  if(fault==='parent_cancel')controller.abort(cancel);
  if(fault==='deadline')clock=1000;
  throw new DOMException('fixture timeout','TimeoutError');
 });
 await assert.rejects(verifyFrontends(async()=>({'rpc.js':'https://example.test/rpc.js'}),'https://example.test',controller.signal,1000,()=>clock),fault==='parent_cancel'?e=>e===cancel:/fixture timeout|network failure/);
 assert.equal(calls,fault==='timeout_again'?2:1);
});
test('expired native frontend verification cannot start even its readonly browser lookup',async()=>{
 let lookups=0;
 await assert.rejects(verifyFrontends(async()=>{lookups++;return {};},'https://example.test',undefined,1000,()=>1000),/deadline elapsed/);
 assert.equal(lookups,0);
});
test('reuse requests the existing own Preview observation scope and rechecks the active port with its schema',async()=>{
 const f=fixture();let calls=0;
 const channel={observe:async options=>{
  calls++;assert.equal(options.readOutputs,true);assert.equal(options.readPreview,true);
  const state={prepared_node_context:{surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[f.port]},node_preview_schema:f.preview};
  assert.equal(options.ready(state),true);return state;
 }};
 assert.deepEqual(await reuseOwnedNativePreview(channel,f.handle,f.ctx),{port:f.port,preview:f.preview});assert.equal(calls,1);
 f.preview.node_id='foreign';await assert.rejects(reuseOwnedNativePreview(channel,f.handle,f.ctx));
});
test('foreign handles, inactive or changed ports and changed complete schemas refuse',()=>{
 for(const damage of [f=>f.handle.node.document_id='foreign',f=>f.handle.node.workflow_id='foreign',f=>f.handle.node.node_id='foreign',
  f=>f.port.active=false,f=>f.port.port_guid='other',f=>f.port.tid='other',f=>f.handle.port.index=1,
  f=>f.preview.verified=false,f=>f.preview.inventory_complete=false,f=>f.preview.port=1,
  f=>f.preview.node_id='other',f=>f.preview.root_tid='other',f=>f.preview.fields[0].type='integer',
  f=>f.preview.fields[0].name='other',f=>f.preview.fields.push({name:'new',type:'real'})]){
  const f=fixture();damage(f);assert.throws(()=>verifyOwnedNativePreview(f.handle,f.ctx,f.port,f.preview));
 }
});
