import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyConfiguredImportContinuation,readRetainedImportSource} from '../lib/node-import-continuation.mjs';
function fixture(){
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},context={...node,verified:true,surface:'wizard'};
 const values={source_path:'/test/file.csv',connection:'Локальное',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true};
 const column={status:'observed',index:0,name:'A',label:'Amount',type:'real',data_kind:'Непрерывный',used:true};
 const fields={delimiter:{status:'observed',value:';'}};
 return {node,configured:{source:{fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value}]))},format:{fields},schema_id:'schema',columns:[column]},
 source:{verified:true,node_context:context,values},format:{prepared_node_context:context,wizard:{stage:'text_import_format',settings:{fields:structuredClone(fields)}}},schema:{definition_complete:true,schema_id:'schema',fields:[structuredClone(column)]}};
}
test('same configured draft may continue without reopening or reconfiguring',()=>assert.equal(verifyConfiguredImportContinuation(fixture()),true));
test('changed source, format, fields, schema or ownership reject continuation',()=>{
 const changes=[f=>f.source.values.source_path='/test/other.csv',f=>f.source.values.encoding='Windows-1251',f=>f.source.values.first_line_as_title=false,
 f=>f.source.node_context.node_id='foreign',f=>f.format.prepared_node_context.workflow_id='foreign',f=>f.format.wizard.stage='done',
 f=>f.format.wizard.column_parameters={},f=>f.format.wizard.settings.fields.delimiter.value=',',f=>f.schema.fields[0].type='string',
 f=>f.schema.fields[0].used=false,f=>f.schema.fields.push({...f.schema.fields[0],index:1}),f=>f.schema.schema_id='reparsed',
 f=>f.schema.definition_complete=false,f=>f.source.verified=false];
 for(const change of changes){const f=structuredClone(fixture());change(f);assert.equal(verifyConfiguredImportContinuation(f),false,String(change));}
});
test('source reader refuses graph or a changed wizard around the cached read',async()=>{
 let reads=0;const page={evaluate:async()=>{reads++;return {verified:true}}};
 assert.equal((await readRetainedImportSource(page,{},async()=>({verified:true,surface:'graph'}))).verified,false);assert.equal(reads,0);
 let n=0;assert.equal((await readRetainedImportSource(page,{},async()=>({verified:true,surface:'wizard',tid:'W',node_id:String(n++)}))).verified,false);assert.equal(reads,1);
});

test('mapped continuation checks retained unused fields, source mapping and completion settings',async()=>{
 const {verifyMappedImportContinuation}=await import('../lib/node-import-continuation.mjs');
 const configured=fixture();
 for(const k of ['text_qualifier','null_marker','decimal_separator'])configured.configured.format.fields[k]={status:'observed',value:k};
 const context={...configured.node,verified:true,surface:'wizard'};
 const mapping={verified:true,node_context:context,inventory_complete:true,source_identity_verified:true,autosync:false,target_fields:[{name:'Mapped',source:{record_id:'source'}}],rendered_indices:[0]};
 const completion={ready:true,fields:{label:{status:'observed',value:'Import'},mode:{status:'observed',value:'Automatic'}}};
 const base={node:configured.node,configured:configured.configured,source:configured.source,
 retained:{verified:true,definition_complete:true,node_context:context,fields:structuredClone(configured.configured.columns),values:Object.fromEntries(Object.entries(configured.configured.format.fields).map(([k,v])=>[k,v.value]))},
 surface:{prepared_node_context:context,wizard:{stage:'done',completion:structuredClone(completion)},node_mapping:structuredClone(mapping)},mapped:{native_mapping:structuredClone(mapping),completion}};
 assert.equal(verifyMappedImportContinuation(base),true);
 for(const mutate of [f=>f.retained.fields[0].used=false,f=>f.retained.values.delimiter=',',f=>f.source.values.source_path='/other',
 f=>f.surface.node_mapping.target_fields[0].source.record_id='foreign',f=>f.surface.node_mapping.autosync=true,
 f=>f.surface.wizard.completion.fields.label.value='Other',f=>f.surface.wizard.stage='text_import_format']) {
  const f=structuredClone(base);mutate(f);assert.equal(verifyMappedImportContinuation(f),false,String(mutate));
 }
});

