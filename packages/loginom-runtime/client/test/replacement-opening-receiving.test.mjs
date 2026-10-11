import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Page,fixtureClock} from './fixtures/replacement-opening-page-double.mjs';
import evidence from './fixtures/replacement-opening-boundary.json' with {type:'json'};
import {makeWorkspacePrepareCode} from '../lib/workspace.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {withBrowserReceipt} from '../lib/executor.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {openPreparedWizard} from '../lib/node-wizard-open.mjs';

// Complete serialized capability and receipt ledger, with real prepared reader
// and real node-procedure/opener. ONLY Page/DOM/Ext/native graph/tree objects and
// mouse-generated application transitions are doubles; no observer/IPC success
// receipt substitution. SaveCheckpoint persistence is the initial boundary input.
const baseline=process.env.OPENING_BASELINE==='1';
const plain=x=>JSON.parse(JSON.stringify(x));
const original=evidence.preparation.workflow_ref.navigation_path;
const canonicalPath=evidence.owner.path.map(({tid,label})=>({tid,label}));
export async function fixture({canonical=true,deactivation=false,fault,beforeDispatch=false,deferFault=false}={}){
 const clock=fixtureClock(),page=new Page({clock:clock.Date}),records=[],dispatches=[];
 page.evaluate=async(fn,arg)=>{page.context.argument=arg;return vm.runInContext('('+fn.toString()+')(argument)',page.context);};
 page.location.pathname='/app/';page.url=()=> 'https://app.loginom.ai/app/?testable=true';
 page.waitForTimeout=async ms=>clock.advance(ms);
 Object.assign(page.context,{innerWidth:1000,innerHeight:800,outerWidth:1000,outerHeight:900,screen:{availWidth:1000,availHeight:900}});
 const base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel','',{x:0,y:30,width:900,height:25});
 const graph=page.add('div',base+'ModelForm;cmpDiagram','',{x:0,y:80,width:1000,height:650});
 page.add('div',base+'ModelForm;pnlWorkarea','',{x:980,y:720,width:10,height:10});
 const body=page.add('g',base+'Graph;DiagInput','',{x:100,y:150,width:100,height:50},graph);
 page.add('span',base+'Graph;DiagInput;Label;Label','DiagInput',{x:100,y:150,width:60,height:20},body);
 const settings=page.add('g',base+'Graph;DiagInput;Setting','',{x:500,y:300,width:30,height:30},graph);
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelNodeTreeNode{};class ModelForm{};class WizardModelComponentForm{};class WizardTreeNode{};
 const pkg=Object.assign(new PackageTreeNode(),{PackageFileName:evidence.preparation.package_ref.path}),module={ParentNode:pkg};
 const flow=Object.assign(new WorkFlowTreeNode(),{ParentNode:module}),data={};
 const nativeRoot={},nativePackages={ParentNode:nativeRoot};pkg.ParentNode=nativePackages;pkg.PackageName=original[2].label;
 const node=Object.assign(new ModelNodeTreeNode(),{FGuid:'32871eef-4ba1-4b93-b57a-99b56d601a8a',ParentNode:flow,FModelNode:data});
 const wizardTree=Object.assign(new WizardTreeNode(),{ParentNode:node});
 const nativeGraph=Object.assign(new ModelForm(),{FDiagram:{FNodes:{FCollection:[{FGuid:node.FGuid,data,FCell:{}}]},FmxGraph:{container:graph,view:{getState:()=>({shape:{node:body}})}}}});
 const controller={Node:{data:{node:flow}},FController:nativeGraph},components=new Map();
 Object.assign(page.app,{PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,ModelForm,WizardTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:controller})}}}}}});
 page.context.Ext={getCmp:id=>components.get(id)};
 const serverConnection={UserName:'lab-73-monkey-47274bad-b33b-4a2a-bf2d-60b0c951c36e'};page.app.Application.FInstance.FMainForm.FMapTree={FServerConnection:serverConnection};
 const prep={id:evidence.preparation.document_id,document:page.document,sequence:1,receipts:new Map()};page.context.__loginomDockPreparationV1=prep;
 const setPath=path=>{panel.children=[];components.clear();path.forEach((p,i)=>{
  const e=page.add('a',p.tid,p.label,{x:i*110,y:30,width:105,height:20},panel);e.id='crumb-'+i;
  if(i===4)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-workflow';
  if(i===5)page.add('span',null,'',undefined,e).attrs.class='bg-vendor-icon-replacement';
  if(i===6)page.add('span',null,'',undefined,e).attrs.class='maptree-icon-wizard';
  components.set(e.id,{el:{dom:e},_node:{data:{node:[nativeRoot,nativePackages,pkg,module,flow,node,wizardTree][i]}}});
 });};setPath(original);
 // Prepare through the actual serialized production preparation. No path-based
 // substitution for native package/workflow binding is permitted afterwards.
 const locator=page.locator.bind(page);page.locator=(selector,...rest)=>selector.includes('btnAvatar')||selector.includes('edtUsername')?{isVisible:async()=>selector.includes('btnAvatar')}:locator(selector,...rest);
 const prepared=plain(await vm.runInContext('('+makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:evidence.preparation.target,platform:'linux',sessionId:evidence.preparation.session_id,operationId:evidence.preparation.operation_id,intent:'open_package',packagePath:pkg.PackageFileName})+')',page.context)(page));
 assert.equal(prepared.status,'READY');const receipt=prep.receipts.get(evidence.preparation.operation_id);receipt.nodeTargetWorkflowNode=flow;
 const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:node.FGuid}};
 const preserved={request:receipt.request,crumbs:plain(receipt.crumbs),binding:structuredClone(binding)};
 let opened=false,question=false,dialog;
 const path=canonical?canonicalPath:[...original,...canonicalPath.slice(-2).map((p,i)=>({...p,tid:original.at(-1).tid+'>DiagInput'+(i?'>Настройка':'')}))];
 const transition=()=>{
  opened=true;question=false;dialog?.remove();graph.remove();controller.Node.data.node=wizardTree;controller.FController=Object.assign(new WizardModelComponentForm(),{FModelNode:data});
  const wizard=page.add('div',base+'WizrdMCF','',{x:10,y:90,width:900,height:600});page.add('button',base+'WizrdMCF;ReplaceColumnsWizard;grdDataList;tbl','',{x:30,y:120,width:30,height:20},wizard);setPath(path);
 };
 const corrupt=()=>{
  if(fault==='foreign-package')module.ParentNode=Object.assign(new PackageTreeNode(),{PackageFileName:pkg.PackageFileName});
  if(fault==='foreign-workflow')receipt.nodeTargetWorkflowNode={};
  if(fault==='foreign-node'){node.FGuid='foreign';nativeGraph.FDiagram.FNodes.FCollection[0].FGuid='foreign';}
  if(fault==='model')controller.FController.FModelNode={};
  if(fault==='authority')components.get('crumb-2')._node.data.node={};
  if(fault==='request')receipt.request=JSON.stringify({intent:'new_draft'});
  if(fault==='account')serverConnection.UserName='foreign-worker';
  if(fault==='connection')page.app.Application.FInstance.FMainForm.FMapTree.FServerConnection={UserName:serverConnection.UserName};
  if(fault==='peer')prep.receipts.set('peer',{...receipt,nodeTargetWorkflowNode:Object.assign(Object.create(Object.getPrototypeOf(flow)),flow)});
  if(fault==='stale-pair')receipt.nodeNavigationPath=[{tid:'stale',label:'stale'}];
  if(fault==='missing-proof')delete receipt.nodeTargetWorkflowNode;
  if(fault==='unverified-proof')receipt.phase='pending';
  if(fault==='malformed-pair')receipt.nodeNavigationBinding.path=[{}];
  if(fault==='prepared-mismatch')receipt.nodeNavigationBinding.path=canonicalPath.slice(0,5);
  if(fault==='observed-mismatch')receipt.nodeNavigationPath=original;
  if(fault==='falsy')page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>null;
  if(fault==='native-error')page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>{throw Error('native getter double failed');};
  if(fault==='pending')wizardRoot()?.remove();
  if(fault==='epoch')vm.runInContext('delete globalThis[Symbol.for("loginom-dock.workspace-ui.identity.v1")]',page.context);
  if(fault==='origin')page.location.origin='https://foreign.invalid';
  if(fault==='rollback')setPath([...original,...canonicalPath.slice(-2).map((p,i)=>({...p,tid:original.at(-1).tid+'>DiagInput'+(i?'>Настройка':'')}))]);
  if(fault==='second-alias')setPath(path.map((p,i)=>i<2?p:{...p,tid:p.tid.replace('cdiag_b073','other_b073')}));
 };
 const wizardRoot=()=>page.document.querySelectorAll('[data-tid="'+base+'WizrdMCF"]')[0];
 const click=page.mouse.click;page.mouse.click=async(...args)=>{
  const hit=page.document.elementFromPoint(args[0],args[1]);await click(...args);
  if(hit===settings){
   if(deactivation){question=true;setPath(path);dialog=page.add('div',null,'',{x:400,y:180,width:400,height:180});dialog.attrs.class='x-window';
    page.add('h1',null,'Loginom 7.4.2',{x:420,y:185,width:300,height:20},dialog).attrs.role='heading';
    page.add('div',null,'Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел?',{x:420,y:210,width:300,height:45},dialog);
    for(const [i,id,label] of [[0,'yes','Да'],[1,'no','Да, больше не спрашивать'],[2,'cancel','Нет']])page.add('button','msgbox;tlb;'+id,label,{x:420+i*100,y:280,width:90,height:25},dialog);
   }else transition();
   if(fault==='primary-error')throw Error('primary mouse reply lost');
   if(!deactivation&&!beforeDispatch&&!deferFault)corrupt();
  }else if(question&&hit?.getAttribute('data-tid')==='msgbox;tlb;yes'){transition();if(!deferFault)corrupt();}
 };
 const operation={id:'full-opening',action:{action_key:'node.apply',revision:'1'},deadline:100000,checkpoint:{document_id:binding.document_id,workflow_ref:binding.workflow_ref}};
 const primary=Error('primary IPC completion lost');
 const execute=async code=>{
  dispatches.push(code.includes('function browserReceipt(')?'receipt':'read');
  if(beforeDispatch&&code.includes('function browserReceipt(')&&records.at(-1)?.action?.verb===(deactivation?'confirm_wizard_deactivation':'begin_wizard'))corrupt();
  const result=plain(await vm.runInContext('('+code+')',page.context)(page));
  if(fault==='transport-loss'&&result.action_key==='ui.act'&&opened)throw primary;
  if(fault==='unknown-reply'&&result.action_key==='ui.act'&&opened)return { ...result,status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false,error:{code:'UNKNOWN_REPLY',message:'IPC double lost completion'}};
  return result;
 };
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',now:()=>clock.Date.now(),wait:page.waitForTimeout,execute,record:async r=>{records.push(structuredClone(r));return structuredClone(r);},wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{operation_id:r.id,receipt_namespace:'offline',receipt_signature:r.signature})});
 const run=async()=>{const s=await channel.observe({condition:'body ready',ready:s=>s.prepared_node_context?.surface==='graph'});await channel.perform({condition:'one body selection',initialObservation:s,ready:()=>true,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:s.ui.elements.find(e=>e.tid===body.attrs['data-tid']&&e.graph_node?.part==='body').ref})});return openPreparedWizard(channel);};
 return {page,prep,receipt,binding,node,flow,pkg,module,components,controller,nativeGraph,body,graph,setPath,canonicalPath,original,data,channel,operation,records,dispatches,run,corrupt,setPath,primary,opened:()=>opened,immutable(){assert.equal(receipt.request,preserved.request);assert.deepEqual(plain(receipt.crumbs),preserved.crumbs);assert.deepEqual(binding,preserved.binding);assert.equal(receipt.packageNode,pkg);assert.equal(receipt.nodeTargetWorkflowNode,flow);},read:()=>readPreparedNodeContext(page,binding)};
}

