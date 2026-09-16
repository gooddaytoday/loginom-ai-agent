import test from 'node:test';
import assert from 'node:assert/strict';
import {configureOutputAutosync} from '../lib/port-mapping-procedure.mjs';

function fixture(initial=true) {
 let value=initial,mutations=0,changed=false,foreign=false;
 const state=()=>({wizard:{status:'observed',stage:'output_mapping',root_ref:foreign?'other':'root',root_tid:'W',
  output_columns:{auto_sync:{status:'observed',value,ref:'auto'},
   page:{status:'complete_definition_page',schema_id:value?'s1':'s2',offset:0,limit:8,total_columns:1,returned:1,next_offset:null},
   fields:[{status:'observed',index:0,name:changed?'Changed':'Id',label:'Id',type:'integer',data_kind:'Дискретный',source:{cell_ref:'cell-'+mutations,status:'rendered_source',label:'Id',type:'integer'}}]}},
  ui:{elements:[{ref:'auto',tid:'W;ColumnsMappingEngineOutputPortWizard;btnAutoSyncThroughColumns',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=state();if(!o.ready(s))throw new Error('Not ready');return s;},
  async perform(o){const s=state();assert.ok(o.ready(s));assert.deepEqual(o.resolve(s),{verb:'click',ref:'auto'});mutations++;value=!value;channel.afterMutation?.();}};
 return {channel,mutations:()=>mutations,change:()=>{changed=true;},foreign:()=>{foreign=true;}};
}

test('output autosync toggles once and preserves the full definition',async()=>{
 for(const value of [false,true]){const f=fixture(!value),r=await configureOutputAutosync(f.channel,value);
  assert.equal(f.mutations(),1);assert.equal(r.autosync.value,value);assert.equal(r.rendered_definition_preserved,true);assert.equal(r.settings_applied,false);}
});
test('already requested autosync value does not issue another toggle',async()=>{
 const f=fixture(false),r=await configureOutputAutosync(f.channel,false);assert.equal(f.mutations(),0);assert.equal(r.effect_possible,false);
});
test('autosync refuses changed fields and foreign wizard after an effect without retrying',async()=>{
 for(const kind of ['change','foreign']){const f=fixture();f.channel.afterMutation=f[kind];
  await assert.rejects(configureOutputAutosync(f.channel,false));assert.equal(f.mutations(),1);}
});
test('autosync requires an explicit boolean before observation',async()=>{
 await assert.rejects(configureOutputAutosync({},'false'),/boolean/);
});

test('configured mapping resolves duplicate labels by source name with explicit order and exclusion',async()=>{
 const {resolveConfiguredOutputMapping:resolve}=await import('../lib/port-mapping-procedure.mjs');
 const configured=['A','B'].map(name=>({name,label:'Same',type:'string',data_kind:'Дискретный',used:true}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,
  source_fields:configured.map((c,i)=>({...c,required:false,record_id:'s'+i,field_id:String(i)}))};
 native.target_fields=native.source_fields.map((s,i)=>({name:s.name,label:s.label,type:s.type,data_kind:'Дискретный',required:false,record_id:'t'+i,source:s}));
 const mapping={direction:'output',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'B'},name:'First'},
  {source:{kind:'configured_field',name:'A'},excluded:true}]};
 const r=resolve(mapping,configured,native);assert.deepEqual(r.fields.map(f=>f.source.name),['B','A']);assert.equal(r.fields[0].name,'First');assert.equal(r.fields[1].excluded,true);
 native.target_fields[1].data_kind='Неопределенное';assert.equal(resolve(mapping,configured,native).fields[0].data_kind,'Неопределенное');
 for(const change of [m=>m.fields.pop(),m=>m.fields[0].source.name='A',m=>m.fields[0].source.name='Missing',m=>m.fields[0].excluded=true,
  m=>m.fields[0].name='A']){const m=structuredClone(mapping);change(m);assert.throws(()=>resolve(m,configured,native));}
 for(const required of [true,undefined]){const restricted=structuredClone(native);restricted.source_fields[0].required=required;assert.throws(()=>resolve(mapping,configured,restricted),/cannot be excluded/);}
 const bad=structuredClone(native);bad.source_fields[0].type='integer';assert.throws(()=>resolve(mapping,configured,bad));
});
test('second output mapping requires the verified exact native port owner',async()=>{
 const {resolveConfiguredOutputMapping:resolve}=await import('../lib/port-mapping-procedure.mjs');
 const configured=[{name:'Id',label:'Id',type:'integer',used:true}],native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,
  mapping_wizard:'DerivedDataSourceOutputSocketWizard',source_fields:configured,target_fields:[],
  node_context:{verified:true,output_port:{port:1}}};
 assert.equal(resolve({direction:'output',port:1},configured,native).autosync,true);
 for(const context of [undefined,{verified:false,output_port:{port:1}},{verified:true,output_port:{port:0}},{verified:true,input_port:{port:1}}])
  assert.throws(()=>resolve({direction:'output',port:1},configured,{...native,node_context:context}),/direction/);
 assert.throws(()=>resolve({direction:'input',port:1},configured,native),/direction/);
});

