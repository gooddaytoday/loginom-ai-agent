import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOwnedNativePreview,reuseOwnedNativePreview} from '../lib/collapse-native-output.mjs';
const fixture=()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},port={port_guid:'port',tid:'owned;Output_Data-0',index:0,active:true};
 const preview={verified:true,inventory_complete:true,port:0,node_id:node.node_id,port_guid:port.port_guid,
  root_tid:'owned;PreviewWindow',fields:[{name:'Amount',label:'Amount',type:'real',index:0,record_id:'field'}]};
 return {ctx:{node},port,preview,handle:structuredClone({node,port,preview})};
};
test('a previously opened own Preview is reusable only after a fresh identical complete observation',()=>{
 const {handle,ctx,port,preview}=fixture();assert.doesNotThrow(()=>verifyOwnedNativePreview(handle,ctx,port,preview));
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
