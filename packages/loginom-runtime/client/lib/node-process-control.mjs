import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {expectedExecutionStopProof} from './node-execution-evidence.mjs';

// Host-only Stop admission. A fresh typed observation replaces the old generic
// UI observation; it never grants arbitrary click or waives workspace UI epochs.
export function makeNodeProcessControlCode(binding,snapshot,action,execution,options) {
 validatePreparedNodeContext(binding);
 if(!options||Object.keys(options).sort().join(',')!=='build,deadline,operation_id,origin'
  ||!Number.isFinite(options.deadline)||typeof options.operation_id!=='string'||!options.operation_id
  ||typeof options.origin!=='string'||typeof options.build!=='string')throw Error('Fixed Stop dispatch options required');
 const proof=expectedExecutionStopProof(execution,snapshot.node_processes);
 const target=snapshot.ui.elements.filter(e=>e.ref===action.ref),element=target[0];
 if(target.length!==1||!['right_click','cancel_process'].includes(action.verb)
   ||!element.allowed_actions.includes(action.verb)||snapshot.prepared_node_context?.verified!==true
   ||snapshot.prepared_node_context.surface!=='graph'
   ||['document_id','workflow_id','node_id'].some(k=>snapshot.prepared_node_context[k]!==execution.node[k])
   ||execution.node.document_id!==binding.document_id||execution.node.workflow_id!==binding.workflow_ref.workflow_id
   ||execution.node.node_id!==binding.node.node_id||options.deadline<=Date.now()
   ||action.verb==='right_click'&&element.process_row?.record_id!==proof.record_id
   ||action.verb==='cancel_process'&&JSON.stringify(element.process_menu?.cancellation)!==JSON.stringify(proof))
   throw Error('Exact owned Stop control admission required');
 const task={binding,action,proof,group_record_id:execution.group_record_id,group_id:execution.group_id,
  element:{ref:element.ref,tid:element.tid},...options};
 return `async page=>{const readNode=${readPreparedNodeContext.toString()},inspect=${inspectNodeProcessControl.toString()};return (${runNodeProcessControl.toString()})(page,${JSON.stringify(task)},readNode,inspect)}`;
}

