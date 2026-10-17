import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {configureTextImportFields,ImportColumnCountError} from '../lib/text-import-procedure.mjs';

function fixture({refusals=1,receipt={},change,recordFailure=false,observedCount=1,onRefresh,signal,field='delimiter'}={}) {
  let reads=0,calls=0,time=1,stage='text_import_file';
  const records=[],actions=[];
  const owner={status:'observed',node:{tid:'MF;TF-1;Graph;Import'},path:[{tid:'Scenario',label:'Scenario'},{tid:'Import',label:'Import'}]};
  const parameters={source:{source_path:'/user/wrong_delimiter.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
    format:{delimiter:',',text_qualifier:'"',null_marker:'?',decimal_separator:'.'},
    columns:['Id','Name'].map(name=>({name,label:name,type:'string',data_kind:'Дискретный',used:true}))};
  if(field==='date_format')parameters.format.date_format='yyyy/mm/dd';
  const format={multiple_delimiters:false,date_format:'dd/mm/yyyy',date_separator:'Дефис (-)',...parameters.format,
    [field]:{delimiter:';',text_qualifier:"'",null_marker:'!',decimal_separator:',',date_format:'dd/mm/yyyy'}[field]};
  const operation={id:'format-epoch',action:{action_key:'node.apply',revision:'1'},deadline:10000,
    checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}};
  const values=o=>Object.fromEntries(Object.entries(o).map(([name,value])=>[name,{status:'observed',truncated:false,value,
    source_tid:'wizard;format;'+name,owner_ref:'ui-owner-'+name.replaceAll('_','-'),
    input_ref:'ui-input-'+name.replaceAll('_','-')+'-'+reads,native_max_length_utf16:256}]));
  const channel=createNodeProcedure({operation,now:()=>time,monotonicNow:()=>time,wait:async ms=>{time+=ms;},maxSteps:100,
    targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async entry=>{
      records.push(entry);
      if(recordFailure&&entry.phase==='node_step_refresh_authorized')throw Error('journal failure');
      if(entry.phase==='node_step_refresh_authorized')onRefresh?.();
      return structuredClone(entry);
    },signal,wrapMutation:(code,reference)=>({reference}),execute:async code=>{
      if(typeof code==='string') {
        reads++;
        const fields=values(format);
        const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{...operation.checkpoint.workflow_ref},
          dom_epoch:{document:'doc',revision:reads},scan:{complete:true},wizard:{status:'observed',stage,
            root_tid:'wizard',root_ref:'ui-wizard-root',owner_context:structuredClone(owner),
            import_source:{fields:values({...parameters.source,connection:'Local',encoding:'UTF-8 (65001)',rows_to_skip:'0'})},
            settings:{fields},import_columns:{initial_layout:{status:'rendered_definition_layout'},
              page:{status:'complete_definition_page',schema_id:'source',offset:0,limit:8,total_columns:observedCount,returned:observedCount,next_offset:null},
              fields:observedCount===1?[{index:0,status:'observed',name:'Id_Name',label:'Id|Name',type:'string',data_kind:'Дискретный',used:true}]
                :parameters.columns.map((c,index)=>({...c,index,status:'observed'}))}},
          ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[
            {ref:'ui-next',tid:'wizard;btnNext',kind:'control',allowed_actions:['wizard_step']},
            // Native source_tid belongs to the ValueControl owner; its input has no data-tid.
            ...Object.entries(fields).map(([name,f])=>({ref:f.input_ref,tid:null,kind:'field',editable:true,
              wizard_field:{scope:'import_format',stage,name,owner_ref:f.owner_ref,root_ref:'ui-wizard-root',max_length_utf16:256},
              allowed_actions:['set_wizard_field']}))]}};
        if(calls&&change)change(state,calls);
        return {status:'SUCCEEDED',output:state};
      }
      const action=records.findLast(e=>e.phase==='node_step_prepared').action;
      actions.push(action);
      if(action.verb==='wizard_step') {
        stage=action.expected_stage;
        return {operation_id:code.reference.id,action_key:'ui.act',status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};
      }
      assert.equal(action.verb,'set_wizard_field');calls++;
      const refused=calls<=refusals;
      if(!refused) {
        const before=records.findLast(e=>e.phase==='node_observation_completed').outcome.output;
        format[before.ui.elements.find(e=>e.ref===action.ref).wizard_field.name]=action.text;
      }
      return {operation_id:code.reference.id,action_key:'ui.act',status:refused?'NOT_APPLIED':'SUCCEEDED',
        phase:refused?'preconditions':'completed',effect_possible:!refused,cleanup_complete:true,
        error:refused?{code:'UI_EPOCH_CHANGED'}:null,
        trace:refused?[{event:'ui_observation_started'},{event:'ui_action_failed',code:'UI_EPOCH_CHANGED'}]:[],...receipt};
    }});
  return {records,actions,operation,parameters,get calls(){return calls;},advance:ms=>{time+=ms;},run:()=>configureTextImportFields(channel,parameters,owner)};
}

