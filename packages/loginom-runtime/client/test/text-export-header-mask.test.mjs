import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTextExport} from '../lib/text-export-procedure.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const root='MF;TF-1;WizrdMCF',tid=root+';ExportTextFilePreviewWizard;edtCaptionType;ValueControl';
const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'export'}};
function fixture({receipt={},change,lateChange,optIn=true,refusals=1,persistent=false,interrupt}={}){
 let clock=1,reads=0,attempts=0,busy=0,header=2,stage='text_export_params',opened=false;
 const records=[],clicks=[],ac=new AbortController();
 const operation={id:'header',deadline:10000,action:{action_key:'node.apply',revision:'1'}};
 const context={verified:true,...binding.node,surface:'wizard',tid:root};
 const snapshot=(masked=false)=>({origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,
  dom_epoch:{document:'dom',revision:reads},scan:{complete:true},prepared_node_context:{...context},
  wizard:{status:'observed',stage:'text_export_format',root_ref:'ui-wizard',root_tid:root},
  ui:{dialogs:[],masks:masked?[{kind:'busy',ref:'ui-wizard',target_tid:root,dialog_ref:null,text:'Загрузка',bounding_box:{x:48,y:71,width:1232,height:729}}]:[],truncated:{masks:false,dialogs:false},elements:[
   {ref:'ui-picker-'+reads,tid:tid+';trg_picker',kind:'control',enabled:true,visible:true,allowed_actions:['click'],
    bounding_box:{x:634,y:427,width:22,height:21},interaction:masked?{state:'point_not_observed',point:null,covering:[{tag:'div',tid:root,anchor_tid:root,role:null}]}:{state:'point_observed',point:{x:645,y:437.5}},
    wizard_combo:{kind:'picker',field:{name:'header',root_ref:'ui-wizard',owner_ref:'ui-field',input_ref:'ui-input',value:'Метки полей'}}},
   ...(opened?[{ref:'ui-option',tid:tid+';boundlist;1',label:'Имена полей',allowed_actions:['select_wizard_option']}]:[])]}});
 const record=async e=>{records.push(structuredClone(e));if(e.phase==='node_step_refresh_authorized'){
  if(interrupt==='cancel')ac.abort(Error('cancelled'));
  if(interrupt==='deadline')operation.deadline=clock;
 }return structuredClone(e);};
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,now:()=>clock,wait:async ms=>{clock+=ms},maxSteps:128,
  signal:ac.signal,targetOrigin:'https://example.test',targetBuild:'7.4.2',record,
  wrapMutation:(code,reference)=>({reference}),execute:async code=>{
   if(typeof code==='string'){
    reads++;const s=snapshot(busy>0);if(busy>0&&!persistent)busy--;
    if(attempts&&change)change(s);if(attempts&&lateChange&&!s.ui.masks.length)lateChange(s);return {status:'SUCCEEDED',output:s};
   }
   attempts++;
   if(attempts<=refusals){
    busy=2;const output=snapshot(true);
    if(change)change(output);
    return {operation_id:code.reference.id,action_key:'ui.act',status:'NOT_APPLIED',phase:'preconditions',effect_possible:false,cleanup_complete:true,
     trace:[{event:'ui_observation_started'},{event:'ui_action_failed',code:'UI_REFERENCE_OBSCURED'}],error:{code:'UI_REFERENCE_OBSCURED'},output,...receipt};
   }
   clicks.push(records.filter(e=>e.phase==='node_step_prepared').at(-1).action);opened=true;
   return {operation_id:code.reference.id,action_key:'ui.act',status:'SUCCEEDED',phase:'completed',effect_possible:true,cleanup_complete:true,trace:[{event:'ui_gesture_applied'}]};
  }});
 const native=()=>({verified:true,stage,values:stage==='text_export_params'?{destination:{value:'/test-2/header.csv'}}:{header:{value:header,tid},delimiter:{value:','}},node_context:context});
 const run=()=>configureTextExport({observe:opts=>channel.observe(opts),perform:async opts=>{
  if(opts.condition==='choose export header'){assert.equal(opened,true);header=1;return {status:'SUCCEEDED'};}
  assert.equal(opts.refreshWizardBusy,true);if(!optIn)opts.refreshWizardBusy=false;
  return channel.perform(opts);
 }},{header:'names'},{...binding,finish:'close',signal:ac.signal,deadline:Date.now()+60000},{operation,
  execute:async code=>{
   if(code.includes('function exportNext')){stage='text_export_format';return {status:'SUCCEEDED',cleanup_complete:true,output:{existed:false}};}
   return native();
  },onRecord:record,receiptOptions:(id,key,signature)=>({receipt_namespace:'test',receipt_id:id,receipt_signature:signature})});
 return {run,records,clicks,get attempts(){return attempts},get reads(){return reads}};
}