function fieldFixture() {
 const original={record_id:'t',field_id:'0',index:0,name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',
  source:{record_id:'s',field_id:'0',index:0,name:'Amount',label:'Amount',type:'real'}};
 let current=structuredClone(original),editor=false,draft={},mutations=0;
 const field={current:structuredClone(original),source:original.source,name:'Mapped',label:'Сумма'};
 const state=()=>{
  const row={...current,status:'observed',name_ref:'name',selected:editor};
  const params=editor?{status:'observed',root_ref:'editor',selected_column:{...original,status:'observed'},fields:{name:{value:draft.name,input_ref:'name'},label:{value:draft.label,input_ref:'label'}}}:undefined;
  const fields=[row];
  return {wizard:{status:'observed',stage:'output_mapping',root_ref:'wizard',root_tid:'W',column_parameters:params,
   output_columns:{fields,page:{status:'complete_definition_page',offset:0,limit:8,returned:1,total_columns:1,next_offset:null,schema_id:'schema'}}},
   node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,source_fields:[original.source],target_fields:[current],rendered_indices:[0]},
   ui:{elements:editor?[...['name','label'].map(k=>({ref:k,wizard_field:{scope:'output_column',name:k},allowed_actions:['set_wizard_field']})),
    {ref:'apply',column_close:{scope:'output'},allowed_actions:['apply_output_column']}]:[{ref:'name',allowed_actions:['double_click']}]}};
 };
 const channel={async observe(o){const s=structuredClone(state());if(!o.ready(s))throw Error('Not ready');return s;},
  async perform(o){const s=structuredClone(state());assert.ok(o.ready(s));const a=o.resolve(s);mutations++;
   if(a.verb==='double_click'){editor=true;draft={name:current.name,label:current.label};}
   else if(a.verb==='set_wizard_field')draft[a.ref]=a.text;
   else if(a.verb==='apply_output_column'){current={...current,...draft};editor=false;channel.afterApply?.(current);}
   else throw Error('Unexpected action');
  }};
 return {channel,field,mutations:()=>mutations};
}
test('output field driver edits name and label once and proves native source preservation',async()=>{
 const {configureOutputField}=await import('../lib/port-mapping-procedure.mjs');
 const f=fieldFixture(),r=await configureOutputField(f.channel,f.field);assert.equal(r.verified,true);assert.equal(r.field.name,'Mapped');assert.equal(r.field.source.record_id,'s');assert.equal(f.mutations(),4);
});
test('output field driver rejects changed identity and unexpected post-Apply state',async()=>{
 const {configureOutputField}=await import('../lib/port-mapping-procedure.mjs');
 const before=fieldFixture();before.field.current.record_id='foreign';await assert.rejects(configureOutputField(before.channel,before.field));assert.equal(before.mutations(),0);
 const after=fieldFixture();after.channel.afterApply=c=>{c.source={...c.source,record_id:'foreign'};};await assert.rejects(configureOutputField(after.channel,after.field),/unrelated/);assert.equal(after.mutations(),4);
});
test('output field driver preserves a matching field without opening its editor',async()=>{
 const {configureOutputField}=await import('../lib/port-mapping-procedure.mjs');const f=fieldFixture();f.field.name='Amount';f.field.label='Amount';
 assert.equal((await configureOutputField(f.channel,f.field)).effect_possible,false);assert.equal(f.mutations(),0);
});

