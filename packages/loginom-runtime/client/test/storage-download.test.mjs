import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,stat,rm,truncate} from 'node:fs/promises';
import {join,win32} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createServerDownloadRegistry,serverDownloadBudget} from '../lib/storage-policy.mjs';
import {fileStatIdentity} from '../lib/file-reference.mjs';
import {Page,runtime,actions,selectors,build} from './support/executor-fixture.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {runtimeCallTimeout} from '../../src/call-timeout.mjs';
import {createTextImportNodeSupport,verifyDeferredTextImportSources} from '../lib/text-import-node.mjs';
import {NodeProcedureStepError} from '../lib/node-procedure.mjs';
import {createExcelExportNodeSupport} from '../lib/exports-excel-node.mjs';

async function sourceNavigation(t,fault,options={}) {
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),records=[],deadlines=[];
 let epoch=0,checks=0,opened=false,refreshed=false;
 const native={kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'};
 const toolbar='MF;cntMain;tlbMainToolbar',button=toolbar+';btnFilestorage';
 const element=tid=>({ref:page.uiReference(tid),tid,kind:'control',scope:'workspace',label:'',enabled:true,visible:true,
  identity:{anchor_tid:tid,path:[]},signature:{tag:'button',tid},bounding_box:{x:10,y:10,width:20,height:20},
  interaction:{state:'point_observed',point:{x:20,y:20}},allowed_actions:['click']});
 const evaluate=page.evaluate.bind(page),elements=page.elements.bind(page);
 page.elements=()=>[...elements(),page.element(button)];
 page.click=async()=>{opened=true;};
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('return {document:state.epoch,revision:state.revision}')){
   if(++checks===1){epoch++;if(fault==='replaced')page.uiRefs.set(button,'ui-replaced-button');}
   return {...base.dom_epoch,revision:epoch};
  }
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  const state=structuredClone(base);state.dom_epoch.revision=epoch;
  if(arg.discoverRoots)state.observation_kind='roots';
  if(epoch&&arg.discoverRoots)refreshed=true;
  if(!opened){state.ui.elements=[element(toolbar),element(button)];
   if(refreshed&&fault==='owner')state.package_identity={name:'foreign',path:'/foreign.lgp'};
   if(refreshed&&fault==='directory')state.file_storage={status:'observed',directory:'/foreign'};
   if(refreshed&&fault==='target')state.ui.elements[1].signature.tag='foreign';
   if(arg.discoverRoots){state.ui.elements=[element(toolbar)];delete state.package_identity;}
   else state.observation_root={ref:arg.rootRef,identity:element(arg.rootRef===page.uiReference(toolbar)?toolbar:button).identity};
  }else{
   const nav=element(page.prefix+';NavigationBar;NavigationPanel'),file=element(page.prefix+';FileStorageForm;colName_full.csv');
   file.label='full.csv';file.storage_entry={...native};
   state.ui.elements=[nav,element(page.prefix+';FileStorageForm;pnlFileStorage;tbl'),file];
   state.file_storage={status:'observed',directory:'/worker'};
  }
  return state;
 };
 const r=runtime(page,{...options,cacheDirectory:join(f.root,'navigation'),onRecord:async record=>{records.push(record);return record;},
  execute:code=>{for(const match of code.matchAll(/"deadline_at":(\d+)/g))deadlines.push(Number(match[1]));return page.execute(code);},
  getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source');
 return {result,records,deadlines,page,refreshed,runtime:r,native,showGraph:()=>{opened=false;}};
}

test('a confirmed Excel destination conflict leaves the node and links uncreated',async t=>{
 const support=createExcelExportNodeSupport({storageDirectories:{packages:'/worker',inputs:'/worker',exports:'/worker'}});
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const workflow={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'d',workflow_ref};
 const steps=[];let exists=true;
 const f=await sourceNavigation(t,undefined,{...support,
  nodeTargetAdapterFactory:()=>({
   activateWorkflow:async()=>{steps.push('activate');throw Error('Lost workflow reply');},
   readWorkflowReceipt:async()=>({output:{state:'completed',receipt:workflow}}),
   verifyWorkflow:async()=>workflow,
   observe:async()=>{steps.push('graph');throw Error('End of test at graph observation');},
  }),
 });
 const destination='/worker/report.xlsx',evaluate=f.page.evaluate.bind(f.page);
 f.page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes('directory,destination})'))return evaluate(fn,arg);
  assert.equal(arg.destination,destination);
  steps.push('destination');
  return {verified:true,destination,exists};
 };
 const request={operation_id:'export-conflict',contract_revision:'1.0.0',document_id:'d',workflow_ref,
  target:{kind:'new',type:'exports.excel'},inputs:[{source:{document_id:'d',workflow_id:'flow',node_id:'table'},output:0,input:0}],
  mode:'xlsx',parameters:{excel_export:{destination,sheet_name:'Report',header:'labels',overwrite:'reject'}},mappings:[],finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const outcome=await f.runtime.runNodeApply(request);
 assert.equal(outcome.status,'NOT_APPLIED',JSON.stringify(outcome.error));
 assert.equal(outcome.cleanup_complete,true);assert.equal(outcome.effect_possible,false);
 assert.equal(outcome.output.node,null);assert.equal(outcome.output.pending_phase,null);
 assert.match(outcome.error.message,/report\.xlsx.*Ask.*user/);
 assert.deepEqual(steps,['destination']);
 assert.equal(f.records.find(e=>e.phase==='node_phase_refused')?.receipt.proof.destination,destination);
 assert.deepEqual(await f.runtime.runNodeApply(request),outcome);
 assert.deepEqual(steps,['destination']);
 // Early evidence is kept outside the source fingerprint so workflow recovery
 // can recheck the same source without reissuing the Files navigation.
 exists=false;
 const next={...request,operation_id:'export-after-conflict'};
 assert.equal((await f.runtime.runNodeApply(next)).output.pending_phase,'workflow');
 await f.runtime.inspect({operationId:next.operation_id});
 await f.runtime.runNodeApply(next,{resume:true});
 assert.ok(f.records.some(e=>e.phase==='node_continuation_checked'&&e.boundary==='workflow'&&e.verified));
 assert.deepEqual(steps,['destination','destination','activate','graph']);
});

test('Import binding consumes its observed file witness after Files returns to the graph',async t=>{
 const node={document_id:'d',workflow_id:'flow',node_id:'import'},workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'d',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let checked=0;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,activateWorkflow:async()=>({...await ok(),status:'SUCCEEDED',document_id:'d',workflow_ref:workflow})}),
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:context=>({verifySource:async()=>{
   f.showGraph();
   try{
    const source=await context.resolveBoundFileSource('/worker/full.csv');checked++;
    assert.equal(source.verified,true);assert.equal(source.bytes,3);
    assert.throws(()=>context.resolveBoundFileSource('/worker/other.csv'),/BINDING_SOURCE_UNVERIFIED/);
    return ok();
   }catch(error){error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
  },mapPorts:ok,openWizard:ok,finish:async mode=>({...await ok(),mode,settings_applied:true,execution_started:false}),waitExecution:ok,readOutput:ok,verifyContinuation:async()=>true}),
 });
 const request={operation_id:'bound-file',contract_revision:'1.0.0',document_id:'d',workflow_ref:workflow,target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{settings:{}},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const evaluate=f.page.evaluate;f.page.evaluate=async()=>{throw Error('SOURCE_UNAVAILABLE');};
 assert.notEqual((await f.runtime.serverDownload({operation_id:'failed-location',path:'/worker/full.csv'},'dock_storage_source')).status,'SUCCEEDED');
 f.page.evaluate=evaluate;
 const unknown=await f.runtime.runNodeApply({...request,operation_id:'bound-file-after-failed-location'});
 assert.notEqual(unknown.status,'SUCCEEDED');assert.equal(checked,0,'a failed current lookup cannot authorize an older witness');
 assert.equal((await f.runtime.serverDownload({operation_id:'fresh-location',path:'/worker/full.csv'},'dock_storage_source')).status,'SUCCEEDED');
 const result=await f.runtime.runNodeApply(request);assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(checked,1);
 const stale=await f.runtime.runNodeApply({...request,operation_id:'bound-file-again'});
 assert.notEqual(stale.status,'SUCCEEDED');assert.match(stale.error.message,/BINDING_SOURCE_UNVERIFIED/);assert.equal(checked,1);
});

test('production Import input scope accepts only Files-supported extensions inside session inputs',async t=>{
 const node={document_id:'d',workflow_id:'flow',node_id:'import'},workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'d',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let scope;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,activateWorkflow:async()=>({...await ok(),status:'SUCCEEDED',document_id:'d',workflow_ref:workflow})}),
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:context=>{scope=context.isBoundFileInput;return {verifySource:ok,mapPorts:ok,openWizard:ok,finish:async mode=>({...await ok(),mode,settings_applied:true,execution_started:false}),waitExecution:ok,readOutput:ok,verifyContinuation:async()=>true};},
 });
 const result=await f.runtime.runNodeApply({operation_id:'scope',contract_revision:'1.0.0',document_id:'d',workflow_ref:workflow,target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{settings:{}},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(typeof scope,'function');
 for(const ext of ['csv','TSV','txt','XLSX','lgd'])assert.equal(scope('/worker/a.'+ext),true,ext);
 for(const path of ['/worker/a.exe','/worker/a.csv.bak','/worker/a','/outside/a.csv','/worker/../foreign/a.csv'])assert.equal(scope(path),false,path);
});

