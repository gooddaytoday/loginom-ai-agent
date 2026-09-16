import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPublicNodeWire} from '../../public-node-wire.mjs';
const snapshot=()=>({operation_id:'test-op',state:'settled',outcome:{status:'SUCCEEDED',action_key:'node.apply',cleanup_complete:true,effect_possible:true,output:{node:{document_id:'doc',workflow_id:'workflow',node_id:'node'},execution:{status:'not_requested',execution_id:null},configuration:{},output:{status:'not_requested',ports:[]}}}});
for(const mismatch of [false,true])test('public user-v1 wire retains genuine compact envelopes, mismatch='+mismatch,async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'collapse-public-wire-'));
 const value=snapshot();const runtime={tools:[{name:'dock_node_apply',inputSchema:{type:'object',properties:{operation_id:{type:'string'}},required:['operation_id']}}],startNodeApply:()=>value,nodeApplyStatus:()=>mismatch?{...value,outcome:{...value.outcome,status:'AMBIGUOUS'}}:value};
 const wire=await createPublicNodeWire(runtime,{directory,browserSequence:()=>0,userProfile:true});
 try{
  if(mismatch)await assert.rejects(wire.runtime.runNodeApply({operation_id:'test-op'}),/differs from retained/);
  else assert.deepEqual(await wire.runtime.runNodeApply({operation_id:'test-op'}),value.outcome);
  const records=(await fs.readFile(directory+'/public-api.jsonl','utf8')).trim().split('\n').map(JSON.parse);
  const reply=records.find(r=>r.phase==='response').reply;
  assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
  assert.equal(reply.structuredContent.result_version,'user-v1');assert.equal(reply.structuredContent.status,'SUCCEEDED');
  assert.equal(reply.structuredContent.outcome,undefined);
 }finally{await wire.close();await fs.rm(directory,{recursive:true,force:true});}
});
