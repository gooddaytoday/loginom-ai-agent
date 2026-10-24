import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeNodePortOutputCode} from '../lib/node-port-output.mjs';

const portGuid='11111111-1111-1111-1111-111111111111';
const execution={verified:true,cleanup_complete:true,status:'completed',owner_verified:true,execution_id:'doc:root:1',group_id:'1',process_id:'1.1',process_record_id:'child'};
function fixture() {
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const rpcCalls=[],uiCalls=[],disposed=[],elements=new Map();
 const el=tid=>{const e={id:tid,getAttribute:k=>k==='data-tid'?tid:null,classList:{contains:k=>k==='x-tab-active'},getBoundingClientRect:()=>({width:100,height:100}),contains:x=>e===x||e.children?.includes(x)};elements.set(tid,e);return e;};
 const crumb=el('MF;TF-1;cnrNaviMode;b.s_Scenario');crumb.textContent='Scenario';
 const tab=el(binding.workflow_ref.tab_tid),graph=el('MF;TF-1;ModelForm;cmpDiagram'),body=el('MF;TF-1;Graph;Import'),portDom=el(body.id+';Output_Data-0');
 portDom.querySelectorAll=()=>[{getAttribute:k=>k==='href'?'/output_table_active.svg':null}];graph.children=[body,portDom];
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};
 const packageNode=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:packageNode}),session={};
 const proxy=(name,values)=>({...values,dispose:async()=>{disposed.push(name);}});
 const helper={FBaseProxy:null,$FData:null,$FCacheInitialized:false};
 const integerColumn=proxy('integerColumn',{get_Name:async()=> 'I',get_DisplayName:async()=> 'I',get_DataType:async()=>4});
 const realColumn=proxy('realColumn',{get_Name:async()=> 'R',get_DisplayName:async()=> 'R',get_DataType:async()=>3});
 const stringColumn=proxy('stringColumn',{get_Name:async()=> 'S',get_DisplayName:async()=> 'S',get_DataType:async()=>5});
 const columns=proxy('columns',{get_Count:async()=>3,getItem:async i=>[integerColumn,realColumn,stringColumn][i]});
 const dataSource=proxy('dataSource',{$S:session,$:{$OW:0,$O:10,$I:116},$FHelper:helper,get_RowCount:async()=>1,get_Columns:async()=>columns,
  AsVariant:async(row,col)=>{rpcCalls.push([row,col]);helper.$FCacheInitialized=true;helper.$FData??={};return [{constructor:{name:'Int64'},toString:()=> '9007199254740993'},1.2345678901234567,''][col];}});helper.FBaseProxy=dataSource;
 const output=proxy('output',{$S:session,$:{$OW:0,$O:9},QueryInterface:async()=>dataSource});
 const node={FGuid:'node',FCell:{},FStatus:1,FRunning:false,FLocked:false,data:{$S:session}};
 const port={FGuid:portGuid,FCell:{},FStatus:1,FType:1,FSubType:1,FParam:0,FPortIndex:0,parent:node,data:{$S:session,get_Output:async()=>output}};node.FPorts=[{FCollection:[port]}];
 const d={FNodes:{FCollection:[node]},FmxGraph:{container:graph,view:{getState:cell=>({shape:{node:cell===node.FCell?body:portDom}})},getSelectionCells:()=>[node.FCell]}};
 const model=Object.assign(new ModelForm(),{FDiagram:d});
 const child={internalId:'child',data:{id:'1.1',Status:3,ErrorDetails:'',ModelNode:node.data},childNodes:[]};
 const group={internalId:'group',data:{id:'1',Status:3,ErrorDetails:'',loaded:true},childNodes:[child]};
 const root={internalId:'root',data:{loaded:true},childNodes:[group]},store={getRoot:()=>root,isLoading:()=>false};
 const tree=el('ConsoleForm;ProgressForm;trpProgress;treepanel;tree');
 const prep={document:null,id:'doc',receipts:new Map([['prepared',{phase:'verified',workflowId:'flow',tab,packageNode,nodeTargetWorkflowNode:workflow}]])};
 const document={querySelectorAll:q=>{if(q.startsWith('[data-tid^='))return [crumb];const tid=JSON.parse(q.slice(10,-1));return elements.has(tid)?[elements.get(tid)]:[];}};prep.document=document;
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{FController:model,Node:{data:{node:workflow}}}})}}}}}};
 const context=vm.createContext({document,bg:{app,IBGDataSource:{}},location:{origin:'http://example.test'},__loginomDockPreparationV1:prep,Ext:{getCmp:id=>id===tree.id?{getStore:()=>store}:null},TextEncoder,getComputedStyle:()=>({visibility:'visible'}),Date});
 const page={evaluate:async(fn,arg)=>structuredClone(await vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context))};
 return {page,binding,node,port,portDom,integerColumn,dataSource,helper,child,group,root,store,output,disposed,rpcCalls,uiCalls,run:request=>vm.runInNewContext('('+makeNodePortOutputCode(binding,request,{origin:'http://example.test',build:'7.4.2',deadline:Date.now()+10000})+')')(page)};
}

