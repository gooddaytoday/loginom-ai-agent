import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupernodeParameters} from '../lib/supernode-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import vm from 'node:vm';
import {readSupernodeVariablesBrowser,readSupernodeBrowser} from '../lib/supernode-context.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {actions} from './support/executor-fixture.mjs';

const boundary={input:{kind:'table',name:'Input',label:'Исходные данные',requirement:'required'},output:{kind:'table',name:'Output',label:'Результат'}};
const variableBoundary={input:{kind:'variables',name:'Params',label:'Параметры',definitions:[{name:'Page',type:'integer',value:99},{name:'Limit',type:'integer',value:2}]},output:boundary.output};
const ref={document_id:'doc',workflow_id:'wf',node_id:'node'};
const request={operation_id:'new',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},
 target:{kind:'new',type:'control.supernode'},inputs:[],mode:'tabular_boundary',parameters:{boundary},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:60000,execute_ms:60000,total_ms:180000}};

test('Supernode boundary crosses the complete public apply schema and installed handler',()=>{
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema;
 const {nodeApplyHandlers}=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.doesNotThrow(()=>validateActionParameters(schema,request));
 assert.doesNotThrow(()=>validateNodeApplyRequest(request,nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,target:{kind:'new',type:'transform.calculator'},mode:'expression'},nodeApplyHandlers));
});

test('integer variable boundary passes the public schema and production preflight',()=>{
 const r={...request,mode:'variable_boundary',parameters:{boundary:variableBoundary}};
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.doesNotThrow(()=>validateActionParameters(nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema,r));
 assert.doesNotThrow(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));
 for(const value of [null,1.5,'99',true])assert.throws(()=>validateSupernodeParameters({boundary:{...variableBoundary,input:{...variableBoundary.input,definitions:[{name:'Page',type:'integer',value}]}}},r.mode,r));
 for(const input of [{...variableBoundary.input,requirement:'required'},{...variableBoundary.input,definitions:[]},{...variableBoundary.input,definitions:[{name:'Page',type:'real',value:99}]},{...variableBoundary.input,definitions:[{name:'Page',type:'integer',value:99},{name:'page',type:'integer',value:2}]}])
  assert.throws(()=>validateSupernodeParameters({boundary:{...variableBoundary,input}},r.mode,r));
 assert.throws(()=>validateSupernodeParameters({boundary},r.mode,r));
 assert.throws(()=>validateSupernodeParameters({boundary:variableBoundary},'tabular_boundary',r));
 assert.throws(()=>validateSupernodeParameters(r.parameters,r.mode,{...r,inputs:[{source:ref,input:0,output:0}]}));
});

test('native output boundary passes executor admission without enabling execution, reads or replay',async()=>{
 const config={targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'},support=createCandidateNodeSupport(config);
 const r={...structuredClone(request),target:{kind:'existing',type:'control.supernode_output',ref},parameters:{}};
 assert.doesNotThrow(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers));
 let probes=0,browserCalls=0;
 const runtime=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,
  ...support,execute:async()=>{browserCalls++;throw Error('Unexpected browser effect');},
  nodeTargetAdapterFactory:()=>({observe:async()=>{probes++;throw Error('native-boundary-probe');}}),onRecord:async e=>e});
 const result=await runtime.runNodeApply(r);
 assert.ok(probes>0,JSON.stringify(result));
 assert.match(result.error.message,/native-boundary-probe/);
 const drivers=support.nodeApplyDriverFactory({operation:{id:r.operation_id,parameters:r}});
 await assert.rejects(()=>drivers.waitExecution(),/output boundary.*Execute/);
 await assert.rejects(()=>drivers.readOutput(),/output boundary.*read/);
 assert.equal(await drivers.verifyContinuation({}),false);
 assert.equal(browserCalls,0);
});