test('unchanged format path reaches the genuine definition-count refusal without a refresh',async()=>{
  const f=fixture({refusals:0});
  await assert.rejects(f.run(),ImportColumnCountError);
  assert.equal(f.calls,1);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,0);
});

test('a proven format-field epoch refusal refreshes before the genuine definition-count refusal',async()=>{
  const f=fixture();
  await assert.rejects(f.run(),error=>error instanceof ImportColumnCountError&&error.message==='Import definition count differs: requested 2, observed 1');
  assert.equal(f.calls,2);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
  const prepared=f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='set_wizard_field');
  assert.equal(new Set(prepared.map(e=>e.internal_operation_id)).size,2);
  assert.notEqual(prepared[0].action.ref,prepared[1].action.ref);
  assert.deepEqual(prepared.map(e=>e.action.text),[',',',']);
  assert.equal(f.operation.deadline,10000);
});

test('a changed parsing value cannot wait for an identical-looking value to return',async()=>{
  let changed=0;
  const f=fixture({change:state=>{
    if(changed++<2)state.wizard.settings.fields.null_marker.value='foreign';
  }});
  await assert.rejects(f.run(),error=>!(error instanceof ImportColumnCountError));
  assert.equal(f.calls,1);
});

for(const field of ['delimiter','text_qualifier','null_marker','decimal_separator','date_format'])test('bounded refresh completes unchanged '+field+' configuration',async()=>{
  const f=fixture({field,observedCount:2,refusals:2});
  const result=await f.run();
  assert.equal(result.verified,true);
  assert.equal(result.format.fields[field].value,f.parameters.format[field]);
  assert.equal(f.calls,3);
  assert.equal(result.execution_started,false);
  assert.equal(result.package_saved,false);
  const refreshes=f.records.filter(e=>e.phase==='node_step_refresh_authorized');
  assert.equal(refreshes.length,2);
  assert.equal(new Set(refreshes.map(e=>e.binding_sha256)).size,1);
  assert.equal(new Set(refreshes.map(e=>e.intent_sha256)).size,1);
  assert.ok(refreshes.every(e=>e.effect_possible===false));
});

