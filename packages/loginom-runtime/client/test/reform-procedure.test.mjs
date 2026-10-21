import test from 'node:test';import assert from 'node:assert/strict';
import {configureReform,advanceReformInputColumns} from '../lib/reform-procedure.mjs';
import {REFORM_TYPES,REFORM_USAGE} from '../lib/reform-parameters.mjs';
const ref=name=>({kind:'configured_field',name});
function inputColumnsFixture(change=()=>{},lost=false){
 const s={prepared_node_context:{verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'reform'},
  wizard:{status:'observed',stage:'input_mapping',title_status:'observed',title:'Настройка входных столбцов',root_ref:'wizard',root_tid:'root',
   owner_context:{status:'observed'},controls:{btnNext:{status:'observed',enabled:true},btnPrev:{status:'observed',enabled:false}}},
  ui:{elements:[{tid:'root;TuneDataSourceInputPortWizard;btnAddMappingColumn'},{tid:'root;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}]}};
 const request={target:{kind:'existing',ref:{document_id:'doc',workflow_id:'flow',node_id:'reform'}}},actions=[];
 change(s,request);
 const channel={observe:async spec=>{assert.equal(spec.readReform,true);if(!spec.ready(s))throw Error('Readiness refused');return structuredClone(s);},
  perform:async spec=>{assert.ok(spec.ready(s));assert.deepEqual(spec.identity(s),{node_context:s.prepared_node_context,owner:s.wizard.owner_context,root_ref:s.wizard.root_ref});
   actions.push(spec.resolve(s));if(lost)throw Error('Lost Next reply');s.wizard.stage='field_parameters';s.node_reform={verified:true};}};
 return {s,request,actions,run:()=>advanceReformInputColumns(channel,request)};
}
test('existing Reform advances its owned initial input-columns page once',async()=>{
 const f=inputColumnsFixture();await f.run();assert.deepEqual(f.actions,[{verb:'wizard_step',ref:'ui-next',expected_stage:'field_parameters'}]);
 await f.run();assert.equal(f.actions.length,1,'verified configuration does not advance again');
});
test('Reform already on its verified configuration page does not click Next',async()=>{
 const f=inputColumnsFixture(s=>{s.wizard.stage='field_parameters';s.node_reform={verified:true};});await f.run();assert.deepEqual(f.actions,[]);
});
test('Reform input-columns transition refuses foreign owners, port wizards and ambiguous controls',async()=>{
 for(const change of [s=>s.prepared_node_context.node_id='other',s=>s.prepared_node_context.workflow_id='other',s=>s.prepared_node_context.document_id='other',
  s=>s.prepared_node_context.verified=false,s=>s.prepared_node_context.surface='graph',s=>s.prepared_node_context.input_port={},s=>s.prepared_node_context.output_port={},
  s=>s.wizard.input_port_context={status:'observed'},s=>s.wizard.port_context={status:'observed'},s=>s.wizard.owner_context.status='unobserved',
  s=>s.wizard.title='Другой мастер',s=>s.wizard.title_status='ambiguous',s=>s.wizard.stage=null,s=>s.wizard.controls.btnNext.enabled=false,
  s=>s.wizard.controls.btnPrev.enabled=true,s=>s.ui.elements.shift(),s=>s.ui.elements.push({...s.ui.elements[0]}),(_s,r)=>r.target.kind='new']){
  const f=inputColumnsFixture(change);await assert.rejects(f.run(),/Readiness refused/);assert.deepEqual(f.actions,[]);
 }
 for(const change of [s=>s.ui.elements[1].allowed_actions=[],s=>s.ui.elements.push({...s.ui.elements[1]})]){
  const f=inputColumnsFixture(change);await assert.rejects(f.run(),/Next unavailable/);assert.deepEqual(f.actions,[]);
 }
});
test('lost Reform initial Next reply is never replayed',async()=>{
 const f=inputColumnsFixture(()=>{},true);await assert.rejects(f.run(),/Lost Next reply/);assert.equal(f.actions.length,1);
});
function fixture(fault){
 const records=['A','B'].map((name,index)=>({index,name,label:'Same',record_id:'r'+index,field_id:String(index),type:'string',data_kind:'Дискретный',usage_type:0,caching_method:2,excluded:false,selected:false}));
 const initial=structuredClone(records),events=[];let editor=null,choice=null,lastSnapshot;
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const sources=records.map(f=>({...f,record_id:'source:'+f.record_id}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map(f=>({...f,record_id:'input:'+f.record_id,source:f}))};
 const snapshot=()=>{
  const wizard={stage:'field_parameters',root_ref:'wizard',reform_columns:{fields:records.map(f=>({...f,status:'observed',name_ref:'cell:'+f.name}))}};
  const elements=records.map(f=>({ref:'cell:'+f.name,allowed_actions:['double_click']}));
  if(editor){
   const values={name:editor.name,label:editor.label,type_label:REFORM_TYPES[editor.type],data_kind:editor.data_kind,usage:Object.keys(REFORM_USAGE).find(k=>REFORM_USAGE[k]===editor.usage_type),excluded:editor.excluded};
   wizard.reform_parameters={status:'observed',portal_bound:true,root_ref:'editor',selected_column:{name:editor.originalName},fields:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,enabled:true,input_ref:k,display_ref:k}]))};
   for(const name of ['type_label','data_kind','usage'])elements.push({ref:'pick:'+name,allowed_actions:['click'],wizard_combo:{kind:'picker',field:{scope:'reform_column',name}}});
   if(choice)for(const label of choice==='type_label'?Object.values(REFORM_TYPES):choice==='usage'?Object.keys(REFORM_USAGE):['Неопределенное','Непрерывный','Дискретный'])elements.push({ref:label,allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label,field:{scope:'reform_column',name:choice}}});
   elements.push({ref:'apply',allowed_actions:['apply_reform_column'],column_close:{scope:'reform'}});
  }
  return {wizard,ui:{elements},node_reform:{verified:true,inventory_complete:true,node_context:owner,fields:structuredClone(records),caching:{value:3,display:'selected',variable:false}}};
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
 }};
 return {channel,events,records,initial,inputMapping};
}
test('reform validates the complete request before any editor gesture',async()=>{
 const f=fixture();await assert.rejects(configureReform(f.channel,{changes:[{field:ref('A'),type:'real'},{field:ref('missing'),excluded:true}]}),/Unknown/);
 assert.deepEqual(f.events,[]);assert.deepEqual(f.records,f.initial);
});
test('reform edits one field while retaining identical labels and unrelated cached field settings',async()=>{
 const f=fixture();const r=await configureReform(f.channel,{changes:[{field:ref('A'),name:'Amount',type:'real',usage:'Показатель'}]});
 assert.equal(r.applied_editors,1);assert.equal(r.settings_applied,false);assert.deepEqual(f.records[1],f.initial[1]);assert.equal(f.records[0].label,'Same');assert.equal(f.records[0].caching_method,2);
 assert.equal(f.events.filter(a=>a.verb==='apply_reform_column').length,1);assert.equal(f.events.some(a=>/finish|execute/.test(a.verb)),false);
});
test('reform never repeats an editor application after a lost response',async()=>{
 const f=fixture('lost_response');await assert.rejects(configureReform(f.channel,{changes:[{field:ref('A'),name:'Amount'}]}),/Response lost/);
 assert.equal(f.records[0].name,'Amount');assert.equal(f.events.filter(a=>a.verb==='apply_reform_column').length,1);
});
test('reform stops after collateral drift and does not apply the remaining patch',async()=>{
 const f=fixture('collateral');await assert.rejects(configureReform(f.channel,{changes:[{field:ref('A'),name:'Amount'},{field:ref('B'),excluded:true}]}),/unrequested/);
 assert.equal(f.events.filter(a=>a.verb==='apply_reform_column').length,1);assert.equal(f.records[1].excluded,false);
});
test('reform no-op requires a complete final read without opening editors',async()=>{
 const f=fixture(),r=await configureReform(f.channel,{changes:[]});assert.equal(r.applied_editors,0);assert.deepEqual(f.events,[]);
});

test('input binding is derived without modifying the observation used to authorize a gesture',async()=>{
 const f=fixture(),r=await configureReform(f.channel,{changes:[{field:{kind:'input_field',name:'A'},name:'Amount'}]},{inputMapping:f.inputMapping});
 assert.equal(r.configuration.source_identity_verified,true);assert.equal(r.configuration.fields[0].input_field.name,'A');assert.equal(r.applied_editors,1);
});