test('supernode handler is registered with the approved table boundary mode',()=>{
 const {nodeApplyHandlers}=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.ok(nodeApplyHandlers.has('control.supernode'));
 assert.equal(NODE_TYPES['control.supernode'].palette_group,'Управление');
 assert.doesNotThrow(()=>validateNodeApplyRequest(request,nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,mode:'compose'},nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,parameters:{boundary:{...boundary,input:{...boundary.input,name:'9bad'}}}},nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,inputs:[{source:{...ref,workflow_id:'foreign'},input:0,output:0}]},nodeApplyHandlers),/another workflow/);
});

test('supernode preflight rejects unsupported boundaries before browser work',()=>{
 assert.doesNotThrow(()=>validateSupernodeParameters({boundary},'tabular_boundary',request));
 assert.throws(()=>validateSupernodeParameters({},'tabular_boundary',request),/boundary/);
 for(const input of [{...boundary.input,name:'9bad'},{...boundary.input,requirement:'optional'},{...boundary.input,kind:'variables'}])
  assert.throws(()=>validateSupernodeParameters({boundary:{...boundary,input}},'tabular_boundary',request));
 const existing={...request,target:{kind:'existing',type:'control.supernode',ref}};
 assert.doesNotThrow(()=>validateSupernodeParameters({},'tabular_boundary',existing));
 assert.throws(()=>validateSupernodeParameters({boundary},'compose',request));
});

// Native GenericSocketModel shape observed in LAB-1615, journal:587:
// empty groups insert non-data placeholder models into the local Store.
function portGrid(data){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;GenericModelComponentWizard',tid=base+';grdModelPorts';
 const root={checkVisibility:()=>true,contains:e=>e===grid},grid={id:'ports',contains:e=>rows.includes(e)};
 const records=data.map((d,i)=>({internalId:String(i+1),isModel:true,...(d.Name===null?{isNonData:true,isFakeInStore:true,isCollapsedPlaceholder:true}:{}),data:d}));
 const rows=records.map(r=>({record:r,querySelectorAll:selector=>selector==='.x-grid-checkcolumn'?[{classList:{contains:()=>r.data.Optional===true}}]:
  ['colName','colDisplayName','colType'].map((key,i)=>({getAttribute:()=>base+';'+key+'_'+r.internalId,textContent:[r.data.Name===''?'<Уникальное>':r.data.Name??'',r.data.DisplayName,r.data.Caption??''][i]}))}));
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length};
 const component={el:{dom:grid},getStore:()=>store,getView:()=>({getNode:r=>rows[records.indexOf(r)],getRecord:row=>row.record})};
 const context={document:{querySelectorAll:selector=>selector==='[data-tid='+JSON.stringify(base)+']'?[root]:selector==='[data-tid='+JSON.stringify(tid)+']'?[grid]:[]},Ext:{getCmp:()=>component}};
 return vm.runInNewContext('('+readSupernodeBrowser.toString()+')('+JSON.stringify(prefix)+')',context);
}
const emptyGroup=SocketType=>({Name:null,DisplayName:'',SocketType,Optional:false});
test('native empty group placeholders do not become two existing ports',()=>{
 const result=portGrid([emptyGroup(0),emptyGroup(1)]);
 assert.equal(result.verified,true);assert.equal(result.ports.length,0);
});
test('native SocketType and VendorGUID bind a real table port independently of empty groups',()=>{
 const result=portGrid([{Name:'Input',DisplayName:'Исходные данные',SocketType:0,Optional:false,Caption:'Таблица',VendorGUID:'05969d66-64f2-4d9f-b714-a2c9821461db'},emptyGroup(1)]);
 assert.equal(result.verified,true);assert.equal(result.ports.length,1);
 assert.equal(result.ports[0].direction,'input');assert.equal(result.ports[0].kind,'table');
 assert.equal(result.ports[0].name,'Input');assert.equal(result.ports[0].optional,false);
});
test('a newly added automatic name is read as empty until the owned editor assigns it',()=>{
 const result=portGrid([{Name:'',DisplayName:'Таблица 1',SocketType:0,Optional:false,Caption:'Таблица',VendorGUID:'05969d66-64f2-4d9f-b714-a2c9821461db'},emptyGroup(1)]);
 assert.equal(result.verified,true);assert.equal(result.ports[0].name,'');
});
test('unknown placeholders and additional native sockets refuse instead of hiding ports',()=>{
 assert.equal(portGrid([{...emptyGroup(0),VendorGUID:'foreign'},emptyGroup(1)]).verified,false);
 const input={Name:'Input',DisplayName:'Input',SocketType:0,Optional:false,Caption:'Таблица',VendorGUID:'05969d66-64f2-4d9f-b714-a2c9821461db'};
 assert.equal(portGrid([input,{...input,Name:'Input2',DisplayName:'Input2'}]).verified,false);
});