for(const list of [false,true])for(const change of ['unchanged','bytes','mtime'])test('import retry after released STALE reopens Files and rechecks the original native witness: '+change+', list: '+list,async t=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},workflow={workflow_id:'flow',prefix:'MF;TF-1',
  tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let stale=true,opens=0;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,
   activateWorkflow:async()=>{f.showGraph();return {...await ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow};}}),
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:context=>({
   verifySource:createTextImportNodeSupport({}).nodeApplyDriverFactory(context).verifySource,
   mapPorts:ok,openWizard:async()=>{opens++;if(stale){stale=false;throw new NodeProcedureStepError({
    status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'UI_REFERENCE_STALE',message:'Observed control replaced'}});}return ok();},
   finish:async mode=>({...await ok(),mode,execution_started:false}),waitExecution:ok,readOutput:()=>assert.fail('no old rows may be read'),
   verifyContinuation:async()=>true,releasePending:async()=>({...await ok(),node_context:node,cleanup:{wizard_closed:false}}),
  }),
 });
 const source=f.result.output.source,request={operation_id:'import-first',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{source:{kind:'storage',server_source_ref:source.server_source_ref},
   settings:{source:{source_path:'/worker/full.csv'}}},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 if(list){request.parameters.source={kind:'verified_sources',sources:[request.parameters.source]};request.parameters.settings.source={source_paths:['/worker/full.csv']};}
 f.runtime.startNodeApply(request);
 const first=await f.runtime.waitNodeApply(request.operation_id,{timeoutMs:10000});
 assert.equal(first.outcome.error?.cause?.code,'UI_REFERENCE_STALE',JSON.stringify(first));
 const released=await f.runtime.recover(request.operation_id,{strategy:'abandon_operation',recoveryOperationId:'release-import'});
 assert.equal(released.status,'SUCCEEDED');
 if(change==='bytes')f.native.bytes++;
 if(change==='mtime')f.native.mtime='replaced';
 const deadline=f.page.clock+request.budgets.total_ms,click=f.page.click;
 f.page.click=async item=>{f.page.clock+=2000;return click(item);};
 f.runtime.startNodeApply({...request,operation_id:'import-retry'});
 const retry=await f.runtime.waitNodeApply('import-retry',{timeoutMs:10000});
 if(change==='unchanged'){
  assert.equal(retry.outcome.status,'SUCCEEDED',JSON.stringify(retry));assert.equal(opens,2);
 }else{
  assert.equal(retry.outcome.error.code,'LOGINOM_FILE_CHANGED',JSON.stringify(retry));
  assert.equal(retry.outcome.effect_possible,false);assert.equal(opens,1);
  assert.deepEqual(retry.outcome.output.output.ports,[]);
 }
 assert.ok(f.page.events.filter(e=>e==='mouse_click').length>=2,'retry must reacquire Files through the guarded UI');
 assert.equal(f.records.find(e=>e.operation_id==='import-retry'&&e.phase==='node_apply_prepared').deadline_at,deadline);
});

for(const fault of [undefined,'replaced'])test('source navigation reissues observation/ref after proven no-effect epoch refusal: '+fault,async t=>{
 const f=await sourceNavigation(t,fault);
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.records.find(r=>r.phase==='storage_source_failed')??f.result));
 const actions=f.records.filter(r=>r.phase==='completed'&&r.action_key==='ui.act');
 assert.equal(actions.length,2);assert.equal(actions[0].outcome.error.code,'UI_EPOCH_CHANGED');
 assert.equal(actions[0].outcome.effect_possible,false);assert.equal(actions[1].outcome.status,'SUCCEEDED');
 assert.notEqual(actions[0].parameters.observation_id,actions[1].parameters.observation_id);
 if(fault==='replaced')assert.notEqual(actions[0].parameters.action.ref,actions[1].parameters.action.ref);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,1);assert.equal(f.refreshed,true);
 assert.ok(f.deadlines.length);assert.ok(f.deadlines.every(d=>d-1000<runtimeCallTimeout('dock_storage_source',{})));
});
for(const fault of ['owner','directory','target'])test('source epoch refresh refuses changed '+fault,async t=>{
 const f=await sourceNavigation(t,fault);assert.equal(f.result.status,'FAILED');
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,0);
 assert.equal(f.records.filter(r=>r.phase==='completed'&&r.action_key==='ui.act').length,1);
});

