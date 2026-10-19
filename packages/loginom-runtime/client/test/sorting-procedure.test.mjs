import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSorting,advanceSortingInputColumns} from '../lib/sorting-procedure.mjs';

function inputColumnsFixture(change=()=>{},lost=false){
 const node={verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'sort'};
 const s={prepared_node_context:node,wizard:{status:'observed',stage:'input_mapping',title_status:'observed',title:'Настройка входных столбцов',root_ref:'wizard',root_tid:'root',
  owner_context:{status:'observed',node:{tid:'workflow>Sort'},path:[]},controls:{btnNext:{status:'observed',enabled:true},btnPrev:{status:'observed',enabled:false}}},ui:{elements:[
   {tid:'root;TuneDataSourceInputPortWizard;btnAddMappingColumn'},
   {tid:'root;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}
  ]}};
 const request={target:{kind:'existing',ref:{document_id:'doc',workflow_id:'flow',node_id:'sort'}}},actions=[];
 change(s,request);
 const channel={observe:async spec=>{assert.equal(spec.readSorting,true);if(!spec.ready(s))throw Error('Readiness refused');return structuredClone(s);},
  perform:async spec=>{assert.ok(spec.ready(s));assert.deepEqual(spec.identity(s),{node_context:s.prepared_node_context,owner:s.wizard.owner_context,root_ref:s.wizard.root_ref});
   const a=spec.resolve(s);actions.push(a);if(lost)throw Error('Lost Next reply');s.wizard.stage='sorting';}};
 return {s,request,actions,run:()=>advanceSortingInputColumns(channel,request)};
}
test('existing Sorting advances only its owned initial input columns once to sorting',async()=>{
 const f=inputColumnsFixture();await f.run();assert.deepEqual(f.actions,[{verb:'wizard_step',ref:'ui-next',expected_stage:'sorting'}]);
});
test('Sorting already on its verified configuration page does not click Next',async()=>{
 const f=inputColumnsFixture(s=>{s.wizard.stage='sorting';s.node_sorting={verified:true};});await f.run();assert.deepEqual(f.actions,[]);
});
test('Sorting input-columns transition refuses other owners, ports, pages and unavailable controls',async()=>{
 for(const change of [s=>s.prepared_node_context.node_id='other',s=>s.prepared_node_context.workflow_id='other',s=>s.prepared_node_context.document_id='other',
  s=>s.prepared_node_context.verified=false,s=>s.prepared_node_context.surface='graph',s=>s.prepared_node_context.input_port={},s=>s.prepared_node_context.output_port={},
  s=>s.wizard.input_port_context={status:'observed'},s=>s.wizard.port_context={status:'observed'},s=>s.wizard.owner_context.status='unobserved',
  s=>s.wizard.title='Другой мастер',s=>s.wizard.title_status='ambiguous',s=>s.wizard.stage=null,s=>s.wizard.controls.btnNext.enabled=false,
  s=>s.wizard.controls.btnPrev.enabled=true,s=>s.ui.elements.shift(),(_s,r)=>r.target.kind='new']){
  const f=inputColumnsFixture(change);await assert.rejects(f.run(),/Readiness refused/);assert.deepEqual(f.actions,[]);
 }
 const f=inputColumnsFixture(s=>s.ui.elements[1].allowed_actions=[]);await assert.rejects(f.run(),/Next unavailable/);assert.deepEqual(f.actions,[]);
});
test('lost Sorting initial Next reply is never replayed',async()=>{
 const f=inputColumnsFixture(()=>{},true);await assert.rejects(f.run(),/Lost Next reply/);assert.equal(f.actions.length,1);
});

function fixture({newNode=false,locale=true}={}) {
 const fields=[{name:'Amount',label:'Сумма',type:'real'},{name:'Name',label:'Имя',type:'string'}];
 const configuration={verified:true,input_fields:fields,keys:[{...fields[0],record_id:'a',order:0,direction:'ASC'}],selections:{selected:[]},options:{chkLocaleAware:{value:locale,switch_pressed:false},chkBufferWhole:{value:false},cbxMaxThreadCount:{value:0}}};
 const gestures=[];const flags={};
 const snapshot=()=>({wizard:{stage:'sorting',root_tid:'root'},node_sorting:structuredClone(configuration),ui:{elements:[
  ...configuration.keys.flatMap(k=>['field','direction','delete'].map(part=>({ref:k.name+':'+part,tid:part,sorting_field:{field_key:k.name,record_id:k.record_id,role:'selected',part},allowed_actions:['click']}))),
  ...configuration.input_fields.filter(f=>!configuration.keys.some(k=>k.name===f.name)).map(f=>({ref:f.name+':available',tid:'available',sorting_field:{field_key:f.name,record_id:'input-'+f.name,role:'available',part:'field'},allowed_actions:['click']})),
  {ref:'locale',tid:'root;SortingWizard;SortingColumnCollection;chkLocaleAware;ValueControl;DisplayEl',allowed_actions:['set_checked']}
 ]}});
 const channel={observe:async()=>snapshot(),perform:async spec=>{
  const action=spec.resolve(snapshot());gestures.push(action);
  if(flags.failBeforeGesture)throw Error('ownership changed before gesture');
  if(action.ref==='locale')configuration.options.chkLocaleAware.value=action.checked;
  const key=configuration.keys.find(k=>action.ref.startsWith(k.name+':'));
  if(action.ref===key?.name+':field')configuration.selections.selected=[key.record_id];
  if(action.ref===key?.name+':direction'&&!flags.lostChange)key.direction=key.direction==='ASC'?'DESC':'ASC';
  if(action.ref===key?.name+':delete'&&!flags.lostRemoval){configuration.keys=configuration.keys.filter(k=>k!==key);configuration.keys.forEach((k,i)=>k.order=i);configuration.selections.selected=configuration.selections.selected.filter(id=>id!==key.record_id);}
  const available=configuration.input_fields.find(f=>action.ref===f.name+':available');
  if(available&&action.verb==='double_click')configuration.keys.push({...available,record_id:'added-'+available.name,order:configuration.keys.length,direction:'ASC',case_sensitive:true});
  if(flags.changeCache)configuration.options.chkBufferWhole.value=true;
 }};
 return {configuration,flags,gestures,run:p=>configureSorting(channel,p,{newNode})};
}

test('existing empty parameters preserve observed keys and locale without toggles',async()=>{
 const f=fixture({locale:false});const r=await f.run({});assert.equal(r.configuration.options.chkLocaleAware.value,false);assert.deepEqual(f.gestures,[]);
});
function renamedInputFixture(){
 const f=fixture();Object.assign(f.configuration.input_fields[0],{name:'RevenueAlias',label:'Выручка alias'});
 Object.assign(f.configuration.keys[0],{name:'total_revenue',label:'total_revenue',type:null,missing_input:true,direction:'DESC'});return f;
}
test('explicit replacement removes the missing input key and selects the real renamed input field',async()=>{
 const f=renamedInputFixture();const r=await f.run({keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]});
 assert.deepEqual(r.configuration.keys.map(k=>({name:k.name,type:k.type,direction:k.direction})),[{name:'RevenueAlias',type:'real',direction:'DESC'}]);
 assert.equal(r.configuration.keys.some(k=>k.missing_input),false);
 assert.deepEqual(r.configuration.selections.selected,['added-RevenueAlias']);
 assert.deepEqual(f.gestures.map(g=>[g.verb,g.ref]),[['click','total_revenue:delete'],['double_click','RevenueAlias:available'],['click','RevenueAlias:field'],['click','RevenueAlias:direction']]);
});
test('empty parameters cannot preserve a missing input key as a valid sorting configuration',async()=>{
 for(const p of [{},{compare_with_locale:false}]){const f=renamedInputFixture();await assert.rejects(f.run(p),/missing|unavailable|replace/i);assert.deepEqual(f.gestures,[]);}
});
test('failed removal of a missing input key stops before adding its replacement',async()=>{
 const f=renamedInputFixture();f.flags.lostRemoval=true;
 await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]}),/removal not applied/);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'total_revenue:delete'}]);
});
test('explicit direction changes once and unrequested cache and threads remain unchanged',async()=>{
 const f=fixture();const r=await f.run({keys:[{field:{kind:'input_field',name:'Amount'},direction:'DESC'}],compare_with_locale:false});
 assert.equal(r.configuration.keys[0].direction,'DESC');assert.equal(r.configuration.options.chkBufferWhole.value,false);
 assert.equal(f.gestures.filter(g=>g.ref==='Amount:direction').length,1);assert.deepEqual(f.gestures.at(-1),{verb:'set_checked',ref:'locale',checked:false});
});
test('unknown field fails before any gesture',async()=>{
 const f=fixture();await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'Missing'},direction:'ASC'}]}),/missing/);assert.deepEqual(f.gestures,[]);
});
test('unconfirmed change never retries a blind direction toggle',async()=>{
 const f=fixture();f.flags.lostChange=true;await assert.rejects(f.run({keys:[{field:{kind:'input_field',name:'Amount'},direction:'DESC'}]}),/direction differs/);
 assert.equal(f.gestures.filter(g=>g.ref==='Amount:direction').length,1);
});
test('foreign ownership and changes to unrelated options cannot succeed',async()=>{
 for(const flag of ['failBeforeGesture','changeCache']){const f=fixture();f.flags[flag]=true;await assert.rejects(f.run({compare_with_locale:false}),/ownership|Unrequested/);}
});
test('new node uses explicit locale default and variable-driven locale fails closed',async()=>{
 const f=fixture({newNode:true,locale:false});await f.run({});assert.equal(f.gestures[0].checked,true);
 const g=fixture();g.configuration.options.chkLocaleAware.switch_pressed=true;await assert.rejects(g.run({}),/Variable-driven/);assert.deepEqual(g.gestures,[]);
});
