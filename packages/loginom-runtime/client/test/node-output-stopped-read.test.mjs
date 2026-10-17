import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreStoppedTableRead} from '../lib/node-output-procedure.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'calc'};
const table={view_guid:'view-1',port_guid:'port-1',table_tid:'MF;TF-1;Views;Table1'};
const path=[{tid:'MF;TF-1;path',label:'Сценарий'}];

// The fake applies the procedure's own admission rule: an observation admits
// only the requested kind of this Table's dialog and refuses any other dialog.
function surface(dialog) {
 let open=dialog,views=true;const gestures=[];
 const state=()=>({prepared_node_context:{...node,verified:true,surface:views?'views':'graph'},
  node_outputs:{verified:true,surface:views?'views':'graph',tables:[{...table,active:true}],ports:[{port_guid:'port-1',active:true}]},
  workflow_navigation:{status:'observed',control_ref:'ui-nav',control_tid:'MF;TF-1;path',path},navigation_context:{status:'observed',path},
  ui:{dialogs:open?[{ref:'ui-d',kind:open}]:[],elements:[{tid:'MF;TF-1;path',ref:'ui-nav',allowed_actions:['click']},
   ...(open&&open!=='foreign'?[{tid:table.table_tid+';ModalWindow_Browse'+(open==='format'?'Format':'Filter')+';btnCancel',ref:'ui-cancel',allowed_actions:['click']}]:[])]}});
 return {gestures,channel:{
  observe:async({tableDialog,ready})=>{
   const s=state();
   if(s.ui.dialogs.some(d=>d.kind!==tableDialog?.kind))throw Error('Node procedure is blocked by a mask or dialog');
   if(!ready(s))throw Error('Node procedure readiness timeout');return structuredClone(s);
  },
  perform:async({resolve,initialObservation})=>{const action=resolve(initialObservation);gestures.push(action);
   if(action.ref==='ui-cancel')open=null;if(action.ref==='ui-nav')views=false;}}};
}

test('an unapplied Format draft of a stopped read is cancelled without restoring precision',async()=>{
 const s=surface('format'),view={table,formatProof:null,restored:false,formatting:{originals:[{index:0}],apply_issued:false}};
 const result=await restoreStoppedTableRead(s.channel,view);
 assert.deepEqual(s.gestures.map(g=>g.ref),['ui-cancel','ui-nav']);
 assert.equal(result.dialog_cancelled,true);assert.equal(result.precision_restored,false);assert.equal(view.restored,false);
 assert.equal(result.returned.node_context.surface,'graph');
});
test('a stopped read Filter dialog is cancelled before leaving the Table',async()=>{
 const s=surface('filter'),result=await restoreStoppedTableRead(s.channel,{table,formatProof:null,restored:false,formatting:{}});
 assert.deepEqual(s.gestures.map(g=>g.ref),['ui-cancel','ui-nav']);assert.equal(result.dialog_cancelled,true);
});
test('a stopped read without a dialog or format change only leaves the Table',async()=>{
 const s=surface(null),result=await restoreStoppedTableRead(s.channel,{table,formatProof:null,restored:false,formatting:{}});
 assert.deepEqual(s.gestures.map(g=>g.ref),['ui-nav']);assert.equal(result.dialog_cancelled,false);assert.equal(result.precision_restored,false);
});
test('a foreign dialog refuses the stopped read cleanup without a gesture',async()=>{
 const s=surface('foreign');
 await assert.rejects(restoreStoppedTableRead(s.channel,{table,formatProof:null,restored:false,formatting:{}}),/other than this Table read/);
 assert.deepEqual(s.gestures,[]);
});
