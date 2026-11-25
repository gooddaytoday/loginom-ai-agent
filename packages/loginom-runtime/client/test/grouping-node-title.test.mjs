import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createTabularTransformNodeSupport} from '../lib/calculator-node.mjs';
import * as titles from '../lib/text-import-procedure.mjs';

// LAB-2024 g201-t5 execution-events.jsonl:564,675,685: a new Grouping created
// with target.label «Группировка» (the native default, so no graph rename) shows
// «Автоматическая метка»/«Revenue по Region» on Done, and Done renames the node.
function groupingDone({label,graphLabel=label??'Revenue по Region'}={}){
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},actions=[];
 let surface='wizard',caption='Группировка';
 const fields={label:{status:'observed',value:'Revenue по Region',truncated:false,input_ref:'label-input',owner_ref:'label-owner',enabled:true},
  label_mode:{status:'observed',value:'Автоматическая метка',truncated:false,input_ref:'mode-input',owner_ref:'mode-owner',enabled:true}};
 const combo=(kind,extra={})=>({wizard_combo:{kind,field:{name:'label_mode',scope:'node_title',root_ref:'root',owner_ref:'mode-owner',input_ref:'mode-input'},...extra}});
 const owner={status:'observed',node:{tid:'nav>Группировка',label:'Группировка'}};
 const state=()=>structuredClone({prepared_node_context:{...node,verified:true,surface},
  wizard:surface==='graph'?{status:'absent'}:{status:'observed',stage:'done',root_tid:'wizard',root_ref:'root',owner_context:owner,completion:{fields,ready:true,settings_applied:false}},
  ui:{elements:[{tid:'wizard;btnDone',ref:'done',allowed_actions:['finish_wizard']},
   {ref:'picker',allowed_actions:['click'],...combo('picker')},
   {ref:'option',allowed_actions:['select_wizard_option'],...combo('option',{label:'Пользовательская метка'})}]}});
 const channel={async observe({ready}){const s=state();assert.ok(ready(s));return s;},
  async perform({resolve,ready}){const s=state();assert.ok(ready(s));const a=resolve(s);actions.push(a);
   if(a.verb==='select_wizard_option')fields.label_mode.value='Пользовательская метка';
   if(a.verb==='fill')fields.label.value=a.text;
   if(a.verb==='finish_wizard'){surface='graph';caption=fields.label_mode.value==='Автоматическая метка'?'Revenue по Region':graphLabel==='Revenue по Region'?fields.label.value:graphLabel;}}};
 const create=vm.runInNewContext('('+createTabularTransformNodeSupport.toString()+')',{
  structuredClone,calculatorParametersSchema:{},calculatorConfigurationReadback:()=>{},requireValue:(v,m)=>{if(!v)throw Error(m);},verified:v=>({verified:true,cleanup_complete:true,effect_possible:false,...v}),
  createNodeProcedure:()=>channel,control:(s,key,verb)=>s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb)),
  configureNodeTitle:titles.configureNodeTitle,
 });
 const support=create({},{type:'transform.group_data',mode:'aggregate',keepTargetLabel:true});
 const request={finish:'execute',target:{kind:'new',type:'transform.group_data',...(label!==undefined?{label}:{})},inputs:[],mappings:[],document_id:'doc',workflow_ref:{workflow_id:'flow'}};
 const operation={id:'g',nodeApply:{request,node},nodeTargetAdapter:{async observe(){return {complete:true,document_id:'doc',workflow_ref:{workflow_id:'flow'},
  nodes:[{ref:node,type:'transform.group_data',label:caption}],links:[]};}}};
 const driver=support.nodeApplyDriverFactory({operation});
 return {actions,fields,finish:()=>driver.finish('done',{node,document_id:'doc',workflow_ref:request.workflow_ref,deadline:1000})};
}

test('explicit target.label survives Grouping Done through the native custom title',async()=>{
 const f=groupingDone({label:'Группировка'});
 const result=await f.finish();
 assert.deepEqual(f.actions.map(a=>a.verb),['click','select_wizard_option','fill','press','finish_wizard']);
 assert.equal(f.actions[2].text,'Группировка');
 assert.equal(f.fields.label_mode.value,'Пользовательская метка');
 assert.equal(result.settings_applied,true);
});

test('omitted target.label keeps the native automatic Grouping caption without title gestures',async()=>{
 const f=groupingDone();
 await f.finish();
 assert.deepEqual(f.actions.map(a=>a.verb),['finish_wizard']);
 assert.equal(f.fields.label_mode.value,'Автоматическая метка');
});

test('Grouping Done fails closed when the graph caption differs from target.label',async()=>{
 const f=groupingDone({label:'Группировка',graphLabel:'Другая подпись'});
 await assert.rejects(f.finish(),/NODE_LABEL_NOT_PRESERVED/);
});
