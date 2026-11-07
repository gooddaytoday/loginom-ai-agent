import test from 'node:test';
import assert from 'node:assert/strict';
import {configureFilterOutputs} from '../lib/filter-output.mjs';

function fixture(autosync=true){
 const node_context={document_id:'doc',workflow_id:'wf',node_id:'filter'};
 const fields=['RowID','Amount'].map((name,index)=>({index,name,label:name,type:'integer',data_kind:'Дискретный'}));
 const source_fields=fields.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),required:false}));
 const gestures=[],opened=[],sync=[autosync,autosync];let port=0;
 const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',output_columns:{
  auto_sync:{status:'observed',value:sync[port],ref:'auto'},
  page:{status:'complete_definition_page',schema_id:sync[port]?'sync':'fixed',offset:0,limit:8,total_columns:2,returned:2,next_offset:null},
  fields:fields.map(f=>({...f,status:'observed',source:{status:'rendered_source',label:f.label,type:f.type}}))}},
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:sync[port],
   node_context:{...node_context,verified:true,output_port:{port}},source_fields,
   target_fields:source_fields.map((source,index)=>({...fields[index],record_id:'t'+index,field_id:String(index),source,excluded:false}))},
  ui:{elements:[{ref:'auto',tid:'W;DerivedDataSourceOutputSocketWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}});
 const channel={async openOutputPort(p){port=p;opened.push(p);},async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},
  async perform(o){const s=state();assert.ok(o.ready(s));const g=o.resolve(s);assert.deepEqual(g,{verb:'click',ref:'auto'});gestures.push(g);sync[port]=!sync[port];}};
 const configuration={node_context,input_fields:fields};
 const context={request:{target:{kind:'new'},bindings:[{}]},inputMapping:{verified:true,inventory_complete:true,
  node_context:{...node_context,input_port:{port:0}},target_fields:fields}};
 const finish=async()=>({verified:true,cleanup_complete:true});
 return {channel,configuration,context,finish,gestures,opened};
}
for(const kind of ['new','existing'])for(const autosync of [true,false])test(`${kind} bound Filter preserves native autosync=${autosync} with omitted output mapping`,async()=>{
 const f=fixture(autosync);f.context.request.target.kind=kind;
 const r=await configureFilterOutputs(f.channel,f.configuration,{},[],f.finish,f.context);
 assert.deepEqual(f.opened,[0,1]);assert.deepEqual(f.gestures,[]);
 assert.deepEqual(r.ports.map(p=>p.native_mapping.autosync),[autosync,autosync]);
 assert.deepEqual(r.ports.map(p=>p.native_mapping.target_fields.map(x=>x.name)),[['RowID','Amount'],['RowID','Amount']]);
});
test('bound and legacy Filter have the same output defaults and gestures',async()=>{
 const results=[];
 for(const bindings of [undefined,[],[{}]]){
  const f=fixture();f.context.request.bindings=bindings;
  const r=await configureFilterOutputs(f.channel,f.configuration,{},[],f.finish,f.context);
  results.push({ports:r.ports.map(p=>p.native_mapping),gestures:f.gestures});
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
test('explicit output autosync remains caller controlled',async()=>{
 const f=fixture();
 const r=await configureFilterOutputs(f.channel,f.configuration,{},[{port:0,autosync:false},{port:1,autosync:false}],f.finish,f.context);
 assert.deepEqual(r.ports.map(p=>p.native_mapping.autosync),[false,false]);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'auto'},{verb:'click',ref:'auto'}]);
});
