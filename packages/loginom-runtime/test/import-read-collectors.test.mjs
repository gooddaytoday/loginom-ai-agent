// Offline preparation; serialized readers/native doubles, not installed authority.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
import {readFixedImportCandidates,collectRecordLabelPair} from '../../../docs/node-development/nodes/join/receiving/import-read-collectors.mjs';
const text=await readFile(new URL('./import-before-configure.test.mjs',import.meta.url),'utf8');
const fixture=Function('return ('+text.slice(text.indexOf('function fixture(){'),text.indexOf('\nconst read='))+')')();
const graphFixture=Function('fixture','return ('+text.slice(text.indexOf('function graphFixture(){'),text.indexOf("\ntest('graph binds"))+')')(fixture);
const read=f=>JSON.parse(JSON.stringify(runInNewContext('('+readFixedImportCandidates.toString()+')(o)',f.env)));
function graph(){
 const f=graphFixture(),model=f.card.Controller.FController,n=f.collection[0],graph=model.FDiagram.FmxGraph;
 n.data={};graph.getSelectionCells=()=>[n.FCell];
 const button={id:'toggle',getAttribute:()=> 'Выполнить узел',querySelectorAll:s=>s==='.bg-icon-run_current'?[{}]:[]},toggle={el:{dom:button},disabled:false,tooltip:'Выполнить узел'};
 f.entries.set('MF;TF-1;ModelForm;btnToggleActivateCurrent',[button]);
 const left={id:'left'},right={id:'right'},panel={contains:e=>e===left||e===right};
 f.entries.set('ConsoleForm',[panel]);f.entries.set('ConsoleForm;ProgressForm;trpProgress;treepanel;tree',[left]);f.entries.set('ConsoleForm;ProgressForm;trpProgress;grd;tbl',[right]);
 const root={isModel:true,internalId:'root',data:{loaded:true,loading:false},childNodes:[]},record={isModel:true,internalId:'child',parentNode:root,data:{id:'1.1',ModelNode:n.data},childNodes:[]};root.childNodes.push(record);
 const store={$className:'Ext.data.TreeStore',isLoading:()=>false,getRoot:()=>root},views={left:{el:{dom:left},getStore:()=>store},right:{el:{dom:right},getStore:()=>store},toggle};f.env.Ext={getCmp:id=>views[id]};
 return {...f,graph,n,button,toggle,root,record,store,views};
}
test('same-selected-node toggle and cached process owner, freshness unknown',()=>{const r=read(graph());assert.equal(r.activity.status,'observed_toggle');assert.equal(r.activity.activation_verified,false);assert.equal(r.process_owner.status,'observed_cached_model_owner');assert.equal(r.process_owner.execution_verified,false);assert.equal(r.freshness.status,'unknown');assert.equal(r.complete,false);assert.equal(r.close_authority,false)});
for(const [name,change,key]of [
 ['foreign-selection',f=>f.graph.getSelectionCells=()=>[{}],'activity'],['multiple-selection',f=>f.graph.getSelectionCells=()=>[f.n.FCell,{}],'activity'],
 ['foreign-toggle',f=>f.toggle.el.dom={},'activity'],['disabled-toggle',f=>f.toggle.disabled=true,'activity'],['wrong-tip',f=>f.button.getAttribute=()=> 'Done','activity'],['both-icons',f=>f.button.querySelectorAll=()=>[{}],'activity'],
 ['foreign-process-owner',f=>f.record.data.ModelNode={},'process_owner'],['foreign-store',f=>f.views.right.getStore=()=>({}),'process_owner'],['loading',f=>f.store.isLoading=()=>true,'process_owner'],
 ['partial-root',f=>f.root.data.loaded=false,'process_owner'],['duplicate-record',f=>f.root.childNodes.push(f.record),'process_owner'],['wrong-process-parent',f=>f.record.parentNode={},'process_owner'],['cycle',f=>f.record.childNodes.push(f.root),'process_owner'],
])test(name+' unknown',()=>{const f=graph();change(f);const r=read(f);assert.equal(r[key].status,'unknown');assert.equal(r.freshness.execution_verified,false);assert.equal(r.complete,false)});
test('cached completed status never proves fresh execution',()=>{const f=graph();Object.assign(f.record.data,{Status:3,ProgressBarCls:'bg-progress-ptpsCompleted'});assert.equal(read(f).freshness.execution_verified,false)});
function portWizard(){
 const f=fixture();class WizardTreeNode{};class ModelPortTreeNode{};class ModelOutputPortsTreeNode{};Object.assign(f.app,{WizardTreeNode,ModelPortTreeNode,ModelOutputPortsTreeNode});
 const group=new ModelOutputPortsTreeNode();group.ParentNode=f.node;const portTree=new ModelPortTreeNode();Object.assign(portTree,{ParentNode:group,FIndex:0,FModelNodePort:{}});
 const wizard=new WizardTreeNode();wizard.ParentNode=portTree;f.card.Controller.Node.data.node=wizard;
 const n={FGuid:f.node.FGuid,data:f.node.FModelNode},port={parent:n,FGuid:'native-port',data:portTree.FModelNodePort};f.model.FModelNode=null;f.model.FModelEnginePort={};f.model.FView={el:{dom:f.root}};
 const opening={phase:'verified',document_id:'document',wizard:f.model,nodeTree:f.node,node_id:f.node.FGuid,workflow_id:'workflow',workflow:f.workflow,packageNode:f.pack,portTree,direction:'output',portIndex:0,nativeIndex:0,node:n,nodeData:n.data,port,portData:port.data,portGuid:port.FGuid,enginePort:f.model.FModelEnginePort};
 f.prep.outputPortOpenReceipts=new Map([['opening',opening]]);return {...f,opening,portTree,port};
}
test('wizard observes cached opening, never mints authority',()=>{const r=read(portWizard());assert.equal(r.wizard_output0.status,'observed_cached_opening');assert.equal(r.wizard_output0.authority_verified,false);assert.equal(r.complete,false)});
for(const [name,change]of [
 ['missing-opening',f=>f.prep.outputPortOpenReceipts.clear()],['foreign-document',f=>f.opening.document_id='other'],['foreign-workflow',f=>f.opening.workflow={}],['wrong-index',f=>f.portTree.FIndex=1],
 ['foreign-data',f=>f.port.data={}],['foreign-parent',f=>f.port.parent={}],['wrong-direction',f=>f.opening.direction='input'],['duplicate-opening',f=>f.prep.outputPortOpenReceipts.set('duplicate',{...f.opening})],['foreign-engine',f=>f.model.FModelEnginePort={}],['foreign-root',f=>f.model.FView.el.dom={}],
])test('wizard '+name+' unknown',()=>{const f=portWizard();change(f);assert.equal(read(f).wizard_output0.status,'unknown')});
function pair(){
 const data={Index:0,Name:'LKey',DisplayName:'Key',DataType:5,DataKind:2},record={isModel:true,internalId:'record',data},icon={classList:{contains:c=>c==='bg-TBGDataType-dtString'}};
 const cells=['colName_LKey','colDisplayName_LKey','colDataKind_LKey'].map((key,i)=>({getAttribute:()=>';'+key,textContent:['LKey','Key','Дискретный'][i],querySelectorAll:()=>[icon]}));
 const row={getAttribute:k=>({'data-recordindex':'0','data-recordid':'record','data-boundview':'grid'})[k],querySelectorAll:()=>cells},grid={id:'grid',contains:e=>e===row},store={isLoading:()=>false,getAt:()=>record},view={el:{dom:grid},getStore:()=>store};return {data,record,icon,cells,row,grid,store,view};
}
const readPair=f=>JSON.parse(JSON.stringify(runInNewContext('('+collectRecordLabelPair.toString()+')(view,grid,row)',f)));
test('record/label/icon pair, Import enum mapping remains unverified',()=>{const r=readPair(pair());assert.equal(r.status,'observed_candidate_pair');assert.equal(r.icon_type,'string');assert.equal(r.enum_mapping_verified,false)});
for(const [name,change]of [
 ['wrong-record-id',f=>f.record.internalId='foreign'],['foreign-view',f=>f.view.el.dom={}],['foreign-record',f=>f.store.getAt=()=>({...f.record})],['missing-type-code',f=>delete f.data.DataType],['missing-kind-code',f=>delete f.data.DataKind],
 ['wrong-name',f=>f.cells[0].textContent='foreign'],['wrong-label',f=>f.cells[1].textContent='foreign'],['duplicate-icon',f=>f.cells[1].querySelectorAll=()=>[f.icon,f.icon]],['unknown-kind',f=>f.cells[2].textContent='guess'],
])test('enum pair '+name+' unknown',()=>{const f=pair();change(f);assert.equal(readPair(f).status,'unknown')});
for(const [name,change]of [['document',f=>f.prep.id='foreign'],['account',f=>f.connection.UserName='foreign'],['package',f=>f.pack.PackageFileName='/foreign/package.lgp']])
 test('collector whole owner '+name+' refused',()=>{const f=graph();change(f);const r=read(f);assert.equal(r.status,'REFUSED');assert.equal(r.activity.status,'unknown');assert.equal(r.process_owner.status,'unknown')});
