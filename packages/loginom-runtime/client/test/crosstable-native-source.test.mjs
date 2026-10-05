import vm from 'node:vm';
import {bindCollapseNative} from '../lib/collapse-native-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {completedCrossTableCollapses,validateCrossTableNativeSources,verifyCrossTableExecutionOwner,crossTableInputSourceSchema} from '../lib/crosstable-native-source.mjs';
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

function reorderedInput(){
 const node={verified:true,document_id:'d',workflow_id:'w',node_id:'cross'};
 const targets=[{index:0,name:'Region',label:'Region',type:'string'},{index:1,name:'Amount',label:'Amount',type:'real'}];
 const sources=targets.toReversed().map((f,index)=>({...f,index,record_id:'s'+index}));
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...node,verified:true,input_port:{port:0}},source_fields:sources,
  target_fields:targets.map(f=>({...f,source:{...sources.find(s=>s.name===f.name)}}))};
 return {node,mapping,fields:targets};
}
test('owned complete input lineage bridges source reordering without changing target roles',()=>{
 const f=reorderedInput();assert.deepEqual(crossTableInputSourceSchema(f.fields,f.mapping,f.node),
  [{name:'Amount',label:'Amount',type:'real'},{name:'Region',label:'Region',type:'string'}]);
 const imports=fixture().imports;
 const proof=validateCrossTableNativeSources(imports,[],f.fields,f.mapping,f.node);
 assert.equal(proof.input_schema[0].name,'Region');assert.equal(proof.input_source_schema[0].name,'Amount');
});
for(const [name,change] of [
 ['unverified configuration owner',f=>f.node.verified=false],['missing owner identity',f=>delete f.node.document_id],
 ['unknown source type',f=>f.mapping.source_fields[0].type='unknown'],['missing source label',f=>delete f.mapping.source_fields[0].label],
 ['foreign source field id',f=>f.mapping.target_fields[0].source.field_id='other'],
 ['foreign owner',f=>f.mapping.node_context.node_id='other'],['unverified owner',f=>f.mapping.node_context.verified=false],
 ['foreign port',f=>f.mapping.node_context.input_port.port=1],['missing source identity',f=>f.mapping.source_identity_verified=false],
 ['partial inventory',f=>f.mapping.inventory_complete=false],['missing source',f=>f.mapping.source_fields.pop()],
 ['missing target',f=>f.mapping.target_fields.pop()],['duplicate source record',f=>f.mapping.source_fields[1].record_id='s0'],
 ['duplicate source name',f=>f.mapping.source_fields[1].name='Amount'],['unordered source indexes',f=>f.mapping.source_fields[0].index=1],
 ['foreign source link',f=>f.mapping.target_fields[0].source.record_id='other'],['wrong source index',f=>f.mapping.target_fields[0].source.index=0],
 ['changed source type',f=>f.mapping.target_fields[0].source.type='integer'],['changed source label',f=>f.mapping.target_fields[0].source.label='changed'],
 ['renamed target',f=>{f.fields[0].name='Renamed';f.mapping.target_fields[0].name='Renamed';}],
 ['changed target label',f=>{f.fields[0].label='Changed';f.mapping.target_fields[0].label='Changed';}],
 ['changed target type',f=>{f.fields[0].type='integer';f.mapping.target_fields[0].type='integer';}],
 ['excluded target',f=>f.mapping.target_fields[0].excluded=true],
 ['duplicated link',f=>f.mapping.target_fields[1].source={...f.mapping.target_fields[0].source}],
 ['input target drift',f=>f.fields[0].name='Other'],['target ordinal drift',f=>f.mapping.target_fields[0].index=1],
])test('input reorder provenance refuses '+name,()=>{const f=reorderedInput();change(f);assert.throws(()=>crossTableInputSourceSchema(f.fields,f.mapping,f.node));});

function nativeReorderedBinding(){
 const f=reorderedInput(),proof=validateCrossTableNativeSources(fixture().imports,[],f.fields,f.mapping,f.node);
 const source={FGuid:'source',FIconCls:'bg-vendor-icon-importtextfile',data:{owner:'source'}},node={FGuid:'cross',FIconCls:'bg-vendor-icon-crosstab',data:{owner:'cross'}};
 const port={FGuid:'port',parent:node},sourcePort={FGuid:'source-port',parent:source};
 const column={Name:'Count',DisplayName:'Count',DataType:4};
 const dataset={FModelNode:node.data,FDataTable:{FDataSourceStore:{loading:false},FTotalRowCount:51},FDataSource:{$FHelper:{$FRowCount:51}},FColumnInfosStore:{data:{items:[{data:column}]}}};
 const root={internalId:'1',data:{loaded:true},childNodes:[{data:{id:'4',Status:3,ErrorDetails:'',loaded:true},childNodes:[{data:{id:'4.1',Status:3,ErrorDetails:'',ModelNode:source.data},childNodes:[]}]}]};
 const table={id:'dataset',checkVisibility:()=>true},tree={id:'tree'};
 const doc={querySelector:q=>q.includes('ConsoleForm')?tree:table};
 const model={FPreviewManager:{FPreviewVisible:true,FPreviewForm:{FCurrentPreviewNode:node,FCurrentPreviewPort:port}},FDiagram:{FNodes:{FCollection:[source,node]},FLinks:{FCollection:[{FGuid:'link',FSourcePort:sourcePort,FTargetPort:port}]}}};
 const context=vm.createContext({document:doc,location:{origin:'http://own'},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model}})}}}}}}},Ext:{getCmp:id=>id==='tree'?{getStore:()=>({isLoading:()=>false,getRoot:()=>root})}:{Controller:dataset}}});
 vm.runInContext("globalThis.__loginomDockPreparationV1={document,id:'d'}",context);
 const page={evaluate:(fn,args)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(args)+')',context)};
 const imports=[{node_id:'source',execution_id:'d:1:1',configuration:{output_mapping:{fields:structuredClone(proof.input_source_schema)}}}];
 const args={document_id:'d',workflow_id:'w',node_id:'cross',port_guid:'port',origin:'http://own',execution:{execution_id:'d:1:4'},execution_owner_verified:true,prefix:'MF;TF-1',imports,cross_table:proof,schema:[{name:'Count',label:'Count',type:4}]};
 return {page,args,root,source,port};
}
test('serialized native binding admits only the proved source order and preserves native 50x8 refusal',async()=>{
 const f=nativeReorderedBinding();const r=await bindCollapseNative(f.page,f.args);assert.equal(r.refusal.code,'NATIVE_FULL_BOUND_EXCEEDED');
 delete f.args.cross_table.input_source_schema;await assert.rejects(bindCollapseNative(f.page,f.args),/input differs from verified import/);
});
for(const [name,change] of [
 ['upstream source drift',f=>f.args.imports[0].configuration.output_mapping.fields[0].label='Changed'],
 ['target preview owner drift',f=>f.args.port_guid='other'],
 ['ancestor execution incomplete',f=>f.root.childNodes[0].data.Status=2],
 ['unowned newer ancestor',f=>{f.root.childNodes[0].data.id='5';f.root.childNodes[0].childNodes[0].data.id='5.1';}],
 ['byte proven source missing',f=>f.args.imports=[]],
])test('serialized reordered lineage refuses '+name,async()=>{const f=nativeReorderedBinding();change(f);await assert.rejects(bindCollapseNative(f.page,f.args));});