async function storageScrollAfterFolder(t,{listing,fault,startInFiles=false,extension='csv',returnFault,signal,abortReturn,beforeReturnClick,options}={}){
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),records=[];
 const toolbar='MF;cntMain;tlbMainToolbar',button=toolbar+';btnFilestorage';
 const strip='MF;cntMain;cntWorkspace;Workspace;t.br',files={tab_tid:strip+';tb-2',prefix:'MF;TF-2'};
 const nav=files.prefix+';NavigationBar;NavigationPanel',table=files.prefix+';FileStorageForm;pnlFileStorage;tbl';
 const filename='full.'+extension;
 const row=files.prefix+';FileStorageForm;colName_',folder=row+'worker',anchor=row+'..',file=row+filename;
 const element=(tid,label='',allowed_actions=[])=>({ref:page.uiReference(tid),tid,label,allowed_actions,
  identity:{anchor_tid:tid,path:[]},signature:{tag:'div',tid},kind:'control',scope:'workspace',visible:true,enabled:true,
  bounding_box:{x:10,y:10,width:20,height:20},interaction:{state:'point_observed',point:{x:20,y:20}}});
 Object.assign(base,{active_tab_ref:page.uiReference(base.workflow_ref.tab_tid),
  navigation_context:{status:'observed',kind:'workflow',path:[{tid:base.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Сценарий',label:'Сценарий'}]}});
 let directory=startInFiles?'/worker':null,top=0,revision=0,attempts=0,scrolls=0,rowRef='ui-parent-row';
 let retrySamples=0,folderClicks=0,downloadStarts=0,mtime='native-time',returnDeadline,returnReceiptReadable=false,returnClicked=false;
 const filesTab=page.app.Application.FInstance.FMainForm.Items.Workspace;
 const getActiveTab=filesTab.getActiveTab;
 filesTab.getActiveTab=()=>directory===null?getActiveTab():{};
 const evaluate=page.evaluate.bind(page),elements=page.elements.bind(page),click=page.click.bind(page);
 page.elements=()=>[...elements(),page.element(button),page.element(folder)];
 page.click=async item=>{
  if(item.tid===button){directory='/';top=0;revision++;return;}
  if(item.tid===base.workflow_ref.tab_tid){
   returnClicked=true;
   if(fault==='return uncertain'||returnFault==='unknown click')throw Error('Return click outcome was lost');
   if(returnFault==='unknown verification')return;
   directory=null;revision++;return;
  }
  return click(item);
 };
 page.afterDoubleClick=async()=>{
  page.editor=null;directory='/worker';revision++;
  if(fault==='files replaced')page.uiRefs.set(files.tab_tid,'ui-replacement-files');
 };
 const stateFor=({rootRef,discoverRoots,storageName}={})=>{
  const state=structuredClone(base);
  state.dom_epoch.revision=revision;
  const inFiles=directory!==null;
  if(inFiles&&fault==='before return'&&rootRef===page.uiReference(strip))directory='/worker/foreign';
  if(fault==='deadline'&&storageName===filename)page.clock=91000;
  if(inFiles)Object.assign(state,{workflow_ref:files,active_tab_ref:page.uiReference(files.tab_tid),package_identity:null,
   file_storage:{status:'observed',directory},navigation_context:{status:'unobserved'}});
  if(discoverRoots){
   state.observation_kind='roots';
   delete state.active_tab_ref;
   delete state.package_identity;
   delete state.file_storage;
   state.ui.elements=storageName
    ?(storageName==='worker'&&directory==='/'?[element(folder,'worker')]:storageName===filename&&top&&fault!=='missing'?[element(file,filename)]:[])
    :inFiles?[element(nav),element(table),element(strip)]:[element(toolbar),element(strip)];
   return state;
  }
  const up={...element(anchor,'..',['scroll']),storage_entry:{kind:'unknown',directory_entries:2,row_ref:rowRef},
   scroll:{ref:page.uiReference(table),top,max_top:48}};
  const csv={...element(file,filename,['double_click']),storage_entry:{kind:'file',path:'/worker/'+filename,bytes:3,mtime,bytes_source:'native_file_store',
   directory_entries:2,row_ref:'ui-file-row'}};
  const scenario=element(base.workflow_ref.tab_tid,'Сценарий',['click']);
  if(returnFault==='clipped')scenario.interaction={state:'point_not_observed',point:null};
  state.ui.elements=!inFiles?[element(button,'',['click'])]
   :rootRef===scenario.ref?[scenario]
   :rootRef===page.uiReference(strip)?[scenario,element(files.tab_tid,'Файлы')]
   :directory==='/'?[{...element(folder,'worker',['double_click']),storage_entry:{kind:'folder'}}]
   :rootRef===page.uiReference(table)?[up,...(top&&fault!=='missing'?[csv]:[])]:rootRef===page.uiReference(file)?[csv]:[];
  if(rootRef)state.observation_root={ref:rootRef,identity:element(inFiles
   ?[nav,table,strip,folder,file,base.workflow_ref.tab_tid].find(tid=>page.uiReference(tid)===rootRef):toolbar).identity};
  return state;
 };
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('return {document:state.epoch,revision:state.revision}'))return {...base.dom_epoch,revision};
  if(fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')")){
   if(returnClicked&&['unknown verification','lost return verification'].includes(returnFault)&&arg.discoverRoots)
    throw Error('Return observation was lost');
   if(arg.rootRef===page.uiReference(strip))abortReturn?.();
   if(fault==='repaint'&&attempts===1&&arg.rootRef===page.uiReference(table)&&++retrySamples===2)revision++;
   return stateFor(arg);
  }
  return evaluate(fn,arg);
 };
 const r=runtime(page,{...options,cacheDirectory:join(f.root,'scroll'),onRecord:async record=>{
  records.push(record);
  if(fault==='late lookup'&&record.phase==='completed'&&record.parameters?.action.verb==='scroll'&&record.outcome.status==='SUCCEEDED')page.clock=89000;
  return record;
 },
  getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}}),
  execute:async (code,options)=>{
   if(code.includes('"action":{"verb":"click","ref":'+JSON.stringify(base.active_tab_ref))){
    returnDeadline=Number(code.match(/"deadline_at":(\d+)/)[1]);
    if(returnFault==='cancel in flight'){
     beforeReturnClick();options.signal.throwIfAborted();
    }
    if(returnFault==='lost return response'){
     await page.execute(code);
     throw Error('Return transport lost the completed receipt');
    }
    if(returnFault==='obscured'){
     const operation_id=code.match(/"operation_id":"([\w-]+:nav\d+)"/)[1];
     return {action_key:'ui.act',operation_id,phase:'preconditions',status:'NOT_APPLIED',cleanup_complete:true,effect_possible:false,output:{},
      error:{code:'UI_REFERENCE_OBSCURED',message:'The observed control has no verified visible interaction point'},trace:[]};
    }
   }
   if(returnFault==='lost return response'&&!returnReceiptReadable&&code.includes('"receipt_read":true'))
    return {status:'SUCCEEDED',action_key:'operation.inspect',output:{state:'running'}};
   if(code.includes('"download_path":')){
    assert.equal(directory,'/worker');downloadStarts++;
    const path=JSON.parse(code.match(/"download_path":("(?:[^"\\]|\\.)*")/)[1]);
    await writeFile(path,'abc');
    return {status:'SUCCEEDED',output:{download_started:true}};
   }
   if(code.includes('"operation_id":"copy"')&&code.includes('browserServerDownloadControl')){
    if(returnFault==='unconfirmed transfer cleanup'&&code.includes('"mode":"release"'))return {status:'FAILED'};
    return {status:'SUCCEEDED',output:{state:'settled',bytes:3}};
   }
   const scrolling=code.includes('"action":{"verb":"scroll"');
   const refusedClick=fault==='click epoch'&&code.includes('"action":{"verb":"double_click"');
   if(!scrolling&&!refusedClick)return page.execute(code);
   const operation_id=code.match(/"operation_id":"([\w-]+:nav\d+)"/)[1];
   if(refusedClick)folderClicks++;
   const refused=refusedClick||++attempts===1||['persistent','replaced workflow'].includes(fault);
   revision++;
   if(fault==='directory')directory='/worker/foreign';
   if(fault==='tab')page.uiRefs.set(files.tab_tid,'ui-foreign-tab');
   if(fault==='owner')page.uiRefs.set(table,'ui-foreign-table');
   if(fault==='position')top=12;
   if(fault==='row ref')rowRef='ui-replacement-parent-row';
   if(fault==='replaced workflow')page.uiRefs.set(base.workflow_ref.tab_tid,'ui-replacement-workflow');
   if(!refused){top=48;scrolls++;}
   const output=stateFor({rootRef:page.uiReference(refusedClick?folder:table)});
   return {action_key:'ui.act',action_revision:'1',operation_id,phase:refused?'preconditions':'completed',
    status:refused?'NOT_APPLIED':'SUCCEEDED',cleanup_complete:true,effect_possible:!refused,output,
    error:refused?{code:'UI_EPOCH_CHANGED',message:'The document changed since this observation'}:null,
    trace:refused&&['ui_scroll_applied','ui_preconditions_verified'].includes(fault)?[{event:fault}]:[]};
  }});
 const notices=[],onWorkflowReturn=state=>notices.push(state);
 const result=await r.serverDownload({operation_id:'scroll',path:listing?'/worker':'/worker/'+filename},listing?'dock_storage_list':'dock_storage_source',{signal,onWorkflowReturn});
 return {result,notices,returnDeadline,records,attempts,scrolls,retrySamples,folderClicks,r,page,downloadStarts:()=>downloadStarts,
  changeFile:()=>{mtime='new-native-time';},failReturn:fault=>{returnFault=fault;returnClicked=false;},
  revealReturnReceipt:()=>{returnReceiptReadable=true;},
  workflow:{...base.workflow_ref,workflow_id:'flow',navigation_path:base.navigation_context.path},showGraph:()=>{directory=null;}};
}

for(const listing of [false,true])test('Files folder repaint reissues the same scroll for '+(listing?'list':'source'),async t=>{
 const f=await storageScrollAfterFolder(t,{listing});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.records.find(r=>r.phase.endsWith('_failed'))??f.result));
 assert.equal(f.attempts,2);assert.equal(f.scrolls,1);
 assert.ok(listing?f.result.output.complete:f.result.output.source.server_source_ref);
 const actions=f.records.filter(r=>r.phase==='completed'&&r.parameters?.action.verb==='scroll');
 assert.notEqual(actions[0].parameters.observation_id,actions[1].parameters.observation_id);
});

for(const fault of ['directory','tab','owner','position'])test('Files scroll refuses a foreign '+fault+' after an epoch change',async t=>{
 const f=await storageScrollAfterFolder(t,{fault});
 assert.equal(f.result.status,'FAILED',JSON.stringify(f.result));
 assert.equal(f.attempts,1);assert.equal(f.scrolls,0);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,['directory','tab'].includes(fault)?2:3);
});

for(const fault of ['ui_scroll_applied','ui_preconditions_verified','row ref'])test('Files scroll does not reissue after '+fault,async t=>{
 const f=await storageScrollAfterFolder(t,{fault});
 assert.ok(['FAILED','AMBIGUOUS'].includes(f.result.status),JSON.stringify(f.result));
 assert.equal(f.attempts,1);assert.equal(f.scrolls,0);
 if(fault!=='row ref')assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
});

for(const listing of [false,true])test('Save works after a successful Files '+(listing?'list':'source'),async t=>{
 const f=await storageScrollAfterFolder(t,{listing});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 const save=await f.r.run('package.save_checkpoint',{path:'/user/data/packages/saved.lgp',conflict_policy:'fail'},{operationId:'save'});
 assert.equal(save.status,'SUCCEEDED',JSON.stringify(save));
});

test('Files scroll waits for two stable observations before reissuing',async t=>{
 const f=await storageScrollAfterFolder(t,{fault:'repaint'});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 assert.equal(f.attempts,2);assert.equal(f.scrolls,1);assert.ok(f.retrySamples>=3);
});

for(const fault of ['missing','click epoch','deadline','position'])test('Save works after a settled Files refusal: '+fault,async t=>{
 const f=await storageScrollAfterFolder(t,{fault});
 assert.equal(f.result.status,'FAILED',JSON.stringify(f.result));
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,1);
 if(fault==='click epoch')assert.equal(f.folderClicks,3);
 const save=await f.r.run('package.save_checkpoint',{path:'/user/data/packages/saved.lgp',conflict_policy:'fail'},{operationId:'save'});
 assert.equal(save.status,'SUCCEEDED',JSON.stringify(save));
});

for(const listing of [false,true])test('download reopens and revalidates Files after '+(listing?'list':'source')+' returns to the workflow',async t=>{
 const f=await storageScrollAfterFolder(t,{listing});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 f.page.clock=Date.now();
 const source=listing?f.result.output.entries[0]:f.result.output.source;
 const operation_id='copy';
 await f.r.serverDownload({operation_id,server_source_ref:source.server_source_ref},'dock_storage_download_start');
 const result=await f.r.serverDownload({operation_id,timeout_ms:10000},'dock_storage_download_wait');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify({result,failures:f.records.filter(r=>r.phase.endsWith('_failed'))}));
 assert.equal(f.downloadStarts(),1);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,2);
 const save=await f.r.run('package.save_checkpoint',{path:'/user/data/packages/saved.lgp',conflict_policy:'fail'},{operationId:'save'});
 assert.equal(save.status,'SUCCEEDED',JSON.stringify(save));
});

