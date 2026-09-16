import test from 'node:test';import assert from 'node:assert/strict';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {openImportColumnEditor} from '../lib/text-import-procedure.mjs';
function fixture({receipt={},change,refusals=1}={}){
 let reads=0,calls=0;const records=[];
 const channel=createNodeProcedure({operation:{id:'import-editor',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}},now:()=>1,wait:async()=>{},maxSteps:30,targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return structuredClone(e)},wrapMutation:(code,reference)=>({reference}),execute:async code=>{
  if(typeof code==='string'){
   const ref='ui-cell-'+(++reads),state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},dom_epoch:{document:'doc',revision:reads},scan:{complete:true},wizard:{status:'observed',stage:'text_import_format',root_tid:'wizard',owner_context:{status:'observed',node:{tid:'Typed'},path:[{tid:'Typed',label:'Typed'}]},import_columns:{page:{status:'complete_definition_page',offset:0,limit:8,total_columns:5},fields:[{index:4,status:'observed',name:'stamp',label:'stamp',type:'datetime',data_kind:'Дискретный',used:true,cell_refs:{data_kind:ref,type:ref}}]}},ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref,tid:'grid;4_3',allowed_actions:['double_click'],kind:'control'}]}};
   if(calls&&change)change(state);return {status:'SUCCEEDED',output:state};
  }
  calls++;return {operation_id:code.reference.id,action_key:'ui.act',cleanup_complete:true,effect_possible:calls>refusals,status:calls>refusals?'SUCCEEDED':'NOT_APPLIED',phase:calls>refusals?'completed':'preconditions',error:{code:'UI_EPOCH_CHANGED'},trace:[],...receipt};
 }});
 return {records,get calls(){return calls},async run(){const initial=await channel.observe({condition:'typed field',ready:()=>true});return openImportColumnEditor(channel,initial,4,'data_kind');}};
}
test('Typed data-kind editor refreshes only after proven pre-gesture refusal',async()=>{
 const f=fixture();await f.run();assert.equal(f.calls,2);assert.equal(f.records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);assert.equal(new Set(f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.action.ref)).size,2);
});
test('changed field, property, owner or page stops without a second gesture',async()=>{
 for(const change of [s=>s.wizard.import_columns.fields[0].name='foreign',s=>s.wizard.import_columns.fields[0].type='string',s=>s.wizard.import_columns.fields[0].data_kind='Непрерывный',s=>s.wizard.owner_context.node.tid='Other',s=>s.wizard.import_columns.page.offset=8,s=>s.ui.elements[0].tid='other-cell']){const f=fixture({change});await assert.rejects(f.run());assert.equal(f.calls,1);}
});
test('unknown effects, missing cleanup or started gesture never refresh',async()=>{
 for(const receipt of [{effect_possible:true},{cleanup_complete:false},{status:'AMBIGUOUS'},{trace:[{event:'ui_gesture_applied'}]}]){const f=fixture({receipt});await assert.rejects(f.run());assert.equal(f.calls,1);}
});
test('persistent epoch churn stops at existing two-refresh budget',async()=>{const f=fixture({refusals:9});await assert.rejects(f.run());assert.equal(f.calls,3);});