test('D54 header picker waits for its late wizard loading mask and rebinds a fresh click',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.configuration.configured.text_export_format.values.header.value,1);
 assert.equal(f.attempts,2);assert.equal(f.clicks.length,1);
 const prepared=f.records.filter(e=>e.phase==='node_step_prepared');
 assert.equal(new Set(prepared.map(e=>e.internal_operation_id)).size,2);
 assert.notEqual(prepared[0].action.ref,prepared[1].action.ref);
 assert.ok(f.records.filter(e=>e.phase==='node_observation_sample').some(e=>e.outcome.output.ui.masks.length));
 assert.equal(f.records.find(e=>e.phase==='node_step_refresh_authorized').reason,'owned_wizard_busy_mask');
});
for(const [name,receipt] of Object.entries({effect:{effect_possible:true},unknown:{status:'AMBIGUOUS'},cleanup:{cleanup_complete:false},phase:{phase:'applying'},gesture:{trace:[{event:'ui_gesture_applied'}]},preconditions:{trace:[{event:'ui_preconditions_verified'}]},missingTrace:{trace:undefined}})){
 test('D54 never repeats a header click with '+name,async()=>{const f=fixture({receipt});await assert.rejects(f.run());assert.equal(f.attempts,1);assert.equal(f.clicks.length,0)});
}
for(const [name,change] of Object.entries({unmasked:s=>s.ui.masks=[],foreignMask:s=>s.ui.masks[0].target_tid='foreign',dialog:s=>s.ui.dialogs=[{ref:'foreign'}],node:s=>s.prepared_node_context.node_id='foreign',document:s=>s.dom_epoch.document='foreign',wizard:s=>s.wizard.root_ref='foreign',field:s=>s.ui.elements[0].wizard_combo.field.name='delimiter',clipping:s=>s.ui.elements[0].interaction.covering=[]})){
 test('D54 refuses '+name+' rather than treating it as the owned loading mask',async()=>{const f=fixture({change});await assert.rejects(f.run());assert.equal(f.attempts,1);assert.equal(f.clicks.length,0)});
}
test('D54 remains bounded if the owned loading mask races every attempt',async()=>{
 const f=fixture({refusals:10});await assert.rejects(f.run());assert.equal(f.attempts,3);assert.equal(f.clicks.length,0);
});
test('D54 persistent loading reaches readiness timeout without another click',async()=>{
 const f=fixture({persistent:true});await assert.rejects(f.run(),/readiness timeout/);assert.equal(f.attempts,1);
});
for(const interrupt of ['cancel','deadline'])test('D54 preserves '+interrupt+' while waiting for the loading mask',async()=>{
 const f=fixture({interrupt});await assert.rejects(f.run());assert.equal(f.attempts,1);assert.equal(f.clicks.length,0);
});
test('ordinary picker callers do not acquire loading-mask refresh implicitly',async()=>{
 const f=fixture({optIn:false});await assert.rejects(f.run());assert.equal(f.attempts,1);assert.equal(f.clicks.length,0);
});
for(const [name,lateChange] of Object.entries({node:s=>s.prepared_node_context.node_id='foreign',document:s=>s.dom_epoch.document='foreign',wizard:s=>s.wizard.root_ref='foreign',field:s=>s.ui.elements[0].wizard_combo.field.name='delimiter',value:s=>s.ui.elements[0].wizard_combo.field.value='Имена полей'})){
 test('D54 stops if '+name+' changes after the loading mask clears',async()=>{const f=fixture({lateChange});await assert.rejects(f.run());assert.equal(f.attempts,1);assert.equal(f.clicks.length,0)});
}
