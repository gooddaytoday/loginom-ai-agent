import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {validateVariablesColumnUnionParameters,validateVariablesColumnUnionFields} from '../lib/variables-coluniondatavar-parameters.mjs';
import {variablesColumnUnionSourceExecution} from '../lib/variables-coluniondatavar-preflight.mjs';
import {configureVariablesColumnUnion,readVariablesColumnUnionMapping,readVariablesColumnUnionSourceEditor} from '../lib/variables-column-union-procedure.mjs';
import {variablesColumnUnionConfigurationReadback} from '../lib/variables-coluniondatavar-readback.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import {createVariablesColumnUnionNodeSupport} from '../lib/variables-coluniondatavar-node.mjs';

const parameters=()=>({column_union:{mapping:'manual',fields:[
 {input:1,source:'amount',name:'right_amount',label:'Правая сумма',type:'integer'},
 {input:0,source:'amount',name:'left_amount',label:'Левая сумма',type:'integer'},
]}});
test('manual union accepts an ordered complete selection with names, labels and declared types',()=>{
 validateVariablesColumnUnionParameters(parameters(),'append_variables');
});
test('manual creation accepts the native default caption with guarded first-link reconciliation',()=>{
 const request={target:{kind:'new',label:'Соединение (переменные)'},inputs:[],mappings:[],variable_inputs:[0,1].map(input=>({kind:'variables',input,source:{node_id:'s'+input}})),read:{ports:[],variable_ports:[0]}};
 validateVariablesColumnUnionParameters(parameters(),'append_variables',request);
 delete request.target.label;validateVariablesColumnUnionParameters(parameters(),'append_variables',request);
 request.target.label='User union';validateVariablesColumnUnionParameters(parameters(),'append_variables',request);
});
test('manual preflight refuses integer to string with a clear platform reason before a target effect',()=>{
 const outputs=[0,1].map(()=>({variables:[{name:'amount',type:'integer'}]}));
 validateVariablesColumnUnionFields(parameters(),outputs);
 const p=parameters();p.column_union.fields[1].type='string';
 assert.throws(()=>validateVariablesColumnUnionFields(p,outputs),e=>/Loginom 7.4.2.*integer.*string/.test(e.message)&&/Калькулятор переменных после Соединения/.test(e.message));
});
test('other type mismatches describe the handler restriction without attributing it to Loginom 7.4.2',()=>{
 const p=parameters();p.column_union.fields[1].type='real';
 assert.throws(()=>validateVariablesColumnUnionFields(p,[0,1].map(()=>({variables:[{name:'amount',type:'integer'}]}))),e=>!/Loginom 7.4.2/.test(e.message)&&/ручное соответствие этого узла не меняет тип/.test(e.message));
});
test('new manual close is refused during parameter validation before any browser effect',()=>{
 const r={target:{kind:'new'},finish:'close',inputs:[],mappings:[],read:{ports:[],variable_ports:[]},variable_inputs:[0,1].map(input=>({kind:'variables',input,source:{node_id:'s'+input}}))};
 assert.throws(()=>validateVariablesColumnUnionParameters(parameters(),'append_variables',r),/new.*manual.*close/);
 r.target.kind='existing';validateVariablesColumnUnionParameters(parameters(),'append_variables',r);
 r.target.kind='new';r.finish='execute';validateVariablesColumnUnionParameters(parameters(),'append_variables',r);
});
test('the production apply entry rejects new manual close before invoking any driver or journal',async()=>{
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const request={operation_id:'close-new',contract_revision:'1.0.0',document_id:'doc',workflow_ref,
  target:{kind:'new',type:'variables.column_union',position:{x:96,y:80}},inputs:[],variable_inputs:[0,1].map(input=>({kind:'variables',input,output:0,source:{document_id:'doc',workflow_id:'wf',node_id:'s'+input}})),
  mode:'append_variables',parameters:parameters(),mappings:[],finish:'close',read:{ports:[],variable_ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:1000,execute_ms:1000,total_ms:10000}};
 const support=createVariablesColumnUnionNodeSupport({targetOrigin:'https://loginom.invalid',targetBuild:'7.4.2'});
 await assert.rejects(()=>applyNode({request,operation:{id:request.operation_id},handlers:support.nodeApplyHandlers,drivers:{},record:()=>assert.fail('pre-mutation refusal must not start a phase')}),/new.*manual.*close/);
});

