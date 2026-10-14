import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {setImportFormatField} from '../lib/text-import-procedure.mjs';

function fixture({change,receipt={},refusals=1}={}) {
  let reads=0,calls=0;const records=[];
  const channel=createNodeProcedure({operation:{id:'format',action:{action_key:'node.apply',revision:'1'},deadline:10000,
    checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}},now:()=>1,wait:async()=>{},
    targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return structuredClone(e);},
    wrapMutation:(code,reference)=>({reference}),execute:async code=>{
      if(typeof code==='string') {
        const ref='ui-format-'+(++reads),state={origin:'http://example.test',loginom_build:'7.4.2',
          workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},dom_epoch:{document:'doc',revision:reads},scan:{complete:true},
          prepared_node_context:{verified:true,document_id:'doc',workflow_id:'wf',node_id:'node',surface:'wizard',tid:'MF;TF-1;WizrdMCF'},
          wizard:{status:'observed',stage:'text_import_format',root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard',
            owner_context:{status:'observed',node:{tid:'flow>Import'},path:[{tid:'flow',label:'Scenario'},{tid:'flow>Import',label:'Import'}]},
            settings:{fields:{delimiter:{status:'observed',truncated:false,value:','},
              decimal_separator:{status:'observed',truncated:false,value:'Не задано (,)',owner_ref:'decimal',input_ref:ref}}}},
          ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref,tid:'decimal-input',allowed_actions:['set_wizard_field'],
            wizard_field:{scope:'import_format',name:'decimal_separator',owner_ref:'decimal',root_ref:'wizard'}}]}};
        if(calls&&change)change(state);return {status:'SUCCEEDED',output:state};
      }
      calls++;return {operation_id:code.reference.id,action_key:'ui.act',cleanup_complete:true,effect_possible:calls>refusals,
        status:calls>refusals?'SUCCEEDED':'NOT_APPLIED',phase:calls>refusals?'completed':'preconditions',error:{code:'UI_EPOCH_CHANGED'},trace:[],...receipt};
    }});
  return {records,get calls(){return calls;},async run(){
    const initial=await channel.observe({condition:'format input',ready:()=>true});
    return setImportFormatField(channel,initial,'decimal_separator','.');
  }};
}

test('import format reacquires its unchanged input only after a proven no-effect epoch refusal',async()=>{
  const f=fixture();await f.run();assert.equal(f.calls,2);
  assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
  assert.equal(new Set(f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.action.ref)).size,2);
});
test('import format refresh rejects changed native owner, settings and input binding',async()=>{
  for(const change of [s=>s.wizard.owner_context.node.tid='foreign',s=>s.wizard.stage='done',s=>s.wizard.root_ref='foreign',
    s=>s.prepared_node_context.node_id='foreign',s=>s.wizard.settings.fields.delimiter.value=';',
    s=>s.wizard.settings.fields.decimal_separator.value='changed',s=>s.wizard.settings.fields.decimal_separator.owner_ref='foreign',
    s=>s.ui.elements[0].wizard_field.root_ref='foreign',s=>s.ui.elements[0].tid='foreign',
    s=>s.ui.elements.push(structuredClone(s.ui.elements[0]))]) {
    const f=fixture({change});await assert.rejects(f.run());assert.equal(f.calls,1);
  }
});
test('import format never refreshes an unknown effect, cleanup or post-gesture refusal',async()=>{
  for(const receipt of [{effect_possible:true},{cleanup_complete:false},{status:'AMBIGUOUS'},
    {trace:[{event:'ui_gesture_applied'}]},{trace:[{event:'ui_preconditions_verified'}]},
    {phase:'observing',error:{code:'UI_MASKED'}}]) {
    const f=fixture({receipt});await assert.rejects(f.run());assert.equal(f.calls,1);
  }
});
test('import format retains the existing two-refresh limit',async()=>{
  const f=fixture({refusals:9});await assert.rejects(f.run());assert.equal(f.calls,3);
});