test('reads_bound_port_without_table',async()=>{
 const f=fixture(),result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);
 assert.equal(result.output.freshness_basis,'completed_execution_port_source');
 assert.deepEqual(result.output.sample[0].map(c=>c.value),['9007199254740993',1.2345678901234567,'']);
 assert.deepEqual(f.uiCalls,[]);
 assert.equal(result.cleanup_complete,true);
 assert.deepEqual(f.disposed.sort(),['columns','dataSource','integerColumn','output','realColumn','stringColumn']);
});

test('refuses foreign port ownership without publishing values',async()=>{
 const f=fixture();f.port.parent={...f.node};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);
});

test('refuses inactive output before data RPC',async()=>{
 const f=fixture();f.portDom.querySelectorAll=()=>[{getAttribute:()=>'/output_table_inactive.svg'}];
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);assert.equal(result.cleanup_complete,true);
});

test('refuses an older execution when the node has a newer process group',async()=>{
 const f=fixture();f.root.childNodes.push({internalId:'next',data:{id:'2',Status:3,ErrorDetails:'',loaded:true},childNodes:[{internalId:'next-child',data:{id:'2.1',ModelNode:f.node.data,Status:3,ErrorDetails:''},childNodes:[]}]});
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.deepEqual(f.rpcCalls,[]);
});

test('cache replacement during reading refuses values and disposes all proxies',async()=>{
 const f=fixture(),read=f.dataSource.AsVariant;
 f.dataSource.AsVariant=async(row,column)=>{const raw=await read(row,column);if(column===1)f.helper.$FData={};return raw;};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.reason,'cache_changed');assert.equal(result.output,undefined);
 assert.equal(result.cleanup_complete,true);assert.equal(f.disposed.length,6);
});

test('cache reset during reading refuses values without exposing proxy state',async()=>{
 const f=fixture(),read=f.dataSource.AsVariant;
 f.dataSource.AsVariant=async(row,column)=>{const raw=await read(row,column);if(column===1)f.helper.$FCacheInitialized=false;return raw;};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.reason,'cache_changed');assert.equal(result.output,undefined);
 assert.doesNotMatch(JSON.stringify(result),/\$FData|\$S|\$OW|\$O|cookie|session|9007199254740993/);
});


test('ordinary source column names do not introduce a new sensitive-name refusal',async()=>{
 const f=fixture();f.integerColumn.get_Name=async()=> 'TokenCount';
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(result.output.schema[0].name,'TokenCount');
});

test('shared channel reads the actual serialized native callback and keeps private handles out of its journal',async()=>{
 const {createNodeProcedure}=await import('../lib/node-procedure.mjs'),f=fixture(),records=[],calls=[];
 const operation={id:'shared',deadline:Date.now()+10000,cleanupConfirmed:true,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:f.binding,targetOrigin:'http://example.test',targetBuild:'7.4.2',
  record:async r=>{records.push(r);return structuredClone(r)},execute:async code=>{calls.push(code);return vm.runInNewContext('('+code+')')(f.page);}});
 const result=await channel.readOutputPort({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,true);assert.equal(calls.length,1);assert.equal(operation.cleanupConfirmed,true);
 assert.deepEqual(result.output.sample[0].map(c=>c.value),['9007199254740993',1.2345678901234567,'']);
 assert.doesNotMatch(JSON.stringify(records),/\$FData|\$S|\$OW|\$O|cookie|session|dispose|QueryInterface/);
});

test('an already initialized cache cannot be replaced while metadata is read',async()=>{
 const f=fixture(),read=f.dataSource.get_Columns;f.helper.$FCacheInitialized=true;f.helper.$FData={};
 f.dataSource.get_Columns=async()=>{f.helper.$FData={};return read();};
 const result=await f.run({port:0,execution,sampleRows:1,requireExactNumbers:true});
 assert.equal(result.verified,false);assert.equal(result.output,undefined);assert.equal(result.reason,'cache_changed');
 assert.equal(result.cleanup_complete,true);
});
