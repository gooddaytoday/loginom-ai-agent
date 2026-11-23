import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoCorrelationNodeSupport} from '../lib/auto-correlation-node.mjs';
import {AUTO_CORRELATION_EMPTY_INPUT,readAutoCorrelationSourceRowCount} from '../lib/auto-correlation-preflight.mjs';

function sourceFixture({rows,kind='new',finish='execute',active=true,parameters={autocorrelation:{field:'X',lag_count:12}}}){
 const node={document_id:'doc',workflow_id:'flow',node_id:'series'},tid='MF;TF;Graph;Series',root='MF;TF;ModelForm;PreviewWindow';
 const owner={...node,verified:true,surface:'graph',locked:false,tid};
 const port={index:0,native_index:0,port_guid:'series-output',tid:tid+';Output_Data-0',active};
 const fields=[{name:'RowID',label:'RowID',type:'integer'},{name:'X',label:'X',type:'real'}];
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',navigation_path:[{tid:'path',label:'Scenario'}]};
 const acf={document_id:'doc',workflow_id:'flow',node_id:'acf'};
 const request={document_id:'doc',workflow_ref,finish,mode:'time_domain',parameters,mappings:[],read:{ports:[0]},
  target:kind==='new'?{kind:'new',type:'research.auto_correlation'}:{kind:'existing',type:'research.auto_correlation',ref:acf},
  inputs:kind==='new'?[{source:node,output:0,input:0}]:[]};
 let preview=false,receipt,reads=0;
 const events=[],operation={id:'acf-run',action:{action_key:'node.apply',revision:'1.0.0'},deadline:Date.now()+5000,parameters:request,
  nodeTargetAdapter:{observe:async()=>({complete:true,document_id:'doc',workflow_ref,nodes:[{ref:node},{ref:acf}],links:[{source:'series',output:0,target:'acf',input:0}]})}};
 const state=()=>({origin:'https://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'doc'},
  prepared_node_context:owner,wizard:{status:'absent'},scan:{complete:true},
  nodes:[{node_ref:{workflow_ref,node_label:'Series'},bounding_box:{x:10,y:10,width:100,height:40},ports:[{tid:port.tid,ui_ref:'ui-port'}]}],
  ui:{masks:[],dialogs:preview?[{ref:'ui-preview',identity:{anchor_tid:root}}]:[],truncated:{elements:false,masks:false,dialogs:false},
   elements:preview?[{tid:root,ref:'ui-preview',allowed_actions:[]},{tid:root+';p.h;close',ref:'ui-close',allowed_actions:['click']}]
    :[{tid:port.tid,ref:'ui-port',kind:'port',allowed_actions:['click','press']}]} });
 const options={operation,onRecord:async r=>{events.push(r);return structuredClone(r);},
  receiptOptions:(id,action_key)=>{receipt={id,action_key};return {};},execute:async code=>{
   if(code.includes('browserReceipt')){
    if(code.includes('"key":"F3"'))preview=true;
    if(code.includes('"ref":"ui-close"'))preview=false;
    return {status:'SUCCEEDED',action_key:receipt.action_key,operation_id:receipt.id,effect_possible:true,cleanup_complete:true};
   }
   if(code.includes('readAutoCorrelationSourceRowCount')){
    assert.equal(preview,true);assert.ok(code.includes('"port_guid":"series-output"')&&code.includes('"node_id":"series"'));
    return reads++===0?{verified:false,reason:'row_count_loading'}:{verified:true,row_count:rows};
   }
   if(code.includes('readOutputContext'))return {verified:true,node_context:owner,ports:[port]};
   if(code.includes('readNodePreviewSchema'))return {verified:true,inventory_complete:true,settings_changed:false,fields,root_tid:root,
    port:0,port_guid:port.port_guid,node_id:node.node_id,node_context:owner};
   return {status:'SUCCEEDED',output:structuredClone(state())};
  }};
 const config={targetOrigin:'https://example.test',targetBuild:'7.4.2'};
 return {events,run:()=>createAutoCorrelationNodeSupport(config).nodeApplyDriverFactory(options).beforeTarget({deadline:Date.now()+5000}),
  get preview(){return preview;},get reads(){return reads;}};
}

const refused=error=>error.message===AUTO_CORRELATION_EMPTY_INPUT&&error.nodePhaseRefusal.phase==='target'&&error.nodePhaseRefusal.status==='NOT_APPLIED'
 &&error.nodePhaseRefusal.effect_possible===false&&error.nodePhaseRefusal.cleanup_complete===true;

