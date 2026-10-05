import test from 'node:test';
import assert from 'node:assert/strict';
import {closeOwnedNativePreview} from '../lib/collapse-native-output.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
for(const fault of [null,'port','node','root','close','return'])test('owned native Preview cleanup '+fault,async()=>{
 let closed=false;
 const preview={verified:true,node_id:'node',port_guid:'port',port:0,root_tid:'preview'};
 const channel={observe:async o=>{
  const s=closed?{prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'}}:
   {node_preview_schema:{...preview},ui:{elements:[{tid:'preview;p.h;close',allowed_actions:['click'],ref:'close'}]}};
  if(!closed&&fault==='port')s.node_preview_schema.port_guid='foreign';
  if(!closed&&fault==='node')s.node_preview_schema.node_id='foreign';
  if(!closed&&fault==='root')s.node_preview_schema.root_tid='foreign';
  if(closed&&fault==='return')s.prepared_node_context.workflow_id='foreign';
  if(!o.ready(s))throw Error('Owned observation unavailable');return s;
 },perform:async o=>{if(fault==='close')throw Error('Close response lost');assert.equal(o.resolve(o.initialObservation).ref,'close');closed=true;}};
 if(fault)await assert.rejects(closeOwnedNativePreview(channel,{node},{port_guid:'port'},'preview'));
 else{const result=await closeOwnedNativePreview(channel,{node},{port_guid:'port'},'preview');assert.equal(result.preview_closed,true);assert.deepEqual(result.node_context,{...node,verified:true,surface:'graph'});}
});
