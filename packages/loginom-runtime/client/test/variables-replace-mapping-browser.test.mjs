import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {configureVariablesReplace,revealVariablesReplaceControl} from '../lib/variables-replace-procedure.mjs';
const options={skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:15000};
test('an onscreen mapping cell can remount without waiting on its old scroll handle',options,async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});t.after(()=>browser.close());
 const page=await browser.newPage(),tid='MF;TF;WizrdMCF;DerivedVariablesMappingEngineOutputPortWizard;colDisplayName_Count';
 await page.setContent(`<style>@keyframes moving {from {transform:translateX(0px)} to {transform:translateX(40px)}} td {animation:moving 1s infinite alternate}</style><table><tr><td data-tid="${tid}">Количество</td></tr></table>`);
 await page.evaluate(()=>{setTimeout(()=>{const e=document.querySelector('td'),copy=e.cloneNode(true);copy.style.animation='none';e.replaceWith(copy);},200);});
 await assert.doesNotReject(()=>revealVariablesReplaceControl(page,tid));
});
test('mapping waits for the native mask, rendered rows and asynchronous label Apply',options,async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.route('http://variables.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://variables.test/');
 await page.evaluate(()=>{
  const rootTid='MF;TF;WizrdMCF',components=new Map();let serial=0;
  const make=(parent,tid,tag='div')=>{const e=document.createElement(tag);e.id='e'+serial++;e.dataset.tid=tid;parent.append(e);return e;};
  const root=make(document.body,rootTid),initial=make(root,rootTid+';ReplaceVariablesWizard');initial.textContent='Замена';
  const next=make(root,rootTid+';btnNext','button');next.textContent='Далее';
  const data={Name:'Count',DisplayName:'Количество Замена',DataType:4},record={internalId:'count',data};
  let mapped=false;
  next.onclick=()=>{
   if(mapped){document.querySelector('[data-tid$=";DerivedVariablesMappingEngineOutputPortWizard"]').remove();make(root,rootTid+';DoneWizard').textContent='Готово';return;}
   mapped=true;initial.remove();const mapping=rootTid+';DerivedVariablesMappingEngineOutputPortWizard',form=make(root,mapping),grid=make(form,mapping+';grdTargetColumns'),table=document.createElement('table'),row=document.createElement('tr');grid.append(table);table.append(row);
   const cell=make(row,mapping+';colDisplayName_Count','td');cell.textContent=data.DisplayName;
   components.set(grid.id,{el:{dom:grid},getStore:()=>({isLoading:()=>false,getData:()=>({items:[record]}),getCount:()=>1}),getView:()=>({getNode:r=>r===record?row:null,getRecord:n=>n===row?record:null})});
   const mask=make(form,'native-mapping-progress');mask.className='x-mask';mask.style='position:fixed;inset:0;background:#9998;z-index:10';setTimeout(()=>mask.remove(),600);
   cell.ondblclick=()=>{
    const dialog=make(document.body,'EditVariableForm');dialog.setAttribute('role','dialog');dialog.style='position:fixed;left:300px;top:100px;background:white;padding:10px';
    const field=make(dialog,'EditVariableForm;edtDisplayName'),input=document.createElement('input');input.value=data.DisplayName;field.append(input);
    const apply=make(dialog,'EditVariableForm;btnApply','button');apply.textContent='Применить';
    apply.onclick=()=>setTimeout(()=>{data.DisplayName=input.value;cell.textContent=data.DisplayName;dialog.remove();},150);
   };
  };
  globalThis.bg={app:{Version:'7.4.2'}};globalThis.Ext={getCmp:id=>components.get(id)};
 });
 const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'replace',surface:'wizard',tid:'MF;TF;WizrdMCF'};
 const readNode=async()=>owner,readContext=async()=>({verified:true,inventory_complete:true,node_context:owner,input_fields:[{record_id:'f',name:'Count',label:'Количество',type:'integer',mode:'none'}],selected:null,pairs:[]});
 const task={binding:{workflow_ref:{prefix:'MF;TF'}},origin:'http://variables.test',build:'7.4.2',deadline:Date.now()+10000,parameters:{},new_node:false,finish:'done'};
 const result=await configureVariablesReplace(page,task,readNode,readContext);
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(result.configuration.output_mapping[0].label,'Количество');
});