function reorderFixture(grouped=false) {
 const sources=(grouped?['A','B','C','D']:['A','B','C']).map((name,i)=>({name,label:name,record_id:'s'+i,field_id:String(i),index:i,type:'string'}));
 let fields=sources.map((source,index)=>({name:source.name,label:source.label,type:'string',data_kind:'Дискретный',record_id:'t'+index,field_id:String(index),index,source})),selected=null,actions=0;
 if(grouped)fields=fields.map((f,i)=>({...f,excluded:i>=2,group_index:i%2}));
 const state=()=>({wizard:{root_ref:'wizard',root_tid:'W',stage:'output_mapping',output_columns:{page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:fields.length,returned:fields.length,next_offset:null},fields:fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}))}},
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,...(grouped?{mapping_wizard:'DerivedDataSourceOutputSocketWizard'}:{}),source_fields:sources,target_fields:fields,rendered_indices:fields.map(f=>f.index)},
  ui:{elements:[...fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),{ref:'up',tid:'W;'+(grouped?'DerivedDataSourceOutputSocketWizard':'ColumnsMappingEngineOutputPortWizard')+';btnMoveMappingColumnUp',allowed_actions:['click']}]}});
 const channel={async observe(o){const s=structuredClone(state());if(!o.ready(s))throw Error('Not ready');return s;},async perform(o){const s=structuredClone(state());assert.ok(o.ready(s));const a=o.resolve(s);actions++;
  if(a.ref!=='up')selected=a.ref;else{const index=fields.findIndex(f=>f.record_id===selected);assert.ok(index>0);if(grouped)assert.equal(fields[index-1].excluded,fields[index].excluded);[fields[index-1],fields[index]]=[fields[index],fields[index-1]];fields=fields.map((f,index)=>({...f,index,...(grouped?{group_index:index%2}:{})}));channel.afterMove?.(fields);}}};
 return {channel,actions:()=>actions};
}
test('output reorder moves only requested records and retains native source identities',async()=>{
 const {reorderOutputFields}=await import('../lib/port-mapping-procedure.mjs');const f=reorderFixture(),r=await reorderOutputFields(f.channel,['t2','t1','t0']);
 assert.equal(r.moves,3);assert.equal(f.actions(),6);assert.deepEqual(r.definition.target_fields.map(f=>f.source.name),['C','B','A']);
 const noop=await reorderOutputFields(f.channel,['t2','t1','t0']);assert.equal(noop.effect_possible,false);assert.equal(f.actions(),6);
});
test('output reorder refuses incomplete goals and stops after an unexpected native change',async()=>{
 const {reorderOutputFields}=await import('../lib/port-mapping-procedure.mjs');
 for(const ids of [['t0'],['t0','t0','t2'],['t0','t1','foreign']]){const f=reorderFixture();await assert.rejects(reorderOutputFields(f.channel,ids));assert.equal(f.actions(),0);}
 const f=reorderFixture();f.channel.afterMove=fields=>{fields[0].label='Wrong';};await assert.rejects(reorderOutputFields(f.channel,['t2','t1','t0']),/unrelated/);assert.equal(f.actions(),2);
});

 test('field edit planning breaks cycles without taking an existing or requested name',async()=>{
 const {planOutputFieldEdits:plan}=await import('../lib/port-mapping-procedure.mjs');
 const fields=['A','B','C','DockMappingTemporary1'].map((name,i)=>({current:{record_id:'t'+i,name,label:name},name:['B','C','A',name][i],label:'Label'+i}));
 const steps=plan(fields);assert.equal(steps.filter(s=>s.temporary).length,1);assert.equal(steps.find(s=>s.temporary).name,'DockMappingTemporary2');
 const state=new Map(fields.map(f=>[f.current.record_id,{...f.current}]));
 for(const s of steps){assert.ok(![...state.values()].some(f=>f.record_id!==s.record_id&&f.name.toLowerCase()===s.name.toLowerCase()));state.set(s.record_id,{...state.get(s.record_id),name:s.name,label:s.label});}
 for(const f of fields){assert.equal(state.get(f.current.record_id).name,f.name);assert.equal(state.get(f.current.record_id).label,f.label);}
 const bad=structuredClone(fields);bad[1].name='b';assert.throws(()=>plan(bad),/Ambiguous/);
 const excluded=structuredClone(fields);excluded[0].excluded=true;assert.throws(()=>plan(excluded),/Supported/);
 });
 test('field edit planning leaves matching fields untouched and orders a free rename chain',async()=>{
 const {planOutputFieldEdits:plan}=await import('../lib/port-mapping-procedure.mjs');
 const fields=['A','B','C'].map((name,i)=>({current:{record_id:'t'+i,name,label:name},name:['B','D','C'][i],label:name}));
 assert.deepEqual(plan(fields).map(s=>s.record_id),['t1','t0']);
 assert.deepEqual(plan(fields.map(f=>({...f,name:f.current.name}))),[]);
 });
 test('batch output field edits validate exclusions before opening any editor',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs');const f=fieldFixture();
 const configured=[{name:'Amount',label:'Amount',type:'real',used:true}];
 await assert.rejects(configureOutputFields(f.channel,{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Amount'},excluded:true}]},configured),/cannot be excluded/);assert.equal(f.mutations(),0);
 const r=await configureOutputFields(f.channel,{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Amount'},name:'Mapped',label:'Сумма'}]},configured);
 assert.equal(r.verified,true);assert.equal(r.edits.length,1);assert.equal(f.mutations(),4);
 });

function exclusionFixture() {
 const sources=['A','B','C'].map((name,index)=>({record_id:'s'+index,field_id:String(index),index,name,label:name,type:'string',required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,source_fields:sources,
  target_fields:sources.map((source,index)=>({...source,record_id:'t'+index,source,group_index:index,excluded:false,inherited:false,exclusion_source:null,data_kind:'Дискретный'})),rendered_indices:[0,1,2]};
 let selected=null,count=0;
 const state=()=>({node_mapping:structuredClone(native),wizard:{status:'observed',stage:'output_mapping',root_tid:'W',root_ref:'root',output_columns:{
  page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,total_columns:native.target_fields.length,returned:native.target_fields.length,next_offset:null},
  fields:native.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:selected===f.record_id}))}},
 ui:{elements:[...native.target_fields.map(f=>({ref:f.record_id,allowed_actions:['click']})),{ref:'exclude',tid:'W;DerivedDataSourceOutputSocketWizard;btnAddMappingToExcluded',allowed_actions:['click']}]}});
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const s=state();assert.ok(o.ready(s));const a=o.resolve(s);count++;
  if(a.ref==='exclude'){
   const field=native.target_fields.find(f=>f.record_id===selected),source=field.source;
   const groups=new Map();native.target_fields=native.target_fields.filter(f=>f!==field).map((f,index)=>{
    const group_index=groups.get(f.excluded)??0;groups.set(f.excluded,group_index+1);return {...f,index,group_index};
   });
   native.target_fields.push({...source,label:source.name,record_id:'excluded'+count,field_id:String(99+count),index:2,group_index:groups.get(true)??0,excluded:true,inherited:false,source:null,exclusion_source:source,data_kind:'Неопределенное'});
   channel.afterExclude?.(native);
  }else {selected=a.ref;channel.afterSelection?.(native);}
 }};
 return {channel,native,count:()=>count};
}
test('optional exclusion creates one source exclusion, preserves all other fields and is idempotent',async()=>{
 const {excludeOutputField}=await import('../lib/port-mapping-procedure.mjs');
 const f=exclusionFixture(),r=await excludeOutputField(f.channel,'s1');assert.equal(r.verified,true);assert.equal(f.count(),2);
 assert.equal(r.excluded_record.source,null);assert.equal(r.excluded_record.exclusion_source.record_id,'s1');
 assert.deepEqual(r.definition.target_fields.map(f=>f.name),['A','C','B']);
 assert.equal((await excludeOutputField(f.channel,'s1')).effect_possible,false);assert.equal(f.count(),2);
});

