import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import evidence from './fixtures/calculator-b073-navigation.json' with {type:'json'};
import {makeWorkspacePrepareCode,prepareWorkspaceSession} from '../lib/workspace.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {createTextImportNodeSupport} from '../lib/text-import-node.mjs';

// OFFLINE ONLY. The navigation inputs are exact receipt 012/020 values.
// SaveCheckpoint persistence, Page/Ext/native instances, workspace UI observer,
// IPC/browser receipts and the settings gesture are doubles. Production prepare,
// prepared reader, import driver, node procedure and openPreparedWizard are real.
// No serialized workspaceUiCapability or browserReceipt body is executed here.
const original=evidence.preparation.workflow_ref.navigation_path;
const opened=evidence.owner.path;
const clone=x=>structuredClone(x);
const plain=x=>JSON.parse(JSON.stringify(x));
const nodeId='32871eef-4ba1-4b93-b57a-99b56d601a8a';

async function fixture({kind='existing',canonical=true,fault=null}={}) {
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};class ModelForm{};class WizardModelComponentForm{};
 const packageNode=Object.assign(new PackageTreeNode(),{PackageFileName:evidence.preparation.package_ref.path}),moduleNode={ParentNode:packageNode};
 const workflowNode=Object.assign(new WorkFlowTreeNode(),{ParentNode:moduleNode}),nodeData={};
 const nodeTree=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflowNode,FGuid:nodeId,FModelNode:nodeData});
 const el=(tid,id='')=>({id,isConnected:true,textContent:'',innerHTML:'',getAttribute:()=>tid,getBoundingClientRect:()=>({width:100,height:20}),classList:{contains:()=>true}});
 const tab=el(evidence.preparation.workflow_ref.tab_tid),graphRoot=el('MF;TF-1;ModelForm;cmpDiagram'),area=el('MF;TF-1;ModelForm;pnlWorkarea'),nodeRoot=el('MF;TF-1;Graph;DiagInput'),wizardRoot=el('MF;TF-1;WizrdMCF');graphRoot.contains=e=>e===nodeRoot;
 const graph=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[{FGuid:nodeId,FCell:{},data:nodeData}]},FmxGraph:{container:graphRoot,view:{getState:()=>({shape:{node:nodeRoot}})}}}});
 const controller={Node:{data:{node:workflowNode}},FController:graph};
 let crumbs=[],surface=[tab,graphRoot,area,nodeRoot],isOpen=false;
 const components=new Map(),events=[],records=[],gestures=[];
 const setCrumbs=path=>{crumbs=path.map((p,i)=>Object.assign(el(p.tid,'crumb-'+i),{textContent:p.label}));components.clear();crumbs.forEach((e,i)=>components.set(e.id,{el:{dom:e},_node:{data:{node:[null,null,packageNode,moduleNode,workflowNode,nodeTree,{}][i]}}}));};setCrumbs(original);
 const document={querySelectorAll(selector){
  if(selector.startsWith('[data-tid^="MF;cntMain;cntWorkspace'))return [tab];
  if(selector.startsWith('[data-tid^='))return crumbs;
  return [...surface,...crumbs].filter(e=>selector==='[data-tid='+JSON.stringify(e.getAttribute())+']');
 }};
 // Boundary input: SaveCheckpoint has persisted the pathname while DOM keys
 // still say Package1. This fixture does not implement or prove native saving.
 const preparation={id:evidence.preparation.document_id,document,sequence:1,receipts:new Map()};
 const app={Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}};
 const context=vm.createContext({document,bg:{app},__loginomDockPreparationV1:preparation,getComputedStyle:()=>({visibility:'visible'}),Ext:{getCmp:id=>components.get(id)},location:{origin:'https://app.loginom.ai',pathname:'/app/'},innerWidth:1000,innerHeight:800,outerWidth:1000,outerHeight:900,screen:{availWidth:1000,availHeight:900}});
 const page={url:()=> 'https://app.loginom.ai/app/?testable=true',evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context),locator:selector=>({isVisible:async()=>selector.includes('btnAvatar'),click:async()=>{throw Error('Unexpected preparation gesture');}})};
 const request={intent:'open_package',packagePath:packageNode.PackageFileName,operation_id:evidence.preparation.operation_id};
 const metadata={skillRevision:'offline-fixture'};
 const prepare=()=>vm.runInNewContext(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:evidence.preparation.target,platform:'linux',sessionId:evidence.preparation.session_id,operationId:request.operation_id,intent:request.intent,packagePath:request.packagePath}))(page);
 const state=plain(await prepareWorkspaceSession({metadata,request,assertAllowed(){},assertTarget(t){assert.equal(t.loginom_build,'7.4.2');},prepare,record:async r=>{events.push(r.event);},save:async()=>{events.push('manifest_saved');}}));
 assert.equal(state.status,'READY');
 assert.deepEqual(state.workflow_ref,evidence.preparation.workflow_ref);
 const binding={document_id:state.document_id,workflow_ref:clone(state.workflow_ref),node:{document_id:state.document_id,workflow_id:state.workflow_ref.workflow_id,node_id:nodeId}};
 const record=preparation.receipts.get(request.operation_id);
 // Production node-target resolution normally installs this object binding.
 // It is explicitly a boundary double here, never established by path/label.
 record.nodeTargetWorkflowNode=workflowNode;
 const requestBefore=record.request,crumbsBefore=plain(record.crumbs),bindingBefore=clone(binding);
 const operation={id:'composition-import',action:{action_key:'node.apply',revision:'1'},deadline:100000,nodeApply:{request:{target:{kind},finish:'done',parameters:{settings:{columns:[{name:'Region'}]}},mappings:[]}}};
 const open=()=>{
  isOpen=true;controller.Node.data.node={ParentNode:nodeTree};controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:nodeData});surface=[tab,wizardRoot];
  setCrumbs(canonical?opened:[...original,...opened.slice(-2)]);
  if(fault==='lost-authority')components.get('crumb-2')._node.data.node={};
  if(fault==='foreign-model')controller.FController.FModelNode={};
 };
 const observe=async()=>{
  const n=plain(await readPreparedNodeContext(page,binding));
  const owner=clone(evidence.owner);if(!canonical)owner.path=[...clone(original),...owner.path.slice(-2)];
  const ui={masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:isOpen?[]:[
   {ref:'ui-graph',tid:graphRoot.getAttribute()},
   {ref:'ui-body',tid:nodeRoot.getAttribute(),allowed_actions:['click'],graph_node:{part:'body'}},
   {ref:'ui-settings',tid:nodeRoot.getAttribute()+';Setting',allowed_actions:['open_wizard','begin_wizard'],wizard_open:{node:{node_label:'DiagInput'},workflow_path:clone(original)}},
   {tid:nodeRoot.getAttribute()+';Label;Label',label:'DiagInput',graph_node:{part:'label'}}]};
  return {origin:'https://app.loginom.ai',loginom_build:'7.4.2',workflow_ref:{tab_tid:binding.workflow_ref.tab_tid,prefix:'MF;TF-1'},dom_epoch:{document:'observer-epoch',revision:isOpen?2:1},scan:{complete:true},prepared_node_context:n,ui,
   wizard:isOpen?{status:'observed',root_ref:'ui-wizard',root_tid:wizardRoot.getAttribute(),stage:'text_import_file',owner_context:owner,import_source:clone(evidence.import_source)}:{status:'absent'}};
 };
 let activeStep;
 const primary=Error('primary IPC failure after gesture');
 const execute=async code=>{
  // Detect the real production receipt envelope; do not treat its serialized
  // capability body as executed. onRecord supplies its exact step/id/action.
  if(code.includes('function browserReceipt(')){
   assert.ok(activeStep);assert.equal(activeStep.action.verb==='click'||['open_wizard','begin_wizard'].includes(activeStep.action.verb),true);
   gestures.push(clone(activeStep.action));
   if(activeStep.action.verb!=='click'){
    open();if(fault==='primary-error')throw primary;
    if(fault==='lost-request')record.request=JSON.stringify({intent:'new_draft'});
   }
   return {status:fault==='ambiguous'&&isOpen?'AMBIGUOUS':'SUCCEEDED',operation_id:activeStep.internal_operation_id,action_key:'ui.act',effect_possible:true,cleanup_complete:!(fault==='ambiguous'&&isOpen),error:fault==='ambiguous'&&isOpen?{code:'UNCONFIRMED',message:'effect unknown'}:null,output:await observe()};
  }
  return {status:'SUCCEEDED',action_key:'workspace.observe',effect_possible:false,cleanup_complete:true,output:await observe()};
 };
 const support=createTextImportNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation,execute,now:()=>1,onRecord:async r=>{records.push(clone(r));if(r.phase==='node_step_prepared')activeStep=r;return clone(r);},receiptOptions:()=>({}),verifiedUploads:()=>[]});
 const ctx={...binding,deadline:100000};
 const immutable=()=>{assert.equal(record.request,requestBefore);assert.deepEqual(plain(record.crumbs),crumbsBefore);assert.deepEqual(binding,bindingBefore);assert.equal(record.packageNode,packageNode);assert.equal(record.nodeTargetWorkflowNode,workflowNode);};
 return {driver,ctx,operation,gestures,records,events,binding,record,preparation,packageNode,workflowNode,nodeTree,components,page,state,metadata,primary,immutable,open,observe,setCrumbs,missingSurface:()=>{surface=[tab];},foreignPackage:()=>{moduleNode.ParentNode=Object.assign(new PackageTreeNode(),{PackageFileName:packageNode.PackageFileName});}};
}

