import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright-core';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {EXPORT_FIELDS} from '../lib/text-export-parameters.mjs';

const prefix='MF;TF-1',root=prefix+';WizrdMCF',base=root+';ExportTextFileParamsWizard;';
const binding={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
 navigation_path:[{tid:prefix+';cnrNaviMode;b.s_Workflow',label:'Workflow'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'node'}};

// LAB-1389 replace-boolean :913: after focusing the export path field, both
// ownership reads of an 854-element wizard (811 in its root, 39 controls)
// exhausted 500 ms in the controls stage. The page has real Chromium layout;
// after focus each native geometry/style/hit-test read is charged a fixed
// page-clock cost, as in storageScrollCostFixture.
async function fixture(t,{fault}={}) {
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.route('http://owner.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"></body>'}));
 await page.goto('http://owner.test/');
 const fields=Object.entries(EXPORT_FIELDS).filter(([,[card]])=>card==='ExportTextFileParamsWizard');
 await page.evaluate(({binding,root,base,fields,fault})=>{
  const components=new Map();let ids=0;
  const add=(tag,parent,tid,style)=>{const e=document.createElement(tag);if(tid)e.dataset.tid=tid;e.id='ext-'+ids++;if(style)e.style.cssText=style;parent.append(e);return e;};
  const avatar=add('button',document.body,'MF;cntMain;tlbMainToolbar;btnAvatar');avatar.textContent='user';
  const tab=add('div',document.body,binding.workflow_ref.tab_tid);tab.className='x-tab-active';tab.textContent='Настройка';
  add('div',document.body,binding.workflow_ref.navigation_path[0].tid).textContent='Workflow';
  // Ext viewport/tab/card nesting: every control shares these ancestors.
  let parent=document.body;
  for(let i=0;i<18;i++)parent=add('div',parent,null,'position:relative;width:1200px');
  const wizard=add('div',parent,root,'position:relative;width:1200px;height:700px');
  let body=wizard;
  for(let i=0;i<6;i++)body=add('div',body,null,'position:relative;width:1180px;height:'+(680-i)+'px'+(i===3?';overflow:auto':''));
  const params=add('div',body,base.slice(0,-1),'width:1150px');
  for(const [key,[,id]] of fields){
   const field=add('div',params,base+id,'display:flex;height:40px;width:1100px');
   let label=field;for(let i=0;i<4;i++)label=add('div',label,null,'width:300px');
   add('label',label).textContent=key;
   let cell=add('table',field,null,'width:700px');cell=add('tbody',cell);cell=add('tr',cell);
   const td=add('td',cell);
   const value=add('div',td,base+id+';ValueControl','width:600px;height:24px');
   let wrap=value;for(let i=0;i<4;i++)wrap=add('div',wrap,null,'width:600px');
   const input=add('input',wrap,null,'width:560px');input.value=key==='destination'?'':key==='text_qualifier'?'"':'x';
   for(let i=0;i<30;i++)add('span',td,null,'display:inline-block;width:1px;height:1px');
   const sw=add('a',add('td',cell),base+id+';SwitchButton','display:inline-block;width:20px;height:20px');
   add('span',add('span',sw));components.set(sw.id,{pressed:false,el:{dom:sw}});
  }
  for(const name of ['btnBack','btnNext','btnFinish','btnCancel'])add('button',wizard,root+';'+name).textContent=name;
  // Remaining anonymous Ext layout elements inside the wizard root.
  const filler=add('div',params,null,'width:10px');
  while(wizard.querySelectorAll('*').length<810)add('div',filler,null,'width:1px;height:0');
  class PackageTreeNode{} class WorkFlowTreeNode{} class ModelNodeTreeNode{} class WizardModelComponentForm{}
  const pkg=new PackageTreeNode(),workflow=Object.assign(new WorkFlowTreeNode(),{ParentNode:pkg});
  const node=Object.assign(new ModelNodeTreeNode(),{ParentNode:workflow,FGuid:binding.node.node_id,FModelNode:{}});
  const model=Object.assign(new WizardModelComponentForm(),{FModelNode:node.FModelNode,FView:{el:{dom:wizard}}});
  globalThis.bg={app:{Version:'7.4.2',PackageTreeNode,WorkFlowTreeNode,ModelNodeTreeNode,
   Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node}},FController:model}})}}}}}}};
  globalThis.__loginomDockPreparationV1={document,id:binding.document_id,receipts:new Map([['receipt',{phase:'verified',workflowId:binding.workflow_ref.workflow_id,tab,packageNode:pkg,nodeTargetWorkflowNode:workflow}]])};
  globalThis.Ext={getCmp:id=>components.get(id)};
  // Page clock: after focus, each native layout/style/hit-test read costs a
  // fixed amount. Counts are kept per kind for the measurement.
  const realNow=Date.now.bind(Date);let offset=0;Date.now=()=>realNow()+offset;
  const cost=globalThis.ownerScanCost={charging:false,ms:0.25,reads:{},total:0};
  const read=kind=>{if(!cost.charging)return;cost.reads[kind]=(cost.reads[kind]??0)+1;cost.total++;offset+=cost.ms;};
  const wrap=(target,key,kind)=>{const original=target[key];target[key]=function(...args){read(kind);return original.apply(this,args);};};
  wrap(Element.prototype,'getBoundingClientRect','box');wrap(globalThis,'getComputedStyle','style');wrap(Document.prototype,'elementFromPoint','hit');
  for(const key of ['scrollHeight','clientHeight','scrollWidth','clientWidth']){
   const d=Object.getOwnPropertyDescriptor(Element.prototype,key);
   Object.defineProperty(Element.prototype,key,{...d,get(){read('extent');return d.get.call(this);}});
  }
  const path=document.querySelector('[data-tid="'+base+'edtFileName;ValueControl"] input');
  path.addEventListener('focus',()=>{
   cost.charging=true;
   if(fault==='mask')add('div',document.body,null,'position:fixed;inset:0').className='x-mask';
   if(fault==='owner')node.FGuid='foreign';
  });
 },{binding,root,base,fields,fault});
 const execute=options=>runInNewContext(makeWorkspaceUiCode({expected_origin:'http://owner.test',expected_build:'7.4.2',prepared_node_context:binding,...options}))(page);
 const roots=await execute({mode:'observe',discover_roots:true});
 assert.equal(roots.status,'SUCCEEDED',JSON.stringify(roots.error));
 const wizardRoot=roots.output.ui.elements.find(e=>e.tid===root);
 assert.ok(wizardRoot,JSON.stringify(roots.output.ui.elements.map(e=>e.tid)));
 const observed=await execute({mode:'observe',root_ref:wizardRoot.ref});
 assert.equal(observed.status,'SUCCEEDED',JSON.stringify(observed.error));
 assert.equal(observed.output.prepared_node_context?.surface,'wizard');
 assert.equal(observed.output.wizard.stage,'text_export_params');
 const field=observed.output.ui.elements.find(e=>e.wizard_field?.name==='destination');
 assert.ok(field?.allowed_actions.includes('set_wizard_field'),JSON.stringify(observed.output.wizard));
 return {page,observed,run:text=>execute({mode:'act',snapshot:observed.output,action:{verb:'set_wizard_field',ref:field.ref,text}})};
}

test('export path ownership read after focus fits the scan budget',async t=>{
 const f=await fixture(t),result=await f.run('/test-2/a.csv');
 const cost=await f.page.evaluate(()=>ownerScanCost);
 if(process.env.OWNER_SCAN_MEASURE)console.log(JSON.stringify({scan:f.observed.output.scan,controls:f.observed.output.ui.elements.length,cost,trace:result.trace}));
 assert.equal(result.status,'SUCCEEDED',JSON.stringify({error:result.error,trace:result.trace}));
 assert.equal(await f.page.locator('[data-tid$="edtFileName;ValueControl"] input').inputValue(),'/test-2/a.csv');
 assert.equal(result.trace.some(e=>e.event==='ui_scan_limit'),false);
});