for(const kind of ['new','existing'])test(kind+' autocorrelation refuses an empty input before target and Execute',async()=>{
 const f=sourceFixture({rows:0,kind,parameters:kind==='new'?undefined:{}});
 await assert.rejects(f.run(),refused);
 assert.equal(f.preview,false);assert.equal(f.reads,2);
 assert.equal(f.events.at(-1).phase,'auto_correlation_preflight_completed');
 assert.equal(f.events.at(-1).proof.parameters_valid,false);
 assert.equal(f.events.some(e=>e.phase==='node_target_effect_prepared'),false);
});

test('autocorrelation with input rows passes the guard after one settled read',async()=>{
 const f=sourceFixture({rows:8,kind:'existing',parameters:{}});
 assert.equal((await f.run()).parameters_valid,true);
 assert.equal(f.preview,false);assert.equal(f.reads,2);
});

test('autocorrelation Done/close does not inspect input rows',async()=>{
 const f=sourceFixture({rows:0,kind:'existing',finish:'done',parameters:{}});
 assert.equal((await f.run()).not_applicable,true);assert.equal(f.reads,0);
});

test('row count reads only the owned settled preview cache',()=>{
 const node={FGuid:'series',data:{}},port={FGuid:'series-output',parent:node},el={id:'ds',checkVisibility:()=>true};
 const dt={FTotalRowCount:0,FDataSourceStore:{loading:false}},dc={FModelNode:node.data,FDataTable:dt,FDataSource:{$FHelper:{$FRowCount:0}}};
 const saved={bg:globalThis.bg,Ext:globalThis.Ext,document:globalThis.document};
 globalThis.bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:{FPreviewManager:{FPreviewVisible:true,FPreviewForm:{FCurrentPreviewNode:node,FCurrentPreviewPort:port}}}}})}}}}}}};
 globalThis.Ext={getCmp:id=>id==='ds'?{Controller:dc}:null};
 globalThis.document={querySelectorAll:s=>s==='[data-tid="MF;TF;ModelForm;PreviewWindow;PreviewForm;DataSetForm"]'?[el]:[]};
 try{
  const b={node_id:'series',prefix:'MF;TF',port_guid:'series-output'};
  assert.deepEqual(readAutoCorrelationSourceRowCount(b),{verified:true,row_count:0});
  dc.FDataSource.$FHelper.$FRowCount=8;assert.equal(readAutoCorrelationSourceRowCount(b).reason,'row_count_unsettled');
  dc.FDataSource.$FHelper.$FRowCount=0;dt.FDataSourceStore.loading=true;assert.equal(readAutoCorrelationSourceRowCount(b).reason,'row_count_loading');
  dt.FDataSourceStore.loading=false;assert.equal(readAutoCorrelationSourceRowCount({...b,port_guid:'other'}).reason,'row_count_preview_binding');
 }finally{Object.assign(globalThis,saved);}
});

test('guard text is the execution error fixed in the acf-empty expected before runs',async()=>{
 const {readFile}=await import('node:fs/promises');
 const expected=JSON.parse(await readFile(new URL('../../../../docs/node-development/nodes/research-autocorrelation/acceptance/edges/expected-empty.json',import.meta.url),'utf8'));
 assert.equal(expected.execution_error.text,AUTO_CORRELATION_EMPTY_INPUT);
});

test('existing Execute on an inactive source names the source Execute step and keeps the empty-input guard',async()=>{
 const f=sourceFixture({rows:0,kind:'existing',active:false,parameters:{}});
 await assert.rejects(f.run(),error=>{
  for(const text of ['auto_correlation preflight requires an active source output','node feeding input 0','Import','finish:"execute"','same existing','NEW operation_id'])
   assert.ok(error.message.includes(text),text);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
  return true;
 });
 assert.equal(f.preview,false);assert.equal(f.reads,0);
 assert.equal(f.events.some(e=>e.phase==='node_target_effect_prepared'),false);
});

test('new-node Execute on an inactive source keeps the neutral refusal',async()=>{
 const f=sourceFixture({rows:0,kind:'new',active:false});
 await assert.rejects(f.run(),error=>{
  assert.equal(error.message,'auto_correlation preflight requires an active source output');
  assert.doesNotMatch(error.message,/existing/);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
  return true;
 });
 assert.equal(f.preview,false);assert.equal(f.reads,0);
});

test('node reference tells to execute a Done-only or reopened Import before repeating the existing node',async()=>{
 const {readFile}=await import('node:fs/promises');
 const url=new URL('../../../product/skills/loginom-automation/references/nodes/research.auto_correlation.md',import.meta.url);
 const text=await readFile(url,'utf8');
 assert.ok(text.includes('Если Импорт обновлён с `finish:"done"` (в том числе `source_switch`) или пакет открыт заново, перед повторным выполнением существующего узла выполни Импорт с `finish:"execute"`'));
 assert.ok(Buffer.byteLength(text)<=6000);
});
