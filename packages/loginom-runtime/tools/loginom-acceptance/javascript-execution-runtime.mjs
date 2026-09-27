import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {armJavascriptNativeRoundtrip,bindJavascriptNativeRoundtripGraph,completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripInput,verifyNativeRoundtripExecution,verifyNativeRoundtripProvenance,verifyNativeRoundtripOutcome} from './javascript-native-roundtrip-contract.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {waitJavascriptWizardSettlement} from './javascript-wizard-settlement.mjs';
// All generated runtime code runs against the caller's authenticated page.
// No browser launch, credentials, server RPC, or second MCP context lives here.
import {openJavascriptOutputViews,waitJavascriptViewsSettlement} from './javascript-output-opening.mjs';
import {captureJavascriptNativeTopology,connectJavascriptInput,requireJavascriptTopology,requireJavascriptGraphUnchanged} from './javascript-link-topology.mjs';
import {caseEffect} from './javascript-batch-plan.mjs';
import {characterizeJavascriptMapping,javascriptExecutionIdentity,verifyJavascriptMismatchTable,verifyJavascriptPreviousExecution} from './javascript-mismatch-probe.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createArtifactStore} from '../../client/lib/artifacts.mjs';
import {createActionRuntime,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {createTextImportNodeSupport} from '../../client/lib/text-import-node.mjs';
import {createJavascriptNativeInputSupport} from './javascript-native-input-driver.mjs';
import {verifyNativeInputFixture,nativeInputRequest,verifyNativeInputUi} from './javascript-native-input-contract.mjs';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
import {createNodeProcedure,NodeProcedureStepError} from '../../client/lib/node-procedure.mjs';
import {createNodeExecutionProcedure} from '../../client/lib/node-execution-procedure.mjs';
import {openNewOutputTable,configureTablePrecision,prepareTableRead,restoreTablePrecision,returnFromOutputTable} from '../../client/lib/node-output-procedure.mjs';
import {readTableOutputPages} from '../../client/lib/table-output-pages.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {boundWizardDeactivationConfirmation} from '../../client/lib/node-wizard-open.mjs';
import {closePreparedWizard,wizardCloseBinding} from '../../client/lib/node-wizard-close.mjs';
import {configureSeparateOutputPort} from '../../client/lib/port-mapping-procedure.mjs';
import {activatePreparedWorkflow} from '../../client/lib/node-workflow-activation.mjs';
import {javascriptInputColumns,javascriptOutputColumns,verifyJavascriptFixture,verifyJavascriptTable,createJavascriptEffectJournal} from './javascript-execution-evidence.mjs';

export function javascriptInputRequest({prepared,storage,artifact,uploadOperationId,totalMs}) {
  if(!/^\/jsteach\/js-g2-[a-f0-9-]{36}$/.test(storage))throw Error('Owned UUID input directory required');
  return {operation_id:'js-input-import',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'imports.text',label:'JSInput',position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{
      settings:{source:{source_path:storage+'/sales.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
        format:{delimiter:',',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'},columns:javascriptInputColumns.map(c=>({...c}))},
      source:{artifact_id:artifact.artifact_id,upload_operation_id:uploadOperationId,bytes:artifact.bytes,sha256:artifact.sha256}},
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},
    budgets:{configure_ms:240000,execute_ms:60000,total_ms:Math.min(600000,totalMs)}};
}

// Waiting for notification auto-close does not attribute the notification to
// this node. Only the existing fresh process-record proof can do that.
export function inspectJavascriptExecutionNotifications({binding:b,poll=false}) {
  const own=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const cached=(object,key)=>{
    for(let depth=0;object&&depth<16;depth++,object=Object.getPrototypeOf(object)){
      const descriptor=Object.getOwnPropertyDescriptor(object,key);
      if(descriptor)return 'value' in descriptor?descriptor.value:Symbol('accessor');
    }
  };
  const app=globalThis.bg?.app,card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const nodes=b.diagram?.FNodes?.FCollection;
  if(document!==b.document||location.origin!=='http://logi-test-plan.bg.local'||app?.Version!=='7.4.2'
    ||card!==b.tab||card?.Controller!==b.controller||b.controller.Node?.data?.node!==b.workflow
    ||b.controller.FController!==b.model||b.model.FDiagram!==b.diagram||b.diagram.FmxGraph!==b.graph
    ||b.graph.container!==b.container||!Array.isArray(nodes)||nodes.length>20
    ||nodes.filter(n=>n.FGuid===b.node.id).length!==1||!nodes.includes(b.native)
    ||b.native.data!==b.nodeData||b.native.FCell!==b.cell)
    throw Error('Post-execution original native graph changed');
  const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const formTid=b.node.tid?.split(';Graph;')[0]+';ModelForm',view=own(b.model,'FView'),form=own(own(view,'el'),'dom');
  const forms=[...document.querySelectorAll('[data-tid='+JSON.stringify(formTid)+']')];
  if(!view||view!==b.view||!form||form!==b.form||forms.length!==1||forms[0]!==form
    ||globalThis.Ext?.getCmp?.(form.id)!==view||!form.contains(b.container)||!visible(form))
    throw Error('Post-execution original ModelForm view changed');
  const masks=[...document.querySelectorAll('.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
  let busyContext=null;
  if(masks.length){
    const type=globalThis.bg?.ext?.AfterElementTextMaskContext,symbol=own(type,'ElementSymb');
    const context=typeof symbol==='symbol'?own(view,symbol):null;
    if(masks.length!==1||masks[0]!==form||!form.classList.contains('bg-mask-message')
      ||typeof type!=='function'||!(context instanceof type))
      throw Error('Post-execution foreign busy or modal mask');
    const sequence=own(context,'FSequence'),index=own(context,'FCurrent');
    if(own(context,'FElement')!==form||own(context,'FIsActive')!==true
      ||own(context,'FController')!==view
      ||!Array.isArray(sequence)||sequence.length<1||sequence.length>64
      ||!Number.isInteger(index)||index<0||index>=sequence.length)
      throw Error('Post-execution ModelForm mask cache unconfirmed');
    const values=Array.from({length:sequence.length},(_,i)=>own(sequence,String(i)));
    if(values.some(v=>v!==null&&typeof v!=='string')||typeof values[index]!=='string'
      ||form.getAttribute('bg-mask-text')!==values[index])
      throw Error('Post-execution ModelForm mask sequence changed');
    busyContext=context;
  }
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box,.x-toast')].filter(visible);
  if(dialogs.length>4)throw Error('Post-execution notification count exceeded');
  const toasts=dialogs.map(element=>{
    const control=globalThis.Ext?.getCmp?.(element.id),delay=own(control,'autoCloseDelay');
    const modal=cached(control,'modal'),hover=cached(control,'mouseIsOver');
    if(element.getAttribute('data-tid')!=='toast'||!globalThis.Ext?.window?.Toast
      ||!(control instanceof globalThis.Ext.window.Toast)||cached(control,'$className')!=='Ext.window.Toast'
      ||own(own(control,'el'),'dom')!==element||own(control,'autoClose')!==true
      ||!Number.isFinite(delay)||delay<=0||delay>60000||(modal!==undefined&&modal!==false)
      ||(hover!==undefined&&hover!==false)||cached(control,'closeOnMouseOut')!==false
      ||cached(control,'hideDuration')!==500)
      throw Error('Post-execution foreign dialog or unsupported notification lifecycle');
    return {element,control,delay};
  });
  const settlement=b.executionNotifications??(b.executionNotifications={toasts:null,quietSince:null});
  // Do not pin an empty toast inventory while launch is still settling. A
  // native busy phase may finish by publishing its first notification.
  if(toasts.length&&!settlement.toasts)settlement.toasts=toasts;
  if(toasts.some(t=>!settlement.toasts.some(p=>p.element===t.element&&p.control===t.control&&p.delay===t.delay)))
    throw Error('Post-execution notification replaced during passive wait');
  const blocked=masks.length>0||toasts.length>0;
  if(blocked)settlement.quietSince=null;
  if(!blocked&&settlement.quietSince===null)settlement.quietSince=performance.now();
  const quietFor=settlement.quietSince===null?null:performance.now()-settlement.quietSince;
  const result={ready:!blocked&&quietFor>=500,native_owner_verified:true,node_id:b.node.id,
    owned_busy:!!busyContext,mask_count:masks.length,mask_target_tid:busyContext?formTid:null,
    notification_count:toasts.length,auto_close_delays:toasts.map(t=>t.delay),notification_owner_verified:false,
    quiet_for_ms:quietFor,
    execution_dispatched:true,execution_completed:false};
  return poll?(result.ready?result:false):result;
}

export async function waitJavascriptExecutionNotifications(page,{binding,deadline,record}) {
  // One budget covers owned busy -> notification -> quiet, without resetting
  // on transitions. Message.js auto-close is capped at 60s plus a 500ms fade.
  const until=Math.min(deadline,Date.now()+61500),args={binding};
  const inspect=()=>page.evaluate(inspectJavascriptExecutionNotifications,args);
  try{
    if(Date.now()>=until)throw Error('Post-execution notification deadline expired');
    const before=await inspect();await record({phase:'execution_notification_wait_before',...before,deadline:until});
    if(!before.ready){
      const remaining=until-Date.now();if(remaining<=0)throw Error('Post-execution notification deadline expired');
      const ready=await page.waitForFunction(inspectJavascriptExecutionNotifications,{...args,poll:true},{timeout:remaining,polling:250});
      await ready.dispose();
    }
    const after=await inspect();
    if(!after.ready||Date.now()>=until)throw Error('Post-execution notifications did not settle');
    await record({phase:'execution_notification_wait_verified',...after,deadline:until});return after;
  }catch(error){
    await record({phase:'execution_notification_wait_refused',execution_dispatched:true,execution_completed:false,
      ...(await inspect().catch(()=>({native_owner_verified:false}))),deadline:until,reason:String(error.message).slice(0,300)});
    throw error;
  }
}

// Cleanup waits are read-only and retain both the original workflow and the
// currently displayed native surface. A foreign owner never becomes ready.
export async function waitJavascriptCleanupReady(page,{owner,prepared,account,deadline,record}) {
  const current=await page.evaluateHandle(()=>{
    const card=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    return {document,card,controller:card?.Controller,node:card?.Controller?.Node?.data?.node};
  });
  const inspect=({owner,prepared,account,current,poll=false})=>{
    const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,map=f?.FMapTree,p=globalThis.__loginomDockPreparationV1;
    const card=f?.Items?.Workspace?.getActiveTab?.(),records=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===prepared.workflow_ref.workflow_id);
    const ancestors=new Set();for(let n=owner.workflow;n&&ancestors.size<32&&!ancestors.has(n);n=n.ParentNode)ancestors.add(n);
    const valid=document===current.document&&p?.document===document&&location.origin==='http://logi-test-plan.bg.local'&&app?.Version==='7.4.2'&&p?.id===prepared.document_id
      &&map?.FServerConnection?.UserName===account&&map.FServerConnection.Connected===true&&map.PackageNodes?.Count===1
      &&map.PackageNodes.Items(0)===owner.packageNode&&owner.packageNode.PackageFileName===''
      &&ancestors.has(owner.packageNode)&&owner.card.Controller===owner.controller&&owner.controller.Node?.data?.node===owner.workflow
      &&records.length===1&&records[0].packageNode===owner.packageNode&&records[0].tab===owner.tab
      &&card===current.card&&card?.Controller===current.controller&&card?.Controller?.Node?.data?.node===current.node
      &&(card===owner.card||current.node?.constructor?.name==='StorageDirectoryTreeNode');
    if(!valid)throw Error('Cleanup original package/workflow or current surface changed');
    const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    const blockers=[...document.querySelectorAll('[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
    const observed={ready:blockers.length===0,blocker_count:blockers.length,blockers:blockers.slice(0,12).map(e=>{
      const rect=e.getBoundingClientRect();
      return {tid:e.getAttribute('data-tid'),role:e.getAttribute('role'),classes:String(e.className??'').slice(0,200),
        mask_text:String(e.getAttribute('bg-mask-text')??'').slice(0,160),
        box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    })};
    return poll?(observed.ready?observed:false):observed;
  };
  const args={owner,prepared,account,current};
  try {
    const before=await page.evaluate(inspect,args);await record({phase:'cleanup_workflow_settlement_before',...before,deadline});
    if(!before.ready){
      const remaining=deadline-Date.now();if(remaining<=0)throw Error('Cleanup settlement deadline');
      const ready=await page.waitForFunction(inspect,{...args,poll:true},{timeout:remaining,polling:250});
      await ready.dispose();
    }
    const after=await page.evaluate(inspect,args);await record({phase:'cleanup_workflow_settlement_after',...after,deadline});
    if(!after.ready||Date.now()>=deadline)throw Error('Cleanup settlement unconfirmed');
  }catch(error){
    const terminal=await page.evaluate(inspect,args).catch(()=>({owner_verified:false}));
    await record({phase:'cleanup_workflow_settlement_refused',...terminal,error:String(error.message).slice(0,300),deadline});
    throw error;
  }finally{await current.dispose();}
}

// A cleanup return uses the same observed parent-scenario capability as the
// normal Table return, including a views surface with no Table created yet.
export async function returnJavascriptViewsForCleanup(channel,node,portGuid,record,{returnAlreadyDispatched=false}={}) {
  if(returnAlreadyDispatched)throw Error('Original views return already dispatched; no replay');
  const bound=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='views'
    &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node[k])
    &&s.node_outputs?.verified===true&&s.node_outputs.surface==='views'
    &&s.node_outputs.port_panels?.filter(p=>p.port_guid===portGuid).length===1
    &&s.workflow_navigation?.status==='observed'
    &&s.ui.elements.filter(e=>e.ref===s.workflow_navigation.control_ref&&e.tid===s.workflow_navigation.control_tid&&e.allowed_actions.includes('click')).length===1;
  const before=await channel.observe({condition:'owned views before cleanup return',readOutputs:true,readNavigation:true,ready:bound});
  const path=before.workflow_navigation.path;
  await record({phase:'cleanup_views_return_dispatch',node,port_guid:portGuid});
  await channel.perform({condition:'return owned views to scenario for cleanup',initialObservation:before,
    ready:s=>bound(s)&&JSON.stringify(s.workflow_navigation.path)===JSON.stringify(path),
    identity:()=>({node,port_guid:portGuid,path}),resolve:s=>({verb:'click',ref:s.workflow_navigation.control_ref})});
  const after=await channel.observe({condition:'owned cleanup scenario returned',readOutputs:true,readNavigation:true,
    ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
      &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node[k])
      &&s.navigation_context?.status==='observed'&&JSON.stringify(s.navigation_context.path)===JSON.stringify(path)
      &&s.node_outputs?.verified===true&&s.node_outputs.surface==='graph'
      &&s.node_outputs.ports?.filter(p=>p.port_guid===portGuid).length===1});
  await record({phase:'cleanup_views_return_verified',node:after.prepared_node_context,port_guid:portGuid});
}

// Private acceptance gesture. Public generic JS-node actions remain denied.
export async function selectJavascriptForSettings(page,{binding,node,icon,deadline,record,openSettings=false,requireSettings=true,requireVisualizers=false,beforeSelect=async()=>{},beforeOpen=async()=>{}}) {
  if(openSettings&&(!requireSettings||requireVisualizers))throw Error('Private opening requires Setting readiness');
  const retained=await page.evaluateHandle(({binding,node})=>{
    const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
    const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.id):[];
    if(tab!==binding.tab||found.length!==1)throw Error('Private selection binding unavailable');
    return {document,controller:tab.Controller,model:tab.Controller.FController,diagram,graph:diagram.FmxGraph,container:diagram.FmxGraph.container,native:found[0],cell:found[0].FCell,shape:diagram.FmxGraph.view.getState(found[0].FCell)?.shape?.node,replacements:0};
  },{binding,node});
  const inspect=({binding,node,icon,retained:r,requireSettings,requireVisualizers,poll=false,afterGesture=false})=>{
    const app=globalThis.bg?.app,tab=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
    const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.id):[];
    if(document!==r.document||location.origin!=='http://logi-test-plan.bg.local'||app?.Version!=='7.4.2'
      ||tab!==binding.tab||tab?.Controller!==r.controller||tab.Controller.FController!==r.model
      ||tab?.Controller?.Node?.data?.node!==binding.workflow||diagram!==r.diagram
      ||diagram.FmxGraph!==r.graph||diagram.FmxGraph.container!==r.container
      ||found.length!==1||found[0]!==r.native||found[0].data!==binding.nodeData||found[0].FCell!==r.cell||found[0].FIconCls!==icon)
      throw Error('Private selection native owner changed');
    const shape=diagram.FmxGraph.view.getState(r.cell)?.shape?.node,graph=diagram.FmxGraph.container;
    const exact=tid=>[...graph.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===tid);
    const selected=diagram.FmxGraph.getSelectionCells();
    const nodeSelected=Array.isArray(selected)&&selected.length===1&&selected[0]===r.cell;
    const unique=exact(node.tid);
    if(!shape?.isConnected||shape.getAttribute('data-tid')!==node.tid||!graph.contains(shape)
      ||unique.length!==1||unique[0]!==shape)throw Error('Private selection DOM changed');
    if(shape!==r.shape){
      if(!afterGesture||r.replacements!==0||r.shape?.isConnected||!nodeSelected)throw Error('Private selection DOM changed');
      // Only the DOM association can change, once, after our returned gesture.
      r.shape=shape;r.replacements++;
    }
    const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    if([...document.querySelectorAll('[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg')].some(visible))throw Error('Private selection blocked');
    const point=element=>{
      if(!visible(element)||element.closest('.x-item-disabled,.x-grid-row-disabled')||element.getAttribute('aria-disabled')==='true')return null;
      const box=element.getBoundingClientRect();
      for(const dy of [.5,.25,.75])for(const dx of [.5,.25,.75]){
        const x=box.x+box.width*dx,y=box.y+box.height*dy,hit=document.elementFromPoint(x,y);
        const target=hit?.closest('[data-tid]');
        const control=hit?.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]');
        if(x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&hit&&(hit===element||element.contains(hit))
          &&target===element&&(!control||control===element))return {x,y};
      }
      return null;
    };
    const settings=exact(node.tid+';Setting');if(settings.length>1)throw Error('Private selection duplicate Setting');
    const setting=settings.length===1?point(settings[0]):null;
    const visualizers=exact(node.tid+';Visualizers');if(requireVisualizers&&visualizers.length>1)throw Error('Private selection duplicate Visualizers');
    const visualizer=visualizers.length===1?point(visualizers[0]):null;
    const result={ready:nodeSelected&&(!requireSettings||!!setting)&&(!requireVisualizers||!!visualizer),node_selected:nodeSelected,
      native_selection_count:Array.isArray(selected)?selected.length:null,dom_replacements:r.replacements,settings_count:settings.length,setting_point:setting,
      visualizers_count:visualizers.length,visualizers_visible:visualizers.length===1&&visible(visualizers[0]),visualizers_point:visualizer,body_point:point(shape)};
    return poll?(result.ready?result:false):result;
  };
  const args={binding,node,icon,retained,requireSettings,requireVisualizers};let dispatched=false,openingDispatched=false;
  try {
    const before=await page.evaluate(inspect,args);await record({phase:'javascript_private_selection_before',node_id:node.id,...before});
    if(Date.now()>=deadline)throw Error('Private selection deadline');
    if(!before.ready){
      if(!before.body_point)throw Error('Private selection body covered');
      await record({phase:'javascript_private_selection_dispatch',node_id:node.id,point:before.body_point,deadline,require_visualizers:requireVisualizers});
      await beforeSelect();
      const checked=await page.evaluate(inspect,args);
      if(JSON.stringify(checked)!==JSON.stringify(before))throw Error('Private selection changed before click');
      if(Date.now()>=deadline)throw Error('Private selection deadline');
      dispatched=true;
      await page.mouse.click(before.body_point.x,before.body_point.y);
      await record({phase:'javascript_private_selection_gesture_returned',node_id:node.id});
      args.afterGesture=true;
      const remaining=deadline-Date.now();if(remaining<=0)throw Error('Private selection deadline');
      const ready=await page.waitForFunction(inspect,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();
    }
    const after=await page.evaluate(inspect,args);
    await record({phase:'javascript_private_selection_after',node_id:node.id,...after});
    if(!after.ready||Date.now()>=deadline)throw Error('Private selection requested controls unconfirmed');
    if(openSettings){
      await beforeOpen();
      const opening=await page.evaluate(inspect,args);
      if(!opening.ready)throw Error('Private Setting no longer ready');
      await record({phase:'javascript_private_open_dispatch',node_id:node.id,point:opening.setting_point,deadline});
      const checked=await page.evaluate(inspect,args);
      if(JSON.stringify(checked)!==JSON.stringify(opening)||Date.now()>=deadline)throw Error('Private Setting changed before click');
      openingDispatched=true;
      await page.mouse.click(opening.setting_point.x,opening.setting_point.y);
      await record({phase:'javascript_private_open_gesture_returned',node_id:node.id});
    }
    return {verified:true,selected:dispatched,opening_dispatched:openingDispatched,dom_replacements:after.dom_replacements};
  }catch(error){
    const observed=await page.evaluate(inspect,args).catch(()=>({owner_verified:false}));
    await record({phase:'javascript_private_selection_refused',node_id:node.id,effect_possible:dispatched||openingDispatched,opening_dispatched:openingDispatched,deadline,reason:String(error.message),...observed});throw error;
  }finally{await retained.dispose();}
}

// The public observer may describe a Setting while generic JS actions stay denied.
// Its owner metadata is evidence, never permission to call begin_wizard.
export function javascriptWizardBinding(state,node) {
  const n=state.prepared_node_context;
  const controls=state.ui?.elements?.filter(e=>e.tid===n?.tid+';Setting'&&e.wizard_open?.node?.part==='settings')??[];
  if(n?.verified!==true||n.surface!=='graph'||state.wizard?.status!=='absent'||controls.length!==1
    ||!['document_id','workflow_id','node_id'].every(k=>n[k]===node[k]))throw Error('Private wizard opening owner unavailable');
  const opening=controls[0].wizard_open;
  if(!Array.isArray(opening.workflow_path)||!opening.workflow_path.length||typeof opening.node.node_label!=='string')throw Error('Private wizard navigation unavailable');
  return {kind:'deactivation',node:{document_id:n.document_id,workflow_id:n.workflow_id,node_id:n.node_id},graph_tid:n.tid,opening:structuredClone(opening)};
}

export async function openJavascriptWizard(page,{binding,node,icon,reference,prepared,deadline,record,channel,lifecycle={}}) {
  await selectJavascriptForSettings(page,{binding,node,icon,deadline,record:async event=>{
    await record(event);
    // Reserved conservatively before dispatch: uncertain opening is never replayed.
    if(event.phase==='javascript_private_open_dispatch')lifecycle.openingDispatched=true;
  },openSettings:true,beforeOpen:async()=>{
    const state=await channel.observe({condition:'private JavaScript Setting owner',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
    lifecycle.confirmation=javascriptWizardBinding(state,reference);
    if(lifecycle.confirmation.graph_tid!==node.tid)throw Error('Private wizard graph identity changed');
  }});
  return finishJavascriptWizardOpening(page,{binding,node,reference,prepared,deadline,record,channel,lifecycle});
}

export async function finishJavascriptWizardOpening(page,{binding,node,reference,prepared,deadline,record,channel,lifecycle}) {
  if(!lifecycle.openingDispatched||!lifecycle.confirmation)throw Error('No owned Setting opening to settle');
  const confirmation=lifecycle.confirmation;
  await waitJavascriptWizardSettlement(page,{binding,prepared,deadline,record,allowDeactivation:!lifecycle.deactivationDispatched});
  const state=await channel.observe({condition:'private JavaScript wizard or bound deactivation',wizardConfirmation:confirmation,
    ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'
      ||!lifecycle.deactivationDispatched&&boundWizardDeactivationConfirmation(s,confirmation)});
  const deactivationRequired=state.wizard.status==='absent';
  if(deactivationRequired){
    lifecycle.deactivationDispatched=true;
    await channel.perform({condition:'confirm only privately opened JavaScript node deactivation',initialObservation:state,
      ready:s=>boundWizardDeactivationConfirmation(s,confirmation),identity:()=>confirmation,
      resolve:s=>({verb:'confirm_wizard_deactivation',ref:s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes').ref})});
    await waitJavascriptWizardSettlement(page,{binding,prepared,deadline,record,allowDeactivation:false});
  }
  const after=await channel.observe({condition:'private JavaScript wizard native owner',ready:s=>s.wizard?.status==='observed'
    &&s.wizard.owner_context?.status==='observed'&&s.prepared_node_context?.surface==='wizard'});
  const valid=await page.evaluate(({binding,node})=>{
    const app=globalThis.bg?.app,tab=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const wizard=tab?.Controller?.Node?.data?.node,tree=wizard?.ParentNode,form=tab?.Controller?.FController;
    return document===binding.document&&location.origin==='http://logi-test-plan.bg.local'&&app?.Version==='7.4.2'&&tab===binding.tab
      &&app.WizardTreeNode&&wizard instanceof app.WizardTreeNode&&app.ModelNodeTreeNode&&tree instanceof app.ModelNodeTreeNode
      &&tree.ParentNode===binding.workflow&&tree.FGuid===node.id&&tree.FModelNode===binding.nodeData&&form?.FModelNode===binding.nodeData;
  },{binding,node});
  if(!valid||Date.now()>=deadline||after.prepared_node_context?.verified!==true
    ||!['document_id','workflow_id','node_id'].every(k=>after.prepared_node_context[k]===reference[k]))throw Error('Private reopened wizard owner changed');
  return {verified:true,deactivation_required:deactivationRequired||lifecycle.deactivationDispatched===true,node_context:after.prepared_node_context,
    owner:after.wizard.owner_context,settings_applied:false,execution_started:false};
}

// A failed opening remains owned by the runtime until cleanup or handoff. This
// memoized cleanup cannot repeat Setting, deactivation, Close or confirmation.
export function cleanupJavascriptWizardOpening(page,options) {
  const lifecycle=options.lifecycle;
  lifecycle.cleanup??=(async()=>{
    await finishJavascriptWizardOpening(page,options);
    if(lifecycle.closeDispatched)throw Error('Wizard close already attempted; no replay');
    lifecycle.closeDispatched=true;
    const closed=await closePreparedWizard(options.channel);
    await options.record({phase:'javascript_pending_wizard_cleanup_verified',closed});
    return closed;
  })();
  return lifecycle.cleanup;
}

// Narrow reconciliation of an already dispatched close confirmation. The shared
// procedure keeps its refusal; only fresh read-only graph proof may complete it.
export function javascriptMappingUnlockReceipt(receipt,reference) {
  if(receipt?.status!=='AMBIGUOUS'||receipt.action_key!=='ui.act'||receipt.effect_possible!==true
    ||receipt.error?.code!=='PREPARED_NODE_CONTEXT_CHANGED'||!Array.isArray(receipt.trace)||receipt.trace.length>32)return false;
  const gestures=receipt.trace.filter(e=>e.event==='ui_gesture_applied'),mismatches=receipt.trace.filter(e=>e.event==='prepared_node_surface_mismatch');
  if(gestures.length!==1||gestures[0].verb!=='confirm_wizard_close'||mismatches.length!==1
    ||!receipt.trace.some(e=>e.event==='ui_preconditions_verified'&&e.verb==='confirm_wizard_close'))return false;
  if(receipt.trace.indexOf(mismatches[0])<=receipt.trace.indexOf(gestures[0]))return false;
  const {before,after}=mismatches[0];
  if(!before||!after||before.verified!==true||after.verified!==true||before.surface!=='graph'||after.surface!=='graph'
    ||before.locked!==true||after.locked!==false||typeof before.tid!=='string'||before.tid!==after.tid
    ||!['document_id','workflow_id','node_id'].every(k=>before[k]===reference[k]&&after[k]===reference[k]))return false;
  const canonical=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  return canonical({...before,locked:false})===canonical(after)&&canonical(receipt.output?.prepared_node_context??{})===canonical(after);
}

export async function closeJavascriptPortMapping({reader,direction,reference,record,deadline,verifyGraph}) {
  let closed;
  try {closed=await closePreparedWizard(reader);}
  catch(error){
    if(direction!=='input'||error.name!=='NodeProcedureStepError'||!javascriptMappingUnlockReceipt(error.receipt,reference))throw error;
    await record({phase:'port_mapping_close_unlock_receipt',direction,operation_id:error.receipt.operation_id,
      original_status:error.receipt.status,reference,transition:'same_graph_locked_true_to_false'});
    const remaining=deadline-Date.now();if(remaining<=0)throw error;
    const state=await reader.observe({condition:'same original mapping node unlocked after dispatched confirmation',timeoutMs:Math.min(15000,remaining),
      ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.prepared_node_context.locked===false
        &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===reference[k])
        &&s.prepared_node_context.tid===error.receipt.output.prepared_node_context.tid
        &&s.wizard?.status==='absent'&&s.ui?.dialogs?.length===0&&s.ui?.masks?.length===0,
      confirmIdentity:s=>s.prepared_node_context});
    if(Date.now()>=deadline)throw error;
    closed={verified:true,cleanup_complete:true,mode:'close',settings_applied:false,execution_started:false,
      reconciled_from:error.receipt.operation_id,original_status:error.receipt.status,node_context:state.prepared_node_context};
  }
  if(Date.now()>=deadline)throw Error('Port mapping close original deadline expired');
  await verifyGraph();
  if(Date.now()>=deadline)throw Error('Port mapping graph proof exceeded original deadline');
  await record({phase:'port_mapping_close_verified',direction,closed,native_graph_unchanged:true});return closed;
}

export function javascriptManualMappingRequest() {
  return {mapping:{direction:'output',port:0,autosync:false,
    fields:[{source:{kind:'configured_field',name:'ObservedID'},name:'ObservedID',label:'ObservedID'},
      {source:{kind:'configured_field',name:'PhaseMarker'},name:'ManualMarker',label:'ManualMarker'}]},
    configured:javascriptOutputColumns.map(column=>({...column,used:true}))};
}

// A separate port wizard is not the node wizard retained by the outer runner.
// Cleanup is allowed only for its proven opening and no possible mapping edits,
// including one confirmed field-editor opening followed by verified cancellation.
export async function configureJavascriptManualMapping({reader,cleanupReader,reference,record,verifyGraph,lifecycle}) {
  if(lifecycle.started)throw Error('Manual mapping already attempted; no replay');
  lifecycle.started=true;lifecycle.attempts=0;
  const bind=state=>{
    const binding=wizardCloseBinding(state),opening=lifecycle.opening?.output;
    if(lifecycle.opening?.status!=='SUCCEEDED'||!opening?.verified||opening.direction!=='output'||opening.port!==0
      ||binding.stage!=='output_mapping'||!binding.owner.output_port
      ||!['document_id','workflow_id','node_id'].every(k=>binding.node[k]===reference[k]&&opening[k]===reference[k])
      ||binding.owner.output_port.port!==0||binding.owner.output_port.port_guid!==opening.port_guid
      ||binding.owner.output_port.native_index!==opening.native_index
      ||binding.owner.output_port.opening_operation_id!==opening.opening_operation_id
      ||opening.opening_operation_id!==lifecycle.opening.operation_id)
      throw Error('Manual mapping original port opening changed');
    if(lifecycle.binding&&JSON.stringify(binding)!==JSON.stringify(lifecycle.binding))throw Error('Manual mapping wizard binding changed');
    return binding;
  };
  const tracked={...reader,
    async openOutputPort(port){
      if(lifecycle.openingAttempted)throw Error('Manual port opening already attempted');
      lifecycle.openingAttempted=true;lifecycle.opening=await reader.openOutputPort(port);
      return lifecycle.opening;
    },
    async observe(options){
      const state=await reader.observe(options);
      if(!lifecycle.binding){
        lifecycle.binding=bind(state);
        lifecycle.mapping=structuredClone(state.node_mapping);
      }
      return state;
    },
    async perform(options){
      lifecycle.attempts++;
      let editorOpening;
      try{
        const result=await reader.perform({...options,resolve:state=>{
          const action=options.resolve(state);
          // Only one confirmed opening of the exact native field editor can
          // be cancelled here. Any later field/Apply/Done dispatch stays unsafe.
          if(lifecycle.attempts===1&&options.condition==='select the exact output field editor'&&action.verb==='double_click'){
            bind(state);
            const original=options.identity(state),native=lifecycle.mapping?.target_fields?.filter(f=>f.record_id===original.record_id);
            const rows=state.wizard.output_columns?.fields?.filter(f=>f.status==='observed'&&f.index===original.index
              &&['name','label','type'].every(k=>f[k]===original[k])&&f.name_ref===action.ref);
            const cell=state.ui.elements.find(e=>e.ref===action.ref);
            if(native?.length===1&&JSON.stringify(native[0])===JSON.stringify(original)&&rows?.length===1
              &&cell?.output_column?.wizard_root_ref===lifecycle.binding.root_ref
              &&['name','label','type','row_ref','index'].every(k=>cell.output_column[k]===rows[0][k])
              &&['name','label','type','data_kind','usage','name_ref','label_ref','row_ref'].every(k=>typeof rows[0][k]==='string'&&rows[0][k]))
              editorOpening={row:structuredClone(rows[0])};
          }
          return action;
        }});
        if(editorOpening&&result?.status==='SUCCEEDED'&&result.cleanup_complete===true&&typeof result.operation_id==='string')
          lifecycle.editorOpening={...editorOpening,operation_id:result.operation_id};
        return result;
      }
      catch(error){
        if(error instanceof NodeProcedureStepError&&error.receipt?.status==='REFUSED'
          &&error.receipt.effect_possible===false&&error.receipt.cleanup_complete===true)lifecycle.attempts--;
        throw error;
      }
    }};
  try{
    const {mapping,configured}=javascriptManualMappingRequest();
    const result=await configureSeparateOutputPort(tracked,mapping,configured);
    lifecycle.closed=true;return result;
  }catch(error){
    await record({phase:'manual_mapping_refused',node:reference,opening_verified:!!lifecycle.binding,
      mapping_effect_possible:lifecycle.attempts>0,reason:String(error.message).slice(0,300)});
    if(!lifecycle.binding||lifecycle.attempts>0&&!(lifecycle.attempts===1&&lifecycle.editorOpening))throw error;
    const deadline=lifecycle.cleanupDeadline=Date.now()+60000,cleanup=cleanupReader(deadline);
    // Pin the original root/port/opening receipt before every observation and
    // gesture; readPreparedNodeContext supplies its retained native identities.
    const owned=state=>{
      if(state.wizard?.status==='observed')bind(state);
      else if(state.wizard?.status!=='absent'||state.prepared_node_context?.verified!==true
        ||state.prepared_node_context.surface!=='graph'
        ||!['document_id','workflow_id','node_id'].every(k=>state.prepared_node_context[k]===reference[k]))
        throw Error('Manual mapping cleanup owner changed');
    };
    const bound={...cleanup,
      observe:options=>cleanup.observe({...options,ready:state=>{owned(state);return options.ready(state);}}),
      perform:options=>cleanup.perform({...options,ready:state=>{owned(state);return options.ready(state);}})};
    lifecycle.cleanupAttempted=true;
    if(lifecycle.editorOpening){
      const row=lifecycle.editorOpening.row;
      const editorReady=state=>{
        const p=state.wizard?.column_parameters;
        const types={integer:'Целый',real:'Вещественный',string:'Строковый',boolean:'Логический',datetime:'Дата/Время',variant:'Переменный'};
        return p?.status==='observed'&&p.portal_bound===true&&p.root_tid==='EditColumnDefForm'
          &&p.selected_column?.status==='observed'&&p.selected_column.selected===true
          &&['name','label','type','data_kind','usage','name_ref','label_ref','row_ref'].every(k=>p.selected_column[k]===row[k])
          &&Object.entries({name:row.name,label:row.label,type_label:types[row.type],data_kind:row.data_kind,usage:row.usage})
            .every(([k,value])=>value&&p.fields?.[k]?.status==='observed'&&p.fields[k].truncated===false&&p.fields[k].value===value)
          &&state.ui.masks.length===0&&state.ui.dialogs.length===1&&state.ui.dialogs[0].ref===p.root_ref;
      };
      const initial=await bound.observe({condition:'original manual mapping editor can be cancelled',ready:editorReady});
      const editor=initial.wizard.column_parameters;
      await bound.perform({condition:'cancel the original manual mapping field editor',initialObservation:initial,
        ready:s=>editorReady(s)&&s.wizard.column_parameters.root_ref===editor.root_ref,
        identity:()=>({opening:lifecycle.editorOpening,root_ref:editor.root_ref}),resolve:s=>{
          const controls=s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.column_close.mode==='cancel'
            &&e.column_close.root_ref===editor.root_ref&&e.column_close.wizard_root_ref===lifecycle.binding.root_ref
            &&JSON.stringify(e.column_close.original_row)===JSON.stringify(s.wizard.column_parameters.selected_column)
            &&e.allowed_actions.includes('cancel_output_column'));
          if(controls.length!==1)throw Error('Original manual mapping editor Cancel unavailable');
          return {verb:'cancel_output_column',ref:controls[0].ref};
        }});
      const after=await bound.observe({condition:'original native mapping after editor cancellation',readMappings:true,
        ready:s=>s.wizard?.status==='observed'&&!s.wizard.column_parameters&&s.ui.dialogs.length===0&&s.ui.masks.length===0
          &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true});
      const semantic=m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='rendered_indices'));
      if(JSON.stringify(semantic(after.node_mapping))!==JSON.stringify(semantic(lifecycle.mapping)))
        throw Error('Native mapping changed after editor cancellation');
      await record({phase:'manual_mapping_editor_cancel_verified',node:reference,opening:lifecycle.editorOpening,native_mapping_unchanged:true});
    }
    const closed=await closePreparedWizard(bound);
    if(Date.now()>=deadline)throw Error('Manual port cleanup deadline expired');
    await verifyGraph(deadline);
    if(Date.now()>=deadline)throw Error('Manual port cleanup graph proof exceeded deadline');
    lifecycle.closed=true;
    await record({phase:'manual_mapping_refusal_cleanup_verified',node:reference,deadline,closed,native_graph_unchanged:true});
    throw error;
  }
}

export async function createJavascriptExecutionRuntime({page,prepared,directory,record,account,deadline,effectScope=()=>null,nativeInputOnly=false,nativeFixtureId='real'}) {
  const nativeInputFixture=javascriptNativeFixture(nativeFixtureId),nativeRoundtripProbe=javascriptNativeRoundtripProbe(nativeFixtureId);
  if(account!=='jsteach'||prepared.status!=='READY'||prepared.package_ref?.persisted!==false)throw Error('Own JavaScript draft required');
  const origin='http://logi-test-plan.bg.local',build='7.4.2',sessionId='js-g2-'+randomUUID();
  const journalOnce=createJavascriptEffectJournal({record,deadline});
  const once=(id,identity,perform)=>journalOnce(caseEffect(effectScope(),id),identity,perform);
  let nativeInputEvidence,nativeInputOwner,nativeReadUncertain=false;
  const validateNativeSource=()=>verifyNativeRoundtripProvenance(nativeInputOwner);
  const executeUntil=async(code,until)=>{
    if(Date.now()>=until)throw Error('Original JavaScript operation deadline expired');
    // The module supplies these fixed local builders; this function is never
    // exposed to a model or evaluated in the browser's application realm.
    return await Function('return ('+code+')')()(page);
  };
  const execute=async(code,options={})=>{
    if(!nativeInputOnly)return executeUntil(code,deadline);
    const until=Math.min(deadline,Date.now()+(options.timeout??deadline-Date.now()));
    if(until<=Date.now())throw Error('Original native input deadline expired');
    let timer;
    try{return await Promise.race([executeUntil(code,until),new Promise((_,reject)=>{
      timer=setTimeout(()=>{nativeReadUncertain=true;reject(Error('Native input transport deadline; cancellation unproven'));},until-Date.now());
    })]);}finally{clearTimeout(timer);}
  };
  const actions=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url),'utf8')).actions;
  const selectors=JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json',import.meta.url),'utf8')).selectors;
  const pinned={actions:new Map(actions.map(action=>[action.action_key,action])),selectors:new Map(selectors.map(selector=>[selector.symbol,selector])),pins:{}};
  const artifactStore=await createArtifactStore({directory:directory+'/input-artifacts',sessionId});
  const support=nativeInputOnly?createJavascriptNativeInputSupport({targetOrigin:origin,targetBuild:build,fixtureId:nativeFixtureId,
    onProof:async(proof,owner)=>{nativeInputEvidence=proof;nativeInputOwner=owner;},
    onState:async state=>{nativeReadUncertain=!state||state.uncertain===true||state.retired===true||state.pending!==0
      ||state.status!=='completed'||state.releasedRequests!==nativeInputFixture.rows||state.releasedResponses!==nativeInputFixture.rows;
      await record({phase:'javascript_native_input_lifecycle',state,uncertain:nativeReadUncertain});}})
    :createTextImportNodeSupport({targetOrigin:origin,targetBuild:build});
  const runtime=createActionRuntime({pinned,execute,artifactStore,allowCandidate:true,onRecord:record,targetOrigin:origin,targetBuild:build,...support});
  const adapter=createNodeTargetBrowserAdapter({execute,origin,build,pinned});
  const graphRequest={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref};
  const workflowOwner=await page.evaluateHandle(prepared=>{
    const p=globalThis.__loginomDockPreparationV1,card=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const matches=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===prepared.workflow_ref.workflow_id);
    if(p?.id!==prepared.document_id||matches.length!==1||!card?.Controller?.Node?.data?.node)throw Error('Original workflow cleanup binding unavailable');
    return {card,controller:card.Controller,workflow:card.Controller.Node.data.node,packageNode:matches[0].packageNode,tab:matches[0].tab};
  },prepared);
  let cleanupRestore,passiveSurface,pendingWizard,pendingMapping;
  const executionPhases=new Map();
  const graph=()=>adapter.observe(graphRequest,deadline);
  const channel=(node,operationDeadline=deadline,cleanup=false)=>createNodeProcedure({operation:{id:'js-g2-'+randomUUID(),action:{action_key:'diagnostic.javascript',revision:'1'},deadline:operationDeadline},
    execute:cleanup?code=>executeUntil(code,operationDeadline):execute,
    record,targetOrigin:origin,targetBuild:build,maxSteps:4096,preparedNodeContext:{...graphRequest,node},
    wrapMutation:(code,receipt)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:sessionId,receipt_id:receipt.id,receipt_signature:receipt.signature,operation_id:receipt.id})});
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']').filter({visible:true});
  const accountGuard=async()=>{
    const same=await page.evaluate(({account,documentId})=>{
      const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
      return location.origin==='http://logi-test-plan.bg.local'&&globalThis.bg.app.Version==='7.4.2'
        &&globalThis.__loginomDockPreparationV1?.id===documentId&&m?.FServerConnection?.UserName===account&&m.FServerConnection.Connected===true&&m.PackageNodes.Count===1;
    },{account,documentId:prepared.document_id});
    if(!same)throw Error('JavaScript runtime account/document changed');
  };
  const privateGraphBinding=async node=>{
    await accountGuard();
    const binding=await page.evaluateHandle(({owner,node})=>{
      const tab=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
      const diagram=tab?.Controller?.FController?.FDiagram,nodes=diagram?.FNodes?.FCollection;
      const found=Array.isArray(nodes)&&nodes.length<=20?nodes.filter(n=>n.FGuid===node.node_id):[];
      if(tab!==owner.card||tab?.Controller!==owner.controller||tab?.Controller?.Node?.data?.node!==owner.workflow
        ||found.length!==1||!found[0].data||found[0].FIconCls!=='bg-vendor-icon-javascript')throw Error('Private JS graph binding unavailable');
      const shape=diagram.FmxGraph.view.getState(found[0].FCell)?.shape?.node,tid=shape?.getAttribute('data-tid');
      if(!tid||!shape.isConnected||!diagram.FmxGraph.container.contains(shape))throw Error('Private JS graph shape unavailable');
      return {document,tab,controller:tab.Controller,model:tab.Controller.FController,
        view:tab.Controller.FController.FView,form:tab.Controller.FController.FView?.el?.dom,
        diagram,graph:diagram.FmxGraph,container:diagram.FmxGraph.container,
        native:found[0],cell:found[0].FCell,workflow:owner.workflow,nodeData:found[0].data,node:{id:node.node_id,tid},icon:found[0].FIconCls};
    },{owner:workflowOwner,node});
    return binding;
  };
  return {
    get nativeReadUncertain(){return nativeReadUncertain;},
    graph,channel,once,
    get passiveSurfacePending(){return !!passiveSurface;},
    get wizardOpeningPending(){return !!pendingWizard;},
    get manualMappingPending(){return !!pendingMapping;},
    restoreWorkflowForCleanup() {
      cleanupRestore??=(async()=>{
        const cleanupDeadline=Date.now()+60000;
        if(pendingMapping)throw Error('Standalone manual mapping remains unresolved; no generic Close or replay');
        if(pendingWizard){
          await cleanupJavascriptWizardOpening(page,{...pendingWizard,deadline:cleanupDeadline,record,channel:channel(pendingWizard.reference,cleanupDeadline)});
          await pendingWizard.binding.dispose();pendingWizard=undefined;
        }
        if(passiveSurface){
          const settled=await waitJavascriptViewsSettlement(page,{...passiveSurface,deadline:cleanupDeadline,record,allowGraph:true});
          if(settled.surface==='views')await returnJavascriptViewsForCleanup(channel(passiveSurface.prepared.node,cleanupDeadline),passiveSurface.prepared.node,passiveSurface.output.port_guid,record,{returnAlreadyDispatched:passiveSurface.returnDispatched});
        }
        await waitJavascriptCleanupReady(page,{owner:workflowOwner,prepared,account,deadline:cleanupDeadline,record});
        await record({phase:'cleanup_workflow_activation_dispatch',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,deadline:cleanupDeadline});
        const restored=await activatePreparedWorkflow(page,{request:graphRequest,origin,build,deadline:cleanupDeadline});
        await record({phase:'cleanup_workflow_activation_observed',restored});
        if(restored.status!=='SUCCEEDED'||restored.verified!==true)throw Error('Cleanup workflow activation unconfirmed');
        const same=await page.evaluate(owner=>{
          const card=globalThis.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
          return card===owner.card&&card.Controller===owner.controller&&card.Controller.Node?.data?.node===owner.workflow;
        },workflowOwner);
        if(!same)throw Error('Cleanup native workflow changed after UI activation');
        await passiveSurface?.held.dispose();await passiveSurface?.binding.dispose();passiveSurface=undefined;
        return restored;
      })();
      return cleanupRestore;
    },
    async reopen(node,operationDeadline=deadline) {
      if(pendingWizard)throw Error('Previous Setting opening remains unresolved; no replay');
      const openingDeadline=Math.min(deadline,operationDeadline,Date.now()+90000),binding=await privateGraphBinding(node);
      const identity=await page.evaluate(b=>({node:b.node,icon:b.icon}),binding);
      pendingWizard={...identity,binding,reference:node,prepared:{...graphRequest,node},lifecycle:{}};
      try {
        const opened=await openJavascriptWizard(page,{...pendingWizard,deadline:openingDeadline,record,channel:channel(node,openingDeadline)});
        pendingWizard.lifecycle.handoffReady=true;return opened;
      }catch(error){
        if(!pendingWizard.lifecycle.openingDispatched){await binding.dispose();pendingWizard=undefined;}
        throw error;
      }
    },
    async handoffReopenedWizard() {
      if(!pendingWizard?.lifecycle.handoffReady||pendingWizard.lifecycle.cleanup)throw Error('Reopened wizard is not ready for runner ownership');
      // The caller has already set its openedWizard flag and owns Close now.
      const binding=pendingWizard.binding;pendingWizard=undefined;await binding.dispose();
    },
    async prepareManualMapping(node) {
      if(pendingMapping)throw Error('Previous manual mapping remains unresolved');
      const before=await graph();requireJavascriptTopology(before);
      const native=await page.evaluateHandle(captureJavascriptNativeTopology,{}),lifecycle={};
      pendingMapping={native,lifecycle};
      try{
        const result=await configureJavascriptManualMapping({reader:channel(node),cleanupReader:until=>channel(node,until,true),
          reference:{document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:node.node_id},
          record,lifecycle,verifyGraph:async until=>{
            const checked=await page.evaluate(captureJavascriptNativeTopology,{previous:native,checkOnly:true});
            const cleanupAdapter=createNodeTargetBrowserAdapter({execute:code=>executeUntil(code,until),origin,build,pinned});
            const after=await cleanupAdapter.observe(graphRequest,until);requireJavascriptGraphUnchanged(before,after);
            await record({phase:'manual_mapping_refusal_graph_verified',checked,before,after});
          }});
        await record({phase:'manual_mapping_prepared',node,result});return result;
      }finally{
        if(lifecycle.closed){pendingMapping=undefined;await native.dispose();}
      }
    },
    async readPortMapping(node,direction,{characterize=false,operationDeadline=deadline,failedExecution}={}) {
      if(!['input','output'].includes(direction))throw Error('Unknown mapping direction');
      if(characterize&&direction!=='output')throw Error('Only output mapping characterization is supported');
      const readDeadline=Math.min(deadline,operationDeadline);
      const reader=channel(node,readDeadline),reference={document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:node.node_id};
      const before=await graph();requireJavascriptTopology(before);
      const native=await page.evaluateHandle(captureJavascriptNativeTopology,{});let opened=false,observationError;
      try {
        try {
          await reader.openPort(direction,0);opened=true;
          const state=await reader.observe({condition:'complete JavaScript '+direction+' mapping',readMappings:true,
            ready:s=>characterize?!!characterizeJavascriptMapping(s,reference,{allowPending:true,failedExecution}):
              s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.prepared_node_context?.verified===true});
          const mapping=characterize?characterizeJavascriptMapping(state,reference,{failedExecution}):state.node_mapping;
          await record({phase:characterize?'port_mapping_characterized':'port_mapping_observed',direction,node,mapping});return mapping;
        } catch(error){observationError=error;throw error;
        } finally {
          try{if(opened)await closeJavascriptPortMapping({reader,direction,reference,record,deadline:Math.min(readDeadline,Date.now()+15000),verifyGraph:async()=>{
            const checked=await page.evaluate(captureJavascriptNativeTopology,{previous:native,checkOnly:true});
            const after=await graph();requireJavascriptGraphUnchanged(before,after);
            await record({phase:'port_mapping_original_graph_verified',direction,checked,before,after});
          }});}catch(cleanupError){
            if(!observationError)throw cleanupError;
            const combined=new AggregateError([observationError,cleanupError],observationError.message,{cause:observationError});
            combined.observationError=observationError;combined.cleanupError=cleanupError;throw combined;
          }
        }
      } finally {await native.dispose();}
    },

    async prepareInput() {
      const fixture=nativeInputOnly?new URL('./fixtures/'+nativeInputFixture.file,import.meta.url)
        :new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/model-input/sales.csv',import.meta.url);
      const pin=nativeInputOnly?verifyNativeInputFixture(await readFile(fixture),nativeFixtureId)
        :verifyJavascriptFixture(await readFile(fixture),JSON.parse(await readFile(new URL('../manifest.json',fixture),'utf8')));
      const folder='js-g2-'+randomUUID(),storage='/jsteach/'+folder;
      await record({phase:'input_fixture_verified',pin,storage});
      await accountGuard();
      await once('storage-open',{account},()=>at('MF;cntMain;tlbMainToolbar;btnFilestorage').click());
      const table=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]').filter({visible:true});
      await table.waitFor({timeout:Math.min(30000,deadline-Date.now())});
      if(await table.count()!==1)throw Error('Unique file storage required');
      const prefix=(await table.getAttribute('data-tid')).split(';FileStorageForm;')[0];
      const nav=prefix+';cnrNaviMode;b.s_Сервер>Файлы>jsteach';
      if(await at(nav).count()===0)await once('storage-user-folder',{account,prefix},()=>at(prefix+';FileStorageForm;colName_jsteach').dblclick());
      await at(nav).waitFor();await accountGuard();
      const observedDirectory=async()=>{
        const roots=await runtime.observe({scope:'roots'});
        const navigation=roots.output.ui.elements.filter(element=>element.tid===prefix+';NavigationBar;NavigationPanel');
        if(navigation.length!==1)throw Error('Exact storage navigation unavailable');
        const observed=await runtime.observe({rootRef:navigation[0].ref,observationId:roots.output.observation_id});
        await record({phase:'storage_directory_observed',file_storage:observed.output.file_storage});
        if(observed.output.file_storage?.status!=='observed')throw Error('Native storage directory unconfirmed');
        return observed.output.file_storage.directory;
      };
      if(await observedDirectory()!=='/jsteach')await once('storage-user-breadcrumb',{account,prefix},()=>at(nav).click());
      if(await observedDirectory()!=='/jsteach')throw Error('Storage parent is not the assigned account directory');
      if(await at(prefix+';FileStorageForm;colName_'+folder).count())throw Error('Own storage directory already exists');
      await once('storage-create-prompt',{storage},()=>at(prefix+';FileStorageForm;btnCreateDirectory').click());
      const prompt=page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;txt"] input').filter({visible:true});
      await prompt.waitFor();if(await prompt.count()!==1)throw Error('Storage directory prompt is ambiguous');
      await once('storage-name',{storage},()=>prompt.fill(folder));
      await accountGuard();
      await once('storage-create',{storage},()=>page.locator('[data-tid^="msgbox"][data-tid$="tlb;ok"]').filter({visible:true}).click());
      await at(prefix+';FileStorageForm;colName_'+folder).waitFor();
      await once('storage-enter',{storage},()=>at(prefix+';FileStorageForm;colName_'+folder).dblclick());
      await at(nav+'>'+folder).waitFor();
      if(await observedDirectory()!==storage)throw Error('Own storage directory did not open');
      const artifact=await artifactStore.admit({sourcePath:fileURLToPath(fixture),name:nativeInputOnly?nativeInputFixture.file:'sales.csv',bytes:pin.bytes,sha256:pin.sha256,upload:{directory:storage,overwrite:'reject'}});
      const delivered=await once('input-delivery',{storage,artifact_id:artifact.artifact_id,sha256:pin.sha256},()=>runtime.deliverArtifact({operation_id:'js-input-delivery',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:Math.min(120000,deadline-Date.now())}));
      if(delivered.outcome?.status!=='SUCCEEDED'||!delivered.upload_operation_id)throw Error('JavaScript source delivery unconfirmed');
      const request=(nativeInputOnly?nativeInputRequest:javascriptInputRequest)({prepared,storage,artifact,uploadOperationId:delivered.upload_operation_id,totalMs:deadline-Date.now(),fixtureId:nativeFixtureId});
      const imported=await once('input-import',{artifact_id:artifact.artifact_id,source_path:request.parameters.settings.source.source_path},()=>runtime.runNodeApply(request));
      if(imported.status!=='SUCCEEDED')throw Error('JavaScript input import unconfirmed: '+JSON.stringify(imported.error??{}));
      const result=imported.output?.output?.ports?.find(p=>p.port===0);
      const proof=nativeInputOnly?verifyNativeInputUi(result,nativeFixtureId):verifyJavascriptTable(result,'input');
      if(nativeInputOnly&&(!nativeInputEvidence?.native.exact.native_bytes_verified||nativeReadUncertain))throw Error('Native input proof/cleanup unavailable');
      await record({phase:'input_verified',node:imported.output.node,pin,storage,proof,table:result});
      return {node:imported.output.node,storage,pin,table:result,proof,...(nativeInputOnly?{native_input:nativeInputEvidence}: {})};
    },
    async armNativeRoundtrip(input) {
      if(!nativeInputOnly||nativeReadUncertain)throw Error('Private native input required');
      const proof=verifyNativeRoundtripInput(input,nativeFixtureId);validateNativeSource();
      await record({phase:'native_roundtrip_input_before_js',proof});
      const armed=await page.evaluate(armJavascriptNativeRoundtrip,{binding:{...proof.binding,read_id:proof.raw.read_id},...nativeRoundtripProbe});
      await record({phase:'native_roundtrip_armed',...armed});return armed;
    },
    async checkNativeRoundtripBeforeExecute() {
      validateNativeSource();
      await page.evaluate(()=>{const s=globalThis.__loginomJavascriptNativeRoundtripV1;if(s?.stage!=='done-sealed')throw Error('Confirmed Done source not sealed');s.check();});
    },
    async bindNativeRoundtripGraph(node,inputPortGuid) {
      validateNativeSource();
      const result=await page.evaluate(bindJavascriptNativeRoundtripGraph,{node,inputPortGuid});
      await record({phase:'native_roundtrip_graph_bound',...result});
    },
    async readNativeRoundtrip(input,node,execution) {
      const before=verifyNativeRoundtripInput(input,nativeFixtureId);validateNativeSource();
      verifyNativeRoundtripExecution(execution,node,nativeFixtureId);
      await page.evaluate(completeJavascriptNativeRoundtrip,{execution,source_sha256:nativeRoundtripProbe.source_sha256});
      const results={before};
      for(const role of ['output','upstream']){
        validateNativeSource();
        const owner=role==='output'?node:input.node,completed=role==='output'?execution:before.exact.provenance.execution;
        const operation={id:'native-roundtrip-'+role+'-'+randomUUID(),action:{action_key:'diagnostic.javascript',revision:'1'},deadline};
        const ctx={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:owner,execution:completed,deadline};
        results[role]=await readNativeRoundtrip({options:{operation,execute,onRecord:record,now:Date.now,exclusiveNodeOperation:()=>!nativeReadUncertain,
          receiptOptions:(id,key,signature)=>({receipt_namespace:sessionId,receipt_id:id,receipt_signature:signature,operation_id:id})},ctx,input:before,role,targetOrigin:origin,targetBuild:build,
          onState:async state=>{nativeReadUncertain=!state||state.uncertain===true||state.retired===true||state.pending!==0||state.status!=='completed'||state.releasedRequests!==nativeInputFixture.rows||state.releasedResponses!==nativeInputFixture.rows;
            await record({phase:'native_roundtrip_lifecycle',role,state,uncertain:nativeReadUncertain});}});
      }
      await page.evaluate(()=>globalThis.__loginomJavascriptNativeRoundtripV1.check());
      validateNativeSource();
      results.outcome=verifyNativeRoundtripOutcome(results,nativeFixtureId);
      const saved=await record({phase:'native_roundtrip_verified',results,g5_complete:false});
      if(JSON.stringify(saved.results)!==JSON.stringify(results))throw Error('Roundtrip final journal ACK differs');
      return results;
    },
    async captureDropTopology() {
      await accountGuard();const before=await graph();requireJavascriptTopology(before);
      await record({phase:'javascript_palette_topology_before',before});
      const native=await page.evaluateHandle(captureJavascriptNativeTopology,{});
      try {
        const selection=await page.evaluate(held=>{
          const cells=held.graph.getSelectionCells();
          if(!Array.isArray(cells)||cells.length>20)throw Error('Palette selection diagnostic bound');
          return cells.map(cell=>({node_id:held.nodes.find(n=>n.cell===cell)?.guid??null,
            port_guid:held.nodes.flatMap(n=>n.ports).find(p=>p.cell===cell)?.guid??null,edge:cell.edge===true}));
        },native);
        await record({phase:'javascript_palette_selection_before',selection,modifiers:['Alt'],selection_is_not_link_authority:true});
        requireJavascriptGraphUnchanged(before,await graph());
        return {before,native};
      }catch(error){await native.dispose();throw error;}
    },
    async checkDropTopology(drop) {
      await accountGuard();
      await page.evaluate(captureJavascriptNativeTopology,{previous:drop.native,checkOnly:true});
      requireJavascriptGraphUnchanged(drop.before,await graph());
    },
    async connectInput(source,id,drop) {
      if(!drop||drop.linkAdmission)throw Error('JavaScript palette link admission already consumed or absent');
      if(drop.gesture?.automatic_link_suppression_requested!==true||drop.gesture.mouse_released!==true||drop.gesture.alt_released!==true)throw Error('Alt palette gesture/release unconfirmed');
      drop.linkAdmission=true;
      await accountGuard();
      const after=await graph();
      await record({phase:'javascript_palette_topology_after',before:drop?.before,after,source,id,
        target_candidates:after.nodes.filter(node=>node.ref.node_id===id),incoming:after.links.filter(edge=>edge.target===id)});
      let native;
      try {
        if(!drop?.native||!drop.before)throw Error('JavaScript retained palette baseline required');
        native=await page.evaluateHandle(captureJavascriptNativeTopology,{previous:drop.native,addedId:id});
        return await connectJavascriptInput({source,id,drop:drop.before,graph,record,allowAutoLink:false,
          checkNative:()=>page.evaluate(captureJavascriptNativeTopology,{previous:native,checkOnly:true}),
          connect:effect=>once(effect.id,effect.parameters,()=>adapter.mutate(effect,deadline))});
      }catch(error){
        await record({phase:'javascript_palette_topology_refused',source,id,reason:String(error.message)});throw error;
      }finally{await native?.dispose();}
    },
    async captureExecutionBoundary() {
      await accountGuard();const before=await graph();requireJavascriptTopology(before);
      return {before,native:await page.evaluateHandle(captureJavascriptNativeTopology,{})};
    },
    async verifyExecutionBoundary(boundary) {
      await accountGuard();
      await page.evaluate(captureJavascriptNativeTopology,{previous:boundary.native,checkOnly:true});
      requireJavascriptGraphUnchanged(boundary.before,await graph());
      await record({phase:'execution_boundary_verified',before:boundary.before});
    },
    async executeNode(node,operationDeadline=deadline,trial) {
      const phaseIdentity=javascriptExecutionIdentity(node,trial);
      if(executionPhases.has(phaseIdentity.effect_id))throw Error('JavaScript execution phase already reserved; no replay');
      if(trial.phase==='generated-mismatch'){
        const initial=executionPhases.get('execute-initial-'+node.node_id)?.terminal;
        if(initial?.verified!==true||initial.owner_verified!==true||initial.status!=='completed'
          ||initial.trial.source_sha256===trial.source_sha256)throw Error('Changed execution requires a completed distinct initial source');
      }
      const slot={identity:phaseIdentity};executionPhases.set(phaseIdentity.effect_id,slot);
      const executionDeadline=Math.min(deadline,operationDeadline);
      const driver=createNodeExecutionProcedure(channel(node,executionDeadline),node,{verifyFailedChild:true});
      const baseline=await driver.prepare();
      if(trial.phase==='generated-mismatch')verifyJavascriptPreviousExecution(baseline,executionPhases.get('execute-initial-'+node.node_id).terminal);
      const binding=await privateGraphBinding(node);
      try {
        const identity=await page.evaluate(b=>({node:b.node,icon:b.icon}),binding);
        await selectJavascriptForSettings(page,{...identity,binding,deadline:Math.min(executionDeadline,Date.now()+90000),record,requireSettings:false});
        const launch=await once(phaseIdentity.effect_id,{...phaseIdentity,node,baseline},()=>driver.launchGraph());
        await record({phase:'execution_launched',identity:phaseIdentity,node,baseline,launch,execution_dispatched:true,execution_completed:false});
        await waitJavascriptExecutionNotifications(page,{binding,deadline:executionDeadline,record});
        const identified=await driver.identify(),terminal=await driver.waitCompleted({});
        const result={...terminal,trial:phaseIdentity,fresh_baseline:baseline,launch_identity:identified};
        slot.terminal=result;
        await record({phase:'execution_terminal',identity:phaseIdentity,node,baseline,launch,identified,terminal:result});return result;
      }finally{await binding.dispose();}
    },
    async readPassive(node,kind='output',operationDeadline=deadline) {
      if(!['input','output','mismatch','discovery'].includes(kind))throw Error('Unknown passive JavaScript table kind');
      // No execution driver is called here. openNewOutputTable refuses an
      // inactive port instead of activating or executing its node.
      const readDeadline=Math.min(deadline,operationDeadline);
      const reader=channel(node,readDeadline),opened=await openNewOutputTable(reader,0,kind==='input'?{}:{openViews:async({output})=>{
        const openingDeadline=Math.min(readDeadline,Date.now()+90000),binding=await privateGraphBinding(node);
        await passiveSurface?.held.dispose();await passiveSurface?.binding.dispose();
        const held=await page.evaluateHandle(({binding:b,output})=>{
          const ports=b.native.FPorts.flatMap(list=>list.FCollection).filter(p=>p.FGuid===output.port_guid);
          if(ports.length!==1)throw Error('Passive cleanup output identity unavailable');
          return {port:ports[0],portData:ports[0].data,portCell:ports[0].FCell};
        },{binding,output});
        passiveSurface={binding,held,prepared:{...graphRequest,node},output};
        const identity=await page.evaluate(b=>({node:b.node,icon:b.icon}),binding);
        return await once('passive-views-'+(kind==='mismatch'?'generated-mismatch-':'')+node.node_id,{node,port_guid:output.port_guid,execution_started:false},()=>
            openJavascriptOutputViews(page,{...identity,binding,reference:node,prepared:{...graphRequest,node},channel:channel(node,openingDeadline),output,deadline:openingDeadline,record,select:selectJavascriptForSettings}));
      }});
      const formatProof=await configureTablePrecision(reader,opened.table);
      let result;
      try {
        const readSettings=await prepareTableRead(reader,opened.table),raw=await readTableOutputPages(reader,opened.table,{sampleRows:10});
        // Characterization decodes the independently observed Table schema;
        // a separate fixed mismatch oracle classifies it, never the old oracle.
        result=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:['mismatch','discovery'].includes(kind)?raw.columns:
          kind==='input'?javascriptInputColumns:javascriptOutputColumns,requireExactNumbers:true});
        if(['mismatch','discovery'].includes(kind))verifyJavascriptMismatchTable(result);else verifyJavascriptTable(result,kind);
      } finally {
        await restoreTablePrecision(reader,formatProof);
        if(kind!=='input'&&passiveSurface)passiveSurface.returnDispatched=true;
        await returnFromOutputTable(reader,opened.table);
        if(kind!=='input'&&passiveSurface){await passiveSurface.held.dispose();await passiveSurface.binding.dispose();passiveSurface=undefined;}
      }
      await record({phase:kind==='discovery'?'passive_discovery_output_characterized':kind==='mismatch'?'passive_mismatch_output_characterized':kind==='input'?'passive_input_verified':'passive_output_verified',execution_started:false,node,result});return result;
    },
  };
}