function configureFixture(){
 const state={verified:true,inventory_complete:true,mapping:'manual',table:true,sources:[{name:'amount',label:'amount',type:'integer'},{name:'amount',label:'amount',type:'integer'}],fields:[]};
 const source_fields=state.sources.map((s,input)=>({...s,input})),effects=[],metadata={};let selected,serial=0;
 const readNode=async()=>({verified:true,surface:'wizard',node_id:'union'}),readMapping=()=>structuredClone(state);
 const click=tid=>{effects.push(tid);
  if(tid.endsWith('colTargetDelete_'))state.fields=state.fields.filter(f=>f.record_id!==selected.record);
  if(tid==='EditVariableForm;btnApply')state.fields.push({...metadata,record_id:'r'+serial++,source_index:null});
  if(tid==='option')state.fields.at(-1).source_index=state.fields.length===1?1:0;
 };
 const locator=tid=>({locator:()=>({count:async()=>1,fill:async value=>{metadata[tid.endsWith('edtName')?'name':'label']=value;},press:async()=>{}}),waitFor:async()=>{},click:async()=>click(tid)});
 const page={evaluate:async(fn,arg)=>{
  if(fn===readMapping)return readMapping();
  if(fn===readVariablesColumnUnionSourceEditor)return {verified:true,tid:arg.source_index===undefined?'editor':'option',expanded:true,index:arg.source_index};
  if(arg?.tid&&arg.value===undefined){selected=arg;return {x:0,y:0};}
  metadata.type=({4:'integer',3:'real',5:'string',1:'boolean'})[arg.value];return 'type-option';
 },waitForTimeout:async()=>{},mouse:{click:async()=>click(selected.tid)},locator:q=>locator(q.includes('type-option')?'type-option':q.includes('option')?'option':q.includes('EditVariableForm;edtName')?'EditVariableForm;edtName':q.includes('EditVariableForm;edtDisplayName')?'EditVariableForm;edtDisplayName':'other')};
 const task={binding:{workflow_ref:{prefix:'MF;TF'}},parameters:parameters(),source_fields,deadline:Date.now()+10000,finish:'done'};
 return {state,effects,task,run:()=>configureVariablesColumnUnion(page,task,readNode,readMapping)};
}
test('manual configuration compares five field values independently of request key order',async()=>{
 const f=configureFixture();f.task.parameters.column_union.fields=f.task.parameters.column_union.fields.map(({source,input,name,label,type})=>({source,input,name,label,type}));
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);
 assert.deepEqual(result.configuration.fields,parameters().column_union.fields);
 assert.ok(f.effects.some(t=>t.endsWith('btnNext')));
});
test('close of a saved manual mapping needs no preflight source inventory and makes no configuration gesture',async()=>{
 const f=configureFixture();f.state.fields=parameters().column_union.fields.map((v,i)=>({...v,source_index:1-i,record_id:'saved'+i}));
 f.task.parameters={};f.task.source_fields=[];f.task.finish='close';
 const before=structuredClone(f.state),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(result.effect_possible,false);
 assert.deepEqual(f.effects,[]);assert.deepEqual(f.state,before);assert.equal(result.configuration.mapping,'manual');
});
test('manual source read binds the latest completed native-owned process without executing the source',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'left'};
 const snapshot={verified:true,inventory_complete:true,show_completed:true,root_id:'r',node_context:{verified:true,...node},processes:[
  {process_id:'1',record_id:'g',parent_id:null,state:'completed',error:false,children_loaded:true},
  {process_id:'1.1',record_id:'p',parent_id:'1',state:'completed',error:false,owner:{verified:true,node_id:'left',source:'native_process_model_identity'}}]};
 assert.equal(variablesColumnUnionSourceExecution(snapshot,node).execution_id,'d:r:1');
 for(const change of [s=>s.processes[1].owner.node_id='other',s=>s.processes[0].error=true,s=>s.inventory_complete=false,
  s=>s.processes.push({...s.processes[1],process_id:'2.1',parent_id:'2',record_id:'later',state:'pending_or_failed'})]){
  const s=structuredClone(snapshot);change(s);assert.throws(()=>variablesColumnUnionSourceExecution(s,node));
 }
});
test('manual production readback fits the public result and refuses wrong order or conversion metadata',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'u'},fields=parameters().column_union.fields;
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,...value}});
 const phases=[phase('input_mapping',{inputs:[0,1].map(input=>({kind:'variables',input,output:0,source:{...node,node_id:'s'+input},source_port_guid:'s'+input,target_port_guid:'u'+input})),source_fields:[0,1].map(input=>({input,name:'amount',label:'amount',type:'integer'}))}),
  phase('configure',{configuration:{mapping:'manual',inventory_complete:true,node_context:{...node,verified:true},fields}}),phase('finish',{settings_applied:true}),phase('read',{variable_ports:[{variables:fields.map(({name,label,type})=>({name,label,type}))}]})];
 const read=()=>variablesColumnUnionConfigurationReadback({node,phases,operation_id:'op'}),r=read();
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validate(r).valid,true);
 phases[3].value.variable_ports[0].variables.reverse();assert.throws(read,/manual output differs/);
});

