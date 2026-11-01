import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {configureTextExport} from '../lib/text-export-procedure.mjs';
import {makeTextExportContextCode} from '../lib/text-export-context.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {EXPORT_FIELDS} from '../lib/text-export-parameters.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';

const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Workflow',label:'Workflow'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
const parameters={destination:'/test-2/a.csv',text_qualifier:'"',decimal_separator:'.',null_marker:'?',true_value:'True',false_value:'False',date_separator:'',time_separator:'',date_format:'',time_format:''};

// Reproduce LAB-560: the PreviewWizard exists before 15 s, while its native
// Ext controls and owned loading mask finish at 19.7 s. Only time and the UI
// observation transport are fixtures; Next and both native readers are real.
async function fixture(t,{fault,deadline=30000}={}){
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('http://export.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto('http://export.test/');
 await page.evaluate(({binding,parameters,fields,fault})=>{
  const base=binding.workflow_ref.prefix+';WizrdMCF',components=new Map();
  const element=(tid,parent=document.body)=>{const e=document.createElement('div');e.dataset.tid=tid;e.id='id-'+components.size+'-'+document.querySelectorAll('[id]').length;e.style.cssText='width:300px;min-height:20px';parent.append(e);return e;};
  const tab=element(binding.workflow_ref.tab_tid);tab.classList.add('x-tab-active');
  element(binding.workflow_ref.navigation_path[0].tid).textContent='Workflow';
  const root=element(base),button=document.createElement('button');button.dataset.tid=base+';btnNext';button.textContent='Next';root.append(button);
  class PackageTreeNode{} class WorkFlowTreeNode{} class ModelNodeTreeNode{}
  class WizardModelComponentForm{}
  const pkg=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg});
  const node=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:binding.node.node_id,FModelNode:{}});
  const model=Object.assign(new WizardModelComponentForm(),{FModelNode:node.FModelNode,FView:{el:{dom:root}}});
  const card={Controller:{Node:{data:{node}},FController:model}};
  globalThis.bg={app:{PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}};
  globalThis.__loginomDockPreparationV1={document,id:binding.document_id,receipts:new Map([['receipt',{phase:'verified',workflowId:binding.workflow_ref.workflow_id,tab,packageNode:pkg,nodeTargetWorkflowNode:workflow}]])};
  globalThis.Ext={getCmp:id=>components.get(id)};
  const control=(parent,tid,value)=>{const e=element(tid,parent);components.set(e.id,{el:{dom:e},getValue:()=>value,pressed:false});};
  const params=element(base+';ExportTextFileParamsWizard',root);
  for(const [key,[card,id]]of Object.entries(fields))if(card==='ExportTextFileParamsWizard'){
   control(params,base+';'+card+';'+id+';ValueControl',parameters[key]);control(params,base+';'+card+';'+id+';SwitchButton',false);
  }
  control(params,base+';ExportTextFileParamsWizard;edtConnection','Локальное');
  const values={delimiter:';',encoding:65001,bom:false,line_ending:0,header:1};
  globalThis.exportFixture={time:0,clicks:0,finished:0,stage:'text_export_params',masked:false,advance(time){
   this.time=time;if(!this.clicks)return;
   if(time>=9000&&this.stage==='text_export_params'){
    params.remove();this.preview=element(base+';ExportTextFilePreviewWizard',root);this.stage='text_export_format';this.masked=true;
    control(this.preview,base+';ExportTextFilePreviewWizard;edtFormatType;ValueControl',{format:0});control(this.preview,base+';ExportTextFilePreviewWizard;edtFormatType;SwitchButton',false);
   }
   if(this.preview)for(const [key,at]of Object.entries({delimiter:9700,encoding:14400,bom:14400,line_ending:17000,header:19500})){
    if(time<at||this[key])continue;this[key]=true;const [card,id]=fields[key];
    control(this.preview,base+';'+card+';'+id+';ValueControl',fault==='unsupported'&&key==='encoding'?1252:values[key]);control(this.preview,base+';'+card+';'+id+';SwitchButton',false);
   }
   if(time>=19700&&fault!=='deadline')this.masked=false;
   if(time>=10000&&fault==='owner')node.FGuid='foreign';
   if(time>=10000&&fault==='document')__loginomDockPreparationV1.id='foreign';
   if(time>=10000&&fault==='workflow')workflow.ParentNode=new PackageTreeNode();
   if(time>=10000&&fault==='dialog'&&!document.querySelector('.x-window'))element('foreign-dialog').className='x-window';
  }};
  button.onclick=()=>exportFixture.clicks++;
 },{binding,parameters,fields:EXPORT_FIELDS,fault});
 t.mock.timers.enable({apis:['Date'],now:100000});
 const ac=new AbortController(),records=[];
 const advance=async ms=>{t.mock.timers.tick(ms);await page.evaluate(time=>exportFixture.advance(time),Date.now()-100000);if(fault==='cancel'&&Date.now()>=110000)ac.abort(Error('fixture cancelled'));};
 page.waitForTimeout=advance;
 const operation={id:'export',deadline:100000+deadline,action:{action_key:'node.apply',revision:'1'}};
 const execute=async code=>{
  if(!code.includes('workspaceUiCapability'))return new Function('return ('+code+')')()(page);
  const owner=await readPreparedNodeContext(page,binding);
  const state=await page.evaluate(({binding,fault})=>({origin:location.origin,loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,dom_epoch:{document:'browser',revision:1},scan:{complete:true},wizard:{status:'observed',stage:exportFixture.stage,root_ref:'wizard',root_tid:binding.workflow_ref.prefix+';WizrdMCF'},ui:{elements:[],dialogs:document.querySelector('.x-window')?[{ref:'foreign',text:'foreign'}]:[],masks:exportFixture.masked?[{kind:'busy',ref:fault==='mask'&&exportFixture.time>=10000?'foreign':'wizard',target_tid:binding.workflow_ref.prefix+';WizrdMCF',dialog_ref:null}]:[],truncated:{masks:false,dialogs:false,elements:false}}}),{binding,fault});
  return {status:'SUCCEEDED',output:{...state,prepared_node_context:owner}};
 };
 const channel={...createNodeProcedure({operation,execute,record:async e=>{records.push(e);return structuredClone(e);},targetOrigin:'http://export.test',targetBuild:'7.4.2',preparedNodeContext:binding,now:Date.now,monotonicNow:Date.now,wait:advance,signal:ac.signal})};
 // The final generic wizard gesture is outside this regression's boundary.
 channel.perform=async()=>{ac.signal.throwIfAborted();assert.ok(Date.now()<operation.deadline);const current=await execute(makeTextExportContextCode(binding));assert.equal(current.verified,true);await page.evaluate(()=>exportFixture.finished++);};
 return {page,records,operation,run:()=>configureTextExport(channel,{}, {...binding,finish:'execute',deadline:operation.deadline,signal:ac.signal},{execute,onRecord:async e=>{records.push(e);return e;},operation,targetOrigin:'http://export.test',receiptOptions:(id,key,signature)=>({receipt_namespace:'export-test',receipt_id:id,receipt_signature:signature}),close:async()=>({cleanup_complete:true,draft_discarded:true,settings_applied:false})})};
}

