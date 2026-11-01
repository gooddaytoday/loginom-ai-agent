import {readGraph} from './node-target-browser.mjs';
import {NODE_TYPES} from './node-contracts.mjs';
import {nodePlacementViewport,nodePlacementPoint,nodePlacementOverflow,revealNodePlacement,samePlacementGraph} from './node-placement.mjs';

// Fixed native UI procedure, invoked under the node operation's existing gate,
// journal and browser receipt. No connection RPC or Loginom mutation API is used.
export function makeRestConnectionCode(task){return `async page=>(${restConnectionCapability.toString()})(page,${JSON.stringify(task)},${readGraph.toString()},${revealNodePlacement.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${nodePlacementOverflow.toString()},${samePlacementGraph.toString()},${JSON.stringify(NODE_TYPES)})`;}
export async function restConnectionCapability(page,t,readPlacementGraph=readGraph,reveal=revealNodePlacement,readViewport=nodePlacementViewport,project=nodePlacementPoint,overflow=nodePlacementOverflow,sameGraph=samePlacementGraph,types=NODE_TYPES){
 const need=(v,m)=>{if(!v)throw Error('REST connection: '+m);};
 const remaining=()=>{const ms=t.deadline-Date.now();need(ms>0,'operation deadline exceeded');return ms;};
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 const owner=await page.evaluateHandle(t=>{
  const p=globalThis.__loginomDockPreparationV1;
  const r=[...(p?.receipts.values()??[])].find(r=>r.phase==='verified'&&r.workflowId===t.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode);
  if(p?.document!==document||p.id!==t.document_id||!r)throw Error('Prepared workflow is unavailable');
  return {p,r,workflow:r.nodeTargetWorkflowNode,module:r.nodeTargetWorkflowNode.ParentNode,packageNode:r.packageNode,tab:r.tab};
 },t);
 let effect=false,placementNavigation,reusedReference,sourceConnectionId;
 try{
  const guard=async()=>{
   remaining();need(await page.evaluate(({b,t})=>{
    const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
    const active=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
    const tabs=document.querySelectorAll('[data-tid='+JSON.stringify(t.workflow_ref.tab_tid)+']');
    if(p!==b.p||p.document!==document||p.id!==t.document_id||location.origin!==t.origin||app.Version!==t.build||tabs.length!==1||tabs[0]!==b.tab||!b.tab.classList.contains('x-tab-active'))return false;
    let n=active?.Controller?.Node?.data?.node;let module=false,packageNode=false;
    for(let i=0;n&&i<32;i++,n=n.ParentNode){if(n===b.module)module=true;if(n===b.packageNode){packageNode=true;break;}}
    return module&&packageNode;
   },{b:owner,t}),'package, module or active tab changed');
  };
  const wait=async(label,read)=>{
   while(remaining()>0){await guard();const v=await read();if(v)return v;await page.waitForTimeout(Math.min(80,remaining()));}
   throw Error('REST connection: '+label+' did not settle');
  };
  const point=async locator=>{
   need(await locator.count()===1,'control is missing or ambiguous');
   return locator.evaluate(e=>{if(e.closest('.x-tree-animator-wrap'))throw Error('REST tree row is still animating');const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit))||e.closest('.x-item-disabled,.x-btn-disabled'))throw Error('REST control is not reachable: '+e.closest('[data-tid]')?.getAttribute('data-tid'));return {x,y};});
  };
  const quiet=()=>wait('loading mask',()=>page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count().then(n=>n===0));
  const click=async(tid,double=false)=>{await quiet();const p=await wait('reachable '+tid,async()=>{try{return await point(find(tid));}catch{return null;}});await guard();effect=true;
   // The accordion can move this small expander after the coordinate read.
   // Wait for its native click target to be stable before the sole expansion.
   if(tid.endsWith(';TreeExpander'))await find(tid).click({timeout:remaining()});
   else await page.mouse[double?'dblclick':'click'](p.x,p.y);};
  // Ext retains visible editor containers while their input is still hidden or
  // zero-sized. Wait for this exact input's hit-test before the sole fill.
  const reachableInput=tid=>wait('reachable input '+tid,async()=>{try{return await point(find(tid).locator('input'));}catch{return null;}});
  const fill=async(tid,value,key='Tab')=>{await quiet();await reachableInput(tid);await guard();const input=find(tid).locator('input');effect=true;await input.fill(value,{timeout:remaining()});await guard();await input.press(key,{timeout:remaining()});};
  const committed=(tid,value)=>wait('committed input '+tid,()=>find(tid).evaluate((e,value)=>{const control=Ext.getCmp(e.id);return control?.el?.dom===e&&control.value===value&&control.lastValue===value;},value));
  const openSettings=async()=>{
   const opening=await page.evaluateHandle(form=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;
    const roots=document.querySelectorAll('[data-tid='+JSON.stringify(form)+']');
    if(c.FController.constructor.name!=='ConnectionsViewWizard'||roots.length!==1||c.FController.FView.el.dom!==roots[0])throw Error('Connection list owner differs');
    return {controller:c.FController,node:c.Node.data.node,root:roots[0]};},form);
   try{
    await click(form+';tbrActions;btnConfigConnection');
    const result=await wait('connection wizard or deactivation question',async()=>{
     if(await find(fields+'pedURL;ValueControl').locator('input').isVisible())return 'wizard';
     return await page.locator('.x-window:visible').count()?'question':null;
    });
    if(result==='question'){
     const question=await page.evaluateHandle(({b,t})=>{
      const visible=e=>e.checkVisibility({checkVisibilityCSS:true}),normalize=s=>s.replace(/\s+/g,' ').trim();
      const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;
      const dialogs=[...document.querySelectorAll('.x-window')].filter(visible),dialog=dialogs[0],native=dialog&&Ext.getCmp(dialog.id);
      const text='Loginom '+t.build+' Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет';
      if(c.FController!==b.controller||c.Node.data.node!==b.node||!b.root.isConnected||dialogs.length!==1||native?.el?.dom!==dialog||normalize(dialog.innerText)!==text)throw Error('Connection deactivation question differs');
      const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(t.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')];
      const nodeElement=crumbs.at(-2),wizardElement=crumbs.at(-1),nc=nodeElement&&Ext.getCmp(nodeElement.id),wc=wizardElement&&Ext.getCmp(wizardElement.id);
      const node=nc?._node?.data?.node,wizardNode=wc?._node?.data?.node;
      if(normalize(nodeElement?.textContent??'')!==normalize(t.connection.name)||normalize(wizardElement?.textContent??'')!=='Настройка'||nc.el.dom!==nodeElement||wc.el.dom!==wizardElement||wizardNode.ParentNode!==node||node.ParentNode!==b.node)throw Error('Pending connection wizard owner differs');
      let yes;
      for(const [key,label] of Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'})){
       const es=document.querySelectorAll('[data-tid='+JSON.stringify('msgbox;tlb;'+key)+']'),e=es[0],control=e&&Ext.getCmp(e.id);
       if(es.length!==1||!dialog.contains(e)||!visible(e)||normalize(e.textContent)!==label||control?.el?.dom!==e||control.disabled)throw Error('Connection confirmation controls differ');
       if(key==='yes')yes=e;
      }
      return {dialog,native,yes,nodeElement,wizardElement,node,wizardNode,text,controller:c.FController,tree:b.node};
     },{b:opening,t});
     try{
      const p=await point(find('msgbox;tlb;yes'));await guard();
      need(await page.evaluate(q=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return q.dialog.isConnected&&Ext.getCmp(q.dialog.id)===q.native&&q.native.el.dom===q.dialog&&q.dialog.innerText.replace(/\s+/g,' ').trim()===q.text&&q.yes.isConnected&&q.dialog.contains(q.yes)&&Ext.getCmp(q.yes.id)?.disabled!==true&&c.FController===q.controller&&c.Node.data.node===q.tree&&Ext.getCmp(q.nodeElement.id)?._node?.data?.node===q.node&&Ext.getCmp(q.wizardElement.id)?._node?.data?.node===q.wizardNode&&q.wizardNode.ParentNode===q.node;},question),'Connection confirmation changed before click');
      effect=true;await page.mouse.click(p.x,p.y);
     }finally{await question.dispose();}
    }
    await reachableInput(fields+'pedURL;ValueControl');await quiet();
   }finally{await opening.dispose();}
  };
  const moduleTid=t.workflow_ref.navigation_path.at(-2).tid,form=t.workflow_ref.prefix+';ConnectionsViewWizard',wizard=t.workflow_ref.prefix+';WizardModelConnectionForm',fields=wizard+';ConnectionWizard;';
  if(t.existing_target){
   need(t.existing_target.document_id===t.document_id&&t.existing_target.workflow_id===t.workflow_ref.workflow_id,'existing REST owner differs');
   const graph=await readPlacementGraph(page,{request:{document_id:t.document_id,workflow_ref:t.workflow_ref},origin:t.origin,build:t.build,types});
   need(graph.complete===true&&graph.interaction_ready===true&&graph.document_id===t.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(t.workflow_ref),'complete owned graph required for existing REST');
   const targets=graph.nodes.filter(n=>n.ref.node_id===t.existing_target.node_id);
   need(targets.length===1&&targets[0].type==='integration.rest_request'&&['document_id','workflow_id','node_id'].every(k=>targets[0].ref[k]===t.existing_target[k]),'existing REST identity differs');
   const edges=(graph.rest_connection_links??[]).filter(e=>e.target===t.existing_target.node_id&&e.input==='connection:0');
   need(edges.length<=1,'existing REST connection is ambiguous');
   if(edges.length){
    const edge=edges[0],sources=graph.nodes.filter(n=>n.ref.node_id===edge.source);
    need(sources.length===1&&sources[0].type==='bg-vendor-icon-restclientconnection','existing REST connection reference differs');
    const tid=await page.evaluate(id=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;const ns=d.FNodes.FCollection.filter(n=>n.FGuid===id);if(ns.length!==1||ns[0].FIconCls!=='bg-vendor-icon-restclientconnection')throw Error('REST connection reference changed');return d.FmxGraph.view.getState(ns[0].FCell)?.shape?.node?.getAttribute('data-tid');},edge.source);
    need(tid?.startsWith(t.workflow_ref.prefix+';Graph;'),'existing REST reference is not rendered');
    await guard();need(await find(tid).count()===1,'existing REST reference is ambiguous');
    const body=await find(tid).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y),tid=e.getAttribute('data-tid'),part=hit?.closest('[data-tid]')?.getAttribute('data-tid');
     if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!(part===tid||part?.startsWith(tid+';')))throw Error('REST reference body is not reachable');return {x,y};});
    await page.mouse.move(body.x,body.y);await click(tid+';ReferenceInfo');
    sourceConnectionId=await wait('existing reference source connection',()=>page.evaluate(b=>{
     const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller,n=c.Node.data.node;
     if(c.FController.constructor.name!=='ConnectionsViewWizard'||n.constructor.name!=='ConnectionTreeNode')return null;
     const id=n.FConnectionNode?.__ObjectId;
     if(n.ParentNode!==b.module.FConnectionsNode||typeof id?.Module!=='string'||!Number.isSafeInteger(id.Instance))throw Error('REST reference source owner differs');
     return {Module:id.Module,Instance:id.Instance};
    },owner));
    reusedReference={node_id:edge.source,edge};
   }
  }
  await click(moduleTid);
  const connections=await wait('module connections entry',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(t.workflow_ref.prefix+';ListViewForm;cntTile;ListView;headercontainer;title_')+']').evaluateAll(es=>es.filter(e=>e.textContent.trim()==='Подключения').map(e=>e.getAttribute('data-tid')));return es.length===1?es[0]:null;
  });
  await click(connections,true);await wait('connections list',()=>find(form+';cntTile;ListView;tbl').isVisible());await quiet();
  const tiles=()=>page.locator('[data-tid^='+JSON.stringify(form+';cntTile;ListView;headercontainer;title_')+']').evaluateAll(es=>es.map(e=>({tid:e.getAttribute('data-tid'),name:e.textContent.replace(/^Метка:/,'').trim()})));
  const before=await tiles();need(before.length<=200,'connection inventory exceeds bound');
  const existing=before.filter(c=>c.name===t.connection.name);need(existing.length<=1,'connection name is ambiguous');
  let tile=existing[0];
  if(!tile){
   need(t.connection.base_url,'new connection requires base_url');
   const vendor=form+';pnlConnectionsTree;headercontainer;text_Источники_данных>Веб-сервисы>REST-сервис;TreeText';
   await click(vendor,true);
   tile=await wait('new connection tile',async()=>{const added=(await tiles()).filter(c=>!before.some(b=>b.tid===c.tid));need(added.length<=1,'unexpected added connections');return added[0];});
  }
  await click(tile.tid);await openSettings();
  const connectionOwner=await page.evaluateHandle(()=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return {wizard:c.FController,node:c.Node.data.node.ParentNode};});
  if(sourceConnectionId)need(await page.evaluate(({b,id})=>{const actual=b.node.FConnectionNode?.__ObjectId;return actual?.Module===id.Module&&actual.Instance===id.Instance;},{b:connectionOwner,id:sourceConnectionId}),'requested connection differs from the existing REST reference; use a new REST target and operation_id');
  const read=async()=>{
   await guard();need(await page.evaluate(b=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return c.FController===b.wizard&&c.Node.data.node.ParentNode===b.node&&b.wizard.FModelNode===b.node.FConnectionNode;},connectionOwner),'connection wizard owner changed');
   const value=name=>find(fields+name).locator('input').inputValue();
   return {name:await value('fldLabel'),base_url:await value('pedURL;ValueControl'),method:await value('pedVerb;ValueControl'),url_mode:await value('pedFieldType;ValueControl'),authentication:await value('txtAuth'),ignore_certificate:await find(fields+'pedIgnoreCertificateErrors;ValueControl').evaluate(e=>e.classList.contains('x-form-cb-checked')),
    ...(t.connection.response_content_type!==undefined?{response_content_type:await value('pedResponseContentType;ValueControl')}:{}),
    parameters:await find(fields+'grdParams;tbl').locator('[data-tid^='+JSON.stringify(fields+'colName_')+']').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.textContent.trim(),tid:e.getAttribute('data-tid'),type:e.parentElement.querySelector('[data-columnid="colDataType"]')?.textContent.trim()})))};
  };
  let observed=await read();
  need(observed.method==='GET'&&observed.url_mode==='Строка запроса'&&observed.authentication==='Не требуется'&&!observed.ignore_certificate,'only GET/query without authentication and with certificate verification is supported');
  if(t.connection.response_content_type!==undefined&&observed.response_content_type!==t.connection.response_content_type)
   await fill(fields+'pedResponseContentType;ValueControl',t.connection.response_content_type);
  if(!existing.length){
   need(observed.parameters.length===0,'new connection unexpectedly has parameters');
   // Ext buffers change events. Commit URL before its generated label, then
   // commit the requested label even when no parameter edits follow it.
   await fill(fields+'pedURL;ValueControl',t.connection.base_url);await committed(fields+'pedURL;ValueControl',t.connection.base_url);
   await fill(fields+'fldLabel',t.connection.name);await committed(fields+'fldLabel',t.connection.name);
   for(const q of t.query_parameters){
    const before=(await read()).parameters;await click(fields+'btnAdd');
    const added=await wait('new string URL parameter',async()=>{const next=(await read()).parameters.filter(q=>!before.some(b=>b.name===q.name));return next.length===1&&next[0].type==='Строковый'?next[0]:null;});
    need(added.type==='Строковый','new URL parameter must be string');
    await click(added.tid,true);
    await fill(fields+'grdParams;tbl;celleditor;txt',q.name,'Enter');
    await wait('URL name committed',async()=>(await read()).parameters.some(p=>p.name===q.name));
   }
  }
  observed=await read();
  need(t.connection.response_content_type===undefined||observed.response_content_type===t.connection.response_content_type,'allowed response Content-Type differs');
  need(observed.name===t.connection.name&&(!t.connection.base_url||observed.base_url===t.connection.base_url),'connection label or URL differs');
  need(JSON.stringify(observed.parameters.map(p=>p.name))===JSON.stringify(t.query_parameters.map(p=>p.name))&&observed.parameters.every(p=>p.type==='Строковый'),'saved query parameters differ');
  await click(wizard+';btnDone');await wait('connection wizard committed',()=>find(form+';cntTile;ListView;tbl').isVisible());await quiet();
  // Reopen the saved object and independently reread the visible settings.
  const saved=(await tiles()).filter(c=>c.name===t.connection.name);need(saved.length===1,'saved connection is not unique');
  await click(saved[0].tid);await openSettings();
  need(await page.evaluate(b=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return c.Node.data.node.ParentNode===b.node&&c.FController.FModelNode===b.node.FConnectionNode;},connectionOwner),'saved connection owner differs');
  await connectionOwner.dispose();
  const persisted={name:await find(fields+'fldLabel').locator('input').inputValue(),base_url:await find(fields+'pedURL;ValueControl').locator('input').inputValue(),method:await find(fields+'pedVerb;ValueControl').locator('input').inputValue(),url_mode:await find(fields+'pedFieldType;ValueControl').locator('input').inputValue(),authentication:await find(fields+'txtAuth').locator('input').inputValue(),ignore_certificate:await find(fields+'pedIgnoreCertificateErrors;ValueControl').evaluate(e=>e.classList.contains('x-form-cb-checked')),
   ...(t.connection.response_content_type!==undefined?{response_content_type:await find(fields+'pedResponseContentType;ValueControl').locator('input').inputValue()}:{}),
   parameters:await find(fields+'grdParams;tbl').locator('[data-tid^='+JSON.stringify(fields+'colName_')+']').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.textContent.trim(),tid:e.getAttribute('data-tid'),type:e.parentElement.querySelector('[data-columnid="colDataType"]')?.textContent.trim()})))};
  need(JSON.stringify(persisted)===JSON.stringify(observed),'saved connection readback differs');
  await click(wizard+';btnDone');await wait('connection readback closed',()=>find(form+';cntTile;ListView;tbl').isVisible());
  await click(moduleTid);
  const workflow=await wait('original workflow entry',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(t.workflow_ref.prefix+';ListViewForm;cntTile;ListView;headercontainer;title_')+']').evaluateAll((es,label)=>es.filter(e=>e.textContent.trim()===label).map(e=>e.getAttribute('data-tid')),t.workflow_ref.navigation_path.at(-1).label);return es.length===1?es[0]:null;
  });
  await click(workflow,true);const graphTid=t.workflow_ref.prefix+';ModelForm;cmpDiagram';await wait('original workflow graph',()=>find(graphTid).isVisible());await quiet();
  const connection={name:persisted.name,base_url:persisted.base_url,method:'GET',url_mode:'query',authentication:'none',verify_server_certificate:true,...(t.connection.response_content_type!==undefined?{response_content_type:persisted.response_content_type}:{}),query_parameters:persisted.parameters.map(p=>p.name)};
  if(reusedReference){
   const graph=await readPlacementGraph(page,{request:{document_id:t.document_id,workflow_ref:t.workflow_ref},origin:t.origin,build:t.build,types});
   need(graph.complete===true&&graph.interaction_ready===true&&graph.document_id===t.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(t.workflow_ref)
    &&(graph.rest_connection_links??[]).filter(e=>e.target===t.existing_target.node_id&&e.input==='connection:0').length===1
    &&graph.rest_connection_links.some(e=>JSON.stringify(e)===JSON.stringify(reusedReference.edge)),'existing REST connection changed during readback');
   return {verified:true,cleanup_complete:true,effect_possible:effect,connection:{...connection,reference_node_id:reusedReference.node_id},document_id:t.document_id,workflow_id:t.workflow_ref.workflow_id};
  }
  const header=t.workflow_ref.prefix+';ModelForm;pnlConnectionsContainer;p.h;p.t';
  const itemPrefix=t.workflow_ref.prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль';
  if(!await find(itemPrefix+';TreeText').isVisible()){
   await click(header);let refreshed=false;
   await wait('connection palette',async()=>{
    if(await find(itemPrefix+';TreeText').isVisible())return true;
    if(!refreshed){
     await guard();
     // With a slow server, Ext can retain loaded Root children without drawing
     // any rows after accordion expansion. Refresh only that owned empty view,
     // once; never repeat connection creation, expansion clicks or the drag.
     refreshed=await page.evaluate(({b,t})=>{
      const active=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
      const forms=document.querySelectorAll('[data-tid='+JSON.stringify(t.workflow_ref.prefix+';ModelForm')+']');
      const trees=document.querySelectorAll('[data-tid='+JSON.stringify(t.workflow_ref.prefix+';ModelForm;pnlConnections;tree')+']');
      if(globalThis.__loginomDockPreparationV1!==b.p||b.p.document!==document||b.p.id!==t.document_id
       ||active?.Controller?.Node?.data?.node!==b.workflow||active.Controller.FController?.constructor?.name!=='ModelForm'
       ||forms.length!==1||trees.length!==1||!forms[0].contains(trees[0]))throw Error('REST connection: connection palette owner changed');
      const tree=trees[0],view=Ext.getCmp(tree.id),store=view?.getStore?.(),root=store?.getRoot?.(),r=tree.getBoundingClientRect();
      if(!tree.isConnected||view?.el?.dom!==tree)throw Error('REST connection: connection palette view changed');
      if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message,.x-window')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return false;
      if(r.width<=0||r.height<=0||!root?.data?.loaded||!root.data.expanded||!root.childNodes?.length
       ||tree.querySelector('[data-tid$=";TreeText"]'))return false;
      view.refresh();return true;
     },{b:owner,t});
    }
    return find(itemPrefix+';TreeText').isVisible();
   });
  }
  if(!await page.locator('[data-tid^='+JSON.stringify(itemPrefix+'>')+'][data-tid$=";TreeText"]').count())await click(itemPrefix+';TreeExpander');
  const item=await wait('saved connection palette item',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(itemPrefix+'>')+'][data-tid$=";TreeText"]').evaluateAll((es,name)=>es.filter(e=>e.textContent.trim()===name).map(e=>e.getAttribute('data-tid')),t.connection.name);return es.length===1?es[0]:null;
  });
  const beforeGraph=await page.evaluate(b=>{const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;if(m?.constructor.name!=='ModelForm')throw Error('Original graph is unavailable');return m.FDiagram.FNodes.FCollection.map(n=>({id:n.FGuid,y:n.FCell.geometry.y}));},owner);
  need(beforeGraph.length<50,'graph exceeds stage-1 bound');
  const canvas=find(graphTid);
  const chooseTarget=()=>canvas.evaluate((e,y)=>{
   const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController,g=m.FDiagram.FmxGraph,r=e.getBoundingClientRect();
   if(g.container!==e||!Number.isFinite(g.view.scale)||g.view.scale<=0||![g.view.translate.x,g.view.translate.y,e.scrollLeft,e.scrollTop].every(Number.isFinite))throw Error('Native canvas transform unavailable');
   const occupied=[...e.querySelectorAll('[data-tid*=";Graph;"]')].map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
   const project=(x,y)=>({x:r.x+(x+g.view.translate.x)*g.view.scale-e.scrollLeft,y:r.y+(y+g.view.translate.y)*g.view.scale-e.scrollTop});
   const free=p=>{
    if(p.x<Math.max(0,r.x)+72||p.x>=Math.min(r.right,innerWidth)-96||p.y<Math.max(0,r.y)+56||p.y>=Math.min(r.bottom,innerHeight)-72)return false;
    const hit=document.elementFromPoint(p.x,p.y);
    return !!hit&&(hit===e||e.contains(hit))&&!occupied.some(r=>p.x>r.left-72&&p.x<r.right+96&&p.y>r.top-56&&p.y<r.bottom+72);
   };
   // Prefer existing visible space; navigate only when that space is full.
   if(y<=10000&&free(project(128,y)))return project(128,y);
   for(const step of [128,32])
    for(let py=Math.max(0,r.y)+80;py<Math.min(r.bottom,innerHeight)-80;py+=step)
     for(let px=Math.max(0,r.x)+80;px<Math.min(r.right,innerWidth)-96;px+=step===128?160:step){
     const x=Math.round(((px-r.x+e.scrollLeft)/g.view.scale-g.view.translate.x)/8)*8;
     const y=Math.round(((py-r.y+e.scrollTop)/g.view.scale-g.view.translate.y)/8)*8;
     if(x<64||y<64||x>10000||y>10000)continue;
     const p=project(x,y);if(free(p))return p;
    }
   return null;
  },Math.max(64,...beforeGraph.map(n=>n.y))+150);
  let target=await chooseTarget(),placementGuard,placementCheckpoint;
  if(!target){
   const graphTask={request:{document_id:t.document_id,workflow_ref:t.workflow_ref},origin:t.origin,build:t.build,types};
   const before=await readPlacementGraph(page,graphTask);
   need(before.complete===true&&before.interaction_ready===true,'complete idle graph required for placement');
   placementGuard=async()=>{await guard();need(sameGraph(before,await readPlacementGraph(page,graphTask)),'Graph changed during connection placement');};
   placementCheckpoint=async message=>{
    // Restore Components before a settled refusal, as on success. Connections
    // otherwise covers the next generated encoder's admitted palette row.
    await click(t.workflow_ref.prefix+';ModelForm;pnlVendorsContainer;p.h;p.t');
    // The connection settings were committed and reread; no reference drag
    // has started. Preserve these settled effects in the existing step receipt.
    await quiet();await placementGuard();
    const graph=await readPlacementGraph(page,graphTask);
    need(graph.complete===true&&graph.interaction_ready===true&&sameGraph(before,graph),
     'complete unchanged idle graph required for connection checkpoint');
    return {verified:false,cleanup_complete:true,effect_possible:true,
     pre_target_checkpoint:{graph,connection:persisted},placement_navigation:placementNavigation,
     error:'REST connection: '+message};
   };
   let initialViewport,totalZoomSteps=0;
   // A visible point alone may still leave no room for the connection's
   // footprint. Continue only settled view navigation, never the drag.
   for(let pass=0;!target&&pass<3;pass++){
    await placementGuard();const view=await canvas.evaluate(readViewport);initialViewport??=view;
    const occupied=await canvas.evaluate(e=>[...e.querySelectorAll('[data-tid*=";Graph;"]')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));
    const position=overflow(view,occupied,64,10000);
    need(position,'no free visible connection position or bounded model position');
    const navigation=await reveal({page,root:canvas,position,prefix:t.workflow_ref.prefix,remaining,readViewport,project,guard:placementGuard});
    totalZoomSteps+=navigation.zoom_steps;
    placementNavigation={...navigation,initial_viewport:initialViewport,passes:pass+1,total_zoom_steps:totalZoomSteps};
    await placementGuard();
    // Overflow is only a navigation hint, not the future reference's identity.
    // The last zoom may expose a different free point outside that hint.
    target=await chooseTarget();
    if(!target&&navigation.fully_visible!==true){
     return await placementCheckpoint('connection placement is not fully visible');
    }
   }
   if(!target)return await placementCheckpoint('no free visible connection position after navigation');
  }
  const source=await wait('reachable connection palette item',async()=>{try{return await point(find(item));}catch{return null;}});
  if(placementGuard){await placementGuard();target=await chooseTarget();if(!target)return await placementCheckpoint('no free visible connection position before drag');}
  await guard();effect=true;await page.mouse.move(source.x,source.y);await page.mouse.down();
  try{await page.mouse.move(target.x,target.y,{steps:12});}finally{await page.mouse.up();}
  const reference=await wait('connection graph reference',()=>page.evaluate(before=>{const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;const added=m.FDiagram.FNodes.FCollection.filter(n=>!before.some(b=>b.id===n.FGuid));if(added.length>1)throw Error('Unexpected graph additions');const n=added[0];if(!n)return null;const ports=(n.FPorts??[]).flatMap(p=>p.FCollection??[]);if(ports.length!==1)throw Error('New node is not a connection reference');const tid=m.FDiagram.FmxGraph.view.getState(ports[0].FCell)?.shape?.node?.getAttribute('data-tid');if(!tid)return null;if(!tid.endsWith(';Output_Connection-0'))throw Error('New node is not a connection reference');return {node_id:n.FGuid};},beforeGraph));
  await click(t.workflow_ref.prefix+';ModelForm;pnlVendorsContainer;p.h;p.t');await quiet();
  return {verified:true,cleanup_complete:true,effect_possible:true,...(placementNavigation?{placement_navigation:placementNavigation}:{}),connection:{...connection,reference_node_id:reference.node_id},document_id:t.document_id,workflow_id:t.workflow_ref.workflow_id};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,...(placementNavigation?{placement_navigation:placementNavigation}:{}),error:String(error.message).slice(0,1000)};}
 finally{await owner.dispose();}
}
