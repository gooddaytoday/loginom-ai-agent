import test from 'node:test';
import assert from 'node:assert/strict';
import {planDateTimeRemovals} from '../lib/date-time-removal.mjs';

function fixture(){
 const matrix=Array.from({length:19},(_,func)=>({func,iso:false,first:false,last:false,number:func===4,string:false,string_format:''}));
 const source={record_id:'source-old',field_id:'2',name:'DateA_Y_1',label:'Дата (Год)',type:'integer',required:true};
 const target={record_id:'target-old',field_id:'7',name:'RenamedYear',label:'Произвольная метка',type:'integer',data_kind:'Дискретный',excluded:false,required:false,source};
 return {original:{input_fields:[{name:'DateA',label:'Дата',type:'datetime'}],field_matrices:[{name:'DateA',matrix}]},
  parameters:{fields:[{field:{kind:'input_field',name:'DateA'},transformations:[]}]},baseline:{source_fields:[source],target_fields:[target]}};
}
test('removal binds a renamed output through its original source, not its label or position',()=>{
 const f=fixture(),r=planDateTimeRemovals(f.original,f.parameters,f.baseline);
 assert.equal(r.length,1);assert.equal(r[0].target.name,'RenamedYear');assert.equal(r[0].target.field_id,'7');assert.equal(r[0].operation,'year');
});
test('an unchanged transformation needs no removal even when its output name changes',()=>{
 const f=fixture();f.parameters.fields[0].transformations=[{operation:'year',name:'AnotherYear',label:'Другой год'}];
 assert.deepEqual(planDateTimeRemovals(f.original,f.parameters,f.baseline),[]);
});
test('a removal requires an observed original output',()=>{
 const f=fixture();assert.throws(()=>planDateTimeRemovals(f.original,f.parameters),/original output bindings/);
});
test('wrong or ambiguous original sources never authorize deletion',()=>{
 for(const kind of ['wrong_name','wrong_type','wrong_label','ambiguous','unlinked','excluded']){
  const f=fixture(),s=f.baseline.source_fields[0],t=f.baseline.target_fields[0];
  if(kind==='wrong_name')s.name='DateB_Y_1';
  if(kind==='wrong_type')s.type='datetime';
  if(kind==='wrong_label')s.label='Дата (Месяц)';
  if(kind==='ambiguous')f.baseline.source_fields.push({...s,record_id:'duplicate'});
  if(kind==='unlinked')t.source=null;
  if(kind==='excluded')t.excluded=true;
  assert.throws(()=>planDateTimeRemovals(f.original,f.parameters,f.baseline),undefined,kind);
 }
});
test('unsupported native ISO and string removals are refused before flag changes',()=>{
 for(const kind of ['iso','string']){
  const f=fixture();if(kind==='iso')f.original.field_matrices[0].matrix[4].iso=true;
  else f.original.field_matrices[0].matrix[4].string=true;
  assert.throws(()=>planDateTimeRemovals(f.original,f.parameters,f.baseline),/ISO\/string\/unsupported/);
 }
});

test('orphan deletion refreshes mapping evidence after addressed paging and preserves the other fields',async()=>{
 const {removeDateTimeOrphans}=await import('../lib/date-time-removal.mjs');
 for(const mode of ['valid','changed_before','changed_after']) {
  const f=fixture(),origin=planDateTimeRemovals(f.original,f.parameters,f.baseline)[0];
  const orphan={...origin.target,source:null,index:0,group_index:0};
  const source={record_id:'retained-source',name:'DateA'},retained={...orphan,name:'DateA',record_id:'retained-target',field_id:'8',index:1,group_index:1,source};
  const mapping={verified:true,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',autosync:true,source_fields:[source],target_fields:[orphan,retained]};
  let clicked=0,refreshed=false;
  const state=(withMapping=false)=>{
   const fields=(clicked?[{...retained,index:0,group_index:0}]:[orphan,retained]).map(f=>({...f,status:'observed',name_ref:f.name}));
   const result={wizard:{stage:'output_mapping',output_columns:{page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:2,returned:2,next_offset:null},fields}},
    ui:{elements:fields.map(f=>({ref:f.name,allowed_actions:['click']})).concat({ref:'delete',allowed_actions:['click'],date_time_cell:{role:'output_delete',record_id:orphan.record_id,field_key:orphan.name}})}};
   if(withMapping){result.node_mapping=structuredClone(mapping);if(clicked){result.node_mapping.target_fields=[{...retained,index:0,group_index:0}];result.node_mapping.autosync=false;}
    if(mode==='changed_before'&&refreshed||mode==='changed_after'&&clicked)result.node_mapping.source_fields=[{...source,name:'Foreign'}];}
   return result;
  };
  const channel={async observe(options){if(options.outputColumnPage&&options.readMappings)refreshed=true;const s=state(options.readMappings);assert.equal(options.ready(s),true);return s;},
   async perform(options){assert.equal(refreshed,true);assert.ok(options.initialObservation.node_mapping);assert.equal(options.ready(options.initialObservation),true);assert.deepEqual(options.resolve(options.initialObservation),{verb:'click',ref:'delete'});clicked++;}};
  if(mode==='valid'){const result=await removeDateTimeOrphans(channel,state(true),[origin]);assert.equal(result.receipts.length,1);assert.equal(clicked,1);}
  else {await assert.rejects(removeDateTimeOrphans(channel,state(true),[origin]),mode==='changed_before'?/bindings changed/:/another output or source/);assert.equal(clicked,mode==='changed_before'?0:1);}
 }
});

test('fresh Date/time source retrieval may only append exact passthrough copies under existing autosync',async()=>{
 const {verifyDateTimeSourceFetch}=await import('../lib/date-time-removal.mjs');
 const f=fixture(),old={...f.baseline.target_fields[0],index:0,group_index:0,inherited:false,exclusion_source:null};
 const source={record_id:'amount-source',field_id:'8',index:1,name:'Amount',label:'Amount',type:'integer',required:false};
 const added={...old,record_id:'amount-target',field_id:'8',index:1,group_index:1,name:'Amount',label:'Amount',type:'integer',source};
 const before={node_context:{node_id:'node'},mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,source_fields:[],target_fields:[{...old,source:null}]};
 const after={...before,inventory_complete:true,source_identity_verified:true,source_fields:[old.source,source],target_fields:[old,added]};
 assert.equal(verifyDateTimeSourceFetch(before,after),true);
 for(const mode of ['fixed','changed_old','generated','renamed','inherited','foreign_source','removed_old']){
  const a=structuredClone(before),b=structuredClone(after);
  if(mode==='fixed')a.autosync=b.autosync=false;
  if(mode==='changed_old')b.target_fields[0].label='Other';
  if(mode==='generated')b.target_fields[1].source.required=true;
  if(mode==='renamed')b.target_fields[1].name='Other';
  if(mode==='inherited')b.target_fields[1].inherited=true;
  if(mode==='foreign_source')b.source_fields.pop();
  if(mode==='removed_old')b.target_fields.shift();
  assert.throws(()=>verifyDateTimeSourceFetch(a,b),undefined,mode);
 }
});
