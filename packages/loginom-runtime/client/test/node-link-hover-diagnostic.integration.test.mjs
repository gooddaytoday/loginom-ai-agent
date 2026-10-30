import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLinkHover} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';

for(const fault of ['none','redraw','source_redraw','timeout','owner','tab','dialog','nested_dialog','foreign_mask','graph'])test('link hover settles only its exact native ModelForm mask: '+fault,{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:10000,
},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true});
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>body{margin:0} #model,#graph{position:absolute;inset:0}
   #port{position:absolute;left:100px;top:100px;width:15px;height:24px}
   #model.bg-mask-message:after{content:'';position:absolute;inset:0;z-index:20}</style>
   <div id="tab" class="x-tab-active" data-tid="wf-tab"></div>
   <div id="model" data-tid="wf;ModelForm"><div id="graph" data-tid="wf;ModelForm;cmpDiagram">
   <div id="port" data-tid="wf;Graph;Source;Output_Data-0"></div></div></div>`);
  await page.evaluate(()=>{
   class ModelForm{}
   const workflow={},model=new ModelForm();model.FView={el:{dom:document.querySelector('#model')}};
   model.FDiagram={FmxGraph:{container:document.querySelector('#graph')}};
   const card={Controller:{Node:{data:{node:workflow}},FController:model}};
   globalThis.bg={app:{Version:'7.4.2',ModelForm,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}};
   globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['prep',{
    workflowId:'workflow',phase:'verified',tab:document.querySelector('#tab'),nodeTargetWorkflowNode:workflow,
   }]])};
  });
  const graph={document_id:'doc',dom_epoch:1,nodes:[],links:[]};let reads=0,moves=0;
  await page.exposeFunction('maskHoverMove',()=>{moves++;});
  await page.evaluate(()=>document.addEventListener('mousemove',()=>window.maskHoverMove()));
  const task={deadline:Date.now()+(fault==='timeout'?1000:5000),origin:'null',build:'7.4.2',
   request:{document_id:'doc',workflow_ref:{prefix:'wf',tab_tid:'wf-tab',workflow_id:'workflow'}},
   effect:{before:graph},source_tid:'wf;Graph;Source;Output_Data-0'};
  const read=async()=>{
   if(++reads===1)await page.evaluate(fault=>{
    document.querySelector('#model').classList.add('bg-mask-message');
    if(fault==='tab')document.querySelector('#tab').classList.remove('x-tab-active');
    if(fault==='owner')bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController.FView.el.dom=document.createElement('div');
    if(fault!=='timeout')setTimeout(()=>{
     if(fault==='redraw'){const old=document.querySelector('#model'),fresh=old.cloneNode(true);old.replaceWith(fresh);const model=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;model.FView.el.dom=fresh;model.FDiagram.FmxGraph.container=document.querySelector('#graph');}
     if(fault==='source_redraw'){const e=document.querySelector('#port');e.replaceWith(e.cloneNode(true));}
     if(fault==='foreign_mask'){const d=document.createElement('div');d.className='x-mask-msg';d.style='position:absolute;width:100px;height:100px';document.body.append(d);}
     if(fault==='dialog'||fault==='nested_dialog'){const d=document.createElement('div');d.setAttribute('role','dialog');d.style='position:absolute;width:100px;height:100px';(fault==='nested_dialog'?document.querySelector('#model'):document.body).append(d);}
     document.querySelector('#model').classList.remove('bg-mask-message');
    },900);
   },fault);
   return fault==='graph'&&reads>1?{...graph,dom_epoch:2}:graph;
  };
  if(['none','redraw','source_redraw'].includes(fault)){
   const started=Date.now();await prepareLinkHover(page,task,read,samePlacementGraph);
   assert.ok(Date.now()-started>=800);assert.equal(moves,1);assert.ok(reads>=3);
  }else{
   if(fault==='graph')await assert.rejects(prepareLinkHover(page,task,read,samePlacementGraph),/Graph changed/);
   else{const result=await prepareLinkHover(page,task,read,samePlacementGraph);assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);assert.match(result.error,/MODELFORM_MASK_(TIMEOUT|CONTEXT_CHANGED)/);}
   assert.equal(moves,0);
  }
 }finally{await browser.close();}
});

test('covered link refusal preserves bounded real DOM blocker identity without a gesture or text',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:30000,
},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.setContent(`<style>body{margin:0} #graph{position:absolute;inset:0} #port{position:absolute;left:100px;top:100px;width:15px;height:24px}
   #layer{position:absolute;left:90px;top:90px;width:60px;height:60px;z-index:20} #cover{width:100%;height:100%} #cover input{display:none}</style>
   <div id="graph" data-tid="wf;ModelForm;cmpDiagram"><div id="port" data-tid="wf;Graph;Source;Output_Data-0"></div></div>
   <div id="layer" role="tooltip" class="x-tip"><div id="cover" role="presentation">PRIVATE_TEXT<input value="PRIVATE_VALUE"></div></div>`);
  let moves=0,clicks=0;
  await page.exposeFunction('recordHoverGesture',kind=>{if(kind==='move')moves++;if(kind==='click')clicks++;});
  await page.evaluate(()=>{
   document.addEventListener('mousemove',()=>window.recordHoverGesture('move'));
   document.addEventListener('click',()=>window.recordHoverGesture('click'));
  });
  const graph={document_id:'doc',dom_epoch:1,nodes:[],links:[]};
  const task={deadline:Date.now()+10000,request:{workflow_ref:{prefix:'wf'}},effect:{before:graph},source_tid:'wf;Graph;Source;Output_Data-0'};
  const refuse=()=>prepareLinkHover(page,task,async()=>graph,samePlacementGraph);
  await assert.rejects(refuse(),error=>{
   assert.ok(error.message.length<=1000);
   assert.match(error.message,/^Link hover source is covered: /);
   const diagnostic=JSON.parse(error.message.slice('Link hover source is covered: '.length));
   assert.equal(diagnostic.source_tid,task.source_tid);assert.deepEqual(diagnostic.point,[107.5,112]);
   assert.equal(diagnostic.reachable,false);assert.equal(diagnostic.covering.role,'presentation');
   assert.equal(diagnostic.covering.tid,null);assert.equal(diagnostic.anchor.role,'tooltip');assert.equal(diagnostic.anchor.class,'x-tip');
   assert.ok(!error.message.includes('PRIVATE_TEXT'));assert.ok(!error.message.includes('PRIVATE_VALUE'));
   return true;
  });
  await page.locator('#layer').evaluate(e=>{
   e.removeAttribute('role');e.setAttribute('data-tid','X'.repeat(1000));e.className='Y'.repeat(1000);
   e.firstElementChild.className='Z'.repeat(1000);
   for(let i=0;i<12;i++){const parent=document.createElement('div');parent.className='P'.repeat(1000);e.parentElement.insertBefore(parent,e);parent.append(e);}
  });
  task.source_tid='wf;Graph;'+'Source'.repeat(100)+';Output_Data-0';
  await page.locator('#port').evaluate((e,tid)=>e.setAttribute('data-tid',tid),task.source_tid);
  await assert.rejects(refuse(),error=>{
   assert.ok(error.message.length<=1000);
   const diagnostic=JSON.parse(error.message.slice('Link hover source is covered: '.length));
   assert.equal(diagnostic.truncated,true);assert.equal(diagnostic.source_tid.length,208);assert.equal(diagnostic.anchor.tid.length,96);return true;
  });
  await page.locator('#layer').evaluate(e=>{
   e.setAttribute('data-tid','\u0000'.repeat(1000));e.className='"\n\\'.repeat(1000);
   e.firstElementChild.className='\u0000'.repeat(1000);
  });
  await assert.rejects(refuse(),error=>{
   assert.ok(error.message.length<=1000);
   const diagnostic=JSON.parse(error.message.slice('Link hover source is covered: '.length));
   assert.equal(diagnostic.truncated,true);assert.ok(diagnostic.anchor.tid.length<96);return true;
  });
  assert.equal(moves,0);assert.equal(clicks,0);
 }finally{await browser.close();}
});
