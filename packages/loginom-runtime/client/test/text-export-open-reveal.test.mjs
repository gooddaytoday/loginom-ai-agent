import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';
import {Page,runtime} from './support/executor-fixture.mjs';
import {createTextExportNodeSupport} from '../lib/text-export-node.mjs';

// D30, LAB-82 head189 q3: bbox=(1256,172,42,78), viewport=1280x800.
// The observed point (1268,211) is valid, but the full body centre (1277,211)
// is obscured. Model the browser boundary; run the real export/channel drivers.
function fixture({fault,finish='execute',targetKind='existing',owner,receiptOptions,onRecord,now=Date.now}={}) {
 const node=owner?.parameters.target.ref??{document_id:'doc',workflow_id:'flow',node_id:'export'};
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const deadline=Date.now()+10000,records=[],gestures=[],processes=[],receipts=new Map();
 let pending,consoleOpen=false,menu=false,revealed=false,wizard=false,shown=false;
 const element=(tid,allowed_actions=['click'],extra={})=>({tid,ref:'ui-'+tid.replace(/[^a-zA-Z0-9-]/g,'-'),signature:{tid},enabled:true,allowed_actions,...extra});
 const changedSurface={};
 const snapshot=()=>({active_tab_ref:'ui-export-tab',package_identity:{name:'Task',path:'/user/task.lgp'},origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,
  dom_epoch:{document:'browser',revision:revealed?2:1},scan:{complete:true},geometry:{viewport:{width:1280,height:800}},
  navigation_context:{status:'observed',path:workflow.navigation_path},
  prepared_node_context:{...node,node_id:revealed&&fault==='owner'?'foreign':node.node_id,tid:'body',verified:true,surface:wizard?'wizard':'graph',locked:false},
  node_processes:{verified:consoleOpen,inventory_complete:true,root_id:'root',show_completed:true,processes:structuredClone(processes),node_context:{...node,verified:true,surface:'graph'}},
  wizard:wizard?{status:'observed',stage:'text_export_params',root_tid:'wizard',owner_context:{status:'observed',node:{tid:'path>Export',label:'Export'},path:[...workflow.navigation_path,{tid:'path>Export',label:'Export'},{tid:'settings',label:'Settings'}]}}:{status:'absent'},
  ui:{dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false},elements:[
   element('MF;cntMain;tlbMainToolbar;btnProgress'),...(wizard?[element('wizard;btnExecute',['execute_wizard'])]:[]),
   ...(consoleOpen?[element('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),element('ConsoleForm;btnClose'),...(processes.length?[element('process-row',['right_click'])]:[])]:[]),
   ...(menu?[element('mnContextMenu;mniShowCompletedProcesses',['click','press']),element('mnContextMenu;mniShowNodeToProcess',['show_process_node'])]:[]),
   element(workflow.prefix+';NavigationBar;NavigationPanel'),element(workflow.prefix+';ModelForm;cmpDiagram'),
   element('body',['click'],{ref:revealed?'ui-fresh-body':'ui-clipped-body',graph_node:{part:'body'},interaction:{state:'point_observed',point:{x:revealed?700:1268,y:211}},bounding_box:{x:revealed?679:1256,y:172,width:42,height:78}}),
   element('body;Setting',['begin_wizard'],{wizard_open:{node:{node_label:'Export'},workflow_path:workflow.navigation_path}})]},...changedSurface});
 const operation=owner??{id:'export',action:{action_key:'node.apply',revision:'1'},nodeApply:{request:{target:{kind:targetKind,ref:node},finish}}};
 const support=createTextExportNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation,now,
  receiptOptions:receiptOptions??((id,key,signature)=>({id,action_key:key,signature})),
  readReceipt:async ref=>({state:'completed',receipt:receipts.get(ref.operation_id)}),
  onRecord:async e=>{records.push(e);if(e.phase==='node_step_prepared')pending=e;return onRecord?onRecord(e):structuredClone(e);},
  execute:async code=>{
   if(code.includes('function readNodeProcesses'))return {...snapshot().node_processes,node_context:snapshot().prepared_node_context};
   if(code.includes('function readOutputContext'))return {verified:true,node_selected:shown,node_context:snapshot().prepared_node_context};
   if(!pending)return {status:'SUCCEEDED',output:snapshot()};
   const step=pending;pending=null;const action=step.action;
   const receipt={status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'ui.act',effect_possible:true,cleanup_complete:true};
   if(action.verb==='reveal_prepared_node') {
    assert.equal(action.target,targetKind==='existing'?'body':'drawing');
    assert.ok(code.includes(JSON.stringify({target:action.target}).slice(1,-1)),'viewport evaluator retains the same target');
    assert.equal(consoleOpen,false,'reveal must follow execution preparation');
    if(fault==='unknown')throw Error('Lost viewport reply');
    revealed=true;gestures.push('reveal');
    return {...receipt,action_key:'node.viewport.reveal.internal',output:{verified:true,graph_unchanged:true,fully_visible:true,settings_applied:false,node}};
   }
   if(action.ref==='ui-clipped-body')return {...receipt,status:'NOT_APPLIED',effect_possible:false,error:{code:'UI_REFERENCE_OBSCURED',message:'Body centre obscured'},trace:[]};
   gestures.push(action.verb+':'+action.ref);
   if(action.ref==='ui-MF-cntMain-tlbMainToolbar-btnProgress')consoleOpen=true;
   if(action.verb==='right_click')menu=true;
   if(action.ref==='ui-process-row')processes.at(-1).selected=true;
   if(action.verb==='show_process_node'){shown=processes.at(-1).selected;menu=false;}
   if(action.verb==='press')menu=false;
   if(action.ref==='ui-ConsoleForm-btnClose')consoleOpen=false;
   if(action.verb==='begin_wizard'){assert.equal(revealed,true);wizard=true;}
   if(action.verb==='execute_wizard'){
    assert.equal(wizard,true);wizard=false;
    const id=String(processes.filter(p=>p.parent_id===null).length+1);
    processes.push({parent_id:null,process_id:id,record_id:'record-'+id,state:'completed',error:false,children_loaded:true,expanded:true,rendered:true},
     {parent_id:id,process_id:id+'.1',record_id:'child-'+id,state:'completed',error:false,rendered:true,process_tid:'process-row'});
   }
   if(action.verb==='execute_wizard'&&fault==='transport')throw Error('Execute reply unavailable');
   receipts.set(step.internal_operation_id,receipt);
   return receipt;
  }});
 return {run:()=>driver.openWizard({document_id:'doc',workflow_ref:workflow,node,deadline}),operation,records,gestures,deadline,driver,processes,node,workflow,changedSurface};
}