test('batch exclusions preserve the active field and repeated full mapping needs no gestures',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs'),f=exclusionFixture();
 const configured=f.native.source_fields.map(s=>({...s,used:true}));
 const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name!=='A'}))};
 const r=await configureOutputFields(f.channel,mapping,configured);
 assert.equal(r.verified,true);assert.equal(f.count(),4);
 assert.deepEqual(r.definition.target_fields.map(f=>[f.name,f.excluded,f.group_index]),[['A',false,0],['B',true,0],['C',true,1]]);
 const repeat=await configureOutputFields(f.channel,mapping,configured);assert.equal(repeat.effect_possible,false);assert.equal(f.count(),4);
 const restore=structuredClone(mapping);restore.fields[1].excluded=false;
 await assert.rejects(configureOutputFields(f.channel,restore,configured),/Restoring/);assert.equal(f.count(),4);
});
test('exclusion retains source identity when Loginom resets the service label to its name',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs'),f=exclusionFixture();
 f.native.source_fields[1].label='Дата';f.native.target_fields[1].label='Дата';
 const configured=f.native.source_fields.map(s=>({...s,used:true}));
 const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name==='B'}))};
 const result=await configureOutputFields(f.channel,mapping,configured);
 assert.equal(result.verified,true);assert.equal(result.definition.target_fields.at(-1).label,'B');
 assert.equal(result.definition.target_fields.at(-1).exclusion_source.label,'Дата');
 assert.equal((await configureOutputFields(f.channel,mapping,configured)).effect_possible,false);
 assert.equal(f.count(),2);
});

