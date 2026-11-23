import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readVariablesColumnUnionNextDialogBrowser} from '../lib/variables-coluniondatavar-context.mjs';
import {captureVariablesColumnUnionNextDialog} from '../lib/variables-coluniondatavar-node.mjs';
const text='Обнаружены связи с несуществующими объектами.Вы хотите удалить все потерянные связи и продолжить?';
function fixture(){
 const prefix='MF;TF-1',root={checkVisibility:()=>true,contains:e=>e===mapping},mapping={checkVisibility:()=>true};
 const button=(id,tid,label)=>({id,innerText:label,disabled:false,checkVisibility:()=>true,getAttribute:k=>k==='data-tid'?tid:null,closest:()=>null});
 const buttons=[button('yes','msgbox;tlb;yes','Удалить и продолжить'),button('no','msgbox;tlb;no','Не удалять и продолжить'),button('cancel','msgbox;tlb;cancel','Отмена')];
 const dialog={id:'messagebox-1001',innerText:text,checkVisibility:()=>true,getAttribute:()=>null,querySelectorAll:q=>q==='[data-tid]'?buttons:buttons};
 const cmp={$className:'Ext.window.MessageBox',xtype:'messagebox',el:{dom:dialog}},document={querySelectorAll:q=>q==='[role="dialog"],.x-message-box'?[dialog]:q.includes('DerivedVariablesMappingEngineOutputPortWizard')?[mapping]:[root]};
 const run=()=>vm.runInNewContext('('+readVariablesColumnUnionNextDialogBrowser.toString()+')("MF;TF-1")',{document,Ext:{getCmp:id=>id===dialog.id?cmp:null,WindowManager:{front:cmp}}});
 return {run,dialog,buttons,cmp};
}
test('union Next diagnostic reads the native question and exact button tids without answering it',()=>{
 const f=fixture(),r=f.run();assert.equal(r.status,'observed');assert.equal(r.dialogs.length,1);
 assert.equal(r.dialogs[0].text,text);assert.equal(r.dialogs[0].data_tid,null);
 assert.deepEqual(Array.from(r.dialogs[0].buttons,b=>[b.data_tid,b.text]),[['msgbox;tlb;yes','Удалить и продолжить'],['msgbox;tlb;no','Не удалять и продолжить'],['msgbox;tlb;cancel','Отмена']]);
 assert.equal(r.dialogs[0].native_class,'Ext.window.MessageBox');
});
test('diagnostic journals only this union Next refusal and never replaces its original error',async()=>{
 const error={receipt:{error:{code:'WIZARD_STEP_NOT_CONFIRMED'}}},events=[],node={document_id:'d',workflow_id:'w',node_id:'u'};
 const options={operation:{id:'union',parameters:{target:{type:'variables.column_union'}}},execute:async()=>({status:'observed',node_context:{...node,verified:true}}),onRecord:async e=>events.push(e)};
 const binding={document_id:'d',workflow_ref:{workflow_id:'w',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},node};
 await captureVariablesColumnUnionNextDialog(options,binding,error);assert.equal(events[0].phase,'node_variables_union_next_dialog');assert.equal(events[0].snapshot.status,'observed');
 options.execute=async()=>{throw Error('read failed');};await captureVariablesColumnUnionNextDialog(options,binding,error);assert.equal(events[1].phase,'node_variables_union_next_dialog_unavailable');
 const count=events.length;await captureVariablesColumnUnionNextDialog(options,binding,{receipt:{error:{code:'OTHER'}}});assert.equal(events.length,count);
});