for(const finish of ['execute','done'])test('existing Export reveals a partially clipped body before fresh selection/open: '+finish,async()=>{
 const f=fixture({finish});assert.equal((await f.run()).verified,true);
 assert.deepEqual(f.gestures.slice(-3),['reveal','click:ui-fresh-body','begin_wizard:ui-body-Setting']);
 assert.equal(f.operation.deadline,f.deadline);
 const reveal=f.records.findIndex(e=>e.phase==='node_step_completed'&&e.outcome?.action_key==='node.viewport.reveal.internal');
 const fresh=f.records.findIndex((e,i)=>i>reveal&&e.phase==='node_observation_completed'&&e.readiness?.condition==='export graph ready');
 const select=f.records.findIndex(e=>e.phase==='node_step_prepared'&&e.action.ref==='ui-fresh-body');
 assert.ok(reveal>=0&&fresh>reveal&&select>fresh);
});
for(const fault of ['owner','unknown'])test('existing Export stops on viewport '+fault+' without selection/open',async()=>{
 const f=fixture({fault});await assert.rejects(f.run(),fault==='owner'?/Prepared node binding is missing or changed/:/Lost viewport reply/);
 assert.equal(f.records.filter(e=>e.phase==='node_step_prepared'&&e.action.verb==='reveal_prepared_node').length,1);
 assert.equal(f.gestures.some(g=>g==='click:ui-fresh-body'||g.startsWith('begin_wizard:')),false);
 assert.equal(f.operation.deadline,f.deadline);
});

test('new Export keeps its complete drawing reveal',async()=>{
 const f=fixture({targetKind:'new'});assert.equal((await f.run()).verified,true);
 assert.equal(f.records.find(e=>e.action?.verb==='reveal_prepared_node').action.target,'drawing');
});

