import test from 'node:test';
import assert from 'node:assert/strict';
import {groupingOutputDefinitions,resolveGroupingOutput,configureGroupingOutput} from '../lib/grouping-output.mjs';
const configuration={keys:[{name:'Group',label:'Группа',type:'string'}],measures:[{name:'Amount',label:'Сумма',type:'real',functions:18},{name:'Other',label:'Сумма',type:'real',functions:9}]};
const parameters={group_by:[{kind:'input_field',name:'Group'}],measures:[
 {field:{kind:'input_field',name:'Amount'},function:'avg',name:'Average',label:'Среднее'},
 {field:{kind:'input_field',name:'Other'},function:'max',name:'Maximum',label:'Максимум'},
 {field:{kind:'input_field',name:'Amount'},function:'count',name:'Rows',label:'Строки'},
 {field:{kind:'input_field',name:'Other'},function:'sum',name:'Total',label:'Итого'}]};
function native(linked=true){
 const sources=groupingOutputDefinitions(configuration).map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),index:i}));
 return {verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:linked?sources:[],
 target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,inherited:false,excluded:false,source:linked?s:null,...(linked?{name:'Custom'+i,label:'Одинаковая метка'}:{})}))};
}
test('full grouping layout follows requested functions, not generated order or duplicate labels',()=>{
 const result=resolveGroupingOutput(configuration,parameters,native());
 assert.deepEqual(result.fields.map(f=>[f.current.record_id,f.name,f.current.type]),[['t0','Group','string'],['t2','Average','real'],['t4','Maximum','real'],['t1','Rows','integer'],['t3','Total','real']]);
});
test('existing custom output names resolve only through exact native source links',()=>{
 const n=native(true),r=resolveGroupingOutput(configuration,parameters,n);
 assert.deepEqual(r.fields.map(f=>f.source.record_id),['s0','s2','s4','s1','s3']);
 n.target_fields[2].source=n.source_fields[1];
 assert.throws(()=>resolveGroupingOutput(configuration,parameters,n),/identity differs/);
});
test('mismatched aggregate types and incomplete native sources cannot authorize output edits',()=>{
 for(const mutate of [n=>{n.target_fields[1].type='real';},n=>n.source_fields.pop(),n=>{n.target_fields[3].inherited=true;}]){
  const n=native(true);mutate(n);assert.throws(()=>resolveGroupingOutput(configuration,parameters,n));
 }
});
test('explicit output layout renames and reorders the configured namespace',()=>{
 const mapping={fields:['Total','Group','Rows','Maximum','Average'].map(name=>({source:{kind:'configured_field',name},name:'Final'+name}))};
 assert.deepEqual(resolveGroupingOutput(configuration,parameters,native(true),mapping).fields.map(f=>f.name),['FinalTotal','FinalGroup','FinalRows','FinalMaximum','FinalAverage']);
 mapping.fields[1].name='FinalTotal';assert.throws(()=>resolveGroupingOutput(configuration,parameters,native(true),mapping),/conflict/);
});

test('single string count resolves suffixed native source through its exact link',()=>{
 const c={keys:[{name:'Group',label:'Group',type:'string'}],measures:[{name:'Text',label:'Text',type:'string',functions:2}]};
 const p={group_by:[{kind:'input_field',name:'Group'}],measures:[{field:{kind:'input_field',name:'Text'},function:'count',name:'TextCount',label:'Count'}]};
 const sources=[{record_id:'s0',name:'Group',label:'Group',type:'string'},{record_id:'s1',name:'Text_Count',label:'Text|Количество',type:'integer'}];
 const n={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,name:i?'Text':'Group',source:s,inherited:false,excluded:false}))};
 assert.equal(resolveGroupingOutput(c,p,n).fields[1].source.name,'Text_Count');
 n.source_fields[1].name='Unrelated_Count';assert.throws(()=>resolveGroupingOutput(c,p,n),/source differs/);
});