for(const listing of [false,true])test('confirmed '+(listing?'list':'source')+' survives a pre-gesture return refusal',async t=>{
 const f=await storageScrollAfterFolder(t,{listing,returnFault:'obscured'});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 assert.ok((listing?f.result.output.entries[0]:f.result.output.source).server_source_ref);
 assert.deepEqual(f.notices,['refused']);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
 const notices=[];
 const replay=await f.r.serverDownload({operation_id:'scroll',path:listing?'/worker':'/worker/full.csv'},
  listing?'dock_storage_list':'dock_storage_source',{onWorkflowReturn:state=>notices.push(state)});
 assert.deepEqual(replay,f.result);assert.deepEqual(notices,['refused']);
});

test('confirmed source survives a clipped workflow tab',async t=>{
 const f=await storageScrollAfterFolder(t,{returnFault:'clipped'});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));assert.deepEqual(f.notices,['refused']);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
});

for(const fault of ['obscured','unknown click','unconfirmed transfer cleanup'])test('cached download handles return boundary: '+fault,async t=>{
 const f=await storageScrollAfterFolder(t);
 f.failReturn(fault);f.page.clock=Date.now();
 const operation_id='copy',notices=[];
 await f.r.serverDownload({operation_id,server_source_ref:f.result.output.source.server_source_ref},'dock_storage_download_start');
 const result=await f.r.serverDownload({operation_id,timeout_ms:10000},'dock_storage_download_wait',{onWorkflowReturn:state=>notices.push(state)});
 assert.equal(f.downloadStarts(),1);
 if(fault==='obscured'){
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.cleanup_complete,true);
  assert.equal(await readFile(result.output.path,'utf8'),'abc');assert.deepEqual(notices,['refused']);
  const redelivered=[];
  assert.deepEqual(await f.r.serverDownload({operation_id},'dock_storage_download_status',{onWorkflowReturn:state=>redelivered.push(state)}),result);
  assert.deepEqual(redelivered,['refused']);
 }else{
  assert.equal(result.status,fault==='unknown click'?'AMBIGUOUS':'FAILED',JSON.stringify(result));
  assert.equal(result.cleanup_complete,false);assert.equal(result.effect_possible,fault==='unknown click');
  assert.equal(result.output.path,undefined);assert.deepEqual(notices,[]);
  if(fault==='unknown click'){
   const cleanup=await f.r.serverDownload({operation_id},'dock_storage_download_cleanup');
   assert.equal(cleanup.status,'AMBIGUOUS');assert.equal(cleanup.cleanup_complete,false);
  }
 }
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,fault==='unknown click'?6:5);
});

for(const fault of ['lost return response','lost return verification'])test('abandoning a download return releases the session: '+fault,async t=>{
 const f=await storageScrollAfterFolder(t);
 f.failReturn(fault);f.page.clock=Date.now();
 const receiptUnavailable=fault==='lost return response';
 const operation_id='copy';
 await f.r.serverDownload({operation_id,server_source_ref:f.result.output.source.server_source_ref},'dock_storage_download_start');
 const result=await f.r.serverDownload({operation_id,timeout_ms:10000},'dock_storage_download_wait');
 assert.equal(result.status,'AMBIGUOUS',JSON.stringify(result));
 assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);
 assert.equal(f.downloadStarts(),1);
 const gestures=f.page.events.filter(e=>e==='mouse_click').length;
 const first=await f.r.inspect();
 assert.equal(first.output.state,'pending');assert.equal(first.output.cleanup_confirmed,!receiptUnavailable);
 const returnId=first.output.operation_id;
 assert.equal(returnId,f.records.findLast(r=>r.phase==='completed'&&r.action_key==='ui.act').operation_id);
 assert.deepEqual(result.next_step.arguments,{operation_id:returnId});
 assert.equal(f.r.hasUnsettledWork(),true);
 await assert.rejects(f.r.recover(returnId,{strategy:'restore_control',recoveryOperationId:'restore-return'}),/fresh observation/);
 if(!receiptUnavailable)f.failReturn(undefined);
 const fresh=await f.r.observe({scope:'roots'});
 assert.equal(fresh.status,'SUCCEEDED',JSON.stringify(fresh));
 const abandon={strategy:'abandon_operation',recoveryOperationId:'abandon-return',observationId:fresh.output.observation_id};
 if(receiptUnavailable)await assert.rejects(f.r.recover(returnId,abandon),/has not confirmed completion/);
 assert.equal((await f.r.serverDownload({operation_id},'dock_storage_download_cleanup')).status,'AMBIGUOUS');
 f.revealReturnReceipt();
 const inspected=await f.r.inspect({operationId:returnId});
 assert.equal(inspected.output.state,'pending');assert.equal(inspected.output.cleanup_confirmed,true);
 const blockedSave={path:'/user/data/packages/saved.lgp',conflict_policy:'fail'};
 await assert.rejects(f.r.run('package.save_checkpoint',blockedSave,{operationId:'early-save'}),/pending.*download|download.*pending/i);
 await assert.rejects(f.r.serverDownload({operation_id:'early-list',path:'/worker'},'dock_storage_list'),/Resolve the pending/);
 const recovery=await f.r.recover(returnId,abandon);
 assert.equal(recovery.status,'SUCCEEDED',JSON.stringify(recovery));assert.equal(recovery.output.goal_verified,false);
 assert.equal(f.r.hasUnsettledWork(),false);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,gestures);
 assert.equal((await f.r.serverDownload({operation_id},'dock_storage_download_cleanup')).cleanup_complete,true);
 const settled=await f.r.serverDownload({operation_id},'dock_storage_download_status');
 assert.equal(settled.cleanup_complete,true);assert.equal(settled.output.path,undefined);
 f.failReturn(undefined);
 const listing=await f.r.serverDownload({operation_id:'after-list',path:'/worker'},'dock_storage_list');
 assert.equal(listing.status,'SUCCEEDED',JSON.stringify(listing));
 const save=await f.r.run('package.save_checkpoint',blockedSave,{operationId:'after-save'});
 assert.equal(save.status,'SUCCEEDED',JSON.stringify(save));
});

test('unsupported download format is refused before reopening Files',async t=>{
 const f=await storageScrollAfterFolder(t,{extension:'lgd'});
 assert.equal(f.result.status,'SUCCEEDED');
 f.page.events.length=0;f.page.clock=Date.now();
 await f.r.serverDownload({operation_id:'copy',server_source_ref:f.result.output.source.server_source_ref},'dock_storage_download_start');
 const result=await f.r.serverDownload({operation_id:'copy',timeout_ms:10000},'dock_storage_download_wait');
 assert.equal(result.error?.code,'LOGINOM_DOWNLOAD_FORMAT_UNSUPPORTED',JSON.stringify(result));
 assert.equal(f.downloadStarts(),0);assert.equal(f.page.events.filter(e=>e==='mouse_click').length,0);
});

test('public lookup reserves time to deliver the receipt after return',async t=>{
 const f=await storageScrollAfterFolder(t,{fault:'late lookup'});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 assert.ok(f.returnDeadline>f.page.clock);
 assert.ok(runtimeCallTimeout('dock_storage_source',{})-(f.returnDeadline-1000)>=5000);
});

test('cancellation during return observation prevents a workflow click',async t=>{
 const controller=new AbortController();
 const f=await storageScrollAfterFolder(t,{signal:controller.signal,abortReturn:()=>controller.abort()});
 assert.ok(controller.signal.aborted);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,0);
});

test('an unverified workflow after a confirmed return click stays AMBIGUOUS',async t=>{
 const f=await storageScrollAfterFolder(t,{returnFault:'unknown verification'});
 assert.equal(f.result.status,'AMBIGUOUS',JSON.stringify(f.result));
 assert.equal(f.result.effect_possible,true);assert.equal(f.result.cleanup_complete,false);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,3);assert.deepEqual(f.notices,[]);
});

for(const fault of ['obscured','unknown click','cancel in flight'])test('node source admission handles return boundary: '+fault,async t=>{
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
 const node={document_id:'d',workflow_id:'flow',node_id:'import'};
 let f,sourceChecks=0,activations=0;
 f=await storageScrollAfterFolder(t,{beforeReturnClick:()=>f.r.cancelNodeApply('admit'),options:{
  nodeTargetAdapterFactory:()=>({observe:async()=>({complete:true,document_id:'d',workflow_ref:f.workflow,
   nodes:[{ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]}],links:[],foreign_links:[]}),preflight:ok,reconcile:ok,
   activateWorkflow:async()=>{activations++;f.showGraph();return {...await ok(),status:'SUCCEEDED',document_id:'d',workflow_ref:f.workflow};}}),
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:context=>({verifySource:async()=>{
   sourceChecks++;
   return {...await ok(),source:await context.resolveStorageSource(f.result.output.source.server_source_ref)};
  },mapPorts:ok,openWizard:ok,finish:async mode=>({...await ok(),mode,settings_applied:true,execution_started:false}),
   waitExecution:ok,readOutput:ok,verifyContinuation:async()=>true}),
 }});
 f.failReturn(fault);
 const request={operation_id:'admit',contract_revision:'1.0.0',document_id:'d',workflow_ref:f.workflow,
  target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',
  parameters:{source:{kind:'storage',server_source_ref:f.result.output.source.server_source_ref}},mappings:[],finish:'done',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 f.r.startNodeApply(request);
 const status=await f.r.waitNodeApply('admit',{timeoutMs:10000});
 const {outcome}=status;
 assert.equal(outcome?.status,fault==='obscured'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(status));
 if(fault==='obscured'){assert.equal(sourceChecks,1);assert.equal(activations,1);}
 else{
  assert.equal(sourceChecks,0);assert.equal(activations,0);assert.equal(outcome.effect_possible,true);assert.equal(outcome.cleanup_complete,false);
  assert.equal(outcome.phase,'source');
  const inspected=await f.r.inspect({operationId:'admit'});
  assert.equal(inspected.output.state,'pending');assert.equal(inspected.output.outcome.status,'AMBIGUOUS');
 }
});