test('batch exclusion validates immutable names and every restriction before its first gesture',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs');
 for(const change of [
  (f,m)=>{m.fields[1].name='Renamed';},(f,m)=>{m.fields[1].label='Other';},
  f=>{f.native.source_fields[2].required=true;},f=>{f.native.target_fields[2].inherited=true;},
  f=>{delete f.native.mapping_wizard;},(f,m)=>{m.fields[0].name='B';},
 ]) {
  const f=exclusionFixture(),configured=f.native.source_fields.map(s=>({...s,used:true}));
  const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name!=='A'}))};
  change(f,mapping);await assert.rejects(configureOutputFields(f.channel,mapping,configured));assert.equal(f.count(),0);
 }
});
test('required, inherited, unknown and last output exclusions refuse before a gesture',async()=>{
 const {excludeOutputField}=await import('../lib/port-mapping-procedure.mjs');
 for(const change of [f=>{f.native.source_fields[1].required=true;},f=>{f.native.target_fields[1].required=true;},
  f=>{f.native.target_fields[1].inherited=true;},f=>{delete f.native.target_fields[1].inherited;},
  f=>{f.native.target_fields=f.native.target_fields.slice(1,2);},f=>{f.native.source_fields[1].record_id='other';}]){
  const f=exclusionFixture();change(f);await assert.rejects(excludeOutputField(f.channel,'s1'));assert.equal(f.count(),0);
 }
});
test('exclusion refuses unrelated changes before and after the effect without retry',async()=>{
 const {excludeOutputField}=await import('../lib/port-mapping-procedure.mjs');
 const f=exclusionFixture();f.channel.afterSelection=n=>{n.autosync=false;};await assert.rejects(excludeOutputField(f.channel,'s1'),/changed before/);assert.equal(f.count(),1);
 for(const change of [n=>{n.source_fields[0].label='other';},n=>{n.target_fields[0].name='other';},
  n=>{n.target_fields.at(-1).exclusion_source=n.source_fields[2];},n=>{n.target_fields.at(-1).field_id='0';},n=>{n.autosync=false;}]){
  const f=exclusionFixture();f.channel.afterExclude=change;await assert.rejects(excludeOutputField(f.channel,'s1'));assert.equal(f.count(),2);
 }
});

