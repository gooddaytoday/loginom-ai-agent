import test from 'node:test';
import assert from 'node:assert/strict';
import {planDateTimeOutputAdditions,verifyDateTimeOutputAddition} from '../lib/date-time-output-additions.mjs';
function fixture(){
 const sources=[{record_id:'s0',name:'Old',label:'Old',type:'integer',required:false},{record_id:'s1',name:'DateB_Q_1',label:'Дата (Квартал)',type:'integer',required:true},{record_id:'s2',name:'Excluded',label:'Excluded',type:'integer',required:false}];
 const targets=[{record_id:'t0',field_id:'0',index:0,group_index:0,name:'Renamed',label:'Сохранить',type:'integer',data_kind:'Непрерывный',source:sources[0],exclusion_source:null,excluded:false,required:false,inherited:false},
 {record_id:'t2',field_id:'2',index:1,group_index:0,name:'Excluded',label:'Excluded',type:'integer',data_kind:'Неопределенное',source:null,exclusion_source:sources[2],excluded:true,required:false,inherited:false}];
 const before={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{node_id:'node'},mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',autosync:false,source_fields:sources,target_fields:targets};
 const added={record_id:'new',field_id:'3',index:1,group_index:1,name:sources[1].name,label:sources[1].label,type:'integer',data_kind:'Дискретный',source:sources[1],exclusion_source:null,excluded:false,required:false,inherited:false};
 const after=structuredClone({...before,target_fields:[targets[0],added,{...targets[1],index:2}]});
 return {before,after,source:sources[1],p:{fields:[{transformations:[{}]}]},resolve:()=>sources[1]};
}
test('only requested new source is planned and exclusions are already accounted for',()=>{
 const f=fixture();assert.deepEqual(planDateTimeOutputAdditions(f.before,{},f.p,f.resolve),[f.source]);
 assert.deepEqual(planDateTimeOutputAdditions(f.after,{},f.p,f.resolve),[]);
 assert.equal(verifyDateTimeOutputAddition(f.before,f.after,f.source).autosync_preserved,true);
});
for(const [name,change] of Object.entries({autosync:f=>f.after.autosync=true,owner:f=>f.after.node_context.node_id='other',renamed:f=>f.after.target_fields[0].name='lost',
 exclusion:f=>f.after.target_fields[2].excluded=false,link:f=>f.after.target_fields[0].source.record_id='other',source:f=>f.after.source_fields[1].name='other',
 newLink:f=>f.after.target_fields[1].source.record_id='other',newName:f=>f.after.target_fields[1].name='wrong',position:f=>f.after.target_fields[1].index=2,
 extra:f=>f.after.target_fields.push({...f.after.target_fields[1],record_id:'extra'}),removed:f=>f.after.target_fields.shift()}))test('creation rejects '+name,()=>{
 const f=fixture();change(f);assert.throws(()=>verifyDateTimeOutputAddition(f.before,f.after,f.source));
});
test('unrequested missing source and name collision refuse before any creation',()=>{
 const f=fixture();assert.throws(()=>planDateTimeOutputAdditions(f.before,{}, {},f.resolve),/unrequested/);
 f.before.target_fields[0].name=f.source.name;assert.throws(()=>planDateTimeOutputAdditions(f.before,{},f.p,f.resolve),/collides/);
});

test('source creation selects the exact native field, preserves exclusion, and never enables autosync',async()=>{
 const {ensureDateTimeRequestedOutputs}=await import('../lib/date-time-output-additions.mjs');const f=fixture();let native=f.before,links=false,selection=[],lost=false;const actions=[];
 const root='MF;TF;WizrdMCF',base=root+';'+native.mapping_wizard+';';
 const snapshot=()=>({wizard:{stage:'output_mapping',root_tid:root},node_mapping:{...native,...(links?{source_selection:{verified:true,record_ids:selection}}:{})},
  ui:{elements:['rbLinks;DisplayEl','rbTable;DisplayEl','colSourceName_DateB_Q_1','btnCreateMapping'].map(key=>({tid:base+key,ref:key,allowed_actions:['click'],...(key.startsWith('colSourceName_')?{date_time_cell:{role:'output_source',record_id:f.source.record_id,field_key:f.source.name}}:{})}))}});
 const channel={observe:async({ready})=>{const s=structuredClone(snapshot());assert.ok(ready(s));return s;},perform:async({ready,resolve})=>{
  const s=structuredClone(snapshot());assert.ok(ready(s));const a=resolve(s);actions.push(a.ref);
  if(a.ref==='rbLinks;DisplayEl')links=true;else if(a.ref==='rbTable;DisplayEl')links=false;
  else if(a.ref==='colSourceName_DateB_Q_1')selection=[f.source.record_id];else if(a.ref==='btnCreateMapping'){assert.deepEqual(selection,[f.source.record_id]);native=f.after;if(lost)throw Error('reply lost');}
 }};
 const r=await ensureDateTimeRequestedOutputs(channel,snapshot(),{},f.p,f.resolve);assert.equal(r.receipts.length,1);assert.equal(r.state.node_mapping.autosync,false);
 assert.deepEqual(actions,['rbLinks;DisplayEl','colSourceName_DateB_Q_1','btnCreateMapping','rbTable;DisplayEl']);
 native=f.before;links=false;selection=[];lost=true;actions.length=0;
 await assert.rejects(ensureDateTimeRequestedOutputs(channel,snapshot(),{},f.p,f.resolve),/reply lost/);
 assert.equal(actions.filter(x=>x==='btnCreateMapping').length,1);assert.equal(native,f.after);
});
