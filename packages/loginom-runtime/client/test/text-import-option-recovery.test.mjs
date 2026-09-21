import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {selectImportColumnOption} from '../lib/text-import-procedure.mjs';
function fixture({change,receipt={},refusals=1,property='data_kind'}={}) {
 let reads=0,calls=0;const records=[];
 const channel=createNodeProcedure({operation:{id:'option',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}},now:()=>1,wait:async()=>{},maxSteps:30,targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return structuredClone(e)},wrapMutation:(code,reference)=>({reference}),execute:async code=>{
  if(typeof code==='string'){
   const ref='ui-option-'+(++reads),state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},dom_epoch:{document:'doc',revision:reads},scan:{complete:true},wizard:{status:'observed',stage:'text_import_format',root_tid:'wizard',root_ref:'root',owner_context:{status:'observed',node:{tid:'Import'},path:[{tid:'Import',label:'Import'}]},import_column_editor:{status:'observed',index:10,name:'margin',label:'Маржа',property,canonical_value:'old',used:true,other_property:property==='type'?'data_kind':'type',other_value:'real',owner_ref:'editor',input_ref:'input'}},ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref,tid:'editor;list;wanted',allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label:'wanted',field:{scope:'import_column',name:property,owner_ref:'editor',input_ref:'input',root_ref:'root'}}}]}};
   if(calls&&change)change(state);return {status:'SUCCEEDED',output:state};
  }
  calls++;return {operation_id:code.reference.id,action_key:'ui.act',cleanup_complete:true,effect_possible:calls>refusals,status:calls>refusals?'SUCCEEDED':'NOT_APPLIED',phase:calls>refusals?'completed':'preconditions',error:{code:'UI_EPOCH_CHANGED'},trace:[],...receipt};
 }});
 return {records,get calls(){return calls},async run(){const initial=await channel.observe({condition:'column option',ready:()=>true});return selectImportColumnOption(channel,initial,10,property,'wanted');}};
}
for(const property of ['type','data_kind'])test('Refresh unchanged '+property+' option after proven refusal',async()=>{const f=fixture({property});await f.run();assert.equal(f.calls,2);assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);assert.equal(new Set(f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.action.ref)).size,2);});
test('Changed editor and option binding stops before another gesture',async()=>{
 for(const change of [s=>s.wizard.owner_context.node.tid='Other',s=>s.wizard.stage='done',...['index','name','label','property','canonical_value','other_value','used'].map(k=>s=>s.wizard.import_column_editor[k]='changed'),...['owner_ref','root_ref','input_ref'].map(k=>s=>s.ui.elements[0].wizard_combo.field[k]='foreign'),s=>s.ui.elements[0].wizard_combo.label='Other',s=>s.ui.elements.push(structuredClone(s.ui.elements[0]))]){const f=fixture({change});await assert.rejects(f.run());assert.equal(f.calls,1);}
});
test('Unknown effect or cleanup cannot replay selection',async()=>{for(const receipt of [{effect_possible:true},{cleanup_complete:false},{status:'AMBIGUOUS'},{trace:[{event:'ui_gesture_applied'}]}]){const f=fixture({receipt});await assert.rejects(f.run());assert.equal(f.calls,1);}});
test('Option refresh is bounded',async()=>{const f=fixture({refusals:9});await assert.rejects(f.run());assert.equal(f.calls,3);});