test('output port Done requires its opening identity and the same unlocked graph afterwards',async()=>{
 const {finishPreparedOutputPort}=await import('../lib/port-mapping-procedure.mjs');
 for(const mode of ['ok','no-receipt','foreign-after','locked-after']) {
  const owner={verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'node',output_port:{direction:'output',port:0,opening_operation_id:'open'}};
  let finished=false,actions=0;
  const state=()=>({prepared_node_context:finished?{verified:true,surface:'graph',document_id:'doc',workflow_id:'flow',node_id:mode==='foreign-after'?'other':'node',locked:mode==='locked-after'}:
   {...owner,...(mode==='no-receipt'?{output_port:null}:{})},node_mapping:{verified:true},wizard:finished?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W'},ui:{elements:[{ref:'done',tid:'W;btnDone',wizard_finish:{mode:'output_port'},allowed_actions:['finish_wizard']}]}});
  const channel={observe:async o=>{const s=state();if(!o.ready(s))throw Error('Owner not ready');return s;},perform:async o=>{const s=state();assert.ok(o.ready(s));assert.deepEqual(o.resolve(s),{verb:'finish_wizard',ref:'done'});actions++;finished=true;}};
  if(mode==='ok'){const r=await finishPreparedOutputPort(channel);assert.equal(r.settings_applied,true);assert.equal(r.package_saved,false);assert.equal(actions,1);}
  else{await assert.rejects(finishPreparedOutputPort(channel));assert.equal(actions,mode==='no-receipt'?0:1);}
 }
});

test('grouped reorder preserves membership and independently orders active and excluded fields',async()=>{
 const {reorderOutputFields}=await import('../lib/port-mapping-procedure.mjs'),f=reorderFixture(true);
 const r=await reorderOutputFields(f.channel,['t3','t1','t2','t0']);
 assert.equal(r.moves,2);assert.equal(f.actions(),4);
 assert.deepEqual(r.definition.target_fields.map(f=>[f.record_id,f.excluded,f.group_index]),[['t1',false,0],['t0',false,1],['t3',true,0],['t2',true,1]]);
 assert.equal((await reorderOutputFields(f.channel,['t3','t1','t2','t0'])).effect_possible,false);assert.equal(f.actions(),4);
});

test('standalone output lifecycle validates its source before committing and preserves metadata across pages',async()=>{
 const {configureSeparateOutputPort}=await import('../lib/port-mapping-procedure.mjs');
 for(const fault of [false,true]){
 const source={name:'A',label:'A',type:'integer',field_id:'a',record_id:'s'},configured=[{...source,used:true}];
 const native={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:[{...source,label:fault?'foreign':'A'}],target_fields:[{...source,record_id:'t',source,data_kind:'Дискретный'}]};
 let opened=false,finished=false,commits=0,reads=0;
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const state=()=>({prepared_node_context:finished?{...owner,surface:'graph',locked:false}:{...owner,surface:'wizard',output_port:{direction:'output',port:0,opening_operation_id:'open'}},
 node_mapping:{...native,rendered_indices:reads++%2?[0]:[]},wizard:finished?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'root',root_tid:'W'},ui:{elements:[{ref:'done',tid:'W;btnDone',wizard_finish:{mode:'output_port'},allowed_actions:['finish_wizard']}]}});
 const channel={openOutputPort:async port=>{assert.equal(port,0);opened=true;},observe:async o=>{assert.ok(opened);const s=state();assert.ok(o.ready(s));return s;},perform:async o=>{const s=state();assert.ok(o.ready(s));assert.equal(o.resolve(s).verb,'finish_wizard');commits++;finished=true;}};
 if(fault){await assert.rejects(configureSeparateOutputPort(channel,{direction:'output',port:0},configured),/Configured source/);assert.equal(commits,0);}
 else{const r=await configureSeparateOutputPort(channel,{direction:'output',port:0},configured);assert.equal(r.settings_applied,true);assert.equal(r.source_identity_verified,true);assert.equal(commits,1);}
 }
});

test('inline derived output preserves an existing exclusion without a separate-wizard gesture',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs'),f=exclusionFixture();
 f.native.source_fields[1].label='Дата';f.native.target_fields[1].label='Дата';
 const configured=f.native.source_fields.map(s=>({...s,used:true}));
 const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name==='B'}))};
 await configureOutputFields(f.channel,mapping,configured);
 f.native.mapping_wizard='DerivedDataSourceMappingEngineOutputPortWizard';f.native.autosync=false;
 const before=structuredClone(f.native),actions=f.count();
 const result=await configureOutputFields(f.channel,mapping,configured);
 assert.equal(result.effect_possible,false);assert.deepEqual(result.definition,before);assert.equal(f.count(),actions);
 const newExclusion=structuredClone(mapping);newExclusion.fields[2].excluded=true;
 await assert.rejects(configureOutputFields(f.channel,newExclusion,configured),/separate output wizard/);
 assert.equal(f.count(),actions);assert.deepEqual(f.native,before);
});

