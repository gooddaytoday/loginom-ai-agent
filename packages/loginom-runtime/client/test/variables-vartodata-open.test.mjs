import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {openPreparedWizard} from '../lib/node-wizard-open.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const fixture=()=>{
 const path=[{tid:'flow',label:'Scenario'}],key='В_столбцы:_Количество_(+7)',tid='MF;TF-1;Graph;'+key;
 const opening={node:{node_label:key,part:'settings'},workflow_path:path};
 const current={workflow_ref:{prefix:'MF;TF-1'},prepared_node_context:{verified:true,document_id:'doc',workflow_id:'wf',node_id:'node',surface:'graph',tid},wizard:{status:'absent'},ui:{masks:[],dialogs:[],elements:[
  {ref:'settings',tid:tid+';Setting',allowed_actions:['begin_wizard'],wizard_open:opening},
  {tid:tid+';Label;Label',label:'В столбцы: Количество (+7)',graph_node:{part:'label',node_label:key},signature:{native_graph:{status:'non_script',icon:'bg-vendor-icon-variablestodata'}}}
 ]}};
 const after=structuredClone(current);after.prepared_node_context.surface='wizard';
 after.wizard={status:'observed',stage:'variables_to_table',owner_context:{status:'observed',node:{tid:'flow>Переменные_в_таблицу',label:'Переменные в таблицу'},path:[...structuredClone(path),{tid:'flow>Переменные_в_таблицу',label:'Переменные в таблицу'},{tid:'flow>Переменные_в_таблицу>Настройка',label:'Настройка'}]}};
 return {current,after,opening};
};
const body=workspaceUiCapability.toString(),start=body.indexOf('const intendedWizard=fresh=>{'),end=body.indexOf('const ownedLoading=',start);
assert.ok(start>0&&end>start);
const intended=new Function('current','task','opening','same',body.slice(start,end)+'return intendedWizard;');
for(const fault of [null,'icon','stage','label','node','path'])test('VarToData native breadcrumb alias binds both opening checks: '+fault,async()=>{
 const f=fixture();
 if(fault==='icon')f.current.ui.elements[1].signature.native_graph.icon='bg-vendor-icon-calc';
 if(fault==='stage')f.after.wizard.stage='calculator';
 if(fault==='label')f.after.wizard.owner_context.node.label='Foreign';
 if(fault==='node')f.after.prepared_node_context.node_id='foreign';
 if(fault==='path')f.after.wizard.owner_context.path[0].tid='foreign';
 const check=intended(f.current,{prepared_node_context:{node:{node_id:'node'}},action:{verb:'begin_wizard'}},f.opening,(a,b)=>JSON.stringify(a)===JSON.stringify(b));
 assert.equal(check(f.after),fault===null);
 let opened=false,clicks=0;const channel={observe:async()=>opened?f.after:f.current,perform:async()=>{opened=true;clicks++;}};
 if(fault)await assert.rejects(openPreparedWizard(channel),/owner differs/);
 else assert.equal((await openPreparedWizard(channel)).verified,true);
 assert.equal(clicks,1);
});
test('VarToData read dispatch uses the common read driver while columns keeps its own driver',()=>{
 const source=createCandidateNodeSupport.toString(),context={createRedactor:()=>({redact:v=>v}),nodeOutputForJournal:v=>v,NODE_READ_MODE:'read',isUnchangedTextImportExecution:()=>false,isUnchangedTransformExecution:()=>false,createNodeReadDrivers:()=>({route:'read'})};
 for(const name of new Set(source.match(/create[A-Za-z]+NodeSupport/g)))context[name]=()=>({nodeApplyHandlers:new Map(),nodeApplyDriverFactory:()=>({route:name==='createVariablesToTableNodeSupport'?'columns':'other'})});
 const support=vm.runInNewContext('('+source+')',context)({});
 for(const mode of ['read','columns'])assert.equal(support.nodeApplyDriverFactory({operation:{parameters:{target:{type:'variables.to_table'},mode}}}).route,mode);
});
