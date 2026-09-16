import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMappedReformChanges,preflightMappedReform} from '../lib/reform-mapped-preflight.mjs';
function fixture(){
 const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'};
 const sources=['Raw','Keep'].map((name,i)=>({name,label:name,type:'string',record_id:'s'+i,field_id:String(i)}));
 const input={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,
  node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map((s,index)=>({...s,index,record_id:'i'+index,source:s,data_kind:'Дискретный'}))};
 const configuration={verified:true,inventory_complete:true,node_context:owner,fields:input.target_fields.map((f,index)=>({...f,record_id:'r'+index,
  name:index?'Keep':'Amount',type:index?'string':'real',data_kind:index?'Дискретный':'Непрерывный',excluded:false,usage_type:0,caching_method:0}))};
 return {input,configuration,mapping:{direction:'input',port:0,autosync:false}};
}
test('mixed request rejects collisions and invalid complete patches before an input settings commit',()=>{
 const {configuration,input,mapping}=fixture();
 for(const changes of [
  [{field:{kind:'input_field',name:'Raw'},name:'Keep'}],
  [{field:{kind:'input_field',name:'Raw'},type:'string'}],
  ['Raw','Keep'].map(name=>({field:{kind:'input_field',name},excluded:true})),
 ])assert.throws(()=>resolveMappedReformChanges({changes},configuration,input,mapping));
});
test('mixed preflight follows effective input names and stable IDs through mapping reorder',()=>{
 const {configuration,input,mapping}=fixture(),before=structuredClone({configuration,input});
 mapping.fields=[{source:{kind:'configured_field',name:'Keep'}},{source:{kind:'configured_field',name:'Raw'},name:'RenamedInput'}];
 const p=resolveMappedReformChanges({changes:[{field:{kind:'input_field',name:'RenamedInput'},name:'Total'}]},configuration,input,mapping);
 assert.deepEqual(p.fields.map(f=>f.name),['Keep','Total']);assert.equal(p.fields[1].field_id,'0');
 assert.deepEqual({configuration,input},before);
});
test('ordinary existing patches, no-ops and new nodes never open preflight wizards',async()=>{
 for(const [kind,changes,mappings] of [['existing',[{}],[]],['existing',[],[{direction:'input'}]],['new',[{}],[{direction:'input'}]]]){
  const result=await preflightMappedReform({operation:{parameters:{target:{kind},parameters:{changes},mappings}},execute:()=>assert.fail('Unexpected browser call')},{},{});
  assert.equal(result,null);
 }
});

test('input renames propagate inherited output names before complete collision validation',()=>{
 const {configuration,input,mapping}=fixture();
 mapping.fields=[{source:{kind:'configured_field',name:'Raw'}},{source:{kind:'configured_field',name:'Keep'},name:'NewKeep',label:'New label'}];
 assert.throws(()=>resolveMappedReformChanges({changes:[{field:{kind:'input_field',name:'Raw'},name:'NewKeep'}]},configuration,input,mapping),/collision/);
 const result=resolveMappedReformChanges({changes:[{field:{kind:'input_field',name:'Raw'},name:'Total'}]},configuration,input,mapping);
 assert.deepEqual(result.fields.map(f=>[f.name,f.label]),[['Total','Raw'],['NewKeep','New label']]);
});