test('same node idle without selected native toggle is unknown activity',()=>{const f=graph();f.entries.delete('MF;TF-1;ModelForm;btnToggleActivateCurrent');const r=read(f);assert.equal(r.activity.status,'unknown');assert.equal(r.freshness.execution_verified,false)});
test('transposed Import draft labels do not establish native enum record association',()=>{
 const f=fixture(),base='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;';
 const header={getAttribute:()=>base+'0'};f.entries.set(base+'0',[header]);
 for(const [i,value]of ['LKey','Key','Строковый','Дискретный'].entries())f.entries.set(base+'0_'+i,[{textContent:value}]);
 const original=f.env.document.querySelectorAll;f.env.document.querySelectorAll=s=>s.startsWith('[data-tid^=')?[header]:original(s);
 const r=read(f);assert.equal(r.enum_binding.status,'unknown');assert.equal(r.enum_binding.rendered_draft_fields[0].rendered_type,'string');assert.equal(r.enum_binding.canonical_types_verified,false);
});

for(const field of ['node','port','enginePort'])test('missing native opening '+field+' unknown',()=>{const f=portWizard();f.opening[field]=null;assert.equal(read(f).wizard_output0.status,'unknown')});

test('foreign native component cannot supply Import toggle/owner candidates',()=>{const f=graph();f.n.FIconCls='calculator';const r=read(f);assert.equal(r.activity.status,'unknown');assert.equal(r.process_owner.status,'unknown')});
test('missing native record index cannot coerce to zero',()=>{const f=pair(),old=f.row.getAttribute;f.row.getAttribute=k=>k==='data-recordindex'?null:old(k);assert.equal(readPair(f).status,'unknown')});

