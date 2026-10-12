// Page/Ext/native UI objects below are explicit doubles; resource functions real.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
const resource=await import(process.env.IMPORT_RESOURCE_MODULE??'../src/acceptance/import-before-configure-v1.mjs');
function fixture(){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};class ModelForm{};class WizardModelComponentForm{};
 const doc={},tab={classList:{contains:c=>c==='x-tab-active'}};
 const pack=new PackageTreeNode();Object.assign(pack,{PackageFileName:'/own/left.lgp',HasRunningNodes:()=>false});
 const workflow=new WorkFlowTreeNode();workflow.ParentNode=pack;
 const node=new ModelNodeTreeNode();Object.assign(node,{FGuid:'e78dbebd-942a-4ef4-ac45-654eec157c31',FModelNode:{},ParentNode:workflow});
 const entries=new Map(),root={contains:e=>[...entries.values()].flat().includes(e),querySelectorAll:s=>[...entries.entries()].filter(([t])=>s.startsWith('[data-tid^=')&&t.startsWith(JSON.parse(s.slice(11,-1)))).flatMap(([,v])=>v)};
 const model=new WizardModelComponentForm();model.FModelNode=node.FModelNode;model.getEl=()=>({dom:root});
 const card={Controller:{Node:{data:{node}},FController:model}},connection={Connected:true,UserName:'own',Session:{}};
 const map={FServerConnection:connection,HasRunningNodes:()=>false},main={FMapTree:map,Items:{Workspace:{getActiveTab:()=>card}}};
 const prefix='MF;TF-1;WizrdMCF;';entries.set('tab-1',[tab]);entries.set('MF;TF-1;WizrdMCF',[root]);
 const fields={'ImportTextFilePreviewWizard;edtFileName;ValueControl':'/own/old.csv','ImportTextFilePreviewWizard;edtConnection':'','ImportTextFilePreviewWizard;edtCodePage;ValueControl':'UTF-8','ImportTextFilePreviewWizard;edtRowsToSkip;ValueControl':'0','ImportTextFileParamsWizard;edtDelimiterChar;ValueControl':';','ImportTextFileParamsWizard;edtTextQualifier;ValueControl':'"','ImportTextFileParamsWizard;edtValueNull;ValueControl':'NULL','ImportTextFileParamsWizard;edtDecimalSeparator;ValueControl':'.'};
 for(const [tid,value] of Object.entries(fields))entries.set(prefix+tid,[{querySelectorAll:()=>[{value}]}]);
 entries.set(prefix+'ImportTextFilePreviewWizard;edtFirstLineAsTitle;ValueControl',[{classList:{contains:()=>true}}]);
 const grid={id:'columns'},records=['LKey','Part','LValue'].map((name,i)=>({isModel:true,internalId:'r'+i,data:{Index:i,Name:name,DisplayName:name,DataType:i===1?1:3,DataKind:2}}));
 entries.set(prefix+'ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;tbl',[grid]);
 const store={isLoading:()=>false,getData:()=>({items:records}),getCount:()=>records.length,getTotalCount:()=>records.length};
 const view={el:{dom:grid},getStore:()=>store};
 doc.querySelectorAll=s=>entries.get(JSON.parse(s.slice(10,-1)))??[];
 const receipt={phase:'verified',request:JSON.stringify({session:'dock-session'}),tab,packageNode:pack,workflowId:'workflow',nodeTargetWorkflowNode:workflow};
 const prep={document:doc,id:'document',receipts:new Map([['prepare',receipt]])};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:main}},PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm};
 const identity={session_id:'dock-session',document_id:'document',account:'own',package_path:'/own/left.lgp',tab_tid:'tab-1',loginom_build:'7.4.2'};
 // Real tab syntax is necessary for the fixed native prefix.
 identity.tab_tid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-1';entries.set(identity.tab_tid,[tab]);
 const env={Map,document:doc,bg:{app},__loginomDockPreparationV1:prep,Ext:{getCmp:()=>view},o:identity};
 return {env,identity,prep,receipt,pack,workflow,node,map,connection,card,model,root,entries,records,store,grid,app};
}
const read=f=>JSON.parse(JSON.stringify(runInNewContext('('+resource.readImportSurface.toString()+')(o)',f.env)));
test('native ordered settings/codes read without configuring; unknown freshness remains partial',()=>{
 const f=fixture(),r=read(f);assert.equal(r.status,'PARTIAL');assert.equal(r.node.node_id,f.node.FGuid);
 assert.equal(r.source.source_path.value,'/own/old.csv');assert.equal(r.source.first_line_as_title.value,true);
 assert.equal(r.format.delimiter.value,';');assert.equal(r.format.null_marker.value,'NULL');
 assert.deepEqual(r.columns.fields.map(x=>[x.index,x.name,x.type,x.data_kind]),[[0,'LKey',3,2],[1,'Part',1,2],[2,'LValue',3,2]]);
 assert.equal(r.columns.canonical_types_verified,false);assert.equal(r.freshness.execution_verified,false);assert.equal(r.complete,false);assert.equal(r.close_authority,false);assert.equal(r.settings_applied,false);
});
for(const [name,change] of [
 ['foreign-document',f=>f.prep.id='foreign'],['foreign-session',f=>f.identity.session_id='other'],
 ['foreign-account',f=>f.connection.UserName='other'],['foreign-package',f=>f.pack.PackageFileName='/other/file.lgp'],
 ['foreign-workflow',f=>f.receipt.nodeTargetWorkflowNode={}],['foreign-guid',f=>f.node.FGuid='unknown'],
 ['global-running',f=>f.map.HasRunningNodes=()=>true],['package-running',f=>f.pack.HasRunningNodes=()=>true],
 ['unknown-running',f=>f.map.HasRunningNodes=()=>null],['foreign-model',f=>f.model.FModelNode={}],
 ['duplicate-tab',f=>f.entries.get(f.identity.tab_tid).push(f.entries.get(f.identity.tab_tid)[0])],
 ['duplicate-root',f=>f.entries.get('MF;TF-1;WizrdMCF').push(f.root)],
 ['identity-during-read',f=>Object.defineProperty(f.records[0].data,'Name',{get(){f.connection.UserName='changed';return 'LKey';}})],
])test(name+': refuse without observations as authority',()=>{const f=fixture();change(f);const r=read(f);assert.equal(r.status,'REFUSED');assert.equal(r.complete,false);assert.equal(r.close_authority,false);assert.equal(r.node,null);});
for(const [name,change] of [
 ['field-order',f=>f.records.reverse()],['duplicate-names',f=>f.records[1].data.Name='LKey'],
 ['missing-type',f=>delete f.records[1].data.DataType],['missing-kind',f=>delete f.records[1].data.DataKind],['foreign-record',f=>f.records[1].isModel=false],['partial-store',f=>f.store.getTotalCount=()=>4],
 ['source-cache-membership',f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:f.records.map(r=>({...r}))})})],['missing-record-id',f=>delete f.records[0].internalId],['loading',f=>f.store.isLoading=()=>true],['missing-source',f=>f.entries.delete('MF;TF-1;WizrdMCF;ImportTextFilePreviewWizard;edtFileName;ValueControl')],
])test(name+': partial, never inferred from pins',()=>{const f=fixture();change(f);const r=read(f);assert.equal(r.status,'PARTIAL');assert.equal(r.complete,false);assert.equal(r.close_authority,false);if(name!=='missing-source')assert.equal(r.columns.status,'unknown');});
function context(f){return {binding:{revision:1,harness:'import-before-configure-v1',owner:'host',run:'run',lease:'host:run',chat:'chat',account:'own',session:'dock-session',admission:'admission',generation:1,expires:Date.now()+10000,packagePath:'/own/left.lgp'},identity:f.identity,browser:{callTool:async request=>{
 const page={evaluate:(fn,o)=>{f.env.o=o;return runInNewContext('('+fn.toString()+')(o)',f.env);}};
 const value=await runInNewContext('('+request.arguments.code+')',{page})(page);
 return {content:[{type:'text',text:JSON.stringify(value)}]};}},record:async()=>{}};}
