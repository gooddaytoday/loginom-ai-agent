import test from 'node:test';
import assert from 'node:assert/strict';
import {openOwnedNativePreview,closeOwnedNativePreview} from '../lib/collapse-native-output.mjs';

test('Preview opens and closes the requested active output port',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},ctx={node};
 const ports=[0,1].map(index=>({index,port_guid:'port-'+index,tid:'output-'+index,active:true}));
 const gestures=[];let opened=false,closed=false;
 const state=()=>({prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'},
  node_outputs:{verified:true,ports},node_preview_schema:opened&&!closed?{verified:true,port:1,port_guid:'port-1',node_id:'node',root_tid:'preview-1'}:undefined,
  ui:{elements:[...ports.map(port=>({tid:port.tid,ref:port.tid,allowed_actions:['click','press']})),
   {tid:'preview-1;p.h;close',ref:'close-1',allowed_actions:['click']}]}});
 const channel={observe:async options=>{const s=state();assert.equal(options.ready(s),true,options.condition);return s;},
  perform:async options=>{const s=state();assert.equal(options.ready(s),true);const gesture=options.resolve(s);gestures.push(gesture);
   if(gesture.verb==='press')opened=true;if(gesture.ref==='close-1')closed=true;}};
 const handle=await openOwnedNativePreview(channel,ctx,1);
 assert.equal(handle.port.index,1);assert.equal(handle.preview.port,1);
 const result=await closeOwnedNativePreview(channel,ctx,handle.port,handle.preview.root_tid);
 assert.equal(result.preview_closed,true);
 assert.deepEqual(gestures.map(g=>g.ref),['output-1','output-1','close-1']);
});