test('production canonical preparation retains original SaveCheckpoint receipt/request/object binding',async()=>{
 const f=await fixture();assert.equal(f.record.phase,'verified');assert.deepEqual(f.events,['manifest_saved','workspace_prepared','manifest_saved']);
 assert.equal(f.state.effect_possible,false);assert.equal(f.metadata.workspaceReady,true);assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);f.immutable();assert.equal(f.gestures.length,0);
});

test('existing import: fresh reader alias passes both production opening consumers',async()=>{
 const f=await fixture();assert.equal((await f.driver.openWizard(f.ctx)).verified,true);
 assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,true);
 assert.deepEqual(plain(f.record.nodeNavigationPath),opened.slice(0,-2).map(({tid,label})=>({tid,label})));
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','begin_wizard']);
 assert.equal(f.records.filter(r=>r.phase==='node_step_prepared'&&r.action.verb==='begin_wizard').length,1);
 assert.equal(f.operation.nodeEffectPossible,true);f.immutable();
});

test('existing import unchanged-key control passes real openPreparedWizard once',async()=>{
 const f=await fixture({canonical:false});assert.equal((await f.driver.openWizard(f.ctx)).verified,true);
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','begin_wizard']);f.immutable();
});

test('new-target import control passes alias through real driver with explicitly doubled successful UI receipt',async()=>{
 const f=await fixture({kind:'new'});const r=await f.driver.openWizard(f.ctx);assert.equal(r.verified,true);
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','open_wizard']);f.immutable();
 // This control cannot prove the native workspaceUiCapability opening predicate.
});