test('closed capture ABI executes actual serialized function and awaits record',async()=>{const f=fixture(),c=context(f);let recorded=false;c.record=async e=>{assert.equal(e.result.complete,false);recorded=true;};const r=await resource.captureImport(c);assert.equal(recorded,true);assert.equal(r.status,'PARTIAL');});
for(const [name,change] of [
 ['forged-close-authority',c=>{const old=c.browser.callTool;c.browser.callTool=async q=>{const r=await old(q),v=JSON.parse(r.content[0].text);v.close_authority=true;r.content[0].text=JSON.stringify(v);return r;};}],['wrong-lease',c=>c.binding.lease='foreign'],['expired',c=>c.binding.expires=Date.now()-1],
 ['persistence',c=>c.record=async()=>{throw Error('fixture fsync refusal');}],
 ['deadline-after-read',c=>{const old=c.browser.callTool;c.browser.callTool=async r=>{const v=await old(r);c.binding.expires=Date.now()-1;return v;};}],
 ['identity-after-record',c=>c.record=async()=>{c.identity.document_id='changed';}],
])test(name+': capture rejects without mint/cleanup/replay',async()=>{const c=context(fixture());change(c);await assert.rejects(()=>resource.captureImport(c));});
function graphFixture(){
 const f=fixture(),model=new f.app.ModelForm(),collection=[];
 const root={contains:e=>[...f.entries.values()].flat().includes(e)};
 f.entries.set('MF;TF-1;ModelForm;cmpDiagram',[root]);
 for(const [guid,label] of [['e78dbebd-942a-4ef4-ac45-654eec157c31','Операции'],['6774e6c2-a207-4293-b7ea-8db76e168f98','Детали']]){
  const tid='MF;TF-1;Graph;'+label,body={getAttribute:()=>tid},portDOM={getAttribute:()=>tid+';Output_Data-0'};
  const cell={dom:body},n={FGuid:guid,FIconCls:'bg-vendor-icon-importtextfile',FCell:cell};
  const port={parent:n,FGuid:'port-'+guid,data:{},FCell:{parent:cell,dom:portDOM}};
  n.FPorts=[{FCollection:[port]}];collection.push(n);f.entries.set(tid,[body]);f.entries.set(tid+';Output_Data-0',[portDOM]);
 }
 model.FDiagram={FNodes:{FCollection:collection},FmxGraph:{container:root,view:{getState:cell=>({shape:{node:cell.dom}})}}};
 f.card.Controller.FController=model;return {...f,collection};
}
test('graph binds both fixed GUIDs and output0 without using labels as authority',()=>{
 const f=graphFixture(),r=read(f);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'GRAPH_IDENTITY_ONLY');
 assert.deepEqual(r.imports.map(n=>[n.role,n.output0.status,n.output0.port]),[['operations','observed_native_binding',0],['details','observed_native_binding',0]]);
 assert.equal(r.complete,false);assert.equal(r.imports[0].freshness.execution_verified,false);
});
for(const [name,change,status] of [
 ['foreign-component',f=>f.collection[1].FIconCls='calculator','REFUSED'],
 ['missing-guid',f=>f.collection[0].FGuid='other','REFUSED'],
 ['duplicate-guid',f=>f.collection.push(f.collection[0]),'REFUSED'],
 ['foreign-port-owner',f=>f.collection[0].FPorts[0].FCollection[0].parent={},'PARTIAL'],
])test('graph '+name,()=>{const f=graphFixture();change(f);const r=read(f);assert.equal(r.status,status);assert.equal(r.complete,false);if(status==='PARTIAL')assert.equal(r.imports[0].output0.status,'unknown');});

