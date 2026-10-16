import test from 'node:test';import assert from 'node:assert/strict';
import {materializeJoinDefaultOutput} from '../lib/join-output-materialize.mjs';
// Explicit channel/native-link doubles. These controls do not qualify a native
// layout, scrolling, persistence, finish, execution or Close.
function fixture(count,{custom=false,foreign=false,missing=false}={}){
 const owner={document_id:'doc',workflow_id:'flow',node_id:'join',output_port:{direction:'output',port:0,port_guid:'port',native_index:0,opening_operation_id:'open'}};
 const sources=Array.from({length:count},(_,i)=>({record_id:'s'+i,name:'F'+i,label:'F'+i,type:'string',data_kind:'Дискретный'}));
 const targets=sources.map((source,i)=>({...source,record_id:'t'+i,source,excluded:false,exclusion_source:null}));
 const original=targets.map((t,i)=>({Name:t.name,OriginType:custom?1:0})),origins=original.map(x=>x.OriginType);let selected=-1,unbound=-1,table=false,gestures=0;
 const clone=structuredClone;
 const snapshot=(page={offset:0,limit:8})=>{
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',node_context:owner,autosync:true,produce_mode:0,source_fields:clone(sources),target_fields:clone(targets)};
  if(unbound>=0)mapping.target_fields[unbound].source=null;
  const ui=[];
  for(let i=0;i<count;i++){
   const link={source_record:sources[i].record_id,target_record:targets[i].record_id,owner:{port:owner.output_port,document_id:'doc',workflow_id:'flow',node_id:foreign?'foreign':'join',root_ref:'root'},settlement:{FLinksUpdateMode:false,FRelationRefreshMode:false,FWaitingRedraw:false,controller_ref:'controller',draw_ref:'draw'},source:sources[i],target:{...original[i],OriginType:origins[i]},selected:i===selected};
   if(i===unbound)Object.assign(link,{state:'unbound',source_display_name:null,source_data_type:null,inventory:{records:[sources.map((s,j)=>({record_id:s.record_id,definition:s})),targets.map((t,j)=>({record_id:t.record_id,definition:{...original[j],OriginType:origins[j]}}))]}});
   for(const role of ['output_source','output_target','output_relation_remove'])if(!(missing&&i===count-1))ui.push({ref:role+i,allowed_actions:['click','drag'],date_time_cell:{role,link:clone(link)}});
  }
  ui.push({ref:'table',tid:'Wizard;DerivedDataSourceOutputSocketWizard;rbTable;DisplayEl',allowed_actions:['click'],signature:{check_state:{kind:'radio',source:'loginom_ext',checked:table}}});
  const fields=targets.slice(page.offset,page.offset+8).map((t,i)=>({...t,index:page.offset+i,status:'observed'}));
  return {node_mapping:mapping,prepared_node_context:clone(owner),wizard:{stage:'output_mapping',root_ref:'root',root_tid:'Wizard',output_columns:{page:{status:'complete_definition_page',schema_id:'stable',offset:page.offset,limit:8,returned:fields.length,total_columns:count,next_offset:page.offset+fields.length<count?page.offset+fields.length:null},fields}},ui:{elements:ui}};
 };
 // Native Links/Table radio-state proof used by the unchanged view helper.
 const view=s=>{s.ui.elements.push({ref:'links',tid:'Wizard;DerivedDataSourceOutputSocketWizard;rbLinks;DisplayEl',allowed_actions:['click'],signature:{check_state:{kind:'radio',source:'loginom_ext',checked:!table}}});s.wizard.output_columns.table_mode=table;s.wizard.output_columns.links_mode=!table;return s;};
 const initial=view(snapshot());
 const channel={async observe(options){const s=view(snapshot(options.outputColumnPage));assert.ok(options.ready(s),options.condition);return s;},async perform(o){const s=view(snapshot());assert.ok(o.ready(s),o.condition);const a=o.resolve(s);gestures++;
   if(a.ref==='table')table=true;else if(a.verb==='drag'){assert.equal(unbound,selected);origins[selected]=1;unbound=-1;}else if(a.ref?.startsWith('output_source'))selected=Number(a.ref.slice('output_source'.length));else if(a.ref?.startsWith('output_relation_remove'))unbound=selected;else throw Error('unexpected gesture');
   return {status:'SUCCEEDED',action_key:'ui.act',action_revision:'1',operation_id:'step'+gestures,phase:'done',effect_possible:true};}};
 return {initial,channel,ids:targets.map(t=>t.record_id),gestures:()=>gestures};
}
for(const count of [2,6,80])for(const custom of [false,true])test('bounded Join cardinality '+count+' custom='+custom,async()=>{
 const f=fixture(count,{custom});const r=await materializeJoinDefaultOutput(f.channel,f.initial,f.ids);assert.equal(r.receipt.verified,true);assert.equal(r.receipt.definition.total_columns,count);assert.equal(r.receipt.materialized_fields.length,custom?0:count);assert.equal(r.receipt.persisted_content_verified,false);
});
for(const variant of ['too_many','partial','duplicate','foreign','missing'])test('wide Join cardinality refuses '+variant+' before effect',async()=>{
 const f=fixture(variant==='too_many'?81:80,{foreign:variant==='foreign',missing:variant==='missing'});if(variant==='partial')f.initial.node_mapping.target_fields.pop();if(variant==='duplicate')f.ids[79]=f.ids[0];await assert.rejects(materializeJoinDefaultOutput(f.channel,f.initial,f.ids));assert.equal(f.gestures(),0);
});
