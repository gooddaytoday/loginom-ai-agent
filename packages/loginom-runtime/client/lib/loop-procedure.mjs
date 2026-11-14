import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function selectLoopBodyRecord(records,target){
 const matches=records.filter(r=>r.data?.target===target);
 if(matches.length!==1)throw Error('Loop: unique native body identity required');
 return matches[0];
}
export function loopSettingsSupported(s){
 return s.group===true&&s.group_kind==='Фиксированный размер групп'&&s.group_size==='1'
  &&s.parallel===false&&s.identifiers===false&&s.ignore_errors===false&&s.variable===''
  &&s.save_configuration===false;
}
// Cached graph and UI tree only: never invoke proxy getters/server methods.
export function readLoopSourceBrowser(t){
 const need=(v,m)=>{if(!v)throw Error('Loop: '+m);};
 const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
 need(p?.document===document&&p.id===t.document_id&&location.origin===t.origin&&app?.Version===t.build,'prepared document changed');
 const rs=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===t.workflow_ref.workflow_id);
 const record=rs.find(r=>r.nodeTargetWorkflowNode);need(record,'prepared workflow not bound');
 const tabs=document.querySelectorAll('[data-tid='+JSON.stringify(t.workflow_ref.tab_tid)+']');
 need(tabs.length===1&&tabs[0]===record.tab&&tabs[0].classList.contains('x-tab-active'),'active tab changed');
 const c=app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller,d=c.FController?.FDiagram;
 need(c.FController instanceof app.ModelForm&&d?.FNodes?.FCollection?.length<=200,'owned graph required');
 let w=c.Node.data.node;while(w&&!(w instanceof app.WorkFlowTreeNode))w=w.ParentNode;
 need(w===record.nodeTargetWorkflowNode,'workflow changed');
 const one=xs=>{need(xs.length===1,'unique native node required');return xs[0];};
 const body=one(d.FNodes.FCollection.filter(n=>n.FGuid===t.body.node_id));
 need(body.FIconCls==='bg-vendor-icon-modelgeneric'&&body.FLocked===false,'body must be an unlocked Supernode');
 const tree=one(w.FSubNodes.FItems.filter(n=>n.FGuid===body.FGuid));
 need(tree.FModelNode===body.data&&tree.ParentNode===w,'body tree identity changed');
 const ports=n=>{
  const ps=n.FPorts.flatMap(g=>g.FCollection);
  need(ps.length===2&&ps.every(p=>p.parent===n&&p.FCell.parent===n.FCell&&p.FSubType===1&&[0,1].includes(p.FType)),'one table input/output without variables required');
  return [0,1].map(direction=>{const p=one(ps.filter(p=>p.FType===direction));
   need(p.FPortIndex===0&&typeof p.FGuid==='string'&&typeof p.FDisplayName==='string','port identity unavailable');
   return {direction:direction===0?'input':'output',index:0,guid:p.FGuid,label:p.FDisplayName,kind:'table'};});
 };
 const result={body:{...t.body},label:body.FLabel.FRawValue,proxy:{...body.data.__ObjectId},ports:ports(body)};
 need(typeof result.proxy.Module==='string'&&Number.isSafeInteger(result.proxy.Instance),'body proxy identity unavailable');
 if(t.source)need(JSON.stringify(result.proxy)===JSON.stringify(t.source.proxy)
  &&JSON.stringify(result.ports)===JSON.stringify(t.source.ports),'body identity or ports changed since selection');
 if(t.loop){
  const loop=one(d.FNodes.FCollection.filter(n=>n.FGuid===t.loop.node_id));
  need(loop.FIconCls==='bg-vendor-icon-loop','target is not Loop');
  const actual=ports(loop);need(actual.every((p,i)=>p.guid===result.ports[i].guid),'live inherited ports differ from body');
  result.actual_ports=actual;
 }
 return result;
}
export function makeLoopSourceCode(t){return `async page=>page.evaluate(${readLoopSourceBrowser.toString()},${JSON.stringify(t)})`;}
export function makeLoopConfigureCode(binding,options){
 validatePreparedNodeContext(binding);
 return `async page=>(${configureLoopBrowser.toString()})(page,${JSON.stringify({...options,binding})},${readPreparedNodeContext.toString()},${selectLoopBodyRecord.toString()},${loopSettingsSupported.toString()})`;
}
export async function configureLoopBrowser(page,t,readNode=readPreparedNodeContext,selectRecord=selectLoopBodyRecord,supported=loopSettingsSupported){
 let effect=false,owner;
 const need=(v,m)=>{if(!v)throw Error('Loop: '+m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const b=t.binding,root=b.workflow_ref.prefix+';WizrdMCF',first=root+';LoopNodeWizard',params=root+';LoopParamsWizard';
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const remaining=()=>{const n=t.deadline-Date.now();need(n>0,'original deadline expired');return n;};
 const guard=async()=>{
  remaining();const n=await readNode(page,b);need(n.verified&&n.surface==='wizard'&&!n.input_port&&!n.output_port,'owned node wizard required');
  need(!owner||same(n,owner),'wizard owner changed');owner??=n;
  need(await page.evaluate(({origin,build,root})=>location.origin===origin&&bg.app.Version===build
   &&document.querySelectorAll('[data-tid='+JSON.stringify(root)+']').length===1
   &&![...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})),{origin:t.origin,build:t.build,root}),'origin/build, mask or dialog changed');
 };
 const bodyRow=async()=>{
  await guard();const rows=await page.evaluate(({b,t,first})=>{
   const need=(v,m)=>{if(!v)throw Error('Loop: '+m);};
   const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;
   let w=c.Node.data.node;while(w&&!(w instanceof bg.app.WorkFlowTreeNode))w=w.ParentNode;
   const ns=w?.FSubNodes.FItems.filter(n=>n.FGuid===t.parameters.body.node_id);need(ns?.length===1,'body tree changed');const n=ns[0];
   need(n.FModelNode.__ObjectId.Module===t.source.proxy.Module&&n.FModelNode.__ObjectId.Instance===t.source.proxy.Instance,'body proxy changed');
   const es=document.querySelectorAll('[data-tid='+JSON.stringify(first+';pnlNodesTree')+']');need(es.length===1,'unique node tree required');
   const grid=Ext.getCmp(es[0].id),store=grid?.getStore(),roots=store?.getRoot()?.childNodes;
   need(grid?.el.dom===es[0]&&roots?.length===2&&roots[0].data.nodeType===3&&roots[0].data.loaded===true&&!store.isLoading(),'complete current-module tree required');
   const records=roots[0].childNodes;need(records.length<=200,'body inventory exceeds bound');
   return records.map(r=>{
    if(r.data.target!==n.FModelNode)return {data:{target:false}};
    need(r.data.nodeType===4&&r.data.iconCls==='bg-vendor-icon-modelgeneric','only Supernode body supported');
    const row=grid.getView().getNode(r);need(row&&grid.getView().getRecord(row)===r&&es[0].contains(row),'body row is not rendered');
    const boxes=[...row.querySelectorAll('[data-tid$=";TreeCheckbox"]')];need(boxes.length===1,'body checkbox ambiguous');
    return {data:{target:true},record_id:String(r.internalId),tid:boxes[0].getAttribute('data-tid'),checked:r.data.checked===true,label:r.data.text};
   });
  },{b,t,first});return selectRecord(rows,true);
 };
 const click=async(tid,identity)=>{
  await guard();const e=at(tid);need(await e.count()===1,'unique rendered control required: '+tid);
  await e.click({trial:true,timeout:remaining()});const before=identity&&await identity();await guard();
  if(identity)need(same(before,await identity()),'control identity changed before gesture');
  effect=true;await e.click({timeout:remaining()});
 };
 const settle=async(read,ready)=>{
  let previous;
  while(remaining()){
   await guard();const s=await read();if(ready(s)&&previous&&same(previous,s))return s;
   previous=ready(s)?s:null;await new Promise(r=>setTimeout(r,200));
  }
 };
 const value=async(name)=>at(params+';'+name).locator('input:visible').inputValue();
 const settings=async()=>{
  const checked=tid=>at(tid).evaluate(e=>e.classList.contains('x-form-cb-checked'));
  return {group:await checked(params+';pedLoopKind;ValueControl;radiofield-2'),group_kind:await value('pedGroupProcessingKind;ValueControl'),group_size:await value('pedGroupSize;ValueControl'),
   parallel:await checked(params+';pedParallelProcessing;ValueControl'),identifiers:await checked(params+';pedAppendIterationIdentifiers;ValueControl'),ignore_errors:await checked(params+';pedIgnoreErrors;ValueControl'),
   variable:await value('cbxLoopVariable'),save_configuration:await page.evaluate(first=>{
    const e=document.querySelector('[data-tid='+JSON.stringify(first+';chkSaveOwnConfguration')+']');return e?.classList.contains('x-form-cb-checked')??true;
   },first)};
 };
 try{
  await guard();
  const expanded=await page.evaluate(first=>{const e=document.querySelector('[data-tid='+JSON.stringify(first+';pnlNodesTree')+']');return Ext.getCmp(e.id).getStore().getRoot().childNodes[0].data.expanded===true;},first);
  if(!expanded)await click(first+';colText_Root>Узлы_в_текущем_модуле;TreeExpander');
  const row=await bodyRow();
  if(!row.checked)await click(row.tid,bodyRow);
  const selected=await settle(bodyRow,r=>r.checked===true&&r.record_id===row.record_id);
  const save=first+';chkSaveOwnConfguration';
  if(await at(save).evaluate(e=>e.classList.contains('x-form-cb-checked')))await click(save+';DisplayEl',bodyRow);
  await click(root+';btnNext',bodyRow);await at(params).waitFor({state:'visible',timeout:remaining()});
  const group=params+';pedLoopKind;ValueControl;radiofield-2';
  if(!await at(group).evaluate(e=>e.classList.contains('x-form-cb-checked')))await click(group+';DisplayEl');
  await at(params+';pedGroupSize;ValueControl').waitFor({state:'visible',timeout:remaining()});
  const observed=await settle(settings,supported);
  const native=await page.evaluate(({root,params})=>{
   const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
   const first=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopNodeWizard')?.FWizard;
   const p=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard')?.FWizard;
   const sockets=p?.FSocketStore?.getRange();
   if(p?.FInputVariablesStore.getCount()!==0||p.FOutputVariablesStore.getCount()!==0||sockets?.length!==1
    ||JSON.stringify(p.FItems.cbxSourceSocket.value)!==JSON.stringify(sockets[0].data.Value))throw Error('Loop: one table source and no variables required');
   const id=first?.FReferencedVendor?.__ObjectId;if(typeof id?.Module!=='string'||!Number.isSafeInteger(id.Instance))throw Error('Loop: derived vendor identity unavailable');
   return {derived_component:{module:id.Module,instance:id.Instance},input_label:sockets[0].data.DisplayText,reference_label:p.FItems.txtReferenceNode.inputEl.dom.value};
  },{root,params});
  need(native.reference_label===selected.label&&native.input_label===t.source.ports[0].label,'selected body/port readback differs');
  await click(root+';btnNext');await at(root+';DoneWizard').waitFor({state:'visible',timeout:remaining()});await guard();
  return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effect,node_context:owner,validation:{status:'accepted_by_loginom_next',node_context:owner},
   configuration:{verified:true,node_context:owner,mode:'group_rows',body:{ref:t.parameters.body,label:selected.label},derived_component:native.derived_component,input_port:t.source.ports[0],settings:observed}};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:!effect,effect_possible:effect,node_context:owner??null,error:String(error.message).slice(0,1500)};}
}
export function makeLoopInspectCode(binding,t){
 validatePreparedNodeContext(binding);
 const task={...t,document_id:binding.document_id,workflow_ref:binding.workflow_ref,body:t.parameters.body,loop:binding.node};
 return `async page=>{const n=await (${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)});if(!n.verified||n.surface!=='graph')throw Error('Loop graph owner changed');const s=await page.evaluate(${readLoopSourceBrowser.toString()},${JSON.stringify(task)});return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,node_context:n,...s}}`;
}