test('observed ordinary variable socket is additive; output variables stay refused',()=>{
 const variable={Name:'Params',DisplayName:'Параметры',SocketType:0,Optional:true,Caption:'Переменные',VendorGUID:'ba746e45-732e-4115-b420-f8f645b94c8d'};
 assert.equal(portGrid([variable,emptyGroup(1)]).ports[0].kind,'variables');
 assert.equal(portGrid([{...variable,SocketType:1}]).verified,false);
 assert.equal(portGrid([variable,{...variable,Name:'More'}]).verified,false);
});

test('saved variable inventory accepts only complete source collections and exact socket ownership',()=>{
 const r={phase:'verified',operation_id:'read:port',document_id:'doc',workflow_id:'wf',node_id:'node',portGuid:'port',portIndex:0,nativeIndex:0};
 const root={},el={},socket={},nodeData={},portData={};r.node={FIconCls:'bg-vendor-icon-modelgeneric',FGuid:'node',data:nodeData};r.nodeData=nodeData;
 r.port={FGuid:'port',data:portData,parent:r.node,FType:0,FSubType:3};r.portData=portData;r.enginePort=socket;
 r.wizard={FModelSocket:socket,FView:{el:{dom:root}}};
 const records=[{isModel:true,data:{ID:0,Index:0,Name:'Page',DisplayName:'Page',DataType:4,OriginType:1,ConnectedRecord:null,ValueIsNull:false,DisplayValue:99,IsDerived:false,Broken:false}}];
 const source={items:[...records]},store={getData:()=>({items:records,getSource:()=>source}),getCount:()=>records.length,isLoading:()=>false};
 const grid={el:{dom:el},getStore:()=>store};root.contains=e=>e===el;
 const task={binding:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'},node:{node_id:'node'}},origin:'https://app.loginom.ai',build:'7.4.2',operation_id:'read'};
 const context={task,document:{querySelectorAll:s=>s.includes('grdTargetColumns')?[el]:[root]},location:{origin:task.origin},
  bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:r.wizard}})}}}}}}},
  __loginomDockPreparationV1:{id:'doc',inputPortOpenReceipts:new Map([['read:port',r]])},Ext:{getCmp:()=>grid}};
 context.__loginomDockPreparationV1.document=context.document;
 const read=()=>vm.runInNewContext('('+readSupernodeVariablesBrowser.toString()+')(task)',context);
 assert.equal(read().definitions[0].value,99);
 source.items.push({});assert.throws(read,/complete unfiltered/);source.items.pop();
 records[0].data.DataType=5;records[0].data.DisplayValue='';assert.throws(read,/integer/);
 task.draft={index:0};assert.equal(read().definitions[0].type,'string');
 task.draft.id=999;assert.throws(read,/draft identity/);delete task.draft;
 records[0].data.DataType=4;records[0].data.DisplayValue=99;
 records[0].data.ValueIsNull=true;assert.throws(read,/non-NULL integer/);records[0].data.ValueIsNull=false;
 r.port.FGuid='foreign';assert.throws(read,/owned input/);
});