test('download refuses changed native metadata when it reopens Files',async t=>{
 const f=await storageScrollAfterFolder(t);
 f.changeFile();
 const operation_id='copy';
 await f.r.serverDownload({operation_id,server_source_ref:f.result.output.source.server_source_ref},'dock_storage_download_start');
 const result=await f.r.serverDownload({operation_id,timeout_ms:10000},'dock_storage_download_wait');
 assert.equal(result.status,'FAILED');assert.equal(f.downloadStarts(),0);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,2);
});

test('Files lookup reports an unresolved return gesture as AMBIGUOUS',async t=>{
 const f=await storageScrollAfterFolder(t,{fault:'return uncertain'});
 assert.equal(f.result.status,'AMBIGUOUS',JSON.stringify(f.result));
 assert.equal(f.result.cleanup_complete,false);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,3);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,0);
});

test('Files already active stay active after a successful lookup',async t=>{
 const f=await storageScrollAfterFolder(t,{startInFiles:true});
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.result));
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,0);
 assert.equal(f.page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller,undefined);
});

for(const fault of ['files replaced','before return'])test('successful lookup refuses a changed Files tab before returning: '+fault,async t=>{
 const f=await storageScrollAfterFolder(t,{fault});
 assert.ok(['FAILED','AMBIGUOUS'].includes(f.result.status),JSON.stringify(f.result));
 assert.equal(f.scrolls,1);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
});

test('Save works after a settled Files scroll refusal returns to the original workflow',async t=>{
 const f=await storageScrollAfterFolder(t,{fault:'persistent'});
 assert.equal(f.result.status,'FAILED',JSON.stringify(f.result));assert.equal(f.attempts,3);assert.equal(f.scrolls,0);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restored').length,1);
 const save=await f.r.run('package.save_checkpoint',{path:'/user/data/packages/saved.lgp',conflict_policy:'fail'},{operationId:'save'});
 assert.equal(save.status,'SUCCEEDED',JSON.stringify(save));
});

test('Files refusal never activates a replacement for the original workflow tab',async t=>{
 const f=await storageScrollAfterFolder(t,{fault:'replaced workflow'});
 assert.equal(f.result.status,'FAILED');assert.equal(f.attempts,3);assert.equal(f.scrolls,0);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,2);
 assert.equal(f.records.filter(r=>r.phase==='storage_workflow_restore_failed').length,1);
});

for(const change of ['unchanged','bytes','mtime'])test('deferred source validation restores Files before a new Execute: '+change,async t=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},group={...node,node_id:'group'};
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[
  {ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]},
  {ref:group,type:'transform.group_data',label:'Group',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const scan={basis:'backend_exact_scan',profile_id:'p',records:1,bytes:3,sha256:'a'.repeat(64),identity:{canonical_path:'/cache/full.csv',size:3,file_id:'1:2'}};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let executions=0;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,
   activateWorkflow:async()=>{f.showGraph();return {...await ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow};}}),
  nodeApplyHandlers:new Map(['imports.text','transform.group_data'].map(type=>[type,{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}])),
  nodeApplyDriverFactory:context=>({verifySource:async()=>{
   const checked=await verifyDeferredTextImportSources(context.operation.parameters,context.nodeHistory(),context.resolveStorageSource);
   return {...await ok(),...(context.operation.parameters.target.type==='imports.text'
    ?{source:{kind:'verified_delivery',bytes:3,sha256:scan.sha256,native_source:await context.resolveStorageSource(context.operation.parameters.parameters.source.server_source_ref)}}
    :{switched_sources:checked})};
  },mapPorts:ok,openWizard:ok,finish:async mode=>{if(mode==='execute')executions++;return {...await ok(),mode,execution_started:mode==='execute',execution_id:mode==='execute'?'exec':null};},
   waitExecution:async()=>({...await ok(),status:'completed',execution_id:'exec'}),readOutput:async()=>{
    assert.equal(executions,1,'output is read only after this execution');
    return {...await ok(),status:'complete',execution_id:'exec',evidence_ref:'fresh-execution',ports:[]};
   },verifyContinuation:async()=>true}),
 });
 const request={operation_id:'switch-done',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'imports.text',ref:node},
  inputs:[],mode:'delimited',parameters:{source:{kind:'storage',server_source_ref:f.result.output.source.server_source_ref},source_switch:{profile_id:'p',save_operation_id:'saved'}},
  mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 f.runtime.startNodeApply(request,{scanReceipt:scan});
 assert.equal((await f.runtime.waitNodeApply('switch-done',{timeoutMs:10000})).outcome.status,'SUCCEEDED');
 if(change==='bytes')f.native.bytes++;
 if(change==='mtime')f.native.mtime='replaced';
 f.runtime.startNodeApply({...request,operation_id:'execute-group',target:{kind:'existing',type:'transform.group_data',ref:group},parameters:{},finish:'execute'});
 const result=await f.runtime.waitNodeApply('execute-group',{timeoutMs:10000});
 if(change==='unchanged'){assert.equal(result.outcome.status,'SUCCEEDED',JSON.stringify(result));assert.equal(executions,1);}
 else {assert.equal(result.outcome.error.code,'LOGINOM_FILE_CHANGED');assert.match(result.outcome.error.message,/native storage size\/mtime/);
  assert.equal(result.outcome.effect_possible,false);assert.deepEqual(result.outcome.output.output.ports,[]);assert.equal(executions,0);}
});

test('source lookup reads only a delivered scroll anchor before rechecking a newly rendered row',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),table='ui-table',file='ui-file',nav='ui-navigation';let queries=0,tableReads=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const tableTid=page.prefix+';FileStorageForm;pnlFileStorage;tbl',fileTid=page.prefix+';FileStorageForm;colName_full.csv';
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  page.clock+=5000;
  const state=structuredClone(base);state.active_tab_ref='files';
  if(arg.discoverRoots){state.observation_kind='roots';state.ui.elements=arg.storageName
   ?(++queries>1?[element(file,fileTid)]:[]):[element(nav,page.prefix+';NavigationBar;NavigationPanel'),element(table,tableTid)];return state;}
  state.file_storage={status:'observed',directory:'/worker'};state.observation_root={ref:arg.rootRef,identity:{anchor_tid:arg.rootRef===table?tableTid:arg.rootRef===file?fileTid:page.prefix+';NavigationBar;NavigationPanel',path:[]}};
  if(arg.rootRef===table){tableReads++;state.ui.elements=Array.from({length:60},(_,i)=>({...element('ui-row-'+i,page.prefix+';FileStorageForm;colName_row'+i),
   kind:'control',label:'row'+i,description:'x'.repeat(1800),scroll:{ref:'ui-scroll',top:0,max_top:28633},allowed_actions:['scroll'],interaction:{state:'point_observed'}}));}
  else if(arg.rootRef===file)state.ui.elements=[{...element(file,fileTid),label:'full.csv',storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  else state.ui.elements=[];
  return state;
 };
 const started=page.clock,r=runtime(page,{cacheDirectory:join(f.root,'bounded-pages'),getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,
  loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'bounded-source',path:'/worker/full.csv'},'dock_storage_source');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.output.source.bytes,3);
 assert.equal(tableReads,1);assert.ok(page.clock-started<90000);assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});

const source=()=>({verified:true,kind:'storage',server_source_ref:'storage-one',destination:'/worker/full.csv',
 bytes:3,mtime:'2026-10-28T00:00:00Z',origin:'https://app.loginom.ai',account:'worker',document_id:'doc'});