const deniedBefore=['later group before checkpoint','unconfirmed Execute journal','cancelled','expired','transport','unconfirmed destination','missing package identity'];
const refusedFresh=['replaced older group','later group during wait','later group before resume','wrong record','wrong tab','wrong package','different unsaved package','new document','wrong node','finish ACK still missing'];
for(const scenario of ['control','P3','second node','lost marker ACK','lost finish receipt','same group after repaint','unsaved package after repaint',...deniedBefore,...refusedFresh])
test('export finish after one Execute: '+scenario,async t=>{
 const {node,workflow}=fixture();
 const destination='/user/task.result.csv',packagePath='/user/task.lgp';
 const absent=['lost finish receipt','same group after repaint','unsaved package after repaint'].includes(scenario)||deniedBefore.includes(scenario)||refusedFresh.includes(scenario);
 const csv=Buffer.from('x;double\n10;20\n20;40\n');
 const dir=await mkdtemp(join(tmpdir(),'export-resume-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await createArtifactStore({directory:dir,sessionId:'session',storageDirectories:{exports:'/user',inputs:'/user',packages:'/user'}});
 let finishWrites=0,clockOffset=0,firstFinish;
  const records=[],graph={complete:true,document_id:'doc',workflow_ref:workflow,links:[],foreign_links:[],
   nodes:[node,{...node,node_id:'first'}].map(ref=>({ref,type:'exports.text',label:ref.node_id,position:{x:100,y:100},inputs:[],outputs:[]}))};
  const ok=async()=>({verified:true,cleanup_complete:true});
  let page;
  const app=runtime(new Page(),{now:()=>Date.now()+clockOffset,acceptanceProbe:scenario==='control'||absent?undefined:{condition:'P3',packagePath},onRecord:async e=>{
    if(scenario==='same group after repaint'&&e.phase==='node_observation_completed'&&e.readiness.condition==='one new node execution group'){
     for(const p of page.processes)p.state='pending_or_failed';
    }
    if(e.phase==='node_observation_completed'&&(scenario==='later group before checkpoint'&&e.readiness.condition==='one new node execution group'
     ||scenario==='later group during wait'&&e.readiness.condition==='new node execution completed'))
     page.processes.unshift({...page.processes[0],process_id:'2',record_id:'later'});
    if(scenario==='unconfirmed Execute journal'&&e.phase==='node_step_completed'&&
     records.some(p=>p.internal_operation_id===e.internal_operation_id&&p.action?.verb==='execute_wizard'))return {...e,outcome:{...e.outcome,operation_id:'foreign'}};
    if(absent&&e.phase==='node_phase_completed'&&e.receipt.phase==='finish'){
     if(++finishWrites===1){
      firstFinish=structuredClone(e.receipt);
      if(scenario==='cancelled')app.cancelNodeApply('export');
      if(scenario==='expired')clockOffset=11000;
      throw Error('Finish journal acknowledgement unavailable');
     }
     if(scenario==='finish ACK still missing')return {...e,receipt:{...e.receipt,receipt_id:'another'}};
    }
    if(e.phase==='acceptance_fault_triggered'&&scenario==='lost marker ACK')return {...e,receipt_id:'another'};
    records.push(e);return e;},
   nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,positionMatches:()=>true}),
   nodeApplyHandlers:new Map([['exports.text',{revision:'1',modes:['delimited'],validate:()=>{},
    configure:async()=>({verified:true,cleanup_complete:true,configuration:{destination,configured:{destination_check:{verified:scenario!=='unconfirmed destination',destination}}}})}]]),
   nodeApplyDriverFactory:options=>{
    page=fixture({owner:options.operation,now:options.now,fault:scenario==='transport'?scenario:undefined,receiptOptions:options.receiptOptions,onRecord:options.onRecord});
    if(scenario==='replaced older group')page.processes.push({parent_id:null,process_id:'1',record_id:'old',state:'completed',error:false});
    if(scenario==='missing package identity')page.changedSurface.package_identity=null;
    if(['unsaved package after repaint','different unsaved package'].includes(scenario))page.changedSurface.package_identity={path:null,name:'Task'};
    return {...page.driver,mapPorts:options.operation.id==='first'?async()=>{throw Error('Input mapping unavailable');}:ok,
     readOutput:async(read,ctx)=>{
      const execution_id=ctx.execution.execution_id,output={verified:true,cleanup_complete:true,status:'complete',ports:[],evidence_ref:ctx.receipt_id,execution_id};
      if(!absent)return output;
      const lease=await store.stageOutput({...node,destination,execution_id,session_id:store.outputSessionId});
      await writeFile(lease.path,csv);await lease.verify('task.result.csv',csv.length);
      return {...output,file_artifacts:[await lease.retain()]};
     }};
   }});
  const request={operation_id:'export',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'exports.text',ref:node},
   inputs:[],mappings:[],parameters:{destination},finish:'execute',mode:'delimited',read:{ports:[],sample_rows:0,require_exact_numbers:false},
   budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
  if(scenario==='second node'){
   app.startNodeApply({...request,operation_id:'first',target:{...request.target,ref:{...node,node_id:'first'}}});
   assert.equal((await app.waitNodeApply('first',{timeoutMs:2000})).outcome.output.pending_phase,'input_mapping');
   assert.equal((await app.recover('first',{strategy:'abandon_operation',recoveryOperationId:'first-release'})).output.resolution,'released_after_proof');
  }
  app.startNodeApply(request);
  const job=await app.waitNodeApply('export',{timeoutMs:2000});
  assert.equal(job.outcome?.status,scenario==='P3'||absent?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(job.outcome?.error));
  const marker=records.filter(e=>e.phase==='acceptance_fault_triggered');
  assert.equal(marker.length,scenario==='P3'?1:0);
  if(deniedBefore.includes(scenario)){
   const advice=(await app.inspect({operationId:'export'})).output;
   assert.equal(advice.next_steps.some(s=>s.tool==='dock_node_resume'),false);
   assert.throws(()=>app.startNodeApply({operation_id:'export'},{resume:true}));
   assert.deepEqual(await store.outputFiles(compactNodeResult(job)),[]);
   if(scenario==='later group before checkpoint')assert.equal((await app.recover('export',{strategy:'abandon_operation',recoveryOperationId:'release'})).output.original_outcome.output.execution.status,'unknown');
  }else if(absent){
   const advice=(await app.inspect({operationId:'export'})).output;
   assert.deepEqual(advice.next_steps[0].arguments,{operation_id:'export'});
   assert.equal(advice.next_steps[0].tool,'dock_node_resume');
   if(['same group after repaint','unsaved package after repaint'].includes(scenario))page.changedSurface.dom_epoch={document:'browser',revision:4};
   if(scenario==='same group after repaint')for(const p of page.processes)p.state='completed';
   if(scenario==='later group before resume')page.processes.unshift({...page.processes[0],process_id:'2',record_id:'later'});
   if(scenario==='replaced older group')page.processes[0].record_id='replacement';
   if(scenario==='wrong record')page.processes[0].record_id='another';
   if(scenario==='wrong tab')page.changedSurface.active_tab_ref='another';
   if(scenario==='different unsaved package')page.changedSurface.package_identity={path:null,name:'Other'};
   if(scenario==='wrong package')page.changedSurface.package_identity={name:'Other',path:'/user/other.lgp'};
   if(scenario==='new document')page.changedSurface.dom_epoch={document:'new',revision:2};
   if(scenario==='wrong node')page.changedSurface.prepared_node_context={...node,node_id:'another',verified:true,surface:'graph'};
   app.startNodeApply({operation_id:'export'},{resume:true});
   const result=compactNodeResult(await app.waitNodeApply('export',{timeoutMs:2000}));
   if(refusedFresh.includes(scenario)){
    assert.deepEqual([result.state,result.status],['settled','AMBIGUOUS']);
    assert.deepEqual(await store.outputFiles(result),[]);
    assert.equal(page.gestures.filter(g=>g.startsWith('execute_wizard:')).length,1);
    assert.equal((await app.inspect({operationId:'export'})).output.next_steps[0].arguments.strategy,'abandon_operation');
    if(scenario.startsWith('later group'))assert.equal((await app.recover('export',{strategy:'abandon_operation',recoveryOperationId:'release'})).output.original_outcome.output.execution.status,'unknown');
    return;
   }
   assert.deepEqual([result.state,result.status],['settled','SUCCEEDED'],JSON.stringify(result));
   assert.deepEqual(records.find(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='finish').receipt,firstFinish);
   const files=await store.outputFiles(result);
   assert.equal(files.length,1);assert.deepEqual(await readFile(files[0].path),csv);
   assert.equal(result.output.file_artifacts[0].execution_id,'doc:root:1');
   assert.equal(result.output.file_artifacts[0].sha256,createHash('sha256').update(csv).digest('hex'));
  }
  if(scenario==='P3'){
   const before=records.findIndex(e=>e.phase==='node_phase_prepared'&&e.receipt.receipt_id==='export:finish');
   const gesture=records.find(e=>e.phase==='node_step_prepared'&&e.action.verb==='execute_wizard');
   const completed=records.findIndex(e=>e.phase==='node_step_completed'&&e.internal_operation_id===gesture.internal_operation_id);
   assert.ok(before>=0&&before<completed&&completed<records.indexOf(marker[0]));
   assert.equal(job.outcome.output.pending_phase,'finish');
   assert.equal((await app.inspect({operationId:'export'})).output.state,'pending');
   app.startNodeApply(request);
   const release=await app.recover('export',{strategy:'abandon_operation',recoveryOperationId:'release'});
   assert.equal(release.output.resolution,'released_after_proof',JSON.stringify(release));
   assert.equal(release.output.original_outcome.output.execution.status,'unknown');
   assert.throws(()=>app.startNodeApply({operation_id:'export'},{resume:true}),/released/);
   assert.deepEqual(await store.outputFiles(compactNodeResult(await app.waitNodeApply('export',{timeoutMs:0}))),[]);
   assert.deepEqual(marker.map(e=>[e.condition,e.operation_id,e.receipt_id,e.execution_id,e.node]),[['P3','export','export:finish','doc:root:1',node]]);
  }
  assert.equal(records.some(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='finish'),scenario!=='P3'&&!deniedBefore.includes(scenario));
  assert.equal(page.gestures.filter(g=>g.startsWith('execute_wizard:')).length,1);
  assert.equal(page.processes.filter(p=>p.parent_id===null).length,scenario==='later group before checkpoint'?2:1);
});