for(const [name,change] of Object.entries({
 'foreign-package':f=>f.foreignPackage(),
 'foreign-workflow':f=>f.record.nodeTargetWorkflowNode={},
 'foreign-node':f=>f.binding.node.node_id='foreign',
 'stale-document':f=>f.preparation.document={},
 'stale-receipt':f=>f.record.phase='effect_possible',
 'surface-pending':f=>f.missingSurface(),
}))test('production import rejects '+name+' before any dispatch',async()=>{
 const f=await fixture();change(f);await assert.rejects(f.driver.openWizard(f.ctx));assert.deepEqual(f.gestures,[]);
});

for(const fault of ['lost-authority','foreign-model','lost-request'])test('production import refuses '+fault+' after one opening without replay/cancel',async()=>{
 const f=await fixture({fault});await assert.rejects(f.driver.openWizard(f.ctx),/binding is missing or changed/);
 assert.equal((await readPreparedNodeContext(f.page,f.binding)).verified,false);
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','begin_wizard']);if(fault!=='lost-request')f.immutable();
});

test('AMBIGUOUS opening receipt preserves effect/cleanup uncertainty without replay or compensation',async()=>{
 const f=await fixture({fault:'ambiguous'});const e=await f.driver.openWizard(f.ctx).then(()=>assert.fail('must refuse'),e=>e);
 assert.equal(e.receipt.status,'AMBIGUOUS');assert.equal(e.receipt.effect_possible,true);assert.equal(e.receipt.cleanup_complete,false);
 assert.equal(f.operation.cleanupConfirmed,false);assert.equal(f.operation.nodeEffectPossible,true);
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','begin_wizard']);f.immutable();
});

test('primary IPC error after opening survives without cleanup success/replay/cancel',async()=>{
 const f=await fixture({fault:'primary-error'});await assert.rejects(f.driver.openWizard(f.ctx),e=>e===f.primary);
 assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.cleanupConfirmed,false);
 assert.deepEqual(f.gestures.map(x=>x.verb),['click','begin_wizard']);f.immutable();
});

for(const reason of ['pending operation','unknown-effect operation'])test('preparation admission '+reason+' stops before prepare/save/dispatch',async()=>{
 let calls=0;await assert.rejects(prepareWorkspaceSession({metadata:{skillRevision:'offline'},request:{operation_id:'next'},assertAllowed(){throw Error(reason);},prepare(){calls++;},save(){calls++;},record(){calls++;}}),new RegExp(reason));assert.equal(calls,0);
 // Admission callback is a double; this checks production ordering, not host IPC.
});

test('production preparation refuses replacing an unresolved effect-possible preparation ID',async()=>{
 const metadata={skillRevision:'fixture',workspaceReady:false,workspacePreparation:{identity:JSON.stringify({operation_id:'old'}),operation_id:'old',effect_possible:true,state:{status:'NOT_READY'}}};
 const before=clone(metadata);let calls=0;
 await assert.rejects(prepareWorkspaceSession({metadata,request:{operation_id:'new'},assertAllowed(){},prepare(){calls++;},save(){calls++;},record(){calls++;}}),/reconcile the existing request/);
 assert.equal(calls,0);assert.deepEqual(metadata,before);
});