async function fixture(t,transfer) {
 const root=await mkdtemp(join(tmpdir(),'server-cache-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const current=source(),registry=createServerDownloadRegistry({directory:join(root,'cache'),
  inspect:async()=>structuredClone(current),download:transfer??(async({path})=>writeFile(path,'abc'))});
 return {root,current,registry,request:{operation_id:'download',server_source_ref:'storage-one'}};
}
async function settled(registry,id='download') {
 while(registry.status(id).state==='running')await registry.wait(id,{timeoutMs:100});
 return registry.status(id);
}
test('explicitly disabled server cache refuses before lookup or download and retains source tools',async t=>{
 const f=await fixture(t),directory=join(f.root,'disabled-cache');
 const r=createActionRuntime({pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},
  allowCandidate:true,cacheDirectory:directory,serverSourceCache:false,execute:()=>assert.fail('Disabled cache must not inspect or click the browser')});
 const outcome=await r.serverDownload(f.request,'dock_storage_download_start');
 assert.equal(outcome.status,'FAILED');assert.equal(outcome.error.code,'SERVER_CACHE_DISABLED');
 assert.match(outcome.error.message,/для серверного файла точная сверка N недоступна/);
 assert.equal(outcome.effect_possible,false);assert.equal(outcome.cleanup_complete,true);assert.equal(r.hasActiveWork(),false);
 assert.ok(r.tools.some(tool=>tool.name==='dock_storage_source'));
 assert.match(r.tools.find(tool=>tool.name==='dock_storage_download_start').description,/disabled/i);
 await assert.rejects(stat(directory),{code:'ENOENT'});await r.cleanupServerCache();
});
test('production default enables server cache and requires an observed native source before any browser download',async t=>{
 const f=await fixture(t),directory=join(f.root,'unobserved-cache');
 const r=createActionRuntime({pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},
  allowCandidate:true,cacheDirectory:directory,execute:()=>assert.fail('An unobserved reference must not reach the browser')});
 const started=await r.serverDownload(f.request,'dock_storage_download_start');
 assert.equal(started.state,'running',JSON.stringify(started));
 const outcome=await r.serverDownload({operation_id:'download',timeout_ms:100},'dock_storage_download_wait');
 assert.equal(outcome.status,'FAILED');assert.equal(outcome.error.code,'LOGINOM_DOWNLOAD_FAILED');
 assert.equal(outcome.effect_possible,false);assert.equal(outcome.cleanup_complete,true);assert.equal(r.hasActiveWork(),false);
 assert.ok(r.tools.some(tool=>tool.name==='dock_storage_source'));
 assert.doesNotMatch(r.tools.find(tool=>tool.name==='dock_storage_download_start').description,/disabled/i);
 await assert.rejects(stat(directory),{code:'ENOENT'});await r.cleanupServerCache();
});
test('server download deadline is size-derived and capped without a global timeout change',()=>{
 assert.equal(serverDownloadBudget(0),120000);
 assert.equal(serverDownloadBudget(2*1024**3),2168000);
 assert.equal(serverDownloadBudget(100*1024**3),7200000);
 for(const value of [-1,NaN,Infinity,1.5])assert.throws(()=>serverDownloadBudget(value));
});
test('growing Chromium bytes keep a slow download alive beyond the old fixed deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const native={...source(),bytes:2*1024**3};
 const registry=createServerDownloadRegistry({directory:join(f.root,'slow'),now:()=>clock,inspect:async()=>native,
  download:async({path,onProgress})=>{
   for(let n=1;n<=15;n++){clock=n*60000;onProgress(n*100*1024**2);}
   await writeFile(path,'');await truncate(path,native.bytes);
  }});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.progress.elapsed_ms,900000);
 assert.equal(result.progress.bytes,native.bytes);await registry.cleanup();
});
test('unchanged byte reports cannot renew the no-progress deadline; late growth cannot revive it',async t=>{
 for(const late of [false,true]){
  const f=await fixture(t);let clock=0;
  const registry=createServerDownloadRegistry({directory:join(f.root,'stalled'),now:()=>clock,inspect:async()=>({...source(),bytes:2*1024**3}),
   download:async({path,onProgress,signal})=>{
    await writeFile(path,'a');clock=60000;onProgress(1);clock=179999;onProgress(1);
    clock=180000;onProgress(late?2:1);signal.throwIfAborted();
   }});
  registry.start(f.request);const result=await settled(registry);
  assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_NO_PROGRESS');
  assert.equal(result.cleanup_complete,true);assert.deepEqual(await readdir(join(f.root,'stalled')),[]);
 }
});
test('complete native bytes allow cache finalization under the original absolute deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const native={...source(),bytes:2*1024**3};
 const registry=createServerDownloadRegistry({directory:join(f.root,'finalizing'),now:()=>clock,inspect:async()=>native,
  download:async({path,onProgress,signal})=>{
   clock=60000;onProgress(native.bytes);
   clock=190000;onProgress(native.bytes);signal.throwIfAborted();
   await writeFile(path,'');await truncate(path,native.bytes);
  }});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.progress.deadline_at,serverDownloadBudget(native.bytes));
 assert.equal(result.progress.elapsed_ms,190000);
 assert.equal((await stat(result.output.path)).size,native.bytes);await registry.cleanup();
});
test('complete native bytes never extend the absolute deadline or authorize an unverified cache',async t=>{
 for(const fault of ['deadline','native','copy']){
  const f=await fixture(t);let clock=0,reads=0;
  const native={...source(),bytes:2*1024**3};
  const registry=createServerDownloadRegistry({directory:join(f.root,'finalizing-'+fault),now:()=>clock,
   inspect:async()=>({...native,mtime:++reads>1&&fault==='native'?'changed':native.mtime}),
   download:async({path,onProgress,signal})=>{
    clock=60000;onProgress(native.bytes);
    clock=fault==='deadline'?serverDownloadBudget(native.bytes):190000;
    onProgress(native.bytes);signal.throwIfAborted();
    await writeFile(path,'');await truncate(path,native.bytes-(fault==='copy'?1:0));
   }});
  registry.start(f.request);const result=await settled(registry);
  assert.equal(result.status,'FAILED',JSON.stringify(result));
  assert.equal(result.error.code,fault==='deadline'?'LOGINOM_DOWNLOAD_DEADLINE':'LOGINOM_FILE_CHANGED');
  assert.equal(result.progress.deadline_at,serverDownloadBudget(native.bytes));
  assert.equal(result.cleanup_complete,true);
  assert.deepEqual(await readdir(join(f.root,'finalizing-'+fault)),[]);
 }
});
test('no-progress timer cancels and drains a stalled transfer even without status reports',async t=>{
 const f=await fixture(t);t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
 let started=false;
 const registry=createServerDownloadRegistry({directory:join(f.root,'silent'),inspect:async()=>({...source(),bytes:2*1024**3}),
  download:async({path,signal})=>{await writeFile(path,'a');started=true;
   await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));signal.throwIfAborted();}});
 registry.start(f.request);while(!started&&registry.status('download').state==='running')await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started,true,JSON.stringify(registry.status('download')));
 t.mock.timers.tick(120000);await registry.cleanup();
 const result=registry.status('download');
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_NO_PROGRESS');
 assert.equal(result.cancel_requested,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(await readdir(join(f.root,'silent')),[]);
});
// Same guarantee on both platforms: no other user can read the cache root.
// Windows: a protected DACL (no inherited ACEs) allowing only the current user,
// SYSTEM. All foreign explicit and inherited ACEs must be removed.
// POSIX: no group/other mode bits.
async function assertPrivateCache(directory) {
 if(process.platform!=='win32'){assert.equal((await stat(directory)).mode&0o777,0o700);return;}
 const system32=win32.join(process.env.SystemRoot,'System32');
 const user=spawnSync(win32.join(system32,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).stdout.match(/"(S-1-[0-9-]+)"/i)[1];
 const script='$a=Get-Acl -LiteralPath $env:LOGINOM_ACL_PATH;ConvertTo-Json -Compress @{protected=$a.AreAccessRulesProtected;'
  +'rules=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|%{@{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;type=[string]$_.AccessControlType}})}';
 const result=spawnSync(win32.join(system32,'WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],
  {encoding:'utf8',windowsHide:true,env:{...process.env,LOGINOM_ACL_PATH:directory}});
 const acl=JSON.parse(result.stdout),text=JSON.stringify(acl);
 assert.equal(acl.protected,true,text);
 assert.ok(acl.rules.length>0,text);
 for(const rule of acl.rules)assert.ok(rule.type==='Allow'&&rule.inherited===false&&['S-1-5-18',user].includes(rule.sid),text);
}
test('download writes a private cache, binds its receipt to native identity and never uploads',async t=>{
 const f=await fixture(t);f.registry.start(f.request);
 const result=await settled(f.registry);assert.equal(result.status,'SUCCEEDED');
 const path=result.output.path;await assertPrivateCache(join(f.root,'cache'));
 assert.equal((await stat(path)).size,3);
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:1,bytes:3,sha256:'a'.repeat(64),
  identity:{canonical_path:path,...fileStatIdentity(await stat(path,{bigint:true}))}};
 assert.equal((await f.registry.bind(source(),receipt)).sha256,receipt.sha256);
 assert.equal((await f.registry.bind({...source(),server_source_ref:'refreshed-native-ref'},receipt)).sha256,receipt.sha256);
 assert.equal((await f.registry.bind({...source(),account:'foreign'},receipt)).sha256,undefined);
 assert.equal((await f.registry.bind(source(),{...receipt,identity:{...receipt.identity,canonical_path:'/foreign'}})).sha256,undefined);
 assert.equal((await f.registry.bind(source(),{...receipt,identity:{...receipt.identity,file_id:'0:0'}})).sha256,undefined);
 assert.equal((await f.registry.bind({...source(),mtime:'changed'},receipt)).sha256,undefined);
 await f.registry.cleanup();assert.deepEqual(await readdir(join(f.root,'cache')),[]);
});

test('public server source discovery refuses foreign roots and unsupported files before browser navigation',async t=>{
 const f=await fixture(t),page=new Page();
 page.execute=()=>assert.fail('Invalid source must not invoke the browser');
 const r=runtime(page,{cacheDirectory:join(f.root,'runtime-cache'),getStorageBinding:()=>({directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 assert.ok(r.tools.some(t=>t.name==='dock_storage_source'));
 for(const path of ['/foreign/full.csv','/worker/../foreign.csv','/worker/full.lgp'])
  await assert.rejects(r.serverDownload({operation_id:'source',path},'dock_storage_source'));
 assert.equal(r.hasActiveWork(),false);await r.cleanupServerCache();
});

test('source discovery waits through the old graph tab before reading the new Files navigation root',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();
 const nav='ui-navigation',old='ui-old-navigation',file='ui-file',table='ui-table';let roots=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const files={...base,observation_kind:'roots',active_tab_ref:'files',ui:{...base.ui,elements:[
  element(nav,page.prefix+';NavigationBar;NavigationPanel'),element(table,page.prefix+';FileStorageForm;pnlFileStorage;tbl'),
  element(file,page.prefix+';FileStorageForm;colName_full.csv')]}};
 const graph={...base,observation_kind:'roots',ui:{...base.ui,elements:[element(old,page.prefix+';NavigationBar;NavigationPanel')]}};
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  if(arg.discoverRoots){
   const state=structuredClone(++roots===2?graph:files);
   // Real workspace-ui storage_name selects only matching file rows, omitting
   // NavigationPanel and the global toolbar (LAB-386 server-a/0.jsonl:2-3).
   if(arg.storageName)state.ui.elements=state.ui.elements.filter(e=>e.tid.endsWith(';colName_'+arg.storageName));
   page.clock+=1000;return state;
  }
  if(arg.rootRef===old)throw Error('Detached graph navigation root must not be read');
  const state=structuredClone(files);delete state.observation_kind;
  state.file_storage={status:'observed',directory:'/worker'};
  if(arg.rootRef===file)state.ui.elements=[{...element(file,page.prefix+';FileStorageForm;colName_full.csv'),label:'full.csv',
   storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  return state;
 };
 const r=runtime(page,{serverSourceCache:false,cacheDirectory:join(f.root,'navigation-cache'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:'https://loginom.invalid',loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source');
 assert.equal(result.status,'SUCCEEDED');assert.ok(result.output.source.server_source_ref);
 assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});

for(const listing of [false,true])for(const restoredTab of [true,false])test('storage navigation replans only a restored Files tab: '+listing+', restored: '+restoredTab,async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),records=[];
 let directory='/',prefix=page.prefix,restored=false;const visited=[];
 const tid=suffix=>prefix+suffix,nav=';NavigationBar;NavigationPanel',table=';FileStorageForm;pnlFileStorage;tbl';
 const root=';cnrNaviMode;b.s_Сервер>Файлы',row=';FileStorageForm;colName_';
 const element=(suffix,label='',allowed=[])=>({ref:page.uiReference(tid(suffix)),tid:tid(suffix),kind:'control',scope:'workspace',label,enabled:true,visible:true,
  identity:{anchor_tid:tid(suffix),path:[]},signature:{tag:'button',tid:tid(suffix)},bounding_box:{x:10,y:10,width:20,height:20},
  interaction:{state:'point_observed',point:{x:20,y:20}},allowed_actions:allowed});
 const name=()=>directory==='/'?'worker':directory==='/worker'?'target':'full.csv';
 const evaluate=page.evaluate.bind(page),elements=page.elements.bind(page);
 page.elements=()=>[...elements(),page.element(tid(row+name())),page.element(tid(root))];
 page.click=async()=>{directory='/';visited.push(directory);};
 page.afterDoubleClick=async()=>{
  if(!restored){restored=true;directory='/worker/old';if(restoredTab)prefix='MF;TF-0';}
  else directory=directory==='/'?'/worker':'/worker/target';
  visited.push(directory);
 };
 page.evaluate=async(fn,arg)=>{
  if(!arg||!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  const state=structuredClone(base);page.clock+=500;
  state.workflow_ref={...base.workflow_ref,prefix};state.active_tab_ref=prefix;
  state.file_storage={status:'observed',directory,listing_complete:false};
  const entry=element(row+name(),name(),directory==='/worker/target'?[]:['double_click']);
  entry.storage_entry=directory==='/worker/target'?{kind:'file',path:directory+'/full.csv',bytes:3,
   mtime:'native-time',bytes_source:'native_file_store',directory_entries:1}:{kind:'folder',directory_entries:1};
  state.ui.elements=[element(nav),element(table),element(root,'Файлы',['click']),entry];
  if(arg.discoverRoots){state.observation_kind='roots';if(arg.storageName)state.ui.elements=state.ui.elements.filter(e=>e.label===arg.storageName);}
  else state.observation_root={ref:arg.rootRef,identity:state.ui.elements.find(e=>e.ref===arg.rootRef)?.identity};
  return state;
 };
 const r=runtime(page,{onRecord:async x=>{records.push(x);return x;},cacheDirectory:join(f.root,'restore'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:base.origin,loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'restore',path:'/worker/target'+(listing?'':'/full.csv')},listing?'dock_storage_list':'dock_storage_source');
 if(!restoredTab){assert.equal(result.status,'FAILED');assert.match(records.at(-1).error.message,/Server storage UI is not ready/);assert.deepEqual(visited,['/worker/old']);return;}
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(records.filter(x=>/storage_.*failed/.test(x.phase))));
 assert.deepEqual(visited,['/worker/old','/','/worker','/worker/target']);
 if(listing){assert.equal(result.output.directory,'/worker/target');assert.equal(result.output.complete,true);}
 else assert.equal(result.output.source.path,'/worker/target/full.csv');
});

test('source discovery reacquires invalidated read pages without replaying any gesture',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();let reads=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const files={...base,observation_kind:'roots',active_tab_ref:'files',ui:{...base.ui,elements:[
  element('ui-navigation',page.prefix+';NavigationBar;NavigationPanel'),element('ui-table',page.prefix+';FileStorageForm;pnlFileStorage;tbl'),
  element('ui-file',page.prefix+';FileStorageForm;colName_full.csv'),
  ...Array.from({length:40},(_,i)=>element('ui-extra-'+i,page.prefix+';FileStorageForm;extra'+i))]}};
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  // LAB-374 s-server-a:8-9 and last-a:8-10: tab replacement followed by
  // several DOM revisions. None of these no-effect reads authorizes a click.
  const state=structuredClone(files),sequence=[0,21,341,455,1387,1417,1598,2681];
  state.dom_epoch.revision=sequence[Math.min(reads++,sequence.length-1)];
  if(reads===1){state.workflow_ref={prefix:'MF;TF-1',tab_tid:'tb-1'};}
  else {state.workflow_ref={prefix:'MF;TF-2',tab_tid:'tb-2'};
   for(const e of state.ui.elements){e.tid=e.tid.replace(page.prefix,'MF;TF-2');e.identity.anchor_tid=e.tid;}}
  if(!arg.discoverRoots){delete state.observation_kind;state.file_storage={status:'observed',directory:'/worker'};
   if(arg.rootRef==='ui-file')state.ui.elements=[{...element('ui-file',state.workflow_ref.prefix+';FileStorageForm;colName_full.csv'),label:'full.csv',
    storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  }
  return state;
 };
 const r=runtime(page,{cacheDirectory:join(f.root,'pages-cache'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:'https://loginom.invalid',loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 assert.equal((await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source')).status,'SUCCEEDED');
 assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});
test('changed native size/mtime or wrong copy size invalidates download and removes partials',async t=>{
 for(const kind of ['size','mtime','copy']){
  const f=await fixture(t,async({path})=>{await writeFile(path,kind==='copy'?'abcd':'abc');
   if(kind==='size')f.current.bytes++;if(kind==='mtime')f.current.mtime='changed';});
  f.registry.start(f.request);const result=await settled(f.registry);
  assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);
  assert.match(result.error.code,/FILE_CHANGED/);assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 }
});
test('cancel drains the actual transfer before deleting partials; IDs cannot replay a download',async t=>{
 let transfers=0,release;
 const f=await fixture(t,async({path,signal})=>{transfers++;await writeFile(path,'a');
  await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});signal.throwIfAborted();});
 f.registry.start(f.request);while(!release&&f.registry.status('download').state==='running')await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(typeof release,'function',JSON.stringify(f.registry.status('download')));
 f.registry.start(f.request);assert.equal(transfers,1);
 assert.throws(()=>f.registry.start({...f.request,server_source_ref:'other'}),/different/);
 f.registry.cancel('download');const result=await settled(f.registry);
 assert.equal(result.status,'FAILED');assert.equal(result.cancel_requested,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 await f.registry.cleanup();
});

test('a transfer finishing beyond its original deadline is invalid and removed',async t=>{
 let clock=0;
 const f=await fixture(t);
 const registry=createServerDownloadRegistry({directory:join(f.root,'timed'),now:()=>clock,inspect:async()=>source(),
  download:async({path,deadline})=>{await writeFile(path,'abc');clock=deadline+1;}});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_DEADLINE');
 assert.deepEqual(await readdir(join(f.root,'timed')),[]);
});

test('native validation time consumes the original download deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const registry=createServerDownloadRegistry({directory:join(f.root,'expired-before-transfer'),now:()=>clock,
  inspect:async()=>{clock=serverDownloadBudget(3)+1;return source();},
  download:async()=>assert.fail('No browser gesture after the original deadline')});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_DEADLINE');
});

test('unknown browser cleanup retains the lease and partial until actual recovery',async t=>{
 const f=await fixture(t);let recovered=false;
 const registry=createServerDownloadRegistry({directory:join(f.root,'unknown'),inspect:async()=>source(),
  download:async({path})=>{await writeFile(path,'a');throw Object.assign(Error('transport lost'),{cleanupUnconfirmed:true});},
  recover:async id=>{assert.equal(id,'download');recovered=true;}});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.cleanup_complete,false);assert.equal(registry.unsettled,true);
 assert.equal(result.error.code,'LOGINOM_DOWNLOAD_FAILED');
 assert.equal(result.output.cleanup_error.code,'LOGINOM_DOWNLOAD_CLEANUP_FAILED');
 assert.equal((await readdir(join(f.root,'unknown'))).length,1);
 assert.throws(()=>registry.start({...f.request,operation_id:'other'}),/cleanup/);
 await registry.cleanup('download');assert.equal(recovered,true);assert.equal(registry.unsettled,false);
 assert.deepEqual(await readdir(join(f.root,'unknown')),[]);
});

test('aborting a long status wait releases the caller without cancelling the retained download',async t=>{
 let active;
 const f=await fixture(t,async({path,signal})=>{
  await writeFile(path,'a');active=true;
  await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));signal.throwIfAborted();
 });
 f.registry.start(f.request);while(!active&&f.registry.status('download').state==='running')await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(active,true,JSON.stringify(f.registry.status('download')));
 const controller=new AbortController();
 const waiting=f.registry.wait('download',{timeoutMs:60000,signal:controller.signal});
 controller.abort(Error('owner interrupted'));
 await assert.rejects(waiting,/owner interrupted/);assert.equal(f.registry.busy,true);
 await f.registry.cleanup();assert.equal(f.registry.unsettled,false);
});

test('folder listing returns every native Files row with its own storage reference without file names',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();
 const nav='ui-navigation',table='ui-table',dir='/worker/Silent Talk/transactions';
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const names=['transactions_2026-10.csv','README.txt','transactions_2026-09.csv','transactions_2026-11.csv'];
 const rows=()=>[...names.map((name,i)=>({...element('ui-row-'+i,page.prefix+';FileStorageForm;colName_'+name),label:name,
  storage_entry:{kind:'file',path:dir+'/'+name,bytes:100+i,mtime:'2026-11-0'+(i+1)+'T00:00:00.000Z',bytes_source:'native_file_store',directory_entries:6}})),
  {...element('ui-row-folder',page.prefix+';FileStorageForm;colName_archive'),label:'archive',storage_entry:{kind:'folder',directory_entries:6}},
  // Observed parent link row (LAB-1468 stage 0 model.stdout:35): unknown kind.
  {...element('ui-row-up',page.prefix+';FileStorageForm;colName_..'),label:'..',storage_entry:{kind:'unknown',selected:true,directory_entries:6}}];
 const evaluate=page.evaluate.bind(page);let gestures=0;
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  const state=structuredClone(base);state.active_tab_ref='files';page.clock+=500;
  if(arg.discoverRoots){state.observation_kind='roots';state.ui.elements=[element(nav,page.prefix+';NavigationBar;NavigationPanel'),
   element(table,page.prefix+';FileStorageForm;pnlFileStorage;tbl')];return state;}
  state.file_storage={status:'observed',directory:dir};
  state.observation_root={ref:arg.rootRef,identity:{anchor_tid:arg.rootRef===table?page.prefix+';FileStorageForm;pnlFileStorage;tbl':page.prefix+';NavigationBar;NavigationPanel',path:[]}};
  state.ui.elements=arg.rootRef===table?rows():[];
  return state;
 };
 page.click=async()=>{gestures++;};
 const records=[];const r=runtime(page,{onRecord:async x=>{records.push(x);return x;},cacheDirectory:join(f.root,'listing'),getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,
  loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const tool=r.tools.find(tool=>tool.name==='dock_storage_list');
 assert.ok(tool);assert.equal(tool.annotations.readOnlyHint,true);
 // The observed refusal (LAB-1468): a folder given to the single-file locator.
 await assert.rejects(r.serverDownload({operation_id:'folder-as-file',path:dir+'/'},'dock_storage_source'),/dock_storage_list/);
 await assert.rejects(r.serverDownload({operation_id:'mask-as-file',path:dir+'/*.csv'},'dock_storage_source'),/dock_storage_list/);
 await assert.rejects(r.serverDownload({operation_id:'bare-folder',path:dir},'dock_storage_source'),/dock_storage_list/);
 await assert.rejects(r.serverDownload({operation_id:'foreign',path:'/foreign/transactions'},'dock_storage_list'));
 await assert.rejects(r.serverDownload({operation_id:'bad-pattern',path:dir,pattern:'*.csv|*.txt'},'dock_storage_list'),/\* only/);
 const result=await r.serverDownload({operation_id:'list',path:dir+'/',pattern:'*.csv'},'dock_storage_list');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(records.filter(x=>/storage_list/.test(x.phase))));
 const out=result.output;
 assert.equal(out.directory,dir);assert.equal(out.complete,true);assert.equal(out.truncated,false);
 assert.equal(out.native_entry_count,6);assert.equal(out.files_matched,3);assert.equal(out.files_other,1);assert.equal(out.folders,1);
 assert.deepEqual(out.entries.map(e=>[e.kind,e.name]),[['file','transactions_2026-09.csv'],['file','transactions_2026-10.csv'],['file','transactions_2026-11.csv'],['folder','archive']]);
 const files=out.entries.filter(e=>e.kind==='file');
 assert.ok(files.every(e=>/^storage-/.test(e.server_source_ref)&&e.path===dir+'/'+e.name&&Number.isSafeInteger(e.bytes)&&e.mtime));
 assert.equal(new Set(files.map(e=>e.server_source_ref)).size,3);
 assert.equal(gestures,0);
 // Same ID and request replay the receipt; a different request is refused.
 assert.deepEqual(await r.serverDownload({operation_id:'list',path:dir+'/',pattern:'*.csv'},'dock_storage_list'),result);
 await assert.rejects(r.serverDownload({operation_id:'list',path:dir},'dock_storage_list'));
});

// LAB-1843 (lab1824-r10a main :2076/:960): every paged read re-ran the browser
// observation, ~7 reads per scroll step. Navigation now reads each state once.
test('storage navigation reads each roots/table state with one browser observation',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();
 const nav='ui-navigation',table='ui-table',dir='/worker';
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const names=Array.from({length:60},(_,i)=>'file'+String(i).padStart(3,'0')+'.csv');
 const rows=()=>names.map((name,i)=>({...element('ui-row-'+i,page.prefix+';FileStorageForm;colName_'+name),kind:'control',label:name,description:'x'.repeat(1800),
  bounding_box:{x:0,y:i*24,width:400,height:23},storage_entry:{kind:'file',path:dir+'/'+name,bytes:1,mtime:'t',bytes_source:'native_file_store',directory_entries:60}}));
 const filler=()=>Array.from({length:90},(_,i)=>({...element('ui-filler-'+i,'MF;cntMain;filler'+i),description:'y'.repeat(300)}));
 const evaluate=page.evaluate.bind(page),reads={roots:0,table:0};
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  const state=structuredClone(base);state.active_tab_ref='files';
  if(arg.discoverRoots){reads.roots++;state.observation_kind='roots';state.ui.elements=[element(nav,page.prefix+';NavigationBar;NavigationPanel'),
   element(table,page.prefix+';FileStorageForm;pnlFileStorage;tbl'),...filler()];return state;}
  state.file_storage={status:'observed',directory:dir};
  state.observation_root={ref:arg.rootRef,identity:{anchor_tid:arg.rootRef===table?page.prefix+';FileStorageForm;pnlFileStorage;tbl':page.prefix+';NavigationBar;NavigationPanel',path:[]}};
  if(arg.rootRef===table)reads.table++;
  state.ui.elements=arg.rootRef===table?rows():[];
  return state;
 };
 const r=runtime(page,{cacheDirectory:join(f.root,'whole-pages'),getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,
  loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'list-grown',path:dir},'dock_storage_list');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.output.complete,true);assert.equal(result.output.files_matched,60);
 // Initial, directory() and listing roots reads; one table read; no page reads.
 assert.deepEqual(reads,{roots:3,table:1});
});
