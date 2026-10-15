// Offline UI double: assertions also run against the clean actual product modules.
import test from 'node:test';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.REFORM_RUNTIME??new URL('..',import.meta.url).pathname;
const load=p=>import(pathToFileURL(root+'/lib/'+p));
const {configureReform}=await load('reform-procedure.mjs');
const {resolveReformChanges,REFORM_TYPES,REFORM_USAGE}=await load('reform-parameters.mjs');
const {preflightReformParameters}=await load('reform-preflight.mjs');
const {reformOutputSources}=await load('reform-output.mjs');
const ref=name=>({kind:'configured_field',name});
function fixture(fault,count=4){
 const records=Array.from({length:count},(_,i)=>count===4?['RowID','A','B','C'][i]:'F'+i).map((name,index)=>({index,name,label:'Same',record_id:'r'+index,field_id:String(index),type:'integer',data_kind:'Дискретный',usage_type:0,caching_method:2,excluded:false,selected:false}));
 const initial=structuredClone(records),events=[];let editor=null,choice=null,lastSnapshot,offset=0;
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const sources=records.map(f=>({...f,record_id:'source:'+f.record_id}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map(f=>({...f,record_id:'input:'+f.record_id,source:f}))};
 const snapshot=()=>{
  const wizard={stage:'field_parameters',root_ref:'wizard',reform_columns:{fields:records.slice(offset,offset+7).map(f=>({...f,status:'observed',name_ref:'cell:'+f.name}))}};
  const elements=records.slice(offset,offset+7).map(f=>({ref:'cell:'+f.name,allowed_actions:['double_click','scroll'],scroll:{ref:'grid',top:offset*20}}));
  if(editor){
   const values={name:editor.name,label:editor.label,type_label:REFORM_TYPES[editor.type],data_kind:editor.data_kind,usage:Object.keys(REFORM_USAGE).find(k=>REFORM_USAGE[k]===editor.usage_type),excluded:editor.excluded};
   wizard.reform_parameters={status:'observed',portal_bound:true,root_ref:'editor',selected_column:{name:editor.originalName},fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,enabled:true,input_ref:k,display_ref:k}]))};
   for(const name of ['type_label','data_kind','usage'])elements.push({ref:'pick:'+name,allowed_actions:['click'],wizard_combo:{kind:'picker',field:{scope:'reform_column',name}}});
   if(choice)for(const label of choice==='type_label'?Object.values(REFORM_TYPES):choice==='usage'?Object.keys(REFORM_USAGE):['Неопределенное','Непрерывный','Дискретный'])elements.push({ref:label,allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label,field:{scope:'reform_column',name:choice}}});
   elements.push({ref:'apply',allowed_actions:['apply_reform_column'],column_close:{scope:'reform'}});
  }
  return {wizard,ui:{elements},node_reform:{verified:true,inventory_complete:fault!=='partial',node_context:owner,fields:structuredClone(records),caching:{value:3,display:'selected',variable:false}}};
 };
 const channel={async observe({ready}){const s=snapshot();assert.equal(ready(s),true);lastSnapshot=structuredClone(s);return s;},async perform({resolve,initialObservation}){
  if(initialObservation)assert.deepEqual(initialObservation,lastSnapshot,'Observation receipt must remain unchanged');
  const a=resolve(snapshot());events.push(a);
  if(a.verb==='scroll')offset=Math.max(0,Math.min(count-7,offset+Math.sign(a.delta_y)*32));
  else if(a.verb==='double_click')editor={...records.find(f=>a.ref==='cell:'+f.name),originalName:a.ref.slice(5)};
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
 }};
 return {channel,events,records,initial,inputMapping};
}

