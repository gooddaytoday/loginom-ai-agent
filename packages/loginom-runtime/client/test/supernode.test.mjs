import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupernodeParameters} from '../lib/supernode-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import vm from 'node:vm';
import {readSupernodeBrowser} from '../lib/supernode-context.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';

const boundary={input:{kind:'table',name:'Input',label:'Исходные данные',requirement:'required'},output:{kind:'table',name:'Output',label:'Результат'}};
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