// P2 controls use the real capture -> serialized page reader -> awaited record path.
for(const [name,change] of [
 ['current-tree-node',f=>{f.card.Controller.Node.data.node=Object.assign(Object.create(Object.getPrototypeOf(f.node)),f.node,{FModelNode:{}});}],
 ['tree-record',f=>{f.card.Controller.Node={data:{node:f.node}};}],
 ['tree-data',f=>{f.card.Controller.Node.data={node:f.node};}],
 ['controller',f=>{f.card.Controller={...f.card.Controller};}],
 ['workflow-parent',f=>{f.workflow.ParentNode={};}],
 ['native-model-pair',f=>{const other={};f.model.FModelNode=other;f.node.FModelNode=other;}],
 ['wizard-root',f=>{f.model.getEl=()=>({dom:{}});}]
])test('capture wizard late '+name+' refuses stale claims',async()=>{
 const f=fixture();Object.defineProperty(f.records[0].data,'Name',{get(){change(f);return 'LKey';}});
 const c=context(f),events=[];c.record=async e=>events.push(e);
 const r=await resource.captureImport(c);assert.equal(r.status,'REFUSED');assert.equal(r.node,null);
 assert.equal(r.columns.status,'unknown');assert.equal(r.complete,false);assert.equal(r.close_authority,false);
 assert.equal(events.length,1);assert.equal(events[0].result.status,'REFUSED');
});
for(const [name,change] of [
 ['port-owner',(f,p)=>p.parent={}],['port-cell-owner',(f,p)=>p.FCell.parent={}],
 ['port-cell',(f,p)=>p.FCell={...p.FCell}],['port-guid',(f,p)=>p.FGuid='foreign'],
 ['port-collection',(f,p)=>f.collection[0].FPorts[0].FCollection=[]],
 ['port-group',(f,p)=>f.collection[0].FPorts[0]={FCollection:[p]}],
 ['node-cell',(f,p)=>f.collection[0].FCell={}],['node-guid',(f,p)=>f.collection[0].FGuid='foreign'],
 ['node-pair',(f,p)=>f.collection.splice(0,1)],
 ['port-dom',(f,p)=>p.FCell.dom={getAttribute:()=>''}],
 ['graph-container',(f,p)=>f.card.Controller.FController.FDiagram.FmxGraph.container={}],
 ['current-tree-node',(f,p)=>f.card.Controller.Node.data.node={}]
])test('capture graph late '+name+' refuses stale output binding',async()=>{
 const f=graphFixture(),p=f.collection[0].FPorts[0].FCollection[0],data=p.data;
 Object.defineProperty(p,'data',{get(){change(f,p);return data;}});
 const c=context(f),events=[];c.record=async e=>events.push(e);
 const r=await resource.captureImport(c);assert.equal(r.status,'REFUSED');assert.equal(r.imports,undefined);
 assert.equal(r.output0.status,'unknown');assert.equal(r.complete,false);assert.equal(r.close_authority,false);
 assert.equal(events.length,1);assert.equal(events[0].result.status,'REFUSED');
});
for(const [name,create] of [['wizard',fixture],['graph',graphFixture]])test('capture unchanged '+name+' records partial native claims',async()=>{
 const f=create(),c=context(f),events=[];c.record=async e=>events.push(e);
 const r=await resource.captureImport(c);assert.equal(r.status,'PARTIAL');assert.equal(events.length,1);
 if(name==='wizard')assert.equal(r.node.native_owner_verified,true);
 else assert.equal(r.imports[0].output0.status,'observed_native_binding');
 assert.equal(r.complete,false);assert.equal(r.close_authority,false);assert.equal(r.effect_possible,false);
});

