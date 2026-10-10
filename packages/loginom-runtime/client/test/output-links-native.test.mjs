import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fixture from './fixtures/output-links-native.mjs';
import {makeWorkspaceUiCode,validateUiAction} from '../lib/workspace-ui.mjs';
const after=fixture['native-selected-complete.json'],prepared=fixture['source-open.json'];
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:after.ledger[0].node_id}};
const executablePath=process.env.LOGINOM_FIXTURE_BROWSER;
test('serialized output Links preserve native pair ownership across guarded gestures', {skip:!executablePath}, async t=>{
 const {chromium}=createRequire(import.meta.url)('playwright');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:after.viewport});
 await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'}));
 const execute=(page,options)=>new Function('page',`return (${makeWorkspaceUiCode({expected_build:after.loginom_build,expected_origin:after.origin,prepared_node_context:binding,...options})})(page)`)(page);
async function hydrate(page,capture,mode){
 await page.goto(after.origin+'/offline-output-links-fixture');
 await page.evaluate(({d,p,mode})=>{
  const objects=new Map(),get=id=>{if(!id)return null;if(!objects.has(id))objects.set(id,{});return objects.get(id);};
  const classes={};for(const t of d.tree_chain){classes[t.constructor]??=({[t.constructor]:class{}})[t.constructor];objects.set(t.object,new classes[t.constructor]());}
  const WizardModelComponentForm=class WizardModelComponentForm{};objects.set(d.active.model,new WizardModelComponentForm());
  const styles=new WeakMap();const oldStyle=globalThis.getComputedStyle;globalThis.getComputedStyle=e=>styles.has(e)?new Proxy(oldStyle(e),{get:(target,k)=>styles.get(e)[k]??target[k]}):oldStyle(e);
  // Captured rectangles already include transforms. Use them as viewport CSS
  // geometry, removing transform containing blocks; browser hit testing stays real.
  for(const n of d.dom.nodes){const e=(['svg','g','path'].includes(n.tag.toLowerCase())?document.createElementNS('http://www.w3.org/2000/svg',n.tag.toLowerCase()):document.createElement(n.tag));for(const [k,v] of Object.entries(n.attributes))e.setAttribute(k,v);if(n.text!==null)e.textContent=n.text;if('value'in n)e.value=n.value;e.style.position='fixed';e.style.left=n.box.x+'px';e.style.top=n.box.y+'px';e.style.width=n.box.width+'px';e.style.height=n.box.height+'px';e.style.boxSizing='border-box';e.style.transform='none';objects.set(n.object,e);styles.set(e,n.computed);e.getBoundingClientRect=()=>({...n.box,left:n.box.x,top:n.box.y,right:n.box.x+n.box.width,bottom:n.box.y+n.box.height});e.checkVisibility=()=>n.visible;e.getClientRects=()=>n.visible?[e.getBoundingClientRect()]:[];for(const [k,v] of Object.entries({scrollLeft:n.scroll.left,scrollTop:n.scroll.top,scrollWidth:n.scroll.width,scrollHeight:n.scroll.height,clientWidth:n.scroll.clientWidth,clientHeight:n.scroll.clientHeight}))Object.defineProperty(e,k,{value:v,configurable:true});}
  for(const n of d.dom.nodes){const e=get(n.object),parent=get(n.parent);if(parent instanceof Element)parent.append(e);else document.body.append(e);}
  const originals=new Map();
  for(const scope of d.dom.scopes){const template=document.createElement('template');template.innerHTML=scope.html;const root=template.content.firstElementChild;originals.set(scope.object,root);}
  const original=id=>{if(originals.has(id))return originals.get(id);const n=d.dom.nodes.find(n=>n.object===id);if(!n)return null;const parent=original(n.parent);if(!parent)return null;const siblings=d.dom.nodes.filter(n=>n.parent===d.dom.nodes.find(x=>x.object===id).parent);const e=parent.children[siblings.findIndex(n=>n.object===id)];if(e)originals.set(id,e);return e;};
  for(const n of d.dom.nodes){const raw=original(n.object);if(!raw)continue;const children=d.dom.nodes.filter(x=>x.parent===n.object);let index=0;get(n.object).replaceChildren(...[...raw.childNodes].map(x=>x.nodeType===Node.ELEMENT_NODE?get(children[index++]?.object):document.createTextNode(x.textContent??'')).filter(Boolean));}
  for(const t of d.tree_chain)Object.assign(get(t.object),{ParentNode:get(t.parent),FGuid:t.FGuid,FIndex:t.FIndex,FModelNode:get(t.FModelNode),FModelNodePort:get(t.FModelNodePort)});
  for(const x of d.dom.ext_bindings){const e=get(x.element),o=get(x.object);Object.assign(o,{$className:x.className,disabled:x.disabled,hidden:x.hidden,el:{dom:get(x.elDom)},_node:x.node?{data:{node:get(x.node)}}:undefined,ownerCt:get(x.ownerCt)});}
  for(const x of d.dom.ext_bindings){const n=d.dom.nodes.find(n=>n.object===x.element),o=get(x.object);o.getValue=()=>n?.attributes?.class?.includes('x-form-cb-checked')??false;}
  for(const g of d.grids){const view=get(g.view),store=get(g.store),records=g.records.map(r=>{const o=get(r.object);Object.assign(o,{internalId:r.internalId,isModel:r.isModel,dirty:r.dirty,data:{...r.scalar,ConnectedRecord:get(r.connected)}});return o;});Object.assign(store,{$className:g.storeClass,isBufferedStore:g.buffered,currentPage:g.currentPage,getRemoteFilter:()=>g.remoteFilter,getRemoteSort:()=>g.remoteSort,getTotalCount:()=>g.total,getCount:()=>g.count,isLoading:()=>g.loading,getData:()=>({items:records,getSource:()=>g.sourceRecords?{items:g.sourceRecords.map(get)}:null}),getProxy:()=>({$className:g.proxyClass,pendingOperations:{}})});view.getStore=()=>store;view.getSelectionModel=()=>({getSelection:()=>g.selected.map(get)});}
  const l=d.linkNative,c=get(l.controller),g=get(l.linkGrid),draw=get(l.draw);get(l.cmp)['@@TestCmpController']=c;Object.assign(c,{FSourceStore:get(l.sourceStore),FTargetStore:get(l.targetStore),Items:{LinkGrid:g}});g.FLinkDrawContainer=draw;draw.FTables=l.tables.map(get);for(const [i,o] of draw.FTables.entries()){o.getStore=()=>get(d.grids[i].store);o.getView=()=>get(d.grids[i].view);}draw.FLinks={};draw.FSelectedLinks={};draw.FDrawLinkItems={};for(const link of l.links){const pair=[get(link.source),get(link.target)];draw.FLinks[link.key]=pair;if(link.selected)draw.FSelectedLinks[link.key]=pair;draw.FDrawLinkItems[link.key]={LinkID:link.drawItem.LinkID,DrawDeleteButton:link.drawItem.buttons.map(b=>({type:b.type,attr:{hidden:b.hidden,globalAlpha:b.opacity},element:{dom:get(b.element)}}))};}
  c.constructor={name:'DerivedDataSourceOutputSocketWizard'};
  globalThis.Ext={getCmp:id=>{const n=d.dom.nodes.find(n=>n.attributes.id===id&&n.ext);return n?get(n.ext):null;}};
  const model=get(d.active.model);Object.assign(model,{FView:get(d.active.FView),FModelEnginePort:get(d.active.FModelEnginePort),FModelNode:get(d.active.FModelNode),FWizardItems:{FItems:d.linkNative.modelWizardItems.map(x=>({Wizard:get(x.wizard)}))}});
  const card=get(d.active.card);card.Controller={FController:model,Node:{data:{node:get(d.active.wizardTree)}}};
  globalThis.bg={app:{Version:d.loginom_build,...classes,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}};
  const ledger=d.ledger.map(r=>({...r,node:get(r.node),nodeData:get(r.nodeData),port:get(r.port),portData:get(r.portData),workflow:get(r.workflow),packageNode:get(r.packageNode),wizard:get(r.wizard),enginePort:get(r.enginePort),portTree:get(r.portTree),nodeTree:get(r.nodeTree)}));
  for(const [i,r] of ledger.entries()){const raw=d.ledger[i];Object.assign(r.node,{FGuid:raw.node_id,data:r.nodeData});Object.assign(r.port,{FGuid:raw.portGuidNow,data:r.portData,parent:r.node});if(raw.portIndexNow!==null)r.port.FPortIndex=raw.portIndexNow;}
  // Workspace chrome is scaffolded from the measured preparation receipt.
  // Output owner objects/relationships and scoped DOM come exclusively
  // from the native capture; no observed context or allowed_actions is injected.
  const tab=document.createElement('div');tab.setAttribute('data-tid',p.workflow_ref.tab_tid);tab.className='x-tab-active';tab.textContent='Сценарий';document.body.prepend(tab);
  const avatar=document.createElement('button');avatar.setAttribute('data-tid','MF;cntMain;tlbMainToolbar;btnAvatar');document.body.prepend(avatar);
  const r=ledger[0];globalThis.__loginomDockPreparationV1={document,id:d.document_id,receipts:new Map([['fixture-preparation',{phase:'verified',workflowId:p.workflow_ref.workflow_id,tab,packageNode:r.packageNode,nodeTargetWorkflowNode:r.workflow}]]),outputPortOpenReceipts:new Map(ledger.map(r=>[r.key,r]))};
  globalThis.__nativeFixture={get,ledger,model,c,draw,grids:d.grids,link:d.linkNative};

 },{d:capture,p:prepared,mode});
}
 const observe=async page=>{const initial=await execute(page,{mode:'observe'});assert.equal(initial.status,'SUCCEEDED');const ref=initial.output.wizard.root_ref;const result=await execute(page,{mode:'observe',root_ref:ref});assert.equal(result.status,'SUCCEEDED');return result.output;};
 const metadata=e=>e.signature?.date_time_cell;
 const linked=s=>s.ui.elements.filter(e=>metadata(e)?.link);
 const pairs=s=>s.ui.elements.filter(e=>metadata(e)?.role==='output_source'&&metadata(e)?.link);
 const action=s=>{const source=pairs(s)[0],target=linked(s).find(e=>metadata(e).role==='output_target'&&metadata(e).link.key===metadata(source).link.key);return {verb:'drag',source_ref:source.ref,target_ref:target.ref};};
 const mutate=async(page,variant)=>page.evaluate(variant=>{
  const {get,ledger,model,c,draw,grids,link}=globalThis.__nativeFixture,r=ledger[0],pair=Object.values(draw.FLinks)[0];
  switch(variant){
   case 'foreign_opening':r.operation_id='foreign';break;
   case 'missing_ledger':globalThis.__loginomDockPreparationV1.outputPortOpenReceipts.clear();break;
   case 'duplicate_opening':globalThis.__loginomDockPreparationV1.outputPortOpenReceipts.set('duplicate',{...r});break;
   case 'foreign_port':r.portGuid='foreign';break;
   case 'foreign_index':r.nativeIndex=1;break;
   case 'foreign_node':r.node.FGuid='foreign';break;
   case 'foreign_workflow':r.workflow_id='foreign';break;
   case 'foreign_tree_port':r.portTree.FModelNodePort={};break;
   case 'foreign_tree_node':r.nodeTree.FModelNode={};break;
   case 'foreign_tree_group':r.portTree.ParentNode={};break;
   case 'foreign_engine':model.FModelEnginePort={};break;
   case 'foreign_controller':model.FWizardItems.FItems=[{Wizard:{}}];break;
   case 'duplicate_controller':model.FWizardItems.FItems.push({Wizard:c});break;
   case 'foreign_root':model.FView.el.dom=document.body;break;
   case 'foreign_ext':get(grids[0].view).el.dom=document.body;break;
   case 'foreign_store':c.FSourceStore={};break;
   case 'missing_record':get(grids[0].store).getData=()=>({items:[]});break;
   case 'duplicate_record':get(grids[0].store).getData=()=>({items:[...grids[0].records.map(x=>get(x.object)),pair[0]]});break;
   case 'pending_store':get(grids[0].store).getProxy=()=>({pendingOperations:{pending:{}}});break;
   case 'foreign_pair':draw.FLinks[Object.keys(draw.FLinks)[0]]=[pair[0],{}];break;
   case 'missing_pair':delete draw.FLinks[Object.keys(draw.FLinks)[0]];break;
   case 'duplicate_pair':draw.FLinks.duplicate=pair;break;
   case 'foreign_connected':pair[1].data.ConnectedRecord={};break;
   case 'foreign_selection':draw.FSelectedLinks[Object.keys(draw.FSelectedLinks)[0]]=[...pair];break;
   case 'foreign_sprite':draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton[0].element.dom=document.body;break;
   case 'hidden_sprite':draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton[0].attr.hidden=true;break;
   case 'duplicate_sprite':{const b=draw.FDrawLinkItems[Object.keys(draw.FLinks)[0]].DrawDeleteButton;b[1]=b[0];break;}
   case 'duplicate_row':{const grid=get(grids[0].element),row=grid.querySelector('table.x-grid-item');row.parentElement.append(row.cloneNode(true));break;}
   case 'wrong_row_ref':get(grids[0].element).querySelector('table.x-grid-item').setAttribute('data-recordid','foreign');break;
   case 'table_mode':{const es=[...document.querySelectorAll('[data-tid]')];es.find(e=>e.getAttribute('data-tid').endsWith(';rbLinks')).classList.remove('x-form-cb-checked');break;}
   case 'stale_definition':pair[1].data.DisplayName='changed';break;
   case 'stale_selection':draw.FSelectedLinks={};break;
   default:throw Error(variant);
  }
 },variant);
 try{
  await t.test('all six measured pairs use only existing opaque click/drag refs',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);assert.equal(s.wizard.stage,'output_mapping');assert.equal(pairs(s).length,6);
   for(const source of pairs(s)){const m=metadata(source),target=linked(s).find(e=>metadata(e).role==='output_target'&&metadata(e).link.key===m.link.key);assert.ok(target);assert.equal(m.link.source.Name,m.link.target.Name);assert.equal(m.link.owner.port.opening_operation_id,after.ledger[0].operation_id);assert.equal(m.link.owner.port.port_guid,after.ledger[0].portGuid);validateUiAction({verb:'click',ref:source.ref},s);validateUiAction({verb:'click',ref:target.ref},s);validateUiAction({verb:'drag',source_ref:source.ref,target_ref:target.ref},s);}
   const removal=linked(s).filter(e=>metadata(e).role==='output_relation_remove');assert.equal(removal.length,2);assert.equal(removal.filter(e=>e.allowed_actions.includes('click')).length,1);assert.ok(removal.every(e=>!e.allowed_actions.includes('drag')));
   assert.ok(!s.ui.elements.some(e=>e.tid?.endsWith(';btnRemoveSelectedLinks')&&e.allowed_actions.length));
   assert.throws(()=>validateUiAction({verb:'drag',source_ref:pairs(s)[0].tid,target_ref:'ui-missing'},s));assert.throws(()=>validateUiAction({verb:'click',ref:'ui-missing'},s));await page.close();
  });
  for(const variant of ['foreign_opening','missing_ledger','duplicate_opening','foreign_port','foreign_index','foreign_node','foreign_workflow','foreign_tree_port','foreign_tree_node','foreign_tree_group','foreign_engine','foreign_controller','duplicate_controller','foreign_root','foreign_ext','foreign_store','missing_record','duplicate_record','pending_store','foreign_pair','missing_pair','duplicate_pair','foreign_connected','foreign_selection','foreign_sprite','hidden_sprite','duplicate_sprite','duplicate_row','wrong_row_ref','table_mode'])await t.test(variant+' denies fresh Links gestures and stale dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),a=action(before);await mutate(page,variant);const result=await execute(page,{mode:'observe',root_ref:before.wizard.root_ref});if(result.status==='SUCCEEDED'){assert.equal(linked(result.output).length,0);assert.throws(()=>validateUiAction(a,result.output));}
   let dispatched=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{dispatched++;return down(...args);};const outcome=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(outcome.status,'NOT_APPLIED');assert.equal(dispatched,0);await page.close();
  });
  for(const variant of ['stale_definition','stale_selection'])await t.test(variant+' rejects retained stale references before dispatch',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),a=action(before);await mutate(page,variant);let dispatched=0;page.mouse.down=async()=>{dispatched++;};const outcome=await execute(page,{mode:'act',snapshot:before,action:a});assert.equal(outcome.status,'NOT_APPLIED');assert.equal(dispatched,0);await page.close();
  });
  await t.test('real guarded drag checks native references and dispatches once',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);let downCount=0,upCount=0;const down=page.mouse.down.bind(page.mouse),up=page.mouse.up.bind(page.mouse);page.mouse.down=async(...args)=>{downCount++;return down(...args);};page.mouse.up=async(...args)=>{upCount++;return up(...args);};const outcome=await execute(page,{mode:'act',snapshot:s,action:action(s)});assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome.error));assert.equal(downCount,1);assert.equal(upCount,1);await page.close();
  });
  for(const role of ['output_source','output_relation_remove'])await t.test('real guarded '+role+' click dispatches exactly once',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),ref=linked(before).find(e=>metadata(e).role===role&&e.allowed_actions.includes('click')).ref;let count=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{count++;return click(...args);};const result=await execute(page,{mode:'act',snapshot:before,action:{verb:'click',ref}});assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(count,1);await page.close();
  });
  await t.test('lost selected-relation click reply remains ambiguous without replay',async()=>{
   const page=await context.newPage();await hydrate(page,after);const before=await observe(page),ref=linked(before).find(e=>metadata(e).role==='output_relation_remove'&&e.allowed_actions.includes('click')).ref;let count=0;const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{count++;await click(...args);throw Error('lost reply after click');};const result=await execute(page,{mode:'act',snapshot:before,action:{verb:'click',ref}});assert.equal(result.status,'AMBIGUOUS');assert.equal(count,1);await page.close();
  });
  await t.test('lost drag reply remains ambiguous without replay',async()=>{
   const page=await context.newPage();await hydrate(page,after);const s=await observe(page);let downCount=0;const down=page.mouse.down.bind(page.mouse);page.mouse.down=async(...args)=>{downCount++;await down(...args);throw Error('lost reply after mouse down');};const outcome=await execute(page,{mode:'act',snapshot:s,action:action(s)});assert.equal(outcome.status,'AMBIGUOUS');assert.equal(downCount,1);await page.close();
  });
 }finally{await context.close();await browser.close();}
});