test('inline derived reorder retains exclusion groups and native group indices',async()=>{
 const {reorderOutputFields}=await import('../lib/port-mapping-procedure.mjs'),f=reorderFixture(true);
 const observe=f.channel.observe,perform=f.channel.perform;
 const adapt=s=>{s.node_mapping.mapping_wizard='DerivedDataSourceMappingEngineOutputPortWizard';for(const e of s.ui.elements)if(e.tid)e.tid=e.tid.replace('DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard');return s;};
 f.channel.observe=async o=>adapt(await observe({...o,ready:s=>o.ready(adapt(s))}));
 f.channel.perform=async o=>perform({...o,ready:s=>o.ready(adapt(s)),resolve:s=>o.resolve(adapt(s))});
 const result=await reorderOutputFields(f.channel,['t3','t1','t2','t0']);
 assert.deepEqual(result.definition.target_fields.map(f=>[f.record_id,f.excluded,f.group_index]),[['t1',false,0],['t0',false,1],['t3',true,0],['t2',true,1]]);
 assert.equal(f.actions(),4);
});

test('exclusion resets a distinct source label while preserving its actual source identity',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs');
 const f=exclusionFixture();f.native.source_fields[1].label='Типы данных';f.native.target_fields[1].label='Типы данных';
 const configured=f.native.source_fields.map(s=>({...s,used:true}));
 const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name==='B'}))};
 const r=await configureOutputFields(f.channel,mapping,configured);assert.equal(r.verified,true);
 const removed=r.definition.target_fields.at(-1);assert.equal(removed.label,'B');assert.equal(removed.exclusion_source.label,'Типы данных');
 assert.equal((await configureOutputFields(f.channel,mapping,configured)).effect_possible,false);assert.equal(f.count(),2);
 const bad=exclusionFixture();bad.native.source_fields[1].label='Типы данных';bad.native.target_fields[1].label='Типы данных';
 bad.channel.afterExclude=n=>{n.target_fields.at(-1).label='Типы данных';};
 const {excludeOutputField}=await import('../lib/port-mapping-procedure.mjs');await assert.rejects(excludeOutputField(bad.channel,'s1'),/Excluded record identity/);
});

test('exclusion of a renamed field restores source name and refuses explicit wrong label before mutation',async()=>{
 const {configureOutputFields}=await import('../lib/port-mapping-procedure.mjs');
 const f=exclusionFixture();f.native.source_fields[1].label='Исходная метка';Object.assign(f.native.target_fields[1],{name:'Renamed',label:'Новая метка'});
 const configured=f.native.source_fields.map(s=>({...s,used:true}));
 const mapping={direction:'output',port:0,fields:configured.map(s=>({source:{kind:'configured_field',name:s.name},excluded:s.name==='B'}))};
 const bad=structuredClone(mapping);bad.fields[1].label='Исходная метка';await assert.rejects(configureOutputFields(f.channel,bad,configured),/source name as name and label/);assert.equal(f.count(),0);
 const r=await configureOutputFields(f.channel,mapping,configured);assert.equal(r.definition.target_fields.at(-1).name,'B');assert.equal(r.definition.target_fields.at(-1).label,'B');
 assert.equal(r.definition.target_fields.at(-1).exclusion_source.label,'Исходная метка');
});