for(const [name,change]of [
 ['record-id',f=>{const old=f.row.getAttribute;f.row.getAttribute=k=>k==='data-recordid'?'foreign':old(k)}],
 ['bound-view',f=>{const old=f.row.getAttribute;f.row.getAttribute=k=>k==='data-boundview'?'foreign':old(k)}],
 ['index',f=>{const old=f.row.getAttribute;f.row.getAttribute=k=>k==='data-recordindex'?'1':old(k)}],
 ['record-data',f=>f.record.data={...f.data}],['cell-inventory',f=>f.row.querySelectorAll=()=>[]],['icon',f=>f.icon.classList.contains=()=>false],
])test('late getAt drift '+name+' drops row claim',()=>{
 const f=pair();let reads=0;f.store.getAt=()=>{if(++reads===2)change(f);return f.record};assert.equal(readPair(f).status,'unknown');
});
for(const [name,change]of [
 ['port-data',f=>f.port.data={}],['port-parent',f=>f.port.parent={}],['port-guid',f=>f.port.FGuid='foreign'],
 ['engine',f=>f.model.FModelEnginePort={}],['tree-index',f=>f.portTree.FIndex=1],['opening-data',f=>f.opening.portData={}],
])test('late activeTab drift '+name+' drops wizard claim',()=>{
 const f=portWizard();let reads=0;f.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{if(++reads===2)change(f);return f.card};const r=read(f);assert.equal(r.wizard_output0.status,'unknown');assert.equal(r.complete,false);
});
for(const index of [undefined,0,1,null,false,'0',-1])test('defined native port index must match '+String(index),()=>{
 const f=portWizard();f.port.FPortIndex=index;const r=read(f);assert.equal(r.wizard_output0.status,index===undefined||index===0?'observed_cached_opening':'unknown');
});
for(const [name,change]of [
 ['model-owner',f=>f.record.data.ModelNode={}],['record-data',f=>f.record.data={...f.record.data}],['record-id',f=>f.record.internalId='foreign'],
 ['process-id',f=>f.record.data.id='9.9'],['parent',f=>f.record.parentNode={}],['children',f=>f.record.childNodes.push({})],
 ['diagram',f=>f.card.Controller.FController.FDiagram={}],['activity-tip',f=>f.button.getAttribute=()=> 'foreign'],
])test('late getRoot drift '+name+' drops emitted relation',()=>{
 const f=graph();let reads=0;f.store.getRoot=()=>{if(++reads===2)change(f);return f.root};const r=read(f);
 assert.equal(r[name==='activity-tip'?'activity':'process_owner'].status,'unknown');assert.equal(r.freshness.execution_verified,false);
});