test('Next confirms its PreviewWizard before 15 s, then waits for native format readiness at 19.7 s',async t=>{
 const f=await fixture(t),result=await f.run().catch(error=>{assert.equal(f.records.find(e=>e.phase==='text_export_next_completed')?.outcome.error?.code,undefined);throw error;});
 assert.equal(result.verified,true);assert.equal(result.configuration.configured.text_export_format.values.encoding.value,65001);
 const next=f.records.find(e=>e.phase==='text_export_next_completed').outcome;
 assert.equal(next.status,'SUCCEEDED');assert.ok(next.trace.at(-1).elapsed_ms<15000);
 assert.ok(f.records.some(e=>e.phase==='node_observation_sample'&&e.readiness.elapsed_ms>10000));
 assert.deepEqual(await f.page.evaluate(()=>({clicks:exportFixture.clicks,finished:exportFixture.finished,time:exportFixture.time})),{clicks:1,finished:1,time:19800});
 assert.equal(f.operation.deadline,130000);
});

for(const fault of ['owner','document','workflow','mask','dialog','cancel','deadline','unsupported'])test('format settlement retains '+fault+' refusal without repeating Next',async t=>{
 const f=await fixture(t,{fault});await assert.rejects(f.run());
 assert.equal(f.records.find(e=>e.phase==='text_export_next_completed').outcome.status,'SUCCEEDED');
 assert.deepEqual(await f.page.evaluate(()=>({clicks:exportFixture.clicks,finished:exportFixture.finished})),{clicks:1,finished:0});
 assert.equal(f.operation.deadline,130000);assert.ok(Date.now()<=130000);
});

test('format readiness cannot outlive the original operation deadline',async t=>{
 const f=await fixture(t,{deadline:18000});await assert.rejects(f.run());
 assert.equal(f.operation.deadline,118000);assert.equal(Date.now(),118000);
 assert.equal(await f.page.evaluate(()=>exportFixture.clicks),1);
});

test('native reader retains recognized page and precise control refusal',async t=>{
 const f=await fixture(t);await f.page.locator('button').click();await f.page.evaluate(()=>exportFixture.advance(9000));
 const r=await new Function('return ('+makeTextExportContextCode(binding)+')')()(f.page);
 assert.equal(r.verified,false);assert.equal(r.stage,'text_export_format');assert.equal(r.reason,'export_control_delimiter');assert.equal(r.node_context.verified,true);
});
