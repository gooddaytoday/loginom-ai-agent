import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fixture from './fixtures/input-cancellation-overflow.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
import {closePreparedWizard,boundWizardCloseConfirmation,wizardCloseBinding} from '../lib/node-wizard-close.mjs';
const after=fixture['native-after-1280.json'],prepared=fixture['open.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:after.ledger[0].node_id}};
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
test('serialized input cancellation owns overflow without broadening mapping or finish', {skip:!executablePath}, async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:after.viewport});
 await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:after.loginom_build,expected_origin:after.origin,prepared_node_context:binding,...options})})(page)`)(page);
async function hydrate(page,capture,mode){
 await page.goto(after.origin+'/offline-cancellation-fixture');
 await page.evaluate(({d,p,mode})=>{
  const objects=new Map(),get=id=>{if(!id)return null;if(!objects.has(id))objects.set(id,{});return objects.get(id);};
  const classes={};for(const t of d.tree_chain){classes[t.constructor]??=({[t.constructor]:class{}})[t.constructor];objects.set(t.object,new classes[t.constructor]());}
  const WizardModelComponentForm=class WizardModelComponentForm{};objects.set(d.active.model,new WizardModelComponentForm());
  const styles=new WeakMap();const oldStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=e=>styles.has(e)?new Proxy(oldStyle(e),{get:(target,k)=>styles.get(e)[k]??target[k]}):oldStyle(e);
  for(const n of d.dom.nodes){const e=document.createElement(n.tag);for(const [k,v] of Object.entries(n.attributes))e.setAttribute(k,v);if(n.text!==null)e.textContent=n.text;if('value'in n)e.value=n.value;objects.set(n.object,e);styles.set(e,n.computed);e.getBoundingClientRect=()=>({...n.box,left:n.box.x,top:n.box.y,right:n.box.x+n.box.width,bottom:n.box.y+n.box.height});e.checkVisibility=()=>n.visible;e.getClientRects=()=>n.visible?[e.getBoundingClientRect()]:[];for(const [k,v] of Object.entries({scrollLeft:n.scroll.left,scrollTop:n.scroll.top,scrollWidth:n.scroll.width,scrollHeight:n.scroll.height,clientWidth:n.scroll.clientWidth,clientHeight:n.scroll.clientHeight}))Object.defineProperty(e,k,{value:v,configurable:true});}
  for(const n of d.dom.nodes){const e=get(n.object),parent=get(n.parent);if(parent instanceof Element)parent.append(e);else document.body.append(e);}
  for(const t of d.tree_chain)Object.assign(get(t.object),{ParentNode:get(t.parent),FGuid:t.FGuid,FIndex:t.FIndex,FModelNode:get(t.FModelNode),FModelNodePort:get(t.FModelNodePort)});
  for(const x of d.dom.ext_bindings){const e=get(x.element),o=get(x.object);Object.assign(o,{$className:x.className,disabled:x.disabled,hidden:x.hidden,el:{dom:get(x.elDom)},_node:x.node?{data:{node:get(x.node)}}:undefined,ownerCt:get(x.ownerCt)});}
  globalThis.Ext={getCmp:id=>{const n=d.dom.nodes.find(n=>n.attributes.id===id&&n.ext);return n?get(n.ext):null;}};
  const model=get(d.active.model);Object.assign(model,{FView:get(d.active.FView),FModelSocket:get(d.active.FModelSocket),FModelNode:get(d.active.FModelNode)});
  const card=get(d.active.card);card.Controller={FController:model,Node:{data:{node:get(d.active.wizardTree)}}};
  globalThis.bg={app:{Version:d.loginom_build,...classes,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}};
  const ledger=d.ledger.map(r=>({...r,node:get(r.node),nodeData:get(r.nodeData),port:get(r.port),portData:get(r.portData),workflow:get(r.workflow),packageNode:get(r.packageNode),wizard:get(r.wizard),enginePort:get(r.enginePort),portTree:get(r.portTree),nodeTree:get(r.nodeTree)}));
  for(const [i,r] of ledger.entries()){const raw=d.ledger[i];Object.assign(r.node,{FGuid:raw.node_id,data:r.nodeData});Object.assign(r.port,{FGuid:raw.portGuidNow,data:r.portData,parent:r.node});if(raw.portIndexNow!==null)r.port.FPortIndex=raw.portIndexNow;}
  // Workspace chrome is scaffolded from the measured preparation receipt.
  // Cancellation owner objects/relationships and scoped DOM come exclusively
  // from the native capture; no observed context or allowed_actions is injected.
  const tab=document.createElement('div');tab.setAttribute('data-tid',p.workflow_ref.tab_tid);tab.className='x-tab-active';tab.textContent='Сценарий';document.body.prepend(tab);
  const avatar=document.createElement('button');avatar.setAttribute('data-tid','MF;cntMain;tlbMainToolbar;btnAvatar');document.body.prepend(avatar);
  const r=ledger[0];globalThis.__loginomDockPreparationV1={document,id:d.document_id,receipts:new Map([['fixture-preparation',{phase:'verified',workflowId:p.workflow_ref.workflow_id,tab,packageNode:r.packageNode,nodeTargetWorkflowNode:r.workflow}]]),inputPortOpenReceipts:new Map(ledger.map(r=>[r.key,r]))};
  if(mode==='missing_ledger')__loginomDockPreparationV1.inputPortOpenReceipts.clear();
  if(mode==='duplicate_ledger')__loginomDockPreparationV1.inputPortOpenReceipts.set('second',{...r});
  if(mode==='foreign_node')r.nodeTree.FGuid='00000000-0000-4000-8000-000000000000';
  if(mode==='foreign_document')__loginomDockPreparationV1.id='foreign';
  if(mode==='foreign_port')r.port.FGuid='00000000-0000-4000-8000-000000000000';
  if(mode==='foreign_index')r.portTree.FIndex=1;
  if(mode==='foreign_socket')model.FModelSocket={};
  if(mode==='foreign_root')model.FView.el.dom=document.createElement('div');
  if(mode==='stale_data')r.port.data={};
  if(mode==='foreign_parent')r.port.parent={};
  if(mode==='foreign_workflow')r.workflow={};
  if(mode==='foreign_opening')r.operation_id='foreign-opening';
  if(mode==='duplicate_root'){const e=get(d.dom.wizardRoots[0]).cloneNode(true);document.body.append(e);}
  if(mode==='duplicate_dialog')document.body.append(get(d.dom.dialogs[0].object).cloneNode(true));
  if(mode==='duplicate_no')get(d.dom.buttons[1].element).parentElement.append(get(d.dom.buttons[1].element).cloneNode(true));
  if(mode==='foreign_yes_binding')get(d.dom.buttons[0].cmp??d.dom.nodes.find(n=>n.object===d.dom.buttons[0].element).ext).el.dom=document.createElement('button');
  if(mode==='foreign_port_breadcrumb'){const n=d.dom.nodes.find(n=>(n.attributes['data-tid']??'').endsWith('>Главная_таблица'));get(n.ext)._node.data.node={};}
  if(mode==='stale_wizard_breadcrumb'){const n=d.dom.nodes.find(n=>(n.attributes['data-tid']??'').endsWith('>Настройка'));get(n.ext).el.dom=document.createElement('span');}
  if(mode==='missing_port_breadcrumb'){const n=d.dom.nodes.find(n=>(n.attributes['data-tid']??'').endsWith('>Главная_таблица'));get(n.object).remove();}
  if(mode==='duplicate_yes')get(d.dom.buttons[0].element).parentElement.append(get(d.dom.buttons[0].element).cloneNode(true));
 },{d:capture,p:prepared,mode});
}

 try {
  for(const [file,owner] of [['native-after-1280.json','unobserved'],['native-after-1440.json','observed'],['native-after-1280-restored.json','unobserved']]) await t.test(file,async()=>{
   const capture=fixture[file],page=await context.newPage();await page.setViewportSize(capture.viewport);await hydrate(page,capture,'valid');
   const initial=await execute(page,{mode:'observe'});assert.equal(initial.status,'SUCCEEDED');
   const portal=await execute(page,{mode:'observe',root_ref:initial.output.ui.dialogs[0].ref});assert.equal(portal.status,'SUCCEEDED');
   const s=portal.output,yes=s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes');
   assert.equal(s.wizard.input_port_context.status,owner);assert.equal(s.wizard.input_mapping.reason,'full_mapping_root_required');
   validateUiAction({verb:'confirm_wizard_close',ref:yes.ref},s);
   assert.equal(boundWizardCloseConfirmation(s,wizardCloseBinding(s)),true);
   assert.ok(!s.ui.elements.some(e=>e.allowed_actions.includes('finish_wizard')));
   // Actual helper, with modelled lost transport replies after each dispatch.
   // No browser gesture is sent; uncertain replies never trigger a replay.
   for(const lossAt of [1,2]){let calls=0;const channel={observe:async()=>s,perform:async args=>{assert.equal(args.ready(s),true);calls++;if(calls===lossAt)throw Error('lost reply');}};
    await assert.rejects(closePreparedWizard(channel),/lost reply/);assert.equal(calls,lossAt);}
   await page.close();
  });
  for(const mode of ['missing_ledger','duplicate_ledger','foreign_node','foreign_document','foreign_port','foreign_index','foreign_socket','foreign_root','stale_data','foreign_parent','foreign_workflow','foreign_opening','duplicate_root','duplicate_dialog','duplicate_yes','duplicate_no','foreign_yes_binding','foreign_port_breadcrumb','stale_wizard_breadcrumb','missing_port_breadcrumb'])await t.test(mode,async()=>{
   const page=await context.newPage();await hydrate(page,after,mode);
   const initial=await execute(page,{mode:'observe'});
   if(initial.status==='SUCCEEDED'){
    const ref=initial.output.ui.dialogs[0]?.ref;
    const portal=ref?await execute(page,{mode:'observe',root_ref:ref}):initial;
    if(portal.status==='SUCCEEDED')assert.ok(!portal.output.ui.elements.some(e=>e.allowed_actions.includes('confirm_wizard_close')),mode);
   }
   await page.close();
  });
 }finally{await context.close();await browser.close();}
});
