// Capture live object identities before Show Node. A later focus repair must
// refer to this exact process record, not another execution of the same node.
export async function captureProcessNodeFocus(page, task) {
 return page.evaluateHandle(({binding,process,origin,build})=>{
  const app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
  if(!binding||!process||location.origin!==origin||app?.Version!==build||p?.document!==document||p.id!==binding.document_id)return null;
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const tabs=exact(binding.workflow_ref.tab_tid),receipts=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===binding.workflow_ref.workflow_id);
  const receipt=receipts.find(r=>r.nodeTargetWorkflowNode);
  if(tabs.length!==1||!receipt||receipts.some(r=>r.tab!==tabs[0]||r.packageNode!==receipt.packageNode)||!tabs[0].classList.contains('x-tab-active'))return null;
  const workspace=app.Application?.FInstance?.FMainForm?.Items?.Workspace,card=workspace?.getActiveTab?.(),model=card?.Controller?.FController;
  if(card?.tab?.el?.dom!==tabs[0]||!app.ModelForm||!(model instanceof app.ModelForm))return null;
  const nodes=model.FDiagram?.FNodes?.FCollection;
  if(!Array.isArray(nodes)||nodes.length>200)return null;
  const owners=nodes.filter(n=>n.FGuid===binding.node.node_id);
  if(owners.length!==1||!owners[0].data)return null;
  const grids=['treepanel;tree','grd;tbl'].map(s=>exact('ConsoleForm;ProgressForm;trpProgress;'+s));
  if(grids.some(es=>es.length!==1)||!Array.isArray(process.grid_ids)||grids.some((es,i)=>es[0].id!==process.grid_ids[i]))return null;
  const views=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id)),store=views[0]?.getStore?.(),root=store?.getRoot?.()??store?.getRootNode?.();
  if(store?.$className!=='Ext.data.TreeStore'||store.isLoading?.()||!root?.isModel||root.data?.loaded!==true||root.data?.loading||!Array.isArray(root.childNodes)
    ||views.some((v,i)=>v?.el?.dom!==grids[i][0]||v.getStore?.()!==store))return null;
  let count=0,record,valid=true;const seen=new Set();
  const walk=rs=>{for(const r of rs){if(++count>2000||!r?.isModel||seen.has(r)||!Array.isArray(r.childNodes)){valid=false;return;}seen.add(r);if(String(r.internalId)===process.record_id){if(record){valid=false;return;}record=r;}walk(r.childNodes);if(!valid)return;}};walk(root.childNodes);
  if(!valid||!record||record.data?.ModelNode!==owners[0].data||!/^\d+\.\d+(?:\.\d+)*$/.test(String(record.data.id)))return null;
  for(const [grid] of grids){const selected=[...grid.querySelectorAll('table.x-grid-item-selected')];if(selected.length!==1||selected[0].getAttribute('data-recordid')!==process.record_id||selected[0].getAttribute('data-boundview')!==grid.id)return null;}
  const cells=exact('ConsoleForm;ProgressForm;colProcess_'+process.path);
  if(cells.length!==1||!grids[0][0].contains(cells[0])||cells[0].closest('table')?.getAttribute('data-recordid')!==process.record_id)return null;
  return {document,app,preparation:p,receipt,packageNode:receipt.packageNode,workflowNode:receipt.nodeTargetWorkflowNode,workspace,card,tab:tabs[0],owner:owners[0],nodeData:owners[0].data,
    store,root,record,recordData:record.data,parent:record.parentNode,processId:String(record.data.id),rootId:String(root.internalId),
    gridElements:grids.map(es=>es[0]),binding,origin,build,process,activeFiles:null};
 },task);
}