for(const canonical of [false,true])for(const deactivation of [false,true])test('full capability/receipt '+(canonical?'canonical':'exact')+(deactivation?' deactivation':' direct'),async()=>{
 const f=await fixture({canonical,deactivation});
 if(baseline&&canonical)await assert.rejects(f.run());else {assert.equal((await f.run()).verified,true);assert.equal((await f.read()).verified,true);}
 const acts=f.records.filter(r=>r.phase==='node_step_prepared').map(r=>r.action.verb);
 assert.deepEqual(acts,baseline&&canonical?['click','begin_wizard']:deactivation?['click','begin_wizard','confirm_wizard_deactivation']:['click','begin_wizard']);f.immutable();
 assert.equal(f.page[Symbol.for('loginom-dock.operation-receipts.v1')].size,acts.length);
});

for(const fault of ['foreign-package','foreign-workflow','foreign-node','request','authority','model','pending','epoch','origin','primary-error','unknown-reply','falsy','native-error'])test('full opening post-dispatch '+fault+' refuses without replay/cancel',async()=>{
 const f=await fixture({fault});await assert.rejects(f.run());
 assert.equal(f.opened(),true);
 assert.deepEqual(f.records.filter(r=>r.phase==='node_step_prepared').map(r=>r.action.verb),['click','begin_wizard']);
 if(fault==='unknown-reply')assert.equal(f.operation.cleanupConfirmed,false);
 assert.equal(f.page[Symbol.for('loginom-dock.operation-receipts.v1')].size,2);
});

