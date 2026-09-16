import test from 'node:test';
import assert from 'node:assert/strict';
import {wizardOpenBinding,boundWizardDeactivationConfirmation} from '../lib/node-wizard-open.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
const fixture=()=>{
 const node={verified:true,surface:'graph',document_id:'doc',workflow_id:'flow',node_id:'node',tid:'MF;TF-1;Graph;Import'};
 const path=[{tid:'flow',label:'Scenario'}];
 const state={loginom_build:'7.4.2',prepared_node_context:node,wizard:{status:'absent'},navigation_context:{status:'observed',path},
  ui:{masks:[],dialogs:[],elements:[{tid:node.tid+';Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import',part:'settings'},workflow_path:path}}]}};
 const binding=wizardOpenBinding(state);
 state.wizard_pending_owner={status:'observed',node:{tid:'flow>Import'},path:[...path,{tid:'flow>Import',label:'Import'},{tid:'flow>Import>Settings',label:'Settings'}]};
 state.ui.dialogs=[{ref:'question',title:'Loginom 7.4.2',text:'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'}];
 state.ui.elements=Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([id,label])=>({tid:'msgbox;tlb;'+id,label,signature:{dialog_ref:'question'},allowed_actions:['click']}));
 return {state,binding};
};
test('deactivation requires the exact prepared graph, workflow, question and three button meanings',()=>{
 const {state,binding}=fixture();assert.equal(boundWizardDeactivationConfirmation(state,binding),true);
 for(const change of [s=>s.prepared_node_context.node_id='foreign',s=>s.prepared_node_context.surface='wizard',
  s=>s.wizard_pending_owner.path=[],s=>s.ui.dialogs[0].text='Закрыть мастер?',s=>s.ui.dialogs[0].title='Восстановление сессии',
  s=>s.ui.elements[0].label='Да, больше не спрашивать',s=>s.ui.elements[0].signature.dialog_ref='foreign',
  s=>s.ui.elements.pop(),s=>s.ui.elements[0].allowed_actions=[],s=>s.ui.dialogs.push({...s.ui.dialogs[0]}),
  s=>s.ui.masks.push({kind:'busy',ref:'question'})]) {
  const bad=structuredClone(state);change(bad);assert.equal(boundWizardDeactivationConfirmation(bad,binding),false);
 }
});
test('question discovery cannot replace button verification',()=>{
 const {state,binding}=fixture();state.ui.elements=[];
 assert.equal(boundWizardDeactivationConfirmation(state,binding,false),true);
 assert.equal(boundWizardDeactivationConfirmation(state,binding),false);
});
test('settings opening requires one control of the prepared graph node',()=>{
 const {state}=fixture();assert.throws(()=>wizardOpenBinding(state));
});
test('deactivation gestures cannot run without a native prepared-node binding',()=>{
 for(const verb of ['begin_wizard','confirm_wizard_deactivation'])assert.throws(()=>
  makeWorkspaceUiCode({mode:'act',action:{verb,ref:'ui-question'}}),/prepared native node binding/);
});
