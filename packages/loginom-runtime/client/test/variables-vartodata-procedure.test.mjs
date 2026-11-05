import test from 'node:test';
import assert from 'node:assert/strict';
import {configureVariablesToTable} from '../lib/variables-vartodata-procedure.mjs';

function fixture({mode='columns',kind='new',finish='execute',destination='done',lost=false,requested='columns'}={}){
 const node={verified:true,surface:'wizard',document_id:'doc',workflow_id:'wf',node_id:'n'};
 const state={wizard:{status:'observed',stage:'variables_to_table',root_tid:'root',root_ref:'ui-wizard'},prepared_node_context:node,
  node_variables_to_table:{verified:true,inventory_complete:true,mode,node_context:node,settings_applied:false},ui:{elements:[
   {tid:'root;VariablesToDataWizard;rbVarToColumns;DisplayEl',ref:'ui-columns',allowed_actions:['set_checked']},
   {tid:'root;VariablesToDataWizard;rbVarToRows;DisplayEl',ref:'ui-rows',allowed_actions:['set_checked']},
   {tid:'root;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}
  ]}},actions=[];
 const channel={observe:async spec=>{assert.ok(spec.ready(state));return structuredClone(state);},perform:async spec=>{
  assert.ok(spec.ready(state));spec.identity(state);const action=spec.resolve(state);actions.push(action);
  if(lost)throw Error('lost reply');
  if(action.verb==='set_checked')state.node_variables_to_table.mode=action.ref==='ui-rows'?'rows':'columns';
  if(action.verb==='wizard_step')state.wizard.stage=destination;
 }};
 return {state,actions,run:()=>configureVariablesToTable(channel,{}, {request:{target:{kind,ref:node},finish,mode:requested}})};
}
test('columns writes no redundant radio gesture and validates with one Next',async()=>{
 const f=fixture();const r=await f.run();assert.equal(r.configuration.mode,'columns');assert.equal(r.validation.status,'accepted_by_loginom_next');
 assert.deepEqual(f.actions,[{verb:'wizard_step',ref:'ui-next',expected_stage:['output_mapping','done']}]);
});
test('new node may explicitly select columns once; existing rows settings cannot silently change',async()=>{
 const f=fixture({mode:'rows'});await f.run();assert.equal(f.actions[0].checked,true);assert.equal(f.actions.length,2);
 const old=fixture({mode:'rows',kind:'existing'});await assert.rejects(old.run(),/Этот режим пока не поддерживается/);assert.deepEqual(old.actions,[]);
});
test('Close observes settings without writing, validating or applying them',async()=>{
 const f=fixture({mode:'rows',kind:'existing',finish:'close'});const r=await f.run();assert.equal(r.draft_edits_skipped,true);assert.equal(r.configuration.mode,'rows');assert.deepEqual(f.actions,[]);
});
test('unsettled radio or Next is never replayed',async()=>{
 for(const mode of ['columns','rows']){const f=fixture({mode,lost:true});await assert.rejects(f.run(),/lost reply/);assert.equal(f.actions.length,1);}
});
test('foreign configuration owner refuses before a gesture',async()=>{
 const f=fixture({kind:'existing'});f.state.node_variables_to_table.node_context={...f.state.prepared_node_context,node_id:'other'};
 await assert.rejects(f.run(),/owner/);assert.deepEqual(f.actions,[]);
});

for(const initial of ['columns','rows'])test('rows selects its owned radio only when needed: '+initial,async()=>{
 const f=fixture({mode:initial,requested:'rows'}),r=await f.run();assert.equal(r.configuration.mode,'rows');
 assert.equal(f.actions.length,initial==='rows'?1:2);
 if(initial==='columns')assert.deepEqual(f.actions[0],{verb:'set_checked',ref:'ui-rows',checked:true});
});
test('existing columns cannot silently switch to rows',async()=>{
 const f=fixture({kind:'existing',requested:'rows'});await assert.rejects(f.run(),/режим/);assert.deepEqual(f.actions,[]);
});
