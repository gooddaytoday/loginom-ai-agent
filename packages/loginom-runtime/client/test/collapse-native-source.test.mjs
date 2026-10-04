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
function readonlyFixture(){
 const f=fixture(),base=f.history[0],fields=[{name:'Id',label:'Id',type:'integer',excluded:false}];
 base.outcome.output.configuration.readback.output_mapping={fields};
 const ref=structuredClone(base.outcome.output.node);
 const read={sequence:3,cleanup_confirmed:true,request:{operation_id:'reread',target:{kind:'existing',type:'imports.text',ref},mode:'read_existing_output',parameters:{source_operation_id:'import'},inputs:[],mappings:[],finish:'execute'},
  outcome:{status:'SUCCEEDED',output:{status:'SUCCEEDED',node:ref,cleanup_complete:true,execution:{status:'completed',execution_id:'doc:1:3'},configuration:{status:'not_requested'},output:{ports:[{port:0,fresh:true,execution_id:'doc:1:3',schema:structuredClone(fields)}]}}}};
 f.history.push(read);return {...f,read};
}
test('successful readonly import reexecution retains the original byte proof with the new owned execution',()=>{
 const f=readonlyFixture(),p=completedStaticImports(f.history,f.uploads,ctx,f.uploadHistory)[0];
 assert.equal(p.execution_id,'doc:1:3');assert.equal(p.import_operation_id,'import');assert.equal(p.readonly_reexecution_operation_id,'reread');assert.equal(p.source.sha256,'a'.repeat(64));assert.equal(p.source.lineage.execution_sequence,3);
});
for(const [name,change] of [
 ['failed reexecution',f=>f.read.outcome.status='FAILED'],
 ['unfinished cleanup',f=>f.read.cleanup_confirmed=false],
 ['pending execution',f=>f.read.outcome.output.execution.status='pending'],
 ['schema changed',f=>f.read.outcome.output.output.ports[0].schema[0].type='real'],
 ['stale port',f=>f.read.outcome.output.output.ports[0].fresh=false],
 ['foreign execution',f=>f.read.outcome.output.output.ports[0].execution_id='foreign'],
 ['unknown source receipt',f=>f.read.request.parameters.source_operation_id='other'],
 ['mapping mutation',f=>f.read.request.mappings=[{}]],
 ['input mutation',f=>f.read.request.inputs=[{}]],
 ['configuration unknown',f=>f.read.outcome.output.configuration.status='applied'],
 ['nonmonotonic execution',f=>f.read.sequence=1],
 ['intervening successful import',f=>{const changed=structuredClone(f.history[0]);changed.request.operation_id='changed';changed.sequence=2;f.history.splice(1,0,changed);}],
 ['intervening unfinished import',f=>{const changed=structuredClone(f.history[0]);changed.outcome.status='AMBIGUOUS';f.history.splice(1,0,changed);}]
])test('readonly source cannot retain bytes after '+name,()=>{const f=readonlyFixture();change(f);assert.throws(()=>completedStaticImports(f.history,f.uploads,ctx,f.uploadHistory));});
