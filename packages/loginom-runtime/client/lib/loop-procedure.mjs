import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function selectLoopBodyRecord(records,target){
 const matches=records.filter(r=>r.data?.target===target);
 if(matches.length!==1)throw Error('Loop: unique native body identity required');
 return matches[0];
}
export function loopSettingsSupported(s,expected){
 if(expected?.mode==='for')return s.for===true&&s.count===String(expected.count)&&s.count_literal===true
  &&s.parallel===false&&s.identifiers===(expected.iteration_identifiers??false)&&s.ignore_errors===false
  &&s.save_configuration===false&&s.variable_identity?.definition_id===expected.variable.definition_id
  &&s.variable_identity?.port_guid===expected.variable.port_guid&&s.variable_identity.type==='integer';
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
 const variable=t.mode==='for'||t.source?.mode==='for';
 const ports=n=>{
  const ps=n.FPorts.flatMap(g=>g.FCollection);
  need(ps.length===2&&ps.every(p=>p.parent===n&&p.FCell.parent===n.FCell&&p.FSubType===(variable&&p.FType===0?3:1)&&[0,1].includes(p.FType)),'one table input/output without variables required');
  return [0,1].map(direction=>{const p=one(ps.filter(p=>p.FType===direction));
   let zero=p.FPortIndex===0;
   if(p.FPortIndex===undefined){
    const g=d.FmxGraph,e=g?.view?.getState(p.FCell)?.shape?.node,tid=e?.getAttribute('data-tid');
    zero=typeof tid==='string'&&tid.startsWith(t.workflow_ref.prefix+';Graph;')
     &&tid.endsWith(';'+(direction===0?'Input':'Output')+(variable&&direction===0?'_Var-0':'_Data-0'))&&g.container.contains(e)
     &&g.container.querySelectorAll('[data-tid='+JSON.stringify(tid)+']').length===1;
   }
   need(zero&&typeof p.FGuid==='string'&&typeof p.FDisplayName==='string','port identity unavailable');
   return {direction:direction===0?'input':'output',index:0,guid:p.FGuid,label:p.FDisplayName,kind:variable&&direction===0?'variables':'table'};});
 };
 const result={body:{...t.body},label:body.FLabel.FRawValue,proxy:{...body.data.__ObjectId},ports:ports(body),mode:variable?'for':'group_rows',...(variable?{variables:t.variables??t.source?.variables}:{})};
 if(variable)need(result.variables?.port_guid===result.ports[0].guid,'observed variable boundary port differs');
 need(typeof result.proxy.Module==='string'&&Number.isSafeInteger(result.proxy.Instance),'body proxy identity unavailable');
 if(t.source)need(JSON.stringify(result.proxy)===JSON.stringify(t.source.proxy)
  &&JSON.stringify(result.ports)===JSON.stringify(t.source.ports),'body identity or ports changed since selection');
 if(t.loop){
  const loop=one(d.FNodes.FCollection.filter(n=>n.FGuid===t.loop.node_id));
  need(loop.FIconCls==='bg-vendor-icon-loop','target is not Loop');
  const actual=t.allow_unconfigured&&loop.FPorts.flatMap(g=>g.FCollection).length===0?[]:ports(loop);need(actual.every((p,i)=>p.guid===result.ports[i].guid),'live inherited ports differ from body');
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
 let effect=false,owner,waitingFor='wizard_ready',lastSettings;
 const need=(v,m)=>{if(!v)throw Error('Loop: '+m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const b=t.binding,root=b.workflow_ref.prefix+';WizrdMCF',first=root+';LoopNodeWizard',params=root+';LoopParamsWizard';
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const remaining=()=>{const n=t.deadline-Date.now();if(n<=0){const e=Error('LOOP_CONFIGURATION_DEADLINE: waiting for '+waitingFor+'; partial wizard retained; inspect/release original operation, then configure SAME target with body again');e.code='LOOP_CONFIGURATION_DEADLINE';throw e;}return n;};
 const guard=async()=>{
  for(;;){
   remaining();const n=await readNode(page,b);need(n.verified&&n.surface==='wizard'&&!n.input_port&&!n.output_port,'owned node wizard required');
   need(!owner||same(n,owner),'wizard owner changed');owner??=n;
   const s=await page.evaluate(({origin,build,root})=>{
    const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
    const grids=document.querySelectorAll('[data-tid='+JSON.stringify(root+';LoopParamsWizard;grdDataSet')+']');
    const grid=grids.length===1&&grids[0],native=grid&&globalThis.Ext?.getCmp(grid.id);
    const group=document.querySelector('[data-tid='+JSON.stringify(root+';LoopParamsWizard;pedLoopKind;ValueControl;radiofield-2')+']');
    const disabledKeyMask=e=>e.classList.contains('x-mask')&&grid&&grid.contains(e)
     &&native?.el?.dom===grid&&native.$className==='Ext.grid.Panel'&&native.disabled===true
     &&(group?.classList.contains('x-form-cb-checked')||document.querySelector('[data-tid='+JSON.stringify(root+';LoopParamsWizard;pedLoopKind;ValueControl;radiofield')+']')?.classList.contains('x-form-cb-checked'))&&!Array.from(e.querySelectorAll('.x-mask-msg')).some(visible);
    return {compatible:location.origin===origin&&bg.app.Version===build
     &&document.querySelectorAll('[data-tid='+JSON.stringify(root)+']').length===1,
     dialog:[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog')].some(visible),
     masked:[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>visible(e)&&!disabledKeyMask(e))};
   },{origin:t.origin,build:t.build,root});
   need(s.compatible,'origin/build or root changed');need(!s.dialog,'dialog changed');
   if(!s.masked)return;waitingFor='wizard_blocker';
   // Body selection builds the derived component asynchronously. While masked,
   // only reread the pinned owner; no gesture is authorized until it is quiet.
   await page.waitForTimeout(Math.min(100,remaining()));
  }
 };
 const bodyRow=async()=>{
  waitingFor='body_selection';await guard();const rows=await page.evaluate(({b,t,first})=>{
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
  waitingFor='control '+tid;await guard();const e=at(tid);need(await e.count()===1,'unique rendered control required: '+tid);
  await e.click({trial:true,timeout:remaining()});const before=identity&&await identity();await guard();
  if(identity)need(same(before,await identity()),'control identity changed before gesture');
  effect=true;await e.click({timeout:remaining()});
 };
 const settle=async(read,ready)=>{
  let previous;
  while(remaining()){
   await guard();const s=await read();lastSettings=s;if(ready(s)&&previous&&same(previous,s))return s;
   previous=ready(s)?s:null;await page.waitForTimeout(Math.min(200,remaining()));
  }
 };
 const value=async(name)=>at(params+';'+name).locator('input:visible').inputValue();
 const forMode=t.source.mode==='for';
 const variableRecord=async()=>page.evaluate(({params,source,selection})=>{
  const need=(v,m)=>{if(!v)throw Error('Loop variable: '+m);};
  const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const w=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard')?.FWizard;
  const e=document.querySelector('[data-tid='+JSON.stringify(params+';cbxLoopVariable')+']'),combo=e&&Ext.getCmp(e.id),store=w?.FInputVariablesStore;
  const records=store?.getData()?.items;
  need(combo?.el.dom===e&&combo.getStore()===store&&!store.isLoading()&&!store.isBufferedStore&&records?.length===store.getCount()
   &&records.length===source.variables.definitions.length&&(!store.getData().getSource?.()||store.getData().getSource().items.length===records.length),'complete bound variable store required');
  const definitions=source.variables.definitions.filter(d=>d.id===selection.definition_id);need(definitions.length===1&&selection.port_guid===source.variables.port_guid,'definition ID differs');
  const definition=definitions[0],matches=records.filter(r=>r.data.Name===definition.name&&r.data.DataType===4);need(matches.length===1,'unique integer definition required');
  const r=matches[0],d=r.data,id=d.Value,proxy=d.Variable?.__ObjectId;
  need(r.isModel&&id?.Module===proxy?.Module&&id.Instance===proxy?.Instance&&typeof id.Module==='string'&&Number.isSafeInteger(id.Instance),'native variable identity required');
  const selected=combo.getSelection(),picker=combo.isExpanded?combo.getPicker():null,row=picker?.getNode(r);
  const tid=row?.getAttribute('data-tid');
  if(row)need(picker.getRecord(row)===r&&picker.el.dom.contains(row)&&typeof tid==='string'&&document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']').length===1,'unique rendered variable identity required');
  return {port_guid:selection.port_guid,definition_id:definition.id,name:d.Name,type:'integer',label:d.DisplayText,proxy:{module:id.Module,instance:id.Instance},record_id:String(r.internalId),selected:selected===r,tid:tid??null};
 },{params,source:t.source,selection:t.parameters.variable});
 const settings=async()=>{
  const checked=tid=>at(tid).evaluate(e=>e.classList.contains('x-form-cb-checked'));
  return {...(forMode?{for:await checked(params+';pedLoopKind;ValueControl;radiofield'),count:await value('pedIterationCount;ValueControl'),count_literal:await page.evaluate(params=>{const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;const p=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard').FWizard;return p.FItems.pedIterationCount.Controller.GetActiveMode()===0;},params),variable_identity:await variableRecord()}:{}),group:await checked(params+';pedLoopKind;ValueControl;radiofield-2'),...(forMode?{}:{group_kind:await value('pedGroupProcessingKind;ValueControl'),group_size:await value('pedGroupSize;ValueControl')}),
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
  if(await at(save).evaluate(e=>e.classList.contains('x-form-cb-checked'))){need(!forMode,'save_configuration is unsupported');await click(save+';DisplayEl',bodyRow);}
  await click(root+';btnNext',bodyRow);await at(params).waitFor({state:'visible',timeout:remaining()});
  let observed;
  if(forMode){
   const initial=await settings();
   need(initial.for&&initial.count_literal&&!initial.parallel&&!initial.ignore_errors&&!initial.save_configuration,'unsupported existing FOR settings; no conversion');
   const input=at(params+';pedIterationCount;ValueControl').locator('input:visible');
   await guard();need(await input.count()===1,'unique count control required');effect=true;
   await input.fill(String(t.parameters.count),{timeout:remaining()});await input.press('Tab',{timeout:remaining()});
   await click(params+';cbxLoopVariable;trg_picker');
   const candidate=await variableRecord();need(candidate.tid,'selected native variable row not rendered');
   await click(candidate.tid,variableRecord);
   const identifiers=params+';pedAppendIterationIdentifiers;ValueControl';
   if(await at(identifiers).evaluate(e=>e.classList.contains('x-form-cb-checked'))!==(t.parameters.iteration_identifiers??false))await click(identifiers+';DisplayEl');
   waitingFor='for_settings';observed=await settle(settings,s=>s.variable_identity.selected&&supported(s,{...t.parameters,mode:'for'}));
  }else{
   const group=params+';pedLoopKind;ValueControl;radiofield-2';
   if(!await at(group).evaluate(e=>e.classList.contains('x-form-cb-checked')))await click(group+';DisplayEl');
   await at(params+';pedGroupSize;ValueControl').waitFor({state:'visible',timeout:remaining()});
   waitingFor='group_rows_settings';observed=await settle(settings,supported);
  }
  const native=await page.evaluate(({params,forMode})=>{
   const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
   const p=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard')?.FWizard;
   const sockets=p?.FSocketStore?.getRange();
   if(p.FOutputVariablesStore.getCount()!==0||sockets?.length!==(forMode?0:1)
    ||!forMode&&(p.FInputVariablesStore.getCount()!==0||JSON.stringify(p.FItems.cbxSourceSocket.value)!==JSON.stringify(sockets[0].data.Value)))throw Error('Loop: unsupported source sockets');
   return {input_label:forMode?null:sockets[0].data.DisplayText,reference_label:p.FItems.txtReferenceNode.inputEl.dom.value};
  },{params,forMode});
  need(native.reference_label===selected.label&&(forMode||native.input_label===t.source.ports[0].label),'selected body/port readback differs');
  await click(root+';btnNext');await at(root+';DoneWizard').waitFor({state:'visible',timeout:remaining()});await guard();
  return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effect,node_context:owner,validation:{status:'accepted_by_loginom_next',node_context:owner},
   configuration:{verified:true,node_context:owner,mode:forMode?'for':'group_rows',body:{ref:t.parameters.body,label:selected.label},input_port:t.source.ports[0],settings:observed}};
 }catch(error){return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:!effect,effect_possible:effect,node_context:owner??null,error:String(error.message).slice(0,1500),error_code:error.code??'LOOP_CONFIGURATION_UNCONFIRMED',waiting_for:waitingFor,last_settings:lastSettings??null};}
}
export function makeLoopInspectCode(binding,t){
 validatePreparedNodeContext(binding);
 const task={...t,document_id:binding.document_id,workflow_ref:binding.workflow_ref,body:t.parameters.body,loop:binding.node};
 return `async page=>{const n=await (${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)});if(!n.verified||n.surface!=='graph')throw Error('Loop graph owner changed');const s=await page.evaluate(${readLoopSourceBrowser.toString()},${JSON.stringify(task)});return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,node_context:n,...s}}`;
}

export function makeLoopVendorCode(binding,t){
 validatePreparedNodeContext(binding);
 return `async page=>{const n=await (${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)});if(!n.verified||n.surface!=='wizard')throw Error('Loop vendor owner changed');
 const v=await page.evaluate(t=>{if(location.origin!==t.origin||bg.app.Version!==t.build)throw Error('Loop origin/build changed');
 const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
 const ws=c.FWizardItems.FItems.filter(i=>i.FWizard.constructor.name==='LoopNodeWizard');
 if(ws.length!==1)throw Error('Loop selection page required');const id=ws[0].FWizard.FReferencedVendor?.__ObjectId;
 if(typeof id?.Module!=='string'||!Number.isSafeInteger(id.Instance))throw Error('Loop: saved derived vendor identity unavailable');
 return {module:id.Module,instance:id.Instance};},${JSON.stringify(t)});
 const saved=${t.source?.mode==='for'?`await (${readSavedLoopForBrowser.toString()})(page,${JSON.stringify({...t,binding})})`:'null'};
 return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,node_context:n,derived_component:v,...(saved?{saved_configuration:saved}:{})}}`;
}

// Inspect the saved wizard without filling controls or committing settings.
export async function readSavedLoopForBrowser(page,t){
 const root=t.binding.workflow_ref.prefix+';WizrdMCF',params=root+';LoopParamsWizard';
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']:visible');
 const remaining=()=>Math.max(1,t.deadline-Date.now());
 await at(root+';btnNext').click({timeout:remaining()});
 await at(params).waitFor({state:'visible',timeout:remaining()});
 return page.evaluate(({params,source,parameters})=>{
  const need=(v,m)=>{if(!v)throw Error('Loop saved FOR: '+m);};
  const exact=tid=>document.querySelector('[data-tid='+JSON.stringify(params+';'+tid)+']');
  const checked=tid=>exact(tid)?.classList.contains('x-form-cb-checked');
  const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const p=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard')?.FWizard;
  need(p&&checked('pedLoopKind;ValueControl;radiofield')&&!checked('pedParallelProcessing;ValueControl')
   &&!checked('pedIgnoreErrors;ValueControl')&&p.FItems.pedIterationCount.Controller.GetActiveMode()===0,'unsupported saved settings');
  const count=Number(exact('pedIterationCount;ValueControl')?.querySelector('input')?.value);
  need(Number.isSafeInteger(count)&&count>0&&count===parameters.count,'count differs');
  const combo=p.FItems.cbxLoopVariable,store=p.FInputVariablesStore,records=store.getData()?.items,selected=combo.getSelection();
  need(!store.isLoading()&&!store.isBufferedStore&&records?.length===store.getCount()&&records.includes(selected)
   &&combo.getStore()===store&&p.FOutputVariablesStore.getCount()===0&&p.FSocketStore.getCount()===0,'complete variable selection required');
  const definition=source.variables.definitions.filter(d=>d.id===parameters.variable.definition_id);
  need(definition.length===1&&parameters.variable.port_guid===source.variables.port_guid,'saved definition ID differs');
  const d=selected.data,id=d.Value;
  need(d.Name===definition[0].name&&d.DataType===4&&records.filter(r=>r.data.Name===d.Name).length===1
   &&d.Variable?.__ObjectId.Module===id?.Module&&d.Variable.__ObjectId.Instance===id?.Instance
   &&combo.inputEl.dom.value===d.DisplayText,'saved native selection differs');
  const identifiers=checked('pedAppendIterationIdentifiers;ValueControl');need(identifiers===(parameters.iteration_identifiers??false),'identifiers differ');
  return {mode:'for',count,iteration_identifiers:identifiers,variable:{port_guid:source.variables.port_guid,definition_id:definition[0].id,name:d.Name,type:'integer',proxy:{module:id.Module,instance:id.Instance}}};
 },{params,source:t.source,parameters:t.parameters});
}
