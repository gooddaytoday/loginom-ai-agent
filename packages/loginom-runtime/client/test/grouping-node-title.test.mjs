import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupingNodeSupport} from '../lib/grouping-node.mjs';
import {createCalculatorNodeSupport} from '../lib/calculator-node.mjs';

// LAB-2024 g201-t5 execution-events.jsonl:564,675,685: a new node created with
// target.label equal to its native default caption is never renamed, so the Done
// page keeps «Автоматическая метка» and Done replaces the requested caption.
const AUTO='Автоматическая метка',CUSTOM='Пользовательская метка';
function nodeDone(createSupport,{type,label,mode=AUTO,derived='Revenue по Region',page=true,graph='rename',extraNodes=0,complete=true}){
 const workflow={workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const node={document_id:'doc',workflow_id:'workflow',node_id:'node1'},actions=[];
 const fields={label:{status:'observed',value:mode===AUTO?derived:label,truncated:false,input_ref:'ui-label',owner_ref:'ui-label-owner',enabled:true},
  label_mode:{status:'observed',value:mode,truncated:false,input_ref:'ui-mode',owner_ref:'ui-mode-owner',enabled:true}};
 let surface='wizard',caption='Default';
 const owner={status:'observed',opening_verified:false,node:{ref:'ui-crumb',tid:'path>Default',label:'Default'}};
 const combo=(kind,extra={})=>({wizard_combo:{kind,field:{name:'label_mode',scope:'node_title',root_ref:'ui-root',owner_ref:'ui-mode-owner',input_ref:'ui-mode'},...extra}});
 const state=()=>structuredClone({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'document',revision:1},
  prepared_node_context:{...node,verified:true,surface,tid:surface==='graph'?'MF;TF-1;Graph;'+caption:'MF;TF-1;WizrdMCF'},scan:{complete:true},
  wizard:surface==='graph'?{status:'absent'}:{status:'observed',stage:'done',root_tid:'MF;TF-1;WizrdMCF',root_ref:'ui-root',owner_context:owner,
   ...(page?{completion:{fields,ready:true,settings_applied:false}}:{})},
  ui:{elements:surface==='graph'?[]:[{ref:'ui-done',tid:'MF;TF-1;WizrdMCF;btnDone',allowed_actions:['finish_wizard']},
   ...(page?[{ref:'ui-picker',tid:'MF;TF-1;WizrdMCF;DoneWizard;cbxNodeTitleMode;trg_picker',allowed_actions:['click'],...combo('picker')},
    ...[AUTO,CUSTOM].filter(o=>o!==fields.label_mode.value).map(o=>({ref:'ui-option',tid:'MF;TF-1;WizrdMCF;DoneWizard;cbxNodeTitleMode;boundlist;'+o,allowed_actions:['select_wizard_option'],...combo('option',{label:o})})),
    {ref:'ui-label',tid:'MF;TF-1;WizrdMCF;DoneWizard;edtDisplayName',allowed_actions:['fill','press']}]:[])],
   dialogs:[],masks:[],truncated:{dialogs:false,masks:false,elements:false}}});
 const operation={id:'apply1',deadline:10000,action:{action_key:'node.apply',revision:'1'}};
 const request={operation_id:'apply1',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'new',type,...(label!==undefined?{label}:{})},inputs:[],mappings:[],parameters:{},finish:'execute'};
 Object.assign(operation,{parameters:request,nodeApply:{request,node,phases:[]}});
 const options={operation,now:()=>1000,onRecord:async e=>({...e,recorded_at:'fixture'}),
  receiptOptions:(id,action_key,signature)=>{operation.lastReceipt={id,operation_id:id,action_key,signature};return {};},
  execute:async code=>{
   const task=JSON.parse(code.match(/(\{"mode":.*"kind":"workspace-ui"\})/s)[1]);
   if(task.mode==='observe')return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:state()};
   const a=task.action;actions.push(a);
   if(a.verb==='select_wizard_option'){fields.label_mode.value=CUSTOM;}
   if(a.verb==='fill')fields.label.value=a.text;
   if(a.verb==='finish_wizard'){surface='graph';caption=graph==='rename'?(fields.label_mode.value===AUTO?derived:fields.label.value):graph;}
   return {status:'SUCCEEDED',operation_id:task.operation_id,action_key:'ui.act',action_revision:'1',phase:'applied',
    cleanup_complete:true,effect_possible:true,output:state(),trace:[],error:null};
  }};
 operation.nodeTargetAdapter={observe:async()=>({complete,document_id:'doc',workflow_ref:workflow,links:[],foreign_links:[],
  nodes:[{ref:node,type,label:caption},...Array.from({length:extraNodes},()=>({ref:node,type,label:caption}))]})};
 const drivers=createSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2',wait:async()=>{}}).nodeApplyDriverFactory(options);
 return {actions,fields,finish:()=>drivers.finish('done',{node,document_id:'doc',workflow_ref:workflow,deadline:10000})};
}
const kinds=[['Grouping',createGroupingNodeSupport,'transform.group_data','Группировка'],['Calculator',createCalculatorNodeSupport,'transform.calculator','Калькулятор']];
for(const [name,create,type,label] of kinds){
 test(name+': explicit target.label survives Done through the native custom title',async()=>{
  const f=nodeDone(create,{type,label});
  const result=await f.finish();
  assert.deepEqual(f.actions.map(a=>a.verb),['click','select_wizard_option','fill','press','finish_wizard']);
  assert.equal(f.actions[2].text,label);assert.equal(f.fields.label_mode.value,CUSTOM);assert.equal(result.settings_applied,true);
 });
 test(name+': omitted target.label keeps the automatic caption without title gestures or graph check',async()=>{
  const f=nodeDone(create,{type,label:undefined,graph:'Revenue по Region',complete:false});
  await f.finish();
  assert.deepEqual(f.actions.map(a=>a.verb),['finish_wizard']);assert.equal(f.fields.label_mode.value,AUTO);
 });
}
test('custom title already equal to target.label makes no title gesture',async()=>{
 const f=nodeDone(createGroupingNodeSupport,{type:'transform.group_data',label:'Группировка',mode:CUSTOM});
 await f.finish();assert.deepEqual(f.actions.map(a=>a.verb),['finish_wizard']);
});
test('custom title with another caption is replaced without a mode gesture',async()=>{
 const f=nodeDone(createGroupingNodeSupport,{type:'transform.group_data',label:'Группировка',mode:CUSTOM});
 f.fields.label.value='Старая подпись';
 await f.finish();assert.deepEqual(f.actions.map(a=>a.verb),['fill','press','finish_wizard']);
});
test('a 121–200 unit target.label is accepted as the custom title',async()=>{
 for(const length of [121,200]){
  const label='Группа '+'x'.repeat(length-7),f=nodeDone(createCalculatorNodeSupport,{type:'transform.calculator',label});
  await f.finish();assert.equal(f.fields.label.value,label);assert.equal(label.length,length);
 }
});
test('a Done page without the native title still verifies the committed caption',async()=>{
 const ok=nodeDone(createCalculatorNodeSupport,{type:'transform.calculator',label:'Калькулятор',page:false,graph:'Калькулятор'});
 await ok.finish();assert.deepEqual(ok.actions.map(a=>a.verb),['finish_wizard']);
 const bad=nodeDone(createCalculatorNodeSupport,{type:'transform.calculator',label:'Калькулятор',page:false,graph:'Twice'});
 await assert.rejects(bad.finish(),/^Error: NODE_LABEL_NOT_PRESERVED/);
});
for(const [why,extra] of [['different caption',{graph:'Другая подпись'}],['incomplete graph',{complete:false}],['ambiguous node identity',{extraNodes:1}]])
 test('Done fails closed on '+why,async()=>{
  const f=nodeDone(createGroupingNodeSupport,{type:'transform.group_data',label:'Группировка',...extra});
  await assert.rejects(f.finish(),/NODE_LABEL_NOT_PRESERVED/);
 });