// The native exclusion group has no complete addressed definition page in
// this DOM double. All production field, reorder and exclusion drivers run.
function outputChannel(){
 const config={keys:[{name:'Segment',label:'Segment',type:'string'},{name:'Group',label:'Group',type:'string'}],
  measures:[{name:'Other',label:'Other',type:'integer',functions:1},{name:'Amount',label:'Amount',type:'real',functions:16},{name:'Text',label:'Text',type:'string',functions:2}]};
 const params={group_by:config.keys.map(f=>({kind:'input_field',name:f.name})),measures:[
  {field:{kind:'input_field',name:'Other'},function:'sum',name:'OtherTotal',label:'Сумма'},
  {field:{kind:'input_field',name:'Amount'},function:'avg',name:'MeanAmount',label:'Сумма'},
  {field:{kind:'input_field',name:'Text'},function:'count',name:'TextRows',label:'Количество строк'}]};
 const sources=groupingOutputDefinitions(config).map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),index:i,required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,
  node_context:{node_id:'grouping'},source_fields:sources,target_fields:[1,4,0,2,3].map((i,index)=>({...sources[i],record_id:'t'+i,index,group_index:index,source:sources[i],exclusion_source:null,excluded:false,inherited:false,data_kind:'Дискретный'}))};
 const actions=[];let selected=null,editor=null,draft=null;
 const state=()=>({node_mapping:structuredClone(native),wizard:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W',
  column_parameters:editor?{status:'observed',root_ref:'editor',selected_column:editor,fields:Object.fromEntries(['name','label'].map(k=>[k,{value:draft[k],input_ref:k}]))}:undefined,
  output_columns:{auto_sync:{status:'observed',value:native.autosync,ref:'auto'},
   page:{status:native.target_fields.some(f=>f.excluded)?'unverified_definition_page':'complete_definition_page',schema_id:'schema-'+native.autosync,offset:0,limit:8,total_columns:5,returned:5,next_offset:null},
   fields:native.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:selected===f.record_id}))}},
  ui:{elements:[...native.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click','double_click']})),
   ...['name','label'].map(k=>({ref:k,wizard_field:{scope:'output_column',name:k},allowed_actions:['set_wizard_field']})),
   {ref:'apply',column_close:{scope:'output'},allowed_actions:['apply_output_column']},
   ...[['auto','btnAutoSyncThroughColumns'],['up','btnMoveMappingColumnUp'],['exclude','btnAddMappingToExcluded']].map(([ref,key])=>({ref,tid:'W;DerivedDataSourceOutputSocketWizard;'+key,allowed_actions:['click']}))]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);
  if(a.ref==='auto'){native.autosync=!native.autosync;channel.afterAutosync?.(native);}
  else if(a.verb==='double_click'){editor=structuredClone(native.target_fields.find(f=>f.record_id===a.ref));draft={name:editor.name,label:editor.label};}
  else if(a.verb==='set_wizard_field')draft[a.ref]=a.text;
  else if(a.ref==='apply'){Object.assign(native.target_fields.find(f=>f.record_id===editor.record_id),draft);editor=null;}
  else if(a.ref==='up'){const i=native.target_fields.findIndex(f=>f.record_id===selected);[native.target_fields[i-1],native.target_fields[i]]=[native.target_fields[i],native.target_fields[i-1]];native.target_fields.forEach((f,index)=>Object.assign(f,{index,group_index:index}));}
  else if(a.ref==='exclude'){
   const f=native.target_fields.find(f=>f.record_id===selected),source=f.source;
   native.target_fields=native.target_fields.filter(t=>t!==f);native.target_fields.forEach((f,index)=>Object.assign(f,{index,group_index:index}));
   native.target_fields.push({...source,record_id:'excluded',field_id:'99',index:4,group_index:0,label:source.name,data_kind:'Неопределенное',source:null,exclusion_source:source,excluded:true,inherited:false});
  }else selected=a.ref;
 }};
 return {config,params,native,channel,actions,mapping:{autosync:false,fields:['Segment','Group','OtherTotal','MeanAmount','TextRows'].map(name=>({source:{kind:'configured_field',name},...(name==='Segment'?{excluded:true}:{})}))}};
}
test('Grouping reconfiguration completes edits and autosync before creating the excluded group',async()=>{
 const f=outputChannel();const result=await configureGroupingOutput(f.channel,f.config,f.params,f.mapping);
 assert.equal(result.verified,true);assert.equal(f.native.autosync,false);
 assert.deepEqual(f.native.target_fields.map(t=>[t.name,t.label,t.excluded]),[['Group','Group',false],['OtherTotal','Сумма',false],['MeanAmount','Сумма',false],['TextRows','Количество строк',false],['Segment','Segment',true]]);
 assert.equal(f.actions[0].ref,'auto');assert.equal(f.actions.at(-1).ref,'exclude');
});
test('Grouping validates the full layout before autosync and retains the autosync schema check',async()=>{
 const bad=outputChannel();bad.mapping.fields.pop();await assert.rejects(configureGroupingOutput(bad.channel,bad.config,bad.params,bad.mapping));assert.deepEqual(bad.actions,[]);
 const drift=outputChannel();drift.channel.afterAutosync=n=>{n.target_fields[0].label='changed';};
 await assert.rejects(configureGroupingOutput(drift.channel,drift.config,drift.params,drift.mapping),/definition changed/);assert.equal(drift.actions.length,1);
});
