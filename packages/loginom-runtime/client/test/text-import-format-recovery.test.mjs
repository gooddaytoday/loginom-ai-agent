import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {setTextImportFormatField} from '../lib/text-import-procedure.mjs';
function fixture({change,receipt={},refusals=1,property='data_kind'}={}) {
 let reads=0,calls=0;const records=[];
 const channel=createNodeProcedure({operation:{id:'option',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}},now:()=>1,wait:async()=>{},maxSteps:30,targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return structuredClone(e)},wrapMutation:(code,reference)=>({reference}),execute:async code=>{
  if(typeof code==='string'){
   const ref='ui-option-'+(++reads),state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},dom_epoch:{document:'doc',revision:reads},scan:{complete:true},wizard:{status:'observed',stage:'text_import_format',root_tid:'wizard',root_ref:'root',owner_context:{status:'observed',node:{tid:'Import'},path:[{tid:'Import',label:'Import'}]},settings:{fields:{delimiter:{status:'observed',value:'Точка с запятой',truncated:false,enabled:true,read_only:false,source_tid:'wizard;delimiter',owner_ref:'owner-'+reads,input_ref:ref,native_max_length_utf16:1}}}},ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref,identity:{anchor_tid:'wizard;delimiter',path:[1,0]},allowed_actions:['set_wizard_field'],wizard_field:{name:'delimiter',scope:'import_format',stage:'text_import_format',owner_ref:'owner-'+reads,root_ref:'root'}}]}};
   if(calls&&change)change(state);return {status:'SUCCEEDED',output:state};
  }
  calls++;return {operation_id:code.reference.id,action_key:'ui.act',cleanup_complete:true,effect_possible:calls>refusals,status:calls>refusals?'SUCCEEDED':'NOT_APPLIED',phase:calls>refusals?'completed':'preconditions',error:{code:'UI_EPOCH_CHANGED'},trace:[],...receipt};
 }});
 return {records,get calls(){return calls},async run(){const initial=await channel.observe({condition:'column option',ready:()=>true});return setTextImportFormatField(channel,initial,'delimiter',';');}};
}

test('format input refreshes fresh refs after a durable pre-gesture epoch refusal',async()=>{const f=fixture();await f.run();assert.equal(f.calls,2);assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);const actions=f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.action);assert.equal(new Set(actions.map(e=>e.ref)).size,2);assert.deepEqual(actions.map(({ref,...a})=>a),[{verb:'set_wizard_field',text:';'},{verb:'set_wizard_field',text:';'}]);});
test('changed native owner, field or previous value refuses before another gesture',async()=>{
 for(const change of [s=>s.wizard.owner_context.node.tid='Other',s=>s.wizard.owner_context.path[0].label='Other',s=>s.wizard.stage='done',s=>s.wizard.root_tid='foreign',...['value','source_tid','native_max_length_utf16'].map(k=>s=>s.wizard.settings.fields.delimiter[k]='changed'),s=>s.wizard.settings.fields.delimiter.enabled=false,s=>s.wizard.settings.fields.delimiter.truncated=true,s=>s.ui.elements[0].identity.path=[2],...['owner_ref','root_ref','name','scope'].map(k=>s=>s.ui.elements[0].wizard_field[k]='foreign'),s=>s.ui.elements.push(structuredClone(s.ui.elements[0]))]){const f=fixture({change});await assert.rejects(f.run());assert.equal(f.calls,1);}
});
test('unknown effect, cleanup, receipt or gesture refuses format recovery',async()=>{for(const receipt of [{effect_possible:true},{cleanup_complete:false},{status:'AMBIGUOUS'},{trace:[{event:'ui_gesture_applied'}]},{trace:[{event:'ui_preconditions_verified'}]},{phase:'gesture'},{error:{code:'UI_REFERENCE_STALE'}},{operation_id:'foreign'}]){const f=fixture({receipt});await assert.rejects(f.run());assert.equal(f.calls,1);}});
test('format recovery is bounded to three distinct prepared actions',async()=>{const f=fixture({refusals:9});await assert.rejects(f.run());assert.equal(f.calls,3);});

test('post-gesture time scan refusal never authorizes a format refresh',async()=>{
 for(const status of ['AMBIGUOUS','NOT_APPLIED']) {
  const f=fixture({receipt:{status,phase:'observing',effect_possible:status==='AMBIGUOUS',cleanup_complete:true,
   error:{code:'UI_SCAN_LIMIT'},output:{observation_required:true,scan:{complete:false,limit_exceeded:true}},
   trace:[{event:'ui_observation_started'},{event:'ui_preconditions_verified'},
    {event:'ui_gesture_applied',verb:'set_wizard_field'},
    {event:'ui_scan_limit',limit_kind:'time',scan_stage:'controls',elapsed_ms:634,max_ms:630},
    {event:'ui_action_failed',code:'UI_SCAN_LIMIT'}]}});
  await assert.rejects(f.run());assert.equal(f.calls,1,status);
  assert.equal(f.records.filter(e=>e.phase==='node_step_prepared').length,1);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,0);
 }
});
