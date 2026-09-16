import test from 'node:test';
import assert from 'node:assert/strict';
import {completedStaticImports} from '../lib/collapse-native-source.mjs';
const ctx={document_id:'doc',workflow_ref:{workflow_id:'flow'}};
function fixture(){
 const node={document_id:'doc',workflow_id:'flow',node_id:'source'},source={artifact_id:'a',upload_operation_id:'up'};
 const proof={verification_id:'v',status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination:'/test/data.csv',bytes:15,sha256:'a'.repeat(64)};
 const uploads=[{operation_id:'up',artifact:{artifact_id:'a',bytes:15,sha256:proof.sha256},outcome:{operation_id:'up',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,
  output:{artifact_id:'a',destination:proof.destination,bytes:15,sha256:proof.sha256,server_copy_verification:proof}}}];
 const history=[{sequence:1,cleanup_confirmed:true,request:{operation_id:'import',target:{kind:'existing',type:'imports.text',ref:node},parameters:{source,settings:{source:{source_path:proof.destination}}}},
  outcome:{status:'SUCCEEDED',output:{status:'SUCCEEDED',node,cleanup_complete:true,execution:{status:'completed',execution_id:'doc:1:1'},
   configuration:{readback:{kind:'text_import',values_are:'observed_ui_values',node,source:{source_path:proof.destination,connection:'Локальное'}}}}}}];
 const uploadHistory={complete:true,records:uploads.map(u=>({...u,sequence:0,destination:u.outcome.output.destination,cleanup_confirmed:true,transport_uncertain:false}))};return {history,uploads,uploadHistory};
}
test('completed private import resolves artifact provenance and cannot trust a path alone',()=>{
 const f=fixture(),value=completedStaticImports(f.history,f.uploads,ctx,f.uploadHistory)[0];
 assert.equal(value.source.sha256,'a'.repeat(64));assert.equal(value.execution_id,'doc:1:1');
 assert.throws(()=>completedStaticImports(f.history,[],ctx));
});
for(const [name,change] of [
 ['cleanup incomplete',f=>f.history[0].cleanup_confirmed=false],
 ['import pending',f=>f.history[0].outcome.output.execution.status='pending'],
 ['configuration path changed',f=>f.history[0].outcome.output.configuration.readback.source.source_path='/test/other.csv'],
 ['dynamic connection',f=>f.history[0].outcome.output.configuration.readback.source.connection='HTTP'],
 ['foreign document',f=>f.history[0].outcome.output.node.document_id='foreign'],
 ['foreign workflow',f=>f.history[0].outcome.output.node.workflow_id='foreign'],
 ['byte proof missing',f=>f.uploads[0].outcome.output.server_copy_verification.bytes_verified=false],
 ['later unresolved source change',f=>f.history.push({...structuredClone(f.history[0]),outcome:{status:'AMBIGUOUS'}})],
 ['later nonexecuted source change',f=>{const last=structuredClone(f.history[0]);last.outcome.output.execution.status='not_requested';f.history.push(last);}]
])test('static provenance rejects '+name,()=>{const f=fixture();change(f);assert.throws(()=>completedStaticImports(f.history,f.uploads,ctx,f.uploadHistory));});