// Whole eligibility inventory: non-candidates can become output0 during re-read.
for(const position of ['before','after'])for(const trigger of ['candidate','non-candidate'])for(const change of ['alias','parent','cell-parent','data','guid'])
 test('capture full inventory '+position+' '+trigger+' late '+change,async()=>{
 const f=graphFixture(),n=f.collection[0],port=n.FPorts[0].FCollection[0];
 const tid='MF;TF-1;Graph;Операции;Output_Data-0';let alias=change==='alias'?tid.replace(/0$/,'1'):tid;
 const dom={getAttribute:()=>alias},other={parent:change==='parent'?{}:n,FGuid:change==='guid'?'':'extra',data:change==='data'?null:{},FCell:{parent:change==='cell-parent'?{}:n.FCell,dom}};
 const ports=n.FPorts[0].FCollection;if(position==='before')ports.unshift(other);else ports.push(other);
 f.entries.set('extra-native-port',[dom]);
 const target=trigger==='candidate'?port:other,retained=target.data;let reads=0;
 Object.defineProperty(target,'data',{get(){
  if(++reads===2){if(change==='alias')alias=tid;if(change==='parent')other.parent=n;if(change==='cell-parent')other.FCell.parent=n.FCell;if(change==='guid')other.FGuid='extra';}
  return change==='data'&&target===other&&reads>=2?{}:retained;
 }});
 // A candidate getter can repair the other port's data without replacing itself.
 if(change==='data'&&trigger==='candidate')Object.defineProperty(other,'data',{get(){return reads>=2?{}:null;}});
 const c=context(f),events=[];c.record=async e=>events.push(e);
 const r=await resource.captureImport(c);assert.equal(r.status,'REFUSED');assert.equal(r.imports,undefined);
 assert.equal(r.output0.status,'unknown');assert.equal(r.complete,false);assert.equal(r.close_authority,false);
 assert.equal(r.effect_possible,false);assert.equal(events.length,1);assert.equal(events[0].result.status,'REFUSED');
});
for(const duplicate of [false,true])test('capture full inventory static '+(duplicate?'duplicate':'extra')+' port',async()=>{
 const f=graphFixture(),n=f.collection[0],tid='MF;TF-1;Graph;Операции;Output_Data-'+(duplicate?'0':'1');
 const dom={getAttribute:()=>tid},other={parent:n,FGuid:'extra',data:{},FCell:{parent:n.FCell,dom}};
 n.FPorts[0].FCollection.push(other);f.entries.set('extra-native-port',[dom]);
 const c=context(f),events=[];c.record=async e=>events.push(e);const r=await resource.captureImport(c);
 assert.equal(r.status,'PARTIAL');assert.equal(r.imports[0].output0.status,duplicate?'unknown':'observed_native_binding');
 assert.equal(r.imports[1].output0.status,'observed_native_binding');assert.equal(events.length,1);
 assert.equal(r.complete,false);assert.equal(r.close_authority,false);assert.equal(r.effect_possible,false);
});

for(const mutation of ['append-port','append-group','replace-group','remove-port'])test('capture late inventory membership '+mutation,async()=>{
 const f=graphFixture(),n=f.collection[0],port=n.FPorts[0].FCollection[0],data=port.data;
 const dom={getAttribute:()=> 'MF;TF-1;Graph;Операции;Output_Data-0'},other={parent:n,FGuid:'extra',data:{},FCell:{parent:n.FCell,dom}};
 f.entries.set('extra-native-port',[dom]);let reads=0;
 Object.defineProperty(port,'data',{get(){if(++reads===2){
  if(mutation==='append-port')n.FPorts[0].FCollection.push(other);
  if(mutation==='append-group')n.FPorts.push({FCollection:[other]});
  if(mutation==='replace-group')n.FPorts[0]={FCollection:[port,other]};
  if(mutation==='remove-port')n.FPorts[0].FCollection.pop();
 }return data;}});
 const c=context(f),events=[];c.record=async e=>events.push(e);const r=await resource.captureImport(c);
 assert.equal(r.status,'REFUSED');assert.equal(r.imports,undefined);assert.equal(events.length,1);
 assert.equal(r.complete,false);assert.equal(r.close_authority,false);assert.equal(r.effect_possible,false);
});
