import test from 'node:test';
import assert from 'node:assert/strict';
import {completedCrossTableCollapses,validateCrossTableNativeSources,verifyCrossTableExecutionOwner} from '../lib/crosstable-native-source.mjs';
test('exact CrossTable needs the private verified execution receipt beyond its public execution id',()=>{
 const ctx={document_id:'own',execution:{status:'completed',execution_id:'own:1:2'}},proof={...ctx.execution,verified:true,owner_verified:true};
 assert.equal(verifyCrossTableExecutionOwner(proof,ctx),true);
 for(const p of [ctx.execution,{...proof,verified:false},{...proof,owner_verified:false},{...proof,status:'failed'},
  {...proof,execution_id:'own:1:1'},{...proof,execution_id:'foreign:1:2'}])assert.throws(()=>verifyCrossTableExecutionOwner(p,ctx));
});
const ctx={document_id:'d',workflow_ref:{workflow_id:'w'}};
function fixture(){
 const ref={document_id:'d',workflow_id:'w',node_id:'collapse'},fields=[{name:'Key',label:'Key',type:'string',source_name:'Key'}];
 const ids=['input','configure','node_finish','output','finish'].map(p=>'collapse:'+p);
 const configuration={kind:'collapse',values_are:'observed_ui_values',node:{...ref},mode:'unpivot',information:[],transposed:[{name:'Key',label:'Key',type:'string'}],ignore_empty:false,receipt_ids:ids,input_mapping:{port:0,fields},output_mapping:{port:0,fields}};
 const history=[{sequence:2,cleanup_confirmed:true,request:{target:{type:'transform.collapse_columns',ref}},outcome:{status:'SUCCEEDED',output:{status:'SUCCEEDED',node:ref,cleanup_complete:true,execution:{status:'completed',execution_id:'d:1:2'},phases:ids.map(receipt_id=>({receipt_id,status:'verified'})),configuration:{readback:configuration}}}}];
 const imports=[{node_id:'source',execution_id:'d:1:1',configuration:{kind:'text_import',source:{connection:'Локальное',source_path:'/owner/data.csv'}},source:{destination:'/owner/data.csv',bytes:50,sha256:'a'.repeat(64),bytes_verified:true,upload_completion_verified:true}}];
 return {history,imports,fields};
}
test('a settled observed Collapse is admitted only from private completed history',()=>{
 const f=fixture(),ancestors=completedCrossTableCollapses(f.history,ctx);
 assert.equal(ancestors[0].execution_id,'d:1:2');
 assert.equal(validateCrossTableNativeSources(f.imports,ancestors,f.fields).input_schema[0].name,'Key');
});
for(const [name,change] of [
 ['unfinished cleanup',f=>f.history[0].cleanup_confirmed=false],
 ['failed outcome',f=>f.history[0].outcome.status='FAILED'],
 ['nonexecuted settings',f=>f.history[0].outcome.output.execution.status='not_requested'],
 ['foreign workflow',f=>f.history[0].outcome.output.node.workflow_id='other'],
 ['new unresolved change',f=>f.history.push({...structuredClone(f.history[0]),outcome:{status:'AMBIGUOUS'}})]
])test('private Collapse provenance does not reuse '+name,()=>{
 const f=fixture();change(f);assert.equal(completedCrossTableCollapses(f.history,ctx).length,0);
});
for(const [name,change] of [
 ['foreign configuration owner',f=>f.history[0].outcome.output.configuration.readback.node.node_id='other'],
 ['missing configuration receipt',f=>f.history[0].outcome.output.phases.pop()],
 ['missing observed subtype',f=>delete f.history[0].outcome.output.configuration.readback.values_are]
])test('private Collapse provenance refuses '+name,()=>{
 const f=fixture();change(f);assert.throws(()=>completedCrossTableCollapses(f.history,ctx));
});
for(const [name,change] of [
 ['missing byte proof',f=>delete f.imports[0].source.bytes_verified],
 ['missing completed upload',f=>delete f.imports[0].source.upload_completion_verified],
 ['foreign destination',f=>f.imports[0].source.destination='/other/data.csv'],
 ['dynamic source',f=>f.imports[0].configuration.source.connection='HTTP'],
 ['missing digest',f=>delete f.imports[0].source.sha256],
 ['oversized input schema',f=>f.fields=Array(129).fill(f.fields[0])]
])test('exact source validation refuses '+name,()=>{
 const f=fixture();change(f);assert.throws(()=>validateCrossTableNativeSources(f.imports,completedCrossTableCollapses(f.history,ctx),f.fields));
});