test('finish continuation requires unchanged live document, process incarnation and active output',async()=>{
 const {finishedImportSurface,verifyFinishedImportContinuation}=await import('../lib/node-import-continuation.mjs');
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},context={...node,verified:true,surface:'graph'};
 const surface={dom_epoch:{document:'dom',revision:21},prepared_node_context:context,wizard:{status:'absent'},
  node_processes:{verified:true,inventory_complete:true,show_completed:true,node_context:context,root_id:'root',
   processes:[{parent_id:null,process_id:'1',record_id:'record',state:'completed',error:false}]},
  node_outputs:{verified:true,node_context:context,ports:[{index:0,port_guid:'port',active:true}]}};
 const finish={verified:true,cleanup_complete:true,mode:'execute',execution_started:true,settings_applied:true,
  execution_id:'execution',execution_group:{node,execution_id:'execution',root_id:'root',group_id:'1',group_record_id:'record'},
  continuation_surface:finishedImportSurface(surface)};
 const base={node,finish,surface};assert.equal(verifyFinishedImportContinuation(base),true);
 for(const mutate of [f=>f.surface.dom_epoch.revision++,f=>f.surface.dom_epoch.document='new',
  f=>f.surface.prepared_node_context.node_id='other',f=>f.surface.node_processes.processes[0].record_id='reused',
  f=>f.surface.node_processes.processes.push({process_id:'2'}),f=>f.surface.node_outputs.ports[0].active=false,
  f=>f.surface.node_outputs.ports[0].port_guid='new',f=>f.finish.execution_id='other',f=>f.finish.execution_group.root_id='new',
  f=>f.finish.execution_started=false,f=>f.finish.mode='done',f=>f.surface.wizard.status='observed',
  f=>{f.surface.node_processes.processes[0].state='running';f.finish.continuation_surface=finishedImportSurface(f.surface);}]) {
  const f=structuredClone(base);mutate(f);assert.equal(verifyFinishedImportContinuation(f),false,String(mutate));
 }
});

test('a paused execution permits progress changes but binds the same launch and ports',async()=>{
 const {finishedImportSurface,verifyWaitingExecutionContinuation:verify}=await import('../lib/node-import-continuation.mjs');
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},context={...node,verified:true,surface:'graph',locked:true};
 const surface={dom_epoch:{document:'dom',revision:21},prepared_node_context:context,wizard:{status:'absent'},
  node_processes:{verified:true,inventory_complete:true,show_completed:true,node_context:context,root_id:'root',processes:[{
   parent_id:null,process_id:'1',record_id:'record',state:'running',error:false,progress_state:{verified:true,state:'running',terminal:false}}]},
  node_outputs:{verified:true,node_context:context,ports:[{index:0,port_guid:'port',active:false}]}};
 const finish={verified:true,cleanup_complete:true,mode:'execute',execution_started:true,settings_applied:true,execution_id:'execution',
  execution_group:{node,execution_id:'execution',root_id:'root',group_id:'1',group_record_id:'record'},continuation_surface:finishedImportSurface(surface)};
 const checkpoint={phase:'execute',read_only:true,cleanup_complete:true,execution_id:'execution'};
 const base={node,finish,surface,checkpoint};assert.equal(verify(base),true);
 const completed=structuredClone(base);completed.surface.dom_epoch.revision++;
 completed.surface.node_processes.processes[0].state='completed';completed.surface.node_outputs.ports[0].active=true;
 completed.surface.prepared_node_context.locked=false;assert.equal(verify(completed),true);
 for(const mutate of [f=>f.surface.dom_epoch.document='new',f=>f.surface.prepared_node_context.node_id='foreign',
  f=>f.surface.node_processes.root_id='new',f=>f.surface.node_processes.processes[0].record_id='reused',
  f=>f.surface.node_processes.processes.push({parent_id:null,process_id:'2',record_id:'second'}),f=>f.surface.node_outputs.ports[0].port_guid='changed',
  f=>f.surface.node_outputs.ports[0].active=false,f=>f.surface.wizard.status='observed',f=>f.checkpoint.execution_id='other',
  f=>f.checkpoint.read_only=false,f=>f.surface.node_processes.processes[0].error=true]) {
  const f=structuredClone(completed);mutate(f);assert.equal(verify(f),false,String(mutate));
 }
});
