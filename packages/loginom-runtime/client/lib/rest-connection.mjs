// Fixed native UI procedure, invoked under the node operation's existing gate,
// journal and browser receipt. No connection RPC or Loginom mutation API is used.
export function makeRestConnectionCode(task){return `async page=>(${restConnectionCapability.toString()})(page,${JSON.stringify(task)})`;}
export async function restConnectionCapability(page,t){
 const need=(v,m)=>{if(!v)throw Error('REST connection: '+m);};
 const remaining=()=>{const ms=t.deadline-Date.now();need(ms>0,'operation deadline exceeded');return ms;};
 const find=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 const owner=await page.evaluateHandle(t=>{
  const p=globalThis.__loginomDockPreparationV1;
  const r=[...(p?.receipts.values()??[])].find(r=>r.phase==='verified'&&r.workflowId===t.workflow_ref.workflow_id&&r.nodeTargetWorkflowNode);
  if(p?.document!==document||p.id!==t.document_id||!r)throw Error('Prepared workflow is unavailable');
  return {p,r,workflow:r.nodeTargetWorkflowNode,module:r.nodeTargetWorkflowNode.ParentNode,packageNode:r.packageNode,tab:r.tab};
 },t);
 let effect=false;
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
   return locator.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
    if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit))||e.closest('.x-item-disabled,.x-btn-disabled'))throw Error('REST control is not reachable: '+e.closest('[data-tid]')?.getAttribute('data-tid'));return {x,y};});
  };
  const quiet=()=>wait('loading mask',()=>page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count().then(n=>n===0));
  const click=async(tid,double=false)=>{await quiet();const p=await wait('reachable '+tid,async()=>{try{return await point(find(tid));}catch{return null;}});await guard();effect=true;await page.mouse[double?'dblclick':'click'](p.x,p.y);};
  // Ext retains visible editor containers while their input is still hidden or
  // zero-sized. Wait for this exact input's hit-test before the sole fill.
  const reachableInput=tid=>wait('reachable input '+tid,async()=>{try{return await point(find(tid).locator('input'));}catch{return null;}});
  const fill=async(tid,value,key='Tab')=>{await quiet();await reachableInput(tid);await guard();const input=find(tid).locator('input');effect=true;await input.fill(value,{timeout:remaining()});await guard();await input.press(key,{timeout:remaining()});};
  const moduleTid=t.workflow_ref.navigation_path.at(-2).tid,form=t.workflow_ref.prefix+';ConnectionsViewWizard',wizard=t.workflow_ref.prefix+';WizardModelConnectionForm',fields=wizard+';ConnectionWizard;';
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
  await click(tile.tid);await click(form+';tbrActions;btnConfigConnection');await reachableInput(fields+'pedURL;ValueControl');await quiet();
  const connectionOwner=await page.evaluateHandle(()=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return {wizard:c.FController,node:c.Node.data.node.ParentNode};});
  const read=async()=>{
   await guard();need(await page.evaluate(b=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return c.FController===b.wizard&&c.Node.data.node.ParentNode===b.node&&b.wizard.FModelNode===b.node.FConnectionNode;},connectionOwner),'connection wizard owner changed');
   const value=name=>find(fields+name).locator('input').inputValue();
   return {name:await value('fldLabel'),base_url:await value('pedURL;ValueControl'),method:await value('pedVerb;ValueControl'),url_mode:await value('pedFieldType;ValueControl'),authentication:await value('txtAuth'),ignore_certificate:await find(fields+'pedIgnoreCertificateErrors;ValueControl').evaluate(e=>e.classList.contains('x-form-cb-checked')),
    parameters:await find(fields+'grdParams;tbl').locator('[data-tid^='+JSON.stringify(fields+'colName_')+']').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.textContent.trim(),tid:e.getAttribute('data-tid'),type:e.parentElement.querySelector('[data-columnid="colDataType"]')?.textContent.trim()})))};
  };
  let observed=await read();
  need(observed.method==='GET'&&observed.url_mode==='Строка запроса'&&observed.authentication==='Не требуется'&&!observed.ignore_certificate,'only GET/query without authentication and with certificate verification is supported');
  if(!existing.length){
   need(observed.parameters.length===0,'new connection unexpectedly has parameters');
   await fill(fields+'pedURL;ValueControl',t.connection.base_url);await fill(fields+'fldLabel',t.connection.name);
   for(const q of t.query_parameters){
    const before=(await read()).parameters;await click(fields+'btnAdd');
    const added=await wait('new URL parameter',async()=>{const next=(await read()).parameters.filter(q=>!before.some(b=>b.name===q.name));return next.length===1&&next[0].type?next[0]:null;});
    need(added.type==='Строковый','new URL parameter must be string');
    await click(added.tid,true);
    await fill(fields+'grdParams;tbl;celleditor;txt',q.name,'Enter');
    await wait('URL name committed',async()=>(await read()).parameters.some(p=>p.name===q.name));
   }
  }
  observed=await read();
  need(observed.name===t.connection.name&&(!t.connection.base_url||observed.base_url===t.connection.base_url),'connection label or URL differs');
  need(JSON.stringify(observed.parameters.map(p=>p.name))===JSON.stringify(t.query_parameters.map(p=>p.name))&&observed.parameters.every(p=>p.type==='Строковый'),'saved query parameters differ');
  await click(wizard+';btnDone');await wait('connection wizard committed',()=>find(form+';cntTile;ListView;tbl').isVisible());await quiet();
  // Reopen the saved object and independently reread the visible settings.
  const saved=(await tiles()).filter(c=>c.name===t.connection.name);need(saved.length===1,'saved connection is not unique');
  await click(saved[0].tid);await click(form+';tbrActions;btnConfigConnection');await reachableInput(fields+'pedURL;ValueControl');await quiet();
  need(await page.evaluate(b=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;return c.Node.data.node.ParentNode===b.node&&c.FController.FModelNode===b.node.FConnectionNode;},connectionOwner),'saved connection owner differs');
  await connectionOwner.dispose();
  const persisted={name:await find(fields+'fldLabel').locator('input').inputValue(),base_url:await find(fields+'pedURL;ValueControl').locator('input').inputValue(),method:await find(fields+'pedVerb;ValueControl').locator('input').inputValue(),url_mode:await find(fields+'pedFieldType;ValueControl').locator('input').inputValue(),authentication:await find(fields+'txtAuth').locator('input').inputValue(),ignore_certificate:await find(fields+'pedIgnoreCertificateErrors;ValueControl').evaluate(e=>e.classList.contains('x-form-cb-checked')),
   parameters:await find(fields+'grdParams;tbl').locator('[data-tid^='+JSON.stringify(fields+'colName_')+']').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width>0).map(e=>({name:e.textContent.trim(),tid:e.getAttribute('data-tid'),type:e.parentElement.querySelector('[data-columnid="colDataType"]')?.textContent.trim()})))};
  need(JSON.stringify(persisted)===JSON.stringify(observed),'saved connection readback differs');
  await click(wizard+';btnDone');await wait('connection readback closed',()=>find(form+';cntTile;ListView;tbl').isVisible());
  await click(moduleTid);
  const workflow=await wait('original workflow entry',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(t.workflow_ref.prefix+';ListViewForm;cntTile;ListView;headercontainer;title_')+']').evaluateAll((es,label)=>es.filter(e=>e.textContent.trim()===label).map(e=>e.getAttribute('data-tid')),t.workflow_ref.navigation_path.at(-1).label);return es.length===1?es[0]:null;
  });
  await click(workflow,true);const graphTid=t.workflow_ref.prefix+';ModelForm;cmpDiagram';await wait('original workflow graph',()=>find(graphTid).isVisible());await quiet();
  const header=t.workflow_ref.prefix+';ModelForm;pnlConnectionsContainer;p.h;p.t';
  const itemPrefix=t.workflow_ref.prefix+';ModelForm;pnlConnections;headercontainer;text_Root>Текущий_модуль';
  if(!await find(itemPrefix+';TreeText').isVisible()){await click(header);await wait('connection palette',()=>find(itemPrefix+';TreeText').isVisible());}
  if(!await page.locator('[data-tid^='+JSON.stringify(itemPrefix+'>')+'][data-tid$=";TreeText"]').count())await click(itemPrefix+';TreeExpander');
  const item=await wait('saved connection palette item',async()=>{
   const es=await page.locator('[data-tid^='+JSON.stringify(itemPrefix+'>')+'][data-tid$=";TreeText"]').evaluateAll((es,name)=>es.filter(e=>e.textContent.trim()===name).map(e=>e.getAttribute('data-tid')),t.connection.name);return es.length===1?es[0]:null;
  });
  const beforeGraph=await page.evaluate(b=>{const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;if(m?.constructor.name!=='ModelForm')throw Error('Original graph is unavailable');return m.FDiagram.FNodes.FCollection.map(n=>({id:n.FGuid,y:n.FCell.geometry.y}));},owner);
  need(beforeGraph.length<50,'graph exceeds stage-1 bound');
  const target=await find(graphTid).evaluate((e,y)=>{const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController,g=m.FDiagram.FmxGraph,r=e.getBoundingClientRect();const x=r.x+128*g.view.scale+g.view.translate.x*g.view.scale-e.scrollLeft;const py=r.y+y*g.view.scale+g.view.translate.y*g.view.scale-e.scrollTop;const hit=document.elementFromPoint(x,py);if(x<r.x||x>=r.right||py<r.y||py>=r.bottom||!hit||!(e===hit||e.contains(hit)))throw Error('Connection placement is outside visible graph');return{x,y:py};},Math.max(64,...beforeGraph.map(n=>n.y))+150);
  const source=await wait('reachable connection palette item',async()=>{try{return await point(find(item));}catch{return null;}});await guard();effect=true;await page.mouse.move(source.x,source.y);await page.mouse.down();
  try{await page.mouse.move(target.x,target.y,{steps:12});}finally{await page.mouse.up();}
  const reference=await wait('connection graph reference',()=>page.evaluate(before=>{const m=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;const added=m.FDiagram.FNodes.FCollection.filter(n=>!before.some(b=>b.id===n.FGuid));if(added.length>1)throw Error('Unexpected graph additions');const n=added[0];if(!n)return null;const ports=(n.FPorts??[]).flatMap(p=>p.FCollection??[]);if(ports.length!==1||!m.FDiagram.FmxGraph.view.getState(ports[0].FCell)?.shape?.node?.getAttribute('data-tid')?.endsWith(';Output_Connection-0'))throw Error('New node is not a connection reference');return {node_id:n.FGuid};},beforeGraph));
  await click(t.workflow_ref.prefix+';ModelForm;pnlVendorsContainer;p.h;p.t');await quiet();
  return {verified:true,cleanup_complete:true,effect_possible:true,connection:{name:persisted.name,base_url:persisted.base_url,method:'GET',url_mode:'query',authentication:'none',verify_server_certificate:true,query_parameters:persisted.parameters.map(p=>p.name),reference_node_id:reference.node_id},document_id:t.document_id,workflow_id:t.workflow_ref.workflow_id};
 }catch(error){return {verified:false,cleanup_complete:!effect,effect_possible:effect,error:String(error.message).slice(0,1000)};}
 finally{await owner.dispose();}
}