for(const fault of ['foreign-package','foreign-workflow','foreign-node','falsy','native-error'])test('full opening pre-dispatch '+fault+' refuses without gesture',async()=>{
 const f=await fixture({fault});f.corrupt();await assert.rejects(f.run());assert.equal(f.page.events.filter(e=>e==='click').length,0);
});

for(const fault of ['foreign-package','foreign-workflow','foreign-node','epoch','origin'])test('full opening authority changes between observation and dispatch: '+fault,async()=>{
 const f=await fixture({fault,beforeDispatch:true});await assert.rejects(f.run());
 assert.equal(f.page.events.filter(e=>e==='click').length,1);assert.equal(f.opened(),false);
});

for(const fault of ['authority','foreign-node','request','account','connection','peer','stale-pair','missing-proof','unverified-proof','malformed-pair','prepared-mismatch','observed-mismatch'])test('deactivation fresh authority lost before affirmative dispatch: '+fault,async()=>{
 const f=await fixture({fault,deactivation:true,beforeDispatch:true});await assert.rejects(f.run());
 assert.equal(f.page.events.filter(e=>e==='click').length,2);assert.equal(f.opened(),false);
});

for(const fault of ['rollback','second-alias'])test('full opening alias cannot '+fault+' on a later fresh read',async()=>{
 const f=await fixture({fault,deferFault:true});if(baseline){await assert.rejects(f.run());return;}
 // Establish the authorized alias, then perturb it on a separate fresh read.
 assert.equal((await f.run()).verified,true);f.corrupt();
 assert.equal((await f.read()).verified,false);assert.equal(f.page.events.filter(e=>e==='click').length,2);
});

test('full capability and receipt completion loss retains the primary IPC Error',async()=>{
 const f=await fixture({fault:'transport-loss'});await assert.rejects(f.run(),e=>e===f.primary);
 assert.equal(f.opened(),true);assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.cleanupConfirmed,false);
 assert.deepEqual(f.records.filter(r=>r.phase==='node_step_prepared').map(r=>r.action.verb),['click','begin_wizard']);
});

test('serialized browserReceipt unknown body retains Error and refuses repeating the same ID',async()=>{
 // Receipt-layer double only, separate from full capability tests above.
 const page={},primary=Error('receipt body failed after possible effect');let calls=0;
 page.body=async()=>{calls++;throw primary;};
 const code=withBrowserReceipt('page.body()', {operation_id:'unknown',receipt_namespace:'offline',receipt_signature:'signature'});
 const run=()=>vm.runInNewContext('('+code+')')(page);
 await assert.rejects(run(),e=>e===primary);assert.equal(page[Symbol.for('loginom-dock.operation-receipts.v1')].get('offline/unknown').state,'unknown');
 await assert.rejects(run(),/already started/);assert.equal(calls,1);
});