export async function restoreProcessNodeFocus(page, ticket) {
 const inspect=()=>page.evaluate(t=>{
  if(!t||t.document!==document||globalThis.bg?.app!==t.app||location.origin!==t.origin||t.app.Version!==t.build
    ||globalThis.__loginomDockPreparationV1!==t.preparation||t.preparation.document!==document||t.preparation.id!==t.binding.document_id)return null;
  const {app,binding,process}=t,exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const receipts=[...t.preparation.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===binding.workflow_ref.workflow_id);
  if(!receipts.includes(t.receipt)||t.receipt.packageNode!==t.packageNode||t.receipt.nodeTargetWorkflowNode!==t.workflowNode||receipts.some(r=>r.tab!==t.tab||r.packageNode!==t.packageNode))return null;
  const tabs=exact(binding.workflow_ref.tab_tid),workspace=app.Application?.FInstance?.FMainForm?.Items?.Workspace;
  if(tabs.length!==1||tabs[0]!==t.tab||workspace!==t.workspace||t.tab.classList.contains('x-tab-active'))return null;
  const cards=workspace.items?.items,active=workspace.getActiveTab?.();
  if(!Array.isArray(cards)||cards.length>32||cards.filter(c=>c===t.card).length!==1||t.card.tab?.el?.dom!==t.tab
    ||active===t.card||active?.Controller?.FController?.constructor?.name!=='FileStorageForm')return null;
  if(t.activeFiles&&t.activeFiles!==active)return null;t.activeFiles=active;
  const model=t.card.Controller?.FController,tree=t.card.Controller?.Node?.data?.node;
  if(!(model instanceof app.ModelForm)||!app.ModelNodeTreeNode||!(tree instanceof app.ModelNodeTreeNode)||tree.FGuid!==binding.node.node_id||tree.FModelNode!==t.nodeData)return null;
  let n=tree,workflow,packageNode;const ancestors=new Set();
  for(let i=0;n&&i<32&&!ancestors.has(n);i++,n=n.ParentNode){ancestors.add(n);if(n instanceof app.WorkFlowTreeNode)workflow=n;if(n instanceof app.PackageTreeNode){packageNode=n;break;}}
  if(workflow!==t.workflowNode||packageNode!==t.packageNode)return null;
  const nodes=model.FDiagram?.FNodes?.FCollection,graph=model.FDiagram?.FmxGraph;
  if(!Array.isArray(nodes)||nodes.length>200||nodes.filter(o=>o.FGuid===binding.node.node_id).length!==1||!nodes.includes(t.owner)||t.owner.data!==t.nodeData)return null;
  const selected=graph?.getSelectionCells?.();
  if(!Array.isArray(selected)||selected.length!==1||selected[0]!==t.owner.FCell)return null;
  const grids=['treepanel;tree','grd;tbl'].map(s=>exact('ConsoleForm;ProgressForm;trpProgress;'+s));
  if(grids.some((es,i)=>es.length!==1||es[0]!==t.gridElements[i]||es[0].id!==process.grid_ids[i]))return null;
  const views=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id)),store=views[0]?.getStore?.(),root=store?.getRoot?.()??store?.getRootNode?.();
  if(store!==t.store||root!==t.root||String(root.internalId)!==t.rootId||root.data?.loaded!==true||root.data?.loading||store.isLoading?.()
    ||views.some((v,i)=>v?.el?.dom!==grids[i][0]||v.getStore?.()!==store))return null;
  let count=0,matches=0,valid=true;const seen=new Set();
  const walk=rs=>{if(!Array.isArray(rs)){valid=false;return;}for(const r of rs){if(++count>2000||!r?.isModel||seen.has(r)){valid=false;return;}seen.add(r);if(String(r.internalId)===process.record_id){if(r!==t.record){valid=false;return;}matches++;}walk(r.childNodes);if(!valid)return;}};walk(root.childNodes);
  if(!valid||matches!==1||t.record.data!==t.recordData||t.record.data.ModelNode!==t.nodeData||String(t.record.data.id)!==t.processId||t.record.parentNode!==t.parent)return null;
  for(const [grid] of grids){const rows=[...grid.querySelectorAll('table.x-grid-item-selected')];if(rows.length!==1||rows[0].getAttribute('data-recordid')!==process.record_id||rows[0].getAttribute('data-boundview')!==grid.id)return null;}
  if([...document.querySelectorAll('[role="dialog"],.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return null;
  const tab=t.tab,rect=tab.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2,hit=document.elementFromPoint(x,y);
  if(!tab.checkVisibility({checkVisibilityCSS:true})||rect.width<=0||rect.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!(hit===tab||tab.contains(hit)))return null;
  const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
  if(!state?.observer)return null;state.captureMutations(state.observer.takeRecords());
  return {tab_tid:binding.workflow_ref.tab_tid,node_id:binding.node.node_id,record_id:process.record_id,process_id:t.processId,root_id:t.rootId,
    document_epoch:state.epoch,revision:state.revision,x,y};
 },ticket);
 const before=await inspect();if(!before)return {restored:false};
 const fresh=await inspect();if(JSON.stringify(before)!==JSON.stringify(fresh))return {restored:false};
 await page.mouse.click(fresh.x,fresh.y,{clickCount:1,button:'left'});
 return {restored:true,proof:fresh};
}
