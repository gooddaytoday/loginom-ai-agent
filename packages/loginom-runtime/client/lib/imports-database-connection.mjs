import {readGraph} from './node-target-browser.mjs';
import {NODE_TYPES} from './node-contracts.mjs';
import {nodePlacementViewport,nodePlacementPoint,nodePlacementOverflow,revealNodePlacement,samePlacementGraph} from './node-placement.mjs';

// Fixed native UI procedure, invoked under the node operation's existing gate,
// journal and browser receipt. No connection RPC or Loginom mutation API is used.
export function makeDatabaseConnectionCode(task){return `async page=>(${databaseConnectionCapability.toString()})(page,${JSON.stringify(task)},${readGraph.toString()},${revealNodePlacement.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${nodePlacementOverflow.toString()},${samePlacementGraph.toString()},${JSON.stringify(NODE_TYPES)})`;}
export async function databaseConnectionCapability(page,t,readPlacementGraph=readGraph,reveal=revealNodePlacement,readViewport=nodePlacementViewport,project=nodePlacementPoint,overflow=nodePlacementOverflow,sameGraph=samePlacementGraph,types=NODE_TYPES){
 const need=(v,m)=>{if(!v)throw Error('Database connection: '+m);};
 // The deadline error names the wait that consumed it.
 let waiting=null;
 const remaining=()=>{const ms=t.deadline-Date.now();need(ms>0,'operation deadline exceeded'+(waiting?' while waiting for '+waiting:''));return ms;};
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
   const outer=waiting;waiting=label;
   try{
    while(remaining()>0){await guard();const v=await read();if(v)return v;await page.waitForTimeout(Math.min(80,remaining()));}
    throw Error('Database connection: '+label+' did not settle');
   }finally{waiting=outer;}
  };
  const point=async locator=>{
   need(await locator.count()===1,'control is missing or ambiguous');
   // A long tree label can be wider than its clipping panel: aim at the centre
   // of the part visible in the viewport and every clipping ancestor. A fully
   // visible control keeps its own centre; the hit-test below is unchanged.
   return locator.evaluate(e=>{if(e.closest('.x-tree-animator-wrap'))throw Error('SQLite tree row is still animating');const r=e.getBoundingClientRect();
    let left=Math.max(r.left,0),top=Math.max(r.top,0),right=Math.min(r.right,innerWidth),bottom=Math.min(r.bottom,innerHeight);
    for(let a=e.parentElement;a&&a!==document.documentElement;a=a.parentElement){const s=getComputedStyle(a);if(s.overflowX==='visible'&&s.overflowY==='visible')continue;
     const c=a.getBoundingClientRect();if(s.overflowX!=='visible'){left=Math.max(left,c.left);right=Math.min(right,c.right);}if(s.overflowY!=='visible'){top=Math.max(top,c.top);bottom=Math.min(bottom,c.bottom);}}
    const x=(left+right)/2,y=(top+bottom)/2,hit=right>left&&bottom>top?document.elementFromPoint(x,y):null;
    if(r.width<=0||r.height<=0||right<=left||bottom<=top||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit))||e.closest('.x-item-disabled,.x-btn-disabled'))throw Error('SQLite control is not reachable: '+e.closest('[data-tid]')?.getAttribute('data-tid'));return {x,y};});
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
     if(await resolveFields()&&await find(fields+'pedDatabasePath;ValueControl').locator('input').isVisible())return 'wizard';
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
    await wait('SQLite connection fields',resolveFields);await reachableInput(fields+'pedDatabasePath;ValueControl');await quiet();
   }finally{await opening.dispose();}
  };
  const moduleTid=t.workflow_ref.navigation_path.at(-2).tid,form=t.workflow_ref.prefix+';ConnectionsViewWizard',wizard=t.workflow_ref.prefix+';WizardModelConnectionForm';
  // The SQLite settings page tid is resolved from its own unique path field.
  let fields=null;
  const resolveFields=async()=>{
   const tids=await page.locator('[data-tid^='+JSON.stringify(wizard+';')+'][data-tid$=";pedDatabasePath;ValueControl"]').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getAttribute('data-tid')));
   if(tids.length!==1)return null;fields=tids[0].slice(0,-'pedDatabasePath;ValueControl'.length);return fields;
  };
  if(t.existing_target){
   need(t.existing_target.document_id===t.document_id&&t.existing_target.workflow_id===t.workflow_ref.workflow_id,'existing import owner differs');
   const graph=await readPlacementGraph(page,{request:{document_id:t.document_id,workflow_ref:t.workflow_ref},origin:t.origin,build:t.build,types});
   need(graph.complete===true&&graph.interaction_ready===true&&graph.document_id===t.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(t.workflow_ref),'complete owned graph required for existing SQLite');
   const targets=graph.nodes.filter(n=>n.ref.node_id===t.existing_target.node_id);
   need(targets.length===1&&targets[0].type==='imports.database'&&['document_id','workflow_id','node_id'].every(k=>targets[0].ref[k]===t.existing_target[k]),'existing SQLite identity differs');
   const edges=(graph.rest_connection_links??[]).filter(e=>e.target===t.existing_target.node_id&&e.input==='connection:0');
   need(edges.length<=1,'existing SQLite connection is ambiguous');
   if(edges.length){
    const edge=edges[0],sources=graph.nodes.filter(n=>n.ref.node_id===edge.source);
    need(sources.length===1&&sources[0].type==='bg-vendor-icon-sqliteunidacdbconnection','existing SQLite connection reference differs');
    const tid=await page.evaluate(id=>{const d=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FDiagram;const ns=d.FNodes.FCollection.filter(n=>n.FGuid===id);if(ns.length!==1||ns[0].FIconCls!=='bg-vendor-icon-sqliteunidacdbconnection')throw Error('SQLite connection reference changed');return d.FmxGraph.view.getState(ns[0].FCell)?.shape?.node?.getAttribute('data-tid');},edge.source);
    need(tid?.startsWith(t.workflow_ref.prefix+';Graph;'),'existing SQLite reference is not rendered');
    await guard();need(await find(tid).count()===1,'existing SQLite reference is ambiguous');
    const body=await find(tid).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y),tid=e.getAttribute('data-tid'),part=hit?.closest('[data-tid]')?.getAttribute('data-tid');
     if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!(part===tid||part?.startsWith(tid+';')))throw Error('SQLite reference body is not reachable');return {x,y};});
    await page.mouse.move(body.x,body.y);await click(tid+';ReferenceInfo');
    sourceConnectionId=await wait('existing reference source connection',()=>page.evaluate(b=>{
     const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller,n=c.Node.data.node;
     if(c.FController.constructor.name!=='ConnectionsViewWizard'||n.constructor.name!=='ConnectionTreeNode')return null;
     const id=n.FConnectionNode?.__ObjectId;
     if(n.ParentNode!==b.module.FConnectionsNode||typeof id?.Module!=='string'||!Number.isSafeInteger(id.Instance))throw Error('SQLite reference source owner differs');
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
  const existing=before.filter(c=>c.name===t.connection.name);need(existing.length<=1,'connection label is ambiguous');
  let tile=existing[0];
  if(!tile){
   const vendor=form+';pnlConnectionsTree;headercontainer;text_Источники_данных>Базы_данных>SQLite;TreeText';
   await click(vendor,true);
   tile=await wait('new connection tile',async()=>{const added=(await tiles()).filter(c=>!before.some(b=>b.tid===c.tid));need(added.length<=1,'unexpected added connections');return added[0];});
  }
  await click(tile.tid);await openSettings();
  const connectionOwner=await page.evaluateHandle(()=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return {wizard:c.FController,node:c.Node.data.node.ParentNode};});
  if(sourceConnectionId)need(await page.evaluate(({b,id})=>{const actual=b.node.FConnectionNode?.__ObjectId;return actual?.Module===id.Module&&actual.Instance===id.Instance;},{b:connectionOwner,id:sourceConnectionId}),'requested connection differs from the existing import reference; use a new import target and operation_id');
  // The DB settings form binds its model node asynchronously after opening.
  // Wait for the same controller/tree owner and report which link differs.
  const ownerState=()=>page.evaluate(b=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller,n=c.Node?.data?.node;
   return {controller:c.FController===b.wizard,parent:n?.ParentNode===b.node,model:b.wizard.FModelNode===b.node.FConnectionNode,
    names:[c.FController?.constructor?.name,b.wizard?.constructor?.name,n?.constructor?.name,b.node?.constructor?.name,b.wizard?.FModelNode?.constructor?.name,b.node?.FConnectionNode?.constructor?.name].join('/')};},connectionOwner);
  const ownedWizard=async()=>{
   const until=Date.now()+10000;let s;
   while(Date.now()<until){await guard();s=await ownerState();if(s.controller&&s.parent&&s.model)return;await page.waitForTimeout(100);}
   throw Error('Database connection: connection wizard owner changed: '+JSON.stringify(s));
  };
  const flags=['pedInMemoryDB','pedCreateDBIfNotExists','pedUseEncryption','pedLoginPrompt'];
  // Settings live in several native sub-views; bind each control by its unique suffix.
  const tidOf=async suffix=>{
   const tids=await page.locator('[data-tid^='+JSON.stringify(wizard+';')+'][data-tid$='+JSON.stringify(';'+suffix)+']').evaluateAll(es=>es.map(e=>e.getAttribute('data-tid')));
   need(tids.length===1,'SQLite connection control is missing or ambiguous: '+suffix);return tids[0];
  };
  const read=async()=>{
   await ownedWizard();
   const value=async name=>find(await tidOf(name)).locator('input').inputValue();
   const checked={};for(const f of flags)checked[f]=await find(await tidOf(f+';ValueControl')).evaluate(e=>e.classList.contains('x-form-cb-checked'));
   return {name:await value('fldLabel'),database_path:await value('pedDatabasePath;ValueControl'),...checked};
  };
  let observed=await read();
  need(flags.every(f=>observed[f]===false),'only a plain file SQLite connection is supported: in-memory, create-if-missing, encryption and login prompt must be off; use a NEW database_path for another connection');
  need(!existing.length||observed.database_path===t.connection.database_path,'saved connection with this label points to another file');
  const pathTid=await tidOf('pedDatabasePath;ValueControl'),labelTid=await tidOf('fldLabel');
  if(observed.database_path!==t.connection.database_path){await fill(pathTid,t.connection.database_path);await committed(pathTid,t.connection.database_path);}
  if((await read()).name!==t.connection.name){await fill(labelTid,t.connection.name);await committed(labelTid,t.connection.name);}
  observed=await read();
  need(observed.name===t.connection.name&&observed.database_path===t.connection.database_path&&flags.every(f=>observed[f]===false),'connection label or database path differs');
  // Native test: the file must exist in storage and open as SQLite.
  await click(await tidOf('btnTestConnection'));
  const message=await wait('connection test result',async()=>{
   const boxes=page.locator('[data-tid="msgbox;cnt"]:visible');const n=await boxes.count();need(n<=1,'connection test message is ambiguous');
   return n===1?(await boxes.innerText()).replace(/\s+/g,' ').trim():null;
  });
  const okButtons=page.locator('[data-tid^="msgbox;tlb;"]:visible');need(await okButtons.count()===1,'connection test message has no single close button');
  // quiet() waits for windows to close, so this one message is dismissed directly.
  const okPoint=await point(okButtons);await guard();effect=true;await page.mouse.click(okPoint.x,okPoint.y);
  await wait('connection test message closed',async()=>await page.locator('[data-tid="msgbox;cnt"]:visible').count()===0);
  need(message.includes('Тестирование соединения прошло успешно'),'connection test failed: '+message.slice(0,400)+'. Check database_path: an existing uploaded SQLite .db file is required');
  await click(wizard+';btnDone');await wait('connection wizard committed',()=>find(form+';cntTile;ListView;tbl').isVisible());await quiet();
  // Reopen the saved object and independently reread the visible settings.
  const saved=(await tiles()).filter(c=>c.name===t.connection.name);need(saved.length===1,'saved connection is not unique');
  await click(saved[0].tid);await openSettings();
  await page.evaluate(b=>{b.wizard=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;},connectionOwner);
  await ownedWizard();
  const persisted=await read();
  await connectionOwner.dispose();
  need(JSON.stringify(persisted)===JSON.stringify(observed),'saved connection readback differs');
  await click(wizard+';btnDone');await wait('connection readback closed',()=>find(form+';cntTile;ListView;tbl').isVisible());
  await click(moduleTid);
  const workflow=await wait('original workflow entry',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(t.workflow_ref.prefix+';ListViewForm;cntTile;ListView;headercontainer;title_')+']').evaluateAll((es,label)=>es.filter(e=>e.textContent.trim()===label).map(e=>e.getAttribute('data-tid')),t.workflow_ref.navigation_path.at(-1).label);return es.length===1?es[0]:null;
  });
  await click(workflow,true);const graphTid=t.workflow_ref.prefix+';ModelForm;cmpDiagram';await wait('original workflow graph',()=>find(graphTid).isVisible());await quiet();
  const connection={name:persisted.name,database_path:persisted.database_path,kind:'sqlite',connection_test:'passed'};
  if(reusedReference){
   const graph=await readPlacementGraph(page,{request:{document_id:t.document_id,workflow_ref:t.workflow_ref},origin:t.origin,build:t.build,types});
   need(graph.complete===true&&graph.interaction_ready===true&&graph.document_id===t.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(t.workflow_ref)
    &&(graph.rest_connection_links??[]).filter(e=>e.target===t.existing_target.node_id&&e.input==='connection:0').length===1
    &&graph.rest_connection_links.some(e=>JSON.stringify(e)===JSON.stringify(reusedReference.edge)),'existing SQLite connection changed during readback');
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
       ||forms.length!==1||trees.length!==1||!forms[0].contains(trees[0]))throw Error('SQLite connection: connection palette owner changed');
      const tree=trees[0],view=Ext.getCmp(tree.id),store=view?.getStore?.(),root=store?.getRoot?.(),r=tree.getBoundingClientRect();
      if(!tree.isConnected||view?.el?.dom!==tree)throw Error('SQLite connection: connection palette view changed');
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
     error:'Database connection: '+message};
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
