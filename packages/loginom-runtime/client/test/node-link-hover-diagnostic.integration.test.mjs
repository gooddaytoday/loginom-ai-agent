import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLinkHover} from '../lib/node-target-browser.mjs';
import {samePlacementGraph} from '../lib/node-placement.mjs';

for(const mode of ['transient','persistent','changed','foreign'])test('Preview mask arriving after graph read: '+mode,{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:30000,
},async()=>{
 const {chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true});
 try{
  const page=await browser.newPage();
  await page.setContent(`<div data-tid="wf;ModelForm;cmpDiagram"><div data-tid="wf;Graph;Source;Output_Data-0" style="position:absolute;left:100px;top:100px;width:20px;height:20px"></div></div>
   <div data-tid="${mode==='foreign'?'other':'wf'};ModelForm" class="bg-mask-message" style="position:absolute;inset:0;background:white;z-index:10"></div>`);
  const graph={document_id:'doc',dom_epoch:1,nodes:[],links:[]};let reads=0,moves=0;
  await page.exposeFunction('recordMaskHover',()=>moves++);
  await page.evaluate(()=>document.addEventListener('mousemove',()=>window.recordMaskHover()));
  const read=async()=>{
   reads++;
   if(reads===1&&mode!=='persistent')await page.evaluate(()=>setTimeout(()=>document.querySelector('.bg-mask-message').remove(),900));
   return mode==='changed'&&reads>1?{...graph,links:[{source:'foreign'}]}:graph;
  };
  const task={deadline:Date.now()+(mode==='persistent'?1200:5000),request:{workflow_ref:{prefix:'wf'}},effect:{before:graph},source_tid:'wf;Graph;Source;Output_Data-0'};
  if(mode==='transient'){await prepareLinkHover(page,task,read,samePlacementGraph);assert.equal(moves,1);}
  else{await assert.rejects(prepareLinkHover(page,task,read,samePlacementGraph));assert.equal(moves,0);}
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