for(const [name,change]of [['native-index',f=>f.data.Index=1],['native-record-id',f=>f.record.internalId='foreign'],['loading',f=>f.store.isLoading=()=>true]])
 test('late final native row '+name+' unknown',()=>{const f=pair();let reads=0;f.store.getAt=()=>{if(++reads===2)change(f);return f.record};assert.equal(readPair(f).status,'unknown')});
for(const [name,change]of [['root-id',f=>f.root.internalId='foreign'],['root-data',f=>f.root.data={loaded:true}],['root-children',f=>f.root.childNodes.push({...f.record})]])
 test('late final native root '+name+' unknown',()=>{const f=graph();let reads=0;f.store.getRoot=()=>{if(++reads===2)change(f);return f.root};assert.equal(read(f).process_owner.status,'unknown')});
for(const [name,change]of [['opening-tree',f=>f.opening.portTree={}],['opening-workflow-id',f=>f.opening.workflow_id='foreign'],['native-node-guid',f=>f.opening.node.FGuid='foreign'],['defined-port-index',f=>f.port.FPortIndex=1],['component-model',f=>f.model.FModelNode={}]])
 test('late final opening '+name+' unknown',()=>{const f=portWizard();let reads=0;f.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{if(++reads===2)change(f);return f.card};assert.equal(read(f).wizard_output0.status,'unknown')});

for(const [name,change]of [['selection',f=>f.graph.getSelectionCells=()=>[{}]],['toggle-native',f=>{const old=f.env.Ext.getCmp;f.env.Ext.getCmp=id=>id==='toggle'?{}:old(id)}]])
 test('late getRoot same-node activity '+name+' unknown',()=>{const f=graph();let reads=0;f.store.getRoot=()=>{if(++reads===2)change(f);return f.root};assert.equal(read(f).activity.status,'unknown')});

for(const kind of ['account','current-tree'])test('final selection provider owner drift '+kind+' refuses all observed claims',()=>{
 const f=graph();let armed=false;let reads=0;
 f.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{if(++reads===2)armed=true;return f.card};
 f.graph.getSelectionCells=()=>{if(armed){if(kind==='account')f.connection.UserName='foreign';else f.card.Controller.Node.data.node={}}return [f.n.FCell]};
 const r=read(f);assert.equal(r.status,'REFUSED');assert.equal(r.activity.status,'unknown');assert.equal(r.process_owner.status,'unknown');assert.equal(r.effect_possible,false);assert.equal(r.close_authority,false);
});
for(const kind of ['store','root'])test('final outer provider replaces current process '+kind+' drops claim',()=>{
 const f=graph();let reads=0;const foreign={};
 f.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{if(++reads===2){if(kind==='store')f.views.right.getStore=()=>foreign;else f.store.getRoot=()=>foreign}return f.card};
 const r=read(f);assert.equal(r.process_owner.status,'unknown');assert.equal(r.activity.status,'observed_toggle');assert.equal(r.freshness.execution_verified,false);assert.equal(r.complete,false);
});

for(const kind of ['activity-tip','process-store'])test('last process root cross-sample drift '+kind+' drops claim',()=>{
 const f=graph();let reads=0,tip='Выполнить узел';f.button.getAttribute=()=>tip;
 f.store.getRoot=()=>{if(++reads===3){if(kind==='activity-tip')tip='foreign';else f.views.right.getStore=()=>({})}return f.root};
 const r=read(f);assert.equal(r[kind==='activity-tip'?'activity':'process_owner'].status,'unknown');assert.equal(r.complete,false);assert.equal(r.effect_possible,false);assert.equal(r.close_authority,false);
});
test('later activity provider replacing process store drops earlier process sample',()=>{
 const f=graph();let armed=false,reads=0;
 f.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{if(++reads===2)armed=true;return f.card};
 f.graph.getSelectionCells=()=>{if(armed)f.views.right.getStore=()=>({});return [f.n.FCell]};
 assert.equal(read(f).process_owner.status,'unknown');
});
