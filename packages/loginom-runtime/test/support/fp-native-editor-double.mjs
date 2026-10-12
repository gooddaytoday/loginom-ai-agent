import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {REFORM_TYPES,REFORM_USAGE} from '../../client/lib/reform-parameters.mjs';
const fixtureInput=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/field-parameters/acceptance/fixtures/preservation/rowid-ab-c.json',import.meta.url),'utf8'));
function fixture(fault){
 const records=fixtureInput.input_columns.map((f,index)=>({...f,index,record_id:'r'+index,field_id:String(index),selected:false}));
 const initial=structuredClone(records),events=[];let editor=null,choice=null,lastSnapshot;
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const sources=records.map(f=>({...f,record_id:'source:'+f.record_id}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map(f=>({...f,record_id:'input:'+f.record_id,source:f}))};
 const snapshot=()=>{
  const wizard={status:'observed',stage:'field_parameters',root_tid:'native-root',root_ref:'wizard',reform_columns:{fields:records.map(f=>({...f,status:'observed',name_ref:'cell:'+f.name}))}};
  const elements=records.map(f=>({ref:'cell:'+f.name,allowed_actions:['double_click']}));
  if(editor){
   const values={name:editor.name,label:editor.label,type_label:REFORM_TYPES[editor.type],data_kind:editor.data_kind,usage:Object.keys(REFORM_USAGE).find(k=>REFORM_USAGE[k]===editor.usage_type),excluded:editor.excluded};
   wizard.reform_parameters={status:'observed',portal_bound:true,root_ref:'editor',selected_column:{name:editor.originalName},fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,enabled:true,input_ref:k,display_ref:k}]))};
   for(const name of ['type_label','data_kind','usage'])elements.push({ref:'pick:'+name,allowed_actions:['click'],wizard_combo:{kind:'picker',field:{scope:'reform_column',name}}});
   if(choice)for(const label of choice==='type_label'?Object.values(REFORM_TYPES):choice==='usage'?Object.keys(REFORM_USAGE):['Неопределенное','Непрерывный','Дискретный'])elements.push({ref:label,allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label,field:{scope:'reform_column',name:choice}}});
   elements.push({ref:'apply',allowed_actions:['apply_reform_column'],column_close:{scope:'reform'}});
  }
  return {prepared_node_context:{...owner,surface:'wizard'},wizard,ui:{elements},node_reform:{verified:true,inventory_complete:true,node_context:owner,fields:structuredClone(records),caching:{value:3,display:'selected',variable:false}}};
 };
 const channel={async observe({ready}){const s=snapshot();assert.equal(ready(s),true);lastSnapshot=structuredClone(s);return s;},async perform({resolve,initialObservation}){
  if(initialObservation)assert.deepEqual(initialObservation,lastSnapshot,'Observation receipt must remain unchanged');
  const a=resolve(snapshot());events.push(a);
  if(a.verb==='double_click')editor={...records.find(f=>a.ref==='cell:'+f.name),originalName:a.ref.slice(5)};
  else if(a.verb==='click')choice=a.ref.slice(5);
  else if(a.verb==='select_wizard_option'){
   if(choice==='type_label')editor.type=Object.keys(REFORM_TYPES).find(k=>REFORM_TYPES[k]===a.ref);
   else if(choice==='usage')editor.usage_type=REFORM_USAGE[a.ref];else editor.data_kind=a.ref;choice=null;
  }else if(a.verb==='set_wizard_field')editor[a.ref]=a.text;
  else if(a.verb==='set_checked')editor.excluded=a.checked;
  else if(a.verb==='apply_reform_column'){
   const {originalName,...next}=editor;Object.assign(records.find(f=>f.record_id===next.record_id),next);editor=null;
   if(fault==='lost_response')throw Error('Response lost after apply');
   if(fault==='collateral')records[1].caching_method=0;
  }
 return {status:'SUCCEEDED',cleanup_complete:true,action_key:'ui.act',operation_id:'fixture-step-'+events.length};
 }};
 return {channel,events,records,initial,inputMapping};
}


export const nativeEditorDouble=fixture;
