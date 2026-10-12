import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const root=process.env.FP_RUNTIME??new URL('..',import.meta.url).pathname;
const {collectFieldParametersPreservation}=await import(pathToFileURL(root+'/src/acceptance/field-parameters-preservation-v1.mjs'));
const {verifyFieldParametersPreservation}=await import(pathToFileURL(root+'/src/acceptance/field-parameters-preservation-consumer.mjs'));
const {REFORM_TYPES,REFORM_USAGE}=await import(pathToFileURL(root+'/client/lib/reform-parameters.mjs'));
const fixtureInput=JSON.parse(await readFile(new URL('../../../docs/node-development/nodes/field-parameters/acceptance/fixtures/preservation/rowid-ab-c.json',import.meta.url),'utf8'));
// Page/editor/retained-resource doubles. Actual component + configureReform + bindReformInput + closed consumer.
// This test supplies no native authority, dataset receipt or persistence proof.
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

function setup(fault){
 const f=fixture(fault),binding={revision:1,harness:'field-parameters-preservation-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',admission:'fp-admission',account:'worker',session:'session',packagePath:'/worker/fp.lgp',expires:Date.now()+60000};
 const identity={type:'transform.reform_columns',input_port:0,session_id:'session',account:'worker',package_path:'/worker/fp.lgp',document_id:'doc',workflow_id:'flow',node_id:'node'};
 const resources={...identity,...binding,deadline:binding.expires,observed_at:Date.now(),dirty:false,running:false,unsettled:false,pending:false,unknown_effect:false};
 const retained={channel:f.channel,binding:{...binding},identity:{...identity}},records=[];
 return {...f,recordsLog:records,args:{binding,identity,resources,retained,channel:f.channel,inputMapping:f.inputMapping,record:async r=>records.push(r)}};
}
function tables(draft){
 const make=(columns,rows)=>({status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,fixture:true,output:{complete:true,port:0,binding:{...draft.owner},columns,rows}});
 const input=fixtureInput.input_columns.map(({name,label,type})=>({name,label,type}));
 return {inputTable:make(input,structuredClone(fixtureInput.input_rows)),outputTable:make(structuredClone(fixtureInput.expected.columns),structuredClone(fixtureInput.expected.rows))};
}
test('actual FP draft component and closed consumer with labelled editor/table doubles preserve identities and Extra',async()=>{
 const f=setup();const draft=await collectFieldParametersPreservation(f.args);
 assert.equal(draft.native_verified,false);assert.equal(draft.stopped_before_done,true);assert.equal(draft.values_verified,false);
 assert.equal(draft.configured.applied_editors,3);
 assert.deepEqual(draft.after.configuration.fields.map(f=>f.field_id),['0','1','2','3','4']);
 assert.deepEqual(f.events.filter(e=>e.verb==='double_click').map(e=>e.ref),['cell:A','cell:B','cell:C']);
 assert.equal(f.events.some(e=>['finish_wizard','open_wizard','execute','save'].includes(e.verb)),false);
 const verified=verifyFieldParametersPreservation({draft,...tables(draft)});assert.equal(verified.closed_contract_verified,true);assert.equal(verified.native_verified,false);
 assert.deepEqual(f.recordsLog.map(r=>r.event),['fp_preservation_baseline','fp_preservation_readback']);
});
for(const [name,change]of Object.entries({
 foreignAccount:f=>f.args.identity.account='other',foreignPackage:f=>f.args.binding.packagePath='/other/a.lgp',foreignDocument:f=>f.args.identity.document_id='other',foreignNode:f=>f.args.identity.node_id='other',foreignLease:f=>f.args.binding.lease='other',foreignChannel:f=>f.args.retained.channel={},expired:f=>f.args.binding.expires=0,missingAdmission:f=>delete f.args.binding.admission,
 pending:f=>f.args.resources.pending=true,dirty:f=>f.args.resources.dirty=true,running:f=>f.args.resources.running=true,unsettled:f=>f.args.resources.unsettled=true,unknown:f=>f.args.resources.unknown_effect=true,missingDirty:f=>delete f.args.resources.dirty,
 missingNativeInput:f=>f.args.inputMapping.verified=false,partial:f=>f.args.inputMapping.inventory_complete=false,port:f=>f.args.inputMapping.node_context.input_port.port=1,foreignNativeContext:f=>f.args.inputMapping.node_context.node_id='foreign',duplicateIdentity:f=>f.args.inputMapping.target_fields[2].field_id='1',cacheMismatch:f=>f.records[4].caching_method=0,
}))test('FP refuses '+name+' without editor mutation',async()=>{const f=setup();change(f);await assert.rejects(collectFieldParametersPreservation(f.args));assert.equal(f.events.length,0);});
for(const rejected of [Error('primary',{cause:0}),undefined,null,false,0,''])test('FP preserves observe Error/falsy rejection and never retries '+String(rejected),async()=>{
 const f=setup();let calls=0;f.args.channel.observe=async()=>{calls++;throw rejected};f.args.record=async()=>{throw Error('separate persistence refusal')};
 let caught,failed=false;try{await collectFieldParametersPreservation(f.args)}catch(e){caught=e;failed=true}
 assert.equal(failed,true);assert.strictEqual(caught,rejected);assert.equal(calls,1);assert.equal(f.events.length,0);
});
for(const fault of ['lost_response','collateral'])test('FP rejects uncertain/collateral editor result without replay/cleanup '+fault,async()=>{
 const f=setup(fault);await assert.rejects(collectFieldParametersPreservation(f.args));assert.equal(f.events.filter(e=>e.verb==='apply_reform_column').length,1);assert.equal(f.recordsLog.at(-1).event,'fp_preservation_refusal');assert.equal(f.recordsLog.at(-1).uncertain,true);
});
for(const [name,change]of Object.entries({
 missingInput:x=>delete x.inputTable,missingOutput:x=>delete x.outputTable,partial:x=>x.outputTable.output.complete=false,foreign:x=>x.outputTable.output.binding.node_id='foreign',wrongValue:x=>x.outputTable.output.rows[1][2]=false,extra:x=>x.outputTable.output.rows[0][3]='changed',wrongOrder:x=>x.outputTable.output.columns.reverse(),wrongCache:x=>x.draft.after.configuration.fields[0].caching_method=0,persistentID:x=>x.draft.after.configuration.fields[1].field_id='foreign',uncertain:x=>x.outputTable.status='AMBIGUOUS',
}))test('closed consumer refuses '+name,async()=>{const f=setup();const draft=await collectFieldParametersPreservation(f.args);const x={draft,...tables(draft)};change(x);assert.throws(()=>verifyFieldParametersPreservation(x));});

for(const reply of [undefined,null,false,0,'',{status:'AMBIGUOUS',cleanup_complete:false,action_key:'ui.act',operation_id:'pending'}])test('FP rejects missing/falsy/uncertain typed step receipt '+JSON.stringify(reply),async()=>{
 const f=setup();const perform=f.channel.perform;let calls=0;
 f.channel.perform=async opts=>{calls++;await perform(opts);return reply};
 await assert.rejects(collectFieldParametersPreservation(f.args),/TYPED_STEP_UNCONFIRMED/);assert.equal(calls,1);
 assert.equal(f.recordsLog.at(-1).uncertain,true);
});
test('FP retained owner change after baseline write refuses before edit',async()=>{
 const f=setup();f.args.record=async r=>{f.recordsLog.push(r);if(r.event==='fp_preservation_baseline')f.args.binding.generation++};
 await assert.rejects(collectFieldParametersPreservation(f.args),/OWNER_CHANGED/);assert.equal(f.events.length,0);
});
