export async function hydrate(page,capture,mode,prepared,settlement){
 await page.goto(capture.origin+'/offline-output-links-fixture');
 await page.evaluate(({d,p,mode,settlement})=>{
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
  const l=d.linkNative,c=get(l.controller),g=get(l.linkGrid),draw=get(l.draw);get(l.cmp)['@@TestCmpController']=c;Object.assign(c,{FSourceStore:get(l.sourceStore),FTargetStore:get(l.targetStore),Items:{LinkGrid:g}});g.FLinkDrawContainer=draw;draw.FTables=l.tables.map(get);for(const [i,o] of draw.FTables.entries()){o.getStore=()=>get(d.grids[i].store);o.getView=()=>get(d.grids[i].view);}draw.FLinks={};draw.FSelectedLinks={};draw.FDrawLinkItems={};for(const link of l.links){const pair=[get(link.source),get(link.target)];draw.FLinks[link.key]=pair;if(link.selected)draw.FSelectedLinks[link.key]=pair;const item={LinkID:link.drawItem.LinkID},presence=link.drawItem.buttonPresence;
   const buttons=()=>link.drawItem.buttons.map(b=>({type:b.type,attr:{hidden:b.hidden,globalAlpha:b.opacity},element:{dom:get(b.element)}}));
   if(!presence)item.DrawDeleteButton=buttons(); // Legacy fixture has normalized arrays, not a presence measurement.
   else if(presence.hasOwn){
    if(presence.kind==='array')item.DrawDeleteButton=buttons();
    else if(presence.kind==='undefined')item.DrawDeleteButton=undefined;
    else if(presence.kind==='null')item.DrawDeleteButton=null;
    else throw Error('Unsupported button presence');
   }else if(presence.kind!=='absent')throw Error('Unsupported absent property');
   draw.FDrawLinkItems[link.key]=item;}
  c.constructor={name:'DerivedDataSourceOutputSocketWizard'};
  // Explicit fixture evidence only; absent keys remain absent, never false.
  if(settlement)for(const key of ['FLinksUpdateMode','FRelationRefreshMode','FWaitingRedraw'])
   if(Object.hasOwn(settlement,key))(key==='FWaitingRedraw'?draw:c)[key]=settlement[key];
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

 },{d:capture,p:prepared,mode,settlement});
}