function mappingFixture(){
 const base='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',elements=new Map(),components=new Map();
 const element=tid=>{const el={id:tid,checkVisibility:()=>true};elements.set(tid,el);return el;};
 const root=element(base);root.contains=e=>[...elements.values()].includes(e);
 const add=(key,properties)=>{const el=element(base+';'+key);components.set(el.id,{el:{dom:el},...properties});};
 const record=(ID,Name,DataType)=>({internalId:'r'+ID,isModel:true,data:{ID,Name,DisplayName:Name,DataType}});
 const sources=[record(0,'amount',4),record(1,'empty',5),record(2,'amount_1',4),record(3,'enabled',1)],targets=[record(4,'right_amount',4),record(5,'left_text',5)];
 for(const [t,index] of targets.map((t,i)=>[t,[2,0][i]])){t.data.ConnectedRecord=sources[index];sources[index].data.ConnectedRecord=t;}
 const stores=[sources,targets].map(rows=>({$className:'Ext.data.Store',getData:()=>({items:rows}),getCount:()=>rows.length,isLoading:()=>false,getProxy:()=>({pendingOperations:{}})}));
 add('btnAutoSyncThroughColumns',{pressed:false});add('rbTable',{getValue:()=>true});
 ['grdSourceColumns','grdTargetColumns'].forEach((k,i)=>add(k,{getStore:()=>stores[i]}));
 const document={querySelectorAll:q=>{const tid=JSON.parse(q.slice(10,-1));return elements.has(tid)?[elements.get(tid)]:[];}};
 return {sources,targets,stores,read:()=>vm.runInNewContext('('+readVariablesColumnUnionMapping.toString()+')("MF;TF")',{document,Ext:{getCmp:id=>components.get(id)}})};
}
test('manual mapping reads complete reciprocal local records, ordered sources and conversion without remote getters',()=>{
 const f=mappingFixture();for(const r of [...f.sources,...f.targets])Object.defineProperty(r.data,'$self',{get(){assert.fail('remote variable read');}});
 const result=f.read();assert.equal(result.verified,true);assert.equal(result.mapping,'manual');
 assert.deepEqual(Array.from(result.fields,f=>[f.name,f.source_index,f.type]),[['right_amount',2,'integer'],['left_text',0,'string']]);
});
test('manual mapping refuses filtered, loading, unsupported and nonreciprocal records',()=>{
 for(const change of [f=>f.stores[0].isLoading=()=>true,f=>f.sources[0].data.ConnectedRecord=null,
  f=>f.targets[0].data.DataType=2,f=>f.stores[1].getCount=()=>99,
  f=>f.stores[0].getData=()=>({items:f.sources,getSource:()=>({items:[...f.sources,{}]})})]){
  const f=mappingFixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('source editor uses native isXType, binds its active record and selects duplicate labels by native identity',()=>{
 const base='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard',elements=new Map(),components=new Map();
 const add=(suffix,properties)=>{const tid=base+';'+suffix,el={id:tid,checkVisibility:()=>true,getAttribute:key=>key==='data-tid'?tid:null};elements.set(tid,el);const cmp={el:{dom:el},...properties};components.set(tid,cmp);return cmp;};
 const sources=[0,1].map(i=>({isModel:true,internalId:'s'+i,data:{Name:'amount',ID:i}}));
 const options=sources.map(source=>({data:{Value:source,DisplayName:'amount'}}));
 const option={getAttribute:key=>key==='data-tid'?base+';editor;boundlist;amount':key==='data-recordindex'?'1':null};
 const combo=add('editor',{isXType:type=>type==='combobox',isExpanded:true,picker:{el:{dom:{checkVisibility:()=>true}},getStore:()=>({getData:()=>({items:options})}),getNode:r=>r===options[1]?option:null,getRecord:()=>options[1]}});
 const plugin={context:{record:{internalId:'target'},column:{dataIndex:'SourceDisplayName'}},activeEditor:{field:combo}};
 add('grdTargetColumns',{findPlugin:()=>plugin});add('grdSourceColumns',{getStore:()=>({getData:()=>({items:sources})})});
 const document={querySelectorAll:q=>q==='[data-tid]'?[...elements.values()]:(()=>{const t=JSON.parse(q.slice(10,-1));return elements.has(t)?[elements.get(t)]:[];})()};
 const read=source_index=>vm.runInNewContext('('+readVariablesColumnUnionSourceEditor.toString()+')(task)',{document,Ext:{getCmp:id=>components.get(id)},task:{base,record:'target',source_index}});
 assert.equal(combo.isComboBox,undefined);assert.equal(read().verified,true);assert.equal(read().expanded,true);
 assert.equal(read(1).index,1);plugin.context.record.internalId='foreign';assert.throws(()=>read(1),/owner changed/);
});
test('manual union refuses ambiguous sources, duplicate names, unsupported types and incomplete fields before mutation',()=>{
 for(const change of [p=>p.column_union.fields=[],p=>p.column_union.fields[0].input=2,
  p=>p.column_union.fields[0].type='datetime',p=>delete p.column_union.fields[0].source,
  p=>p.column_union.fields[1].name='RIGHT_AMOUNT',p=>p.column_union.fields[0].extra=true,
  p=>p.column_union.fields.push({...p.column_union.fields[0],name:'other'}),
  p=>p.column_union.mapping='automatic']){
  const p=parameters();change(p);assert.throws(()=>validateVariablesColumnUnionParameters(p,'append_variables'));
 }
});