const input=state=>state.ui.elements.find(e=>e.ref===state.wizard.settings.fields.delimiter.input_ref);
for(const [name,change] of Object.entries({
  owner:state=>{state.wizard.owner_context.node.tid='foreign';},
  ownerPath:state=>{state.wizard.owner_context.path[0].tid='foreign';},
  ownerLabel:state=>{state.wizard.owner_context.path[0].label='foreign';},
  ownerUnobserved:state=>{state.wizard.owner_context.status='unobserved';},
  root:state=>{state.wizard.root_ref='ui-foreign';input(state).wizard_field.root_ref='ui-foreign';},
  rootTid:state=>{state.wizard.root_tid='foreign';},
  stage:state=>{state.wizard.stage='done';},
  fieldOwner:state=>{state.wizard.settings.fields.delimiter.owner_ref='ui-foreign';input(state).wizard_field.owner_ref='ui-foreign';},
  fieldTid:state=>{state.wizard.settings.fields.delimiter.source_tid='foreign';},
  inputTid:state=>{input(state).tid='foreign';},
  inputScope:state=>{input(state).wizard_field.scope='output_column';},
  inputName:state=>{input(state).wizard_field.name='decimal_separator';},
  inputRoot:state=>{input(state).wizard_field.root_ref='ui-foreign';},
  inputOwner:state=>{input(state).wizard_field.owner_ref='ui-foreign';},
  inputStage:state=>{input(state).wizard_field.stage='output_mapping';},
  inputLimit:state=>{input(state).wizard_field.max_length_utf16=0;},
  inputMissing:state=>{state.ui.elements=state.ui.elements.filter(e=>e!==input(state));},
  inputDuplicate:state=>{state.ui.elements.push(structuredClone(input(state)));},
  inputUnsupported:state=>{input(state).allowed_actions=[];},
  fieldUnobserved:state=>{state.wizard.settings.fields.delimiter.status='unobserved';},
  fieldTruncated:state=>{state.wizard.settings.fields.delimiter.truncated=true;},
  currentValue:state=>{state.wizard.settings.fields.delimiter.value=',';},
  otherValue:state=>{state.wizard.settings.fields.null_marker.value='foreign';},
  otherUnobserved:state=>{state.wizard.settings.fields.null_marker.status='unobserved';},
  otherTruncated:state=>{state.wizard.settings.fields.null_marker.truncated=true;},
  missingSetting:state=>{delete state.wizard.settings.fields.null_marker;},
  newSetting:state=>{state.wizard.settings.fields.auto_detect={status:'observed',value:false};},
  multipleDelimiters:state=>{state.wizard.settings.fields.multiple_delimiters.value=true;},
  dateFormat:state=>{state.wizard.settings.fields.date_format.value='yyyy/mm/dd';},
  document:state=>{state.dom_epoch.document='foreign';},
  workflow:state=>{state.workflow_ref.prefix='foreign';},
}))test('format refresh refuses changed '+name+' before another gesture',async()=>{
  const f=fixture({change});
  await assert.rejects(f.run(),error=>!(error instanceof ImportColumnCountError));
  assert.equal(f.calls,1);
});

for(const [name,receipt] of Object.entries({
  effect:{effect_possible:true},unknownEffect:{effect_possible:undefined},
  cleanup:{cleanup_complete:false},unknownCleanup:{cleanup_complete:undefined},
  ambiguous:{status:'AMBIGUOUS'},timedOut:{status:'TIMED_OUT'},
  phase:{phase:'applying'},code:{error:{code:'UI_CONTEXT_CHANGED'}},
  missingTrace:{trace:undefined},preconditions:{trace:[{event:'ui_preconditions_verified'}]},
  gesture:{trace:[{event:'ui_gesture_applied'}]},foreignReceipt:{operation_id:'foreign'},
}))test('format refresh refuses '+name+' receipt',async()=>{
  const f=fixture({receipt});
  await assert.rejects(f.run(),error=>!(error instanceof ImportColumnCountError));
  assert.equal(f.calls,1);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,0);
});

test('format refresh stops after the existing two-refresh limit',async()=>{
  const f=fixture({refusals:9});
  await assert.rejects(f.run(),/did not confirm completion/);
  assert.equal(f.calls,3);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,2);
  assert.equal(f.operation.deadline,10000);
});

test('format refresh cannot proceed without durable authorization',async()=>{
  const f=fixture({recordFailure:true});
  await assert.rejects(f.run(),/journal failure/);
  assert.equal(f.calls,1);
});

test('cancellation after refresh authorization prevents another gesture',async()=>{
  const controller=new AbortController();
  const f=fixture({signal:controller.signal,onRefresh:()=>controller.abort(Error('cancelled'))});
  await assert.rejects(f.run(),/cancelled/);
  assert.equal(f.calls,1);
});

test('format refresh consumes the original deadline without extending it',async()=>{
  const f=fixture({onRefresh:()=>f.advance(10000)});
  await assert.rejects(f.run(),/budget exhausted/);
  assert.equal(f.calls,1);
  assert.equal(f.operation.deadline,10000);
});

test('format intent remains the admitted value if caller settings change after refusal',async()=>{
  const f=fixture({observedCount:2,onRefresh:()=>{f.parameters.format.delimiter='|';}});
  const result=await f.run();
  assert.equal(result.format.fields.delimiter.value,',');
  assert.deepEqual(f.actions.filter(a=>a.verb==='set_wizard_field').map(a=>a.text),[',',',']);
});