// Serialized, synchronous inspection. Retain live objects, not names alone;
// no model proxy dereference, RPC, DOM write or synthetic event dispatch.
export function inspectNodeProcessControl({task,held=null}) {
 const need=(ok,message)=>{if(!ok)throw Error(message);};
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const {binding,proof,element}=task,p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 need(Date.now()<task.deadline&&location.origin===task.origin&&app?.Version===task.build,'deadline/origin/build');
 need(p?.document===document&&p.id===binding.document_id,'prepared document');
 const receipts=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===binding.workflow_ref.workflow_id);
 const receipt=receipts.find(r=>r.nodeTargetWorkflowNode),tabs=exact(binding.workflow_ref.tab_tid);
 need(receipt&&tabs.length===1&&tabs[0]===receipt.tab&&tabs[0].classList.contains('x-tab-active')
  &&receipts.every(r=>r.tab===receipt.tab&&r.packageNode===receipt.packageNode),'workflow receipt');
 const workspace=app.Application?.FInstance?.FMainForm?.Items?.Workspace,card=workspace?.getActiveTab?.(),model=card?.Controller?.FController;
 need(app.ModelForm&&model instanceof app.ModelForm&&card.tab?.el?.dom===receipt.tab,'graph owner');
 const navigationNode=card.Controller?.Node?.data?.node,ancestors=[];
 let workflow,packageNode;
 for(let n=navigationNode;n&&ancestors.length<32&&!ancestors.includes(n);n=n.ParentNode){
  ancestors.push(n);if(app.WorkFlowTreeNode&&n instanceof app.WorkFlowTreeNode)workflow=n;
  if(app.PackageTreeNode&&n instanceof app.PackageTreeNode){packageNode=n;break;}
 }
 need(workflow===receipt.nodeTargetWorkflowNode&&packageNode===receipt.packageNode,'native workflow ancestry');
 const nodes=model.FDiagram?.FNodes?.FCollection;
 need(Array.isArray(nodes)&&nodes.length<=200,'node cache');
 const owners=nodes.filter(n=>n.FGuid===proof.node_id),owner=owners[0];
 need(owners.length===1&&owner.data&&nodes.filter(n=>n.data===owner.data).length===1,'native node owner');
 const panels=['ConsoleForm','MF;ConsoleForm'].flatMap(exact),panel=panels[0];
 need(panels.length===1,'console panel');
 const base=panel.getAttribute('data-tid')+';ProgressForm;';
 const grids=['treepanel;tree','grd;tbl'].map(s=>exact(base+'trpProgress;'+s));
 need(grids.every(es=>es.length===1&&panel.contains(es[0])),'console grids');
 const views=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id)),store=views[0]?.getStore?.(),root=store?.getRoot?.()??store?.getRootNode?.();
 need(store?.$className==='Ext.data.TreeStore'&&!store.isLoading?.()&&root?.isModel
  &&String(root.internalId)===proof.root_id&&root.data?.loaded===true&&!root.data.loading
  &&views.every((v,i)=>v?.el?.dom===grids[i][0]&&v.getStore?.()===store),'native console binding');
 let visited=0;const records=[],seen=new Set(),ids=new Set();
 const walk=(children,parent)=>{need(Array.isArray(children),'tree children');for(const r of children){
  const id=String(r?.data?.id??'');
  need(++visited<=2000&&r?.isModel&&!seen.has(r)&&!ids.has(String(r.internalId))&&String(r.internalId)
   &&!r.data.loading&&/^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/.test(id)
   &&(parent===null?!id.includes('.'):id.slice(0,id.lastIndexOf('.'))===parent),'tree identity');
  seen.add(r);ids.add(String(r.internalId));records.push(r);walk(r.childNodes,id);
 }};walk(root.childNodes,null);
 const matches=records.filter(r=>String(r.internalId)===proof.record_id),record=matches[0];
 const groups=records.filter(r=>String(r.internalId)===task.group_record_id),group=groups[0];
 need(matches.length===1&&groups.length===1&&String(record.data.id)===proof.process_id
  &&String(group.data.id)===task.group_id&&group.childNodes.includes(record)&&group.data.loaded===true
  &&record.data.ModelNode===owner.data&&record.data.CanCancelProcess===true&&record.data.Status!==3,'owned cancellable child');
 const states=String(record.data.ProgressBarCls??'').split(/\s+/).filter(c=>c.startsWith('bg-progress-ptps'));
 need(states.length===1&&['bg-progress-ptpsProcessing','bg-progress-ptpsNotResponding'].includes(states[0]),'native running state');
 const rows=grids.map(([g])=>[...g.querySelectorAll('table.x-grid-item')].filter(r=>r.getAttribute('data-recordid')===proof.record_id));
 need(rows.every((rs,i)=>rs.length===1&&rs[0].getAttribute('data-boundview')===grids[i][0].id),'rendered child binding');
 const row=rows[0][0],index=Number(row.getAttribute('data-recordindex'));
 need(Number.isSafeInteger(index)&&index>=0&&store.getAt?.(index)===record
  &&rows[1][0].getAttribute('data-recordindex')===String(index),'native rendered ordinal');
 const cells=[...row.querySelectorAll('td[data-tid]')].filter(e=>e.getAttribute('data-tid')?.startsWith(base+'colProcess_'));
 const controls=exact(element.tid),control=controls[0],state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
 need(cells.length===1&&controls.length===1&&state?.observer&&state.ids.get(control)===element.ref,'opaque process control');
 if(task.action.verb==='right_click')need(control===cells[0],'owned row target');
 if(task.action.verb==='cancel_process'){
  need(element.tid==='mnContextMenu;mniCancel'&&rows.every(rs=>rs[0].classList.contains('x-grid-item-selected')),'selected cancel owner');
  const menus=exact('mnContextMenu');need(menus.length===1&&menus[0].contains(control),'cancel menu owner');
  need(['mniShowNodeToProcess','mniShowCompletedProcesses'].every(s=>exact('mnContextMenu;'+s).length===1),'native process menu');
 }
 const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
  &&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 need(visible(panel)&&grids.every(es=>visible(es[0]))&&visible(control)
  &&control.getAttribute('aria-disabled')!=='true'&&!control.closest('.x-item-disabled,.x-btn-disabled,.x-menu-item-disabled'),'enabled visible control');
 need(![...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-mask,.x-mask-msg,.bg-mask-message')].some(visible),'visible blocker');
 const box=control.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
 const geometry={x:box.x,y:box.y,width:box.width,height:box.height};
 need(Object.values(geometry).every(Number.isFinite)&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight,'control geometry');
 if(task.action.verb==='right_click'){
  const g=grids[0][0].getBoundingClientRect();
  need(box.x>=g.x&&box.y>=g.y&&box.x+box.width<=g.x+g.width&&box.y+box.height<=g.y+g.height,'row clipped');
 }
 const hit=document.elementFromPoint(x,y);need(hit===control||control.contains(hit),'control covered');
 const objects={document,preparation:p,app,receipt,packageNode:receipt.packageNode,workflow:receipt.nodeTargetWorkflowNode,
  tab:receipt.tab,workspace,card,model,navigationNode,owner,nodeData:owner.data,panel,store,root,group,record,recordData:record.data,parent:record.parentNode,control};
 if(held)need(Object.keys(objects).every(k=>objects[k]===held.objects[k])
  &&grids.every((es,i)=>es[0]===held.grids[i])&&views.every((v,i)=>v===held.views[i])
  &&ancestors.length===held.ancestors.length&&ancestors.every((n,i)=>n===held.ancestors[i])
  &&rows.every((rs,i)=>rs[0]===held.rows[i])&&JSON.stringify(geometry)===JSON.stringify(held.geometry),'live process ticket changed');
 // Both checks use this new typed observation's epoch. All mutations, including
 // ABA and unrelated repaint, still invalidate the interval before dispatch.
 state.captureMutations(state.observer.takeRecords());
 const epoch={document:state.epoch,revision:state.revision};
 if(held)need(JSON.stringify(epoch)===JSON.stringify(held.epoch),'UI_EPOCH_CHANGED');
 return {objects,ancestors,grids:grids.map(es=>es[0]),views,rows:rows.map(rs=>rs[0]),geometry,epoch,point:{x,y}};
}

export async function runNodeProcessControl(page,task,readNode,inspect) {
 let held,effect=false,mouseHeld=false,phase='preconditions';const trace=[];
 const result=(status,output={},error=null)=>({status,action_key:'ui.act',action_revision:'1',operation_id:task.operation_id,
  phase,effect_possible:effect,cleanup_complete:!effect||status==='SUCCEEDED',output,error,trace});
 try {
  const before=await readNode(page,task.binding);
  if(!before.verified||before.surface!=='graph')throw Error('Prepared graph unavailable');
  held=await page.evaluateHandle(inspect,{task});
  const after=await readNode(page,task.binding);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Prepared node changed');
  const fresh=await held.evaluate((ticket,{task,inspect})=>{
   const checked=eval('('+inspect+')')({task,held:ticket});
   return {point:checked.point,epoch:checked.epoch};
  },{task,inspect:inspect.toString()});
  if(Date.now()>=task.deadline)throw Error('Stop deadline elapsed');
  trace.push({event:'process_control_preconditions_verified',proof:task.proof,epoch:fresh.epoch,point:fresh.point});
  phase='applying';effect=true;
  mouseHeld=true;await page.mouse.click(fresh.point.x,fresh.point.y,{clickCount:1,button:task.action.verb==='right_click'?'right':'left'});
  mouseHeld=false;phase='gesture_returned';trace.push({event:'ui_gesture_applied',verb:task.action.verb});
  return result('SUCCEEDED',{process_control:{proof:task.proof,verb:task.action.verb,gesture_returned:true,terminal_verified:false}});
 }catch(error){return result(effect?'AMBIGUOUS':'NOT_APPLIED',{},
  {code:error.message==='UI_EPOCH_CHANGED'?'UI_EPOCH_CHANGED':'PROCESS_CONTROL_UNCONFIRMED',message:error.message});}
 finally{if(mouseHeld)await page.mouse.up({button:task.action.verb==='right_click'?'right':'left'});if(held)await held.dispose();}
}