for(const [key,value] of [['label','Only A'],['name','RenamedA'],['data_kind','Неопределенное'],['usage','Группа'],['excluded',true]])test('only requested '+key+' changes among duplicate labels',async()=>{
 const f=fixture(),before=structuredClone(f.records);
 const r=await configureReform(f.channel,{changes:[{field:ref('A'),[key]:value}]});
 const expected=structuredClone(before);if(key==='usage')expected[1].usage_type=6;else expected[1][key]=value;
 assert.deepEqual(f.records,expected);assert.equal(r.applied_editors,1);assert.equal(r.configuration.fields[1].record_id,'r1');
 assert.equal(r.preservation.unrequested_fields,true);assert.equal(r.settings_applied,false);
 assert.equal(f.events.some(e=>/execute|finish|wizard_step/.test(e.verb)),false);
});
test('full baseline collision and late unknown reject before the first gesture',async()=>{
 for(const changes of [[{field:ref('A'),name:'C'}],[{field:ref('A'),label:'Allowed'},{field:ref('Missing'),excluded:true}]]){
  const f=fixture();await assert.rejects(configureReform(f.channel,{changes}));assert.deepEqual(f.events,[]);assert.deepEqual(f.records,f.initial);
 }
 const f=fixture('partial');await assert.rejects(configureReform(f.channel,{changes:[{field:ref('A'),name:'Unoccupied'}]}),/Complete/);assert.deepEqual(f.events,[]);
});
test('acyclic rename chain uses vacated names and preserves record order',async()=>{
 const f=fixture();await configureReform(f.channel,{changes:[{field:ref('A'),name:'B'},{field:ref('B'),name:'C'},{field:ref('C'),name:'Free'}]});
 assert.deepEqual(f.events.filter(e=>e.verb==='double_click').map(e=>e.ref),['cell:C','cell:B','cell:A']);
 assert.deepEqual(f.records.map(e=>[e.record_id,e.name]),[['r0','RowID'],['r1','B'],['r2','C'],['r3','Free']]);
 assert.deepEqual(f.records.map(e=>e.index),[0,1,2,3]);
});
test('rename cycle rejects the entire patch with no editor or invented field',async()=>{
 const f=fixture();await assert.rejects(configureReform(f.channel,{changes:[{field:ref('A'),name:'B'},{field:ref('B'),name:'A'}]}),/Cyclic/);assert.deepEqual(f.events,[]);assert.deepEqual(f.records,f.initial);
});
test('wide complete baseline reveals and edits only the last of 1000 fields',async()=>{
 const f=fixture(undefined,1000),before=structuredClone(f.records);
 const r=await configureReform(f.channel,{changes:[{field:ref('F999'),label:'Last only'}]});
 assert.equal(r.applied_editors,1);assert.deepEqual(f.records.slice(0,999),before.slice(0,999));
 assert.deepEqual(f.records[999],{...before[999],label:'Last only'});
 assert.equal(f.events.filter(e=>e.verb==='double_click').length,1);assert.ok(f.events.some(e=>e.verb==='scroll'));
});
test('typed schema requires both output definitions even when data cardinality is unknown',()=>{
 // Metadata proof only: zero-row native execution is not established by this fixture.
 const fields=[{name:'Id',label:'Same',type:'integer',data_kind:'Непрерывный'},{name:'Flag',label:'Same',type:'boolean',data_kind:'Дискретный'}];
 const resolved=preflightReformParameters({changes:[{field:{kind:'input_field',name:'Flag'},label:'Active'}]},fields);
 assert.deepEqual(resolved.fields.map(f=>[f.name,f.label,f.type]),[['Id','Same','integer'],['Flag','Active','boolean']]);
 const owner={verified:true,document_id:'d',workflow_id:'w',node_id:'n'};
 const c={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,fields:resolved.fields};
 const native={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,source_fields:[{name:'Id',label:'Same',type:'integer'},{name:'Flag',label:'Active',type:'boolean'}]};
 assert.equal(reformOutputSources(c,native).length,2);assert.throws(()=>reformOutputSources(c,{...native,source_fields:[]}));
});
test('128 patches retain baseline while 129 patches refuse without a partial projection',()=>{
 const f=fixture(undefined,130),baseline={verified:true,inventory_complete:true,fields:f.records};
 const p={changes:Array.from({length:128},(_,i)=>({field:ref('F'+i),label:'Changed '+i}))};
 const r=resolveReformChanges(p,baseline);assert.deepEqual(r.fields.slice(128),f.initial.slice(128));assert.deepEqual(f.records,f.initial);
 assert.throws(()=>resolveReformChanges({changes:[...p.changes,{field:ref('F128'),label:'Extra'}]},baseline),/Bounded/);
});
